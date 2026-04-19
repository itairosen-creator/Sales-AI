import { GoogleGenAI, Modality, Type } from "@google/genai";
import { ChatMessage, CoachingFeedback, ScenarioSetup, UserProfile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT_ROLEPLAY = `
אתה סימולטור המכירות והמאמן העסקי. 
תפקידך הוא לדמות לקוח פוטנציאלי בשיחת מכירה מול המשתמש (המוכר).

פרוטוקול ניתוח מוכר (סריקה):
עליך לסרוק את פרטי המוכר (השם, סוג השירות והחבילות) ולבנות דמות לקוח שרלוונטית ספציפית לעולם הזה.
- אם הוא מוכר וידאו לנדל"ן, אתה סוכן נדל"ן.
- אם הוא מוכר שיווק דיגיטלי, אתה בעל עסק קטן.
- עליך להבין את רמת המחירים של המוכר ולהשתמש בה כדי להעלות התנגדויות (למשל: "זה יקר מדי לחבילת בסיס" או "למה שזה יעלה ככה אם אני יכול לעשות לבד?").
- עליך לבחון את המוכר על המומחיות שלו בתחום הספציפי שהוא הגדיר.

דינמיקת הפנייה (קריטי):
1. פנייה קרה (Cold Call): המשתמש פונה אליך בשיחה יזומה. אתה לא מכיר אותו, אתה עסוק, ויש לך את "היד העליונה". תהיה קצר רוח, חשדן, ותדרוש לדעת "למה התקשרת".
2. פנייה חמה (Warm Call): אתה פנית למשתמש או שנקבעה פגישה מראש. למשתמש יש את "היד העליונה" (Status). תהיה פתוח יותר, מנומס, ותסביר למה חיפשת אותו.

פרוטוקול השיחה (חשוב מאוד):
1. תמציתיות: כתוב משפטים קצרים בלבד. אל תנאם.
2. תגובתיות: חכה לתגובת המשתמש. 
3. פתיחת השיחה: 
   - אם זו פנייה קרה: ענה "הלו?" או "כן, מי זה?". אל תפתח בנאום.
   - אם זו פנייה חמה: פתח בברכת שלום קצרה ושאל מה שלום המשתמש. דוגמה: "אהלן, מדבר [שם], תודה שחזרת אלי. מה שלומך?".
4. זרימת השיחה: שבירת קרח -> אג'נדה -> גילוי -> פתרון/מחיר.

סיום השיחה:
ברגע שאתה מרגיש שהשיחה הגיעה לסיום טבעי (הסכמה על פגישה, סגירה, או כישלון מוחלט וניתוק), כתוב את הודעת הסיום של הלקוח ובסופה הוסף את התגית [END_CONVERSATION].
לעולם אל תספק את המשוב או הניתוח (Coach Mode) בתוך חלון הצ'אט. תפקידך הוא להיות הלקוח בלבד.

חוקי ברזל:
- אל תשתמש בביטויים כמו "הנה תרחיש" או כוכביות.
- עברית ישראלית, חיה, טבעית.
- לעולם אל תיתן תשובות ארוכות מ-2 משפטים אלא אם התבקשת להסביר משהו מורכב.
`;

const COACHING_PROMPT = `
מיד עם סיום הסימולציה, ספק ניתוח במבנה הבא:

1. כרטיס ניקוד (Scorecard) - ציונים 1-10
2. ניתוח פסיכולוגי ("מה עבר ללקוח בראש")
3. תיקוני ניסוח (The Script Fixer) - טבלה של "מה אמרת" מול "מה היית צריך לומר" והסבר למה.

ענה בפורמט JSON התואם את המבנה הבא:
{
  "scorecard": {
    "authority": number,
    "objectionHandling": number,
    "funnelManagement": number,
    "cta": number
  },
  "psychologicalAnalysis": "string",
  "scriptFixer": [
    {
      "original": "string",
      "improved": "string",
      "explanation": "string"
    }
  ]
}
`;

function handleAiError(error: any): never {
  console.error("AI Service Error:", error);
  const errorMessage = error?.message || "";
  if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
    throw new Error("QUOTA_EXCEEDED");
  }
  throw error;
}

export async function generateInitialMessage(setup: ScenarioSetup, profile: UserProfile) {
  try {
    const prompt = `
      פרטי המוכר (המשתמש):
      שם: ${profile.name}
      מה הוא מוכר/השירות שלו: ${profile.serviceType}
      חבילות/מחירים: ${profile.packages.map(p => `${p.name}: ${p.price} (${p.description})`).join(', ')}
  
      התרחיש: ${setup.scenario}
      קושי: ${setup.difficulty}/10
      אישיות הלקוח (אתה): ${setup.personality}
      סוג פנייה: ${setup.callType === 'cold' ? 'פנייה קרה (המוכר מתקשר ללקוח)' : 'פנייה חמה (הלקוח מחכה למוכר)'}
  
      צור את משפט הפתיחה של הלקוח לפי הפרוטוקול:
      - אם קר: "הלו?" או "כן, מי זה?"
      - אם חם: "אהלן, מדבר [שם], מה שלומך?"
    `;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT_ROLEPLAY,
        temperature: 0.85,
        topP: 0.9,
      },
    });
    
    return response.text.trim();
  } catch (error) {
    return handleAiError(error);
  }
}

export async function sendMessage(history: ChatMessage[], setup: ScenarioSetup, profile: UserProfile) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })),
      config: {
        systemInstruction: `${SYSTEM_PROMPT_ROLEPLAY}\n\nהתרחיש הנוכחי: ${setup.scenario}. קושי: ${setup.difficulty}. אישיות: ${setup.personality}. סוג פנייה: ${setup.callType}.\nפרטי המוכר: ${profile.name}, מוכר: ${profile.serviceType}. חבילות: ${profile.packages.map(p => p.name).join(', ')}.`,
        temperature: 0.85,
        topP: 0.9,
      },
    });
    
    return response.text.trim();
  } catch (error) {
    return handleAiError(error);
  }
}

export async function getCoachingFeedback(history: ChatMessage[]): Promise<CoachingFeedback> {
  try {
    const historyText = history.map(m => `${m.role === 'user' ? 'משתמש' : 'לקוח'}: ${m.content}`).join('\n');
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: `נתח את שיחת המכירה הבאה:\n\n${historyText}` }] }],
      config: {
        systemInstruction: COACHING_PROMPT,
        responseMimeType: "application/json",
      },
    });
    
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return handleAiError(error);
  }
}

export async function generateScenarioSuggestion(): Promise<string> {
  try {
    const prompt = "צור תרחיש קצר ומאתגר (משפט אחד בלבד) לסימולציית מכירה של צלם וידאו לסוכן נדל\"ן יוקרה. אל תוסיף פתיחים, אל תשתמש בכוכביות או בעיצוב מודגש. פשוט כתוב את התרחיש עצמו.";
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are an expert sales coach. Output ONLY the scenario text. No markdown, no intro phrases.",
        temperature: 0.9,
      },
    });
    
    return response.text?.replace(/\*/g, '').replace(/^"|"$/g, '').trim() || "";
  } catch (error) {
    return handleAiError(error);
  }
}

export async function generateScenarioForPersonality(personality: string): Promise<string> {
  try {
    const prompt = `צור תרחיש קצר ומאתגר (משפט אחד בלבד) המותאם לאישיות הלקוח: ${personality}. אל תוסיף פתיחים, אל תשתמש בכוכביות. פשוט כתוב את התרחיש.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are an expert sales coach. Output ONLY the raw scenario text. No intro, no markdown.",
        temperature: 0.9,
      },
    });
    
    return response.text?.replace(/\*/g, '').replace(/^"|"$/g, '').trim() || "";
  } catch (error) {
    return handleAiError(error);
  }
}

export async function generateAudio(text: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say naturally but professionally in Hebrew: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error: any) {
    console.error("TTS Error:", error);
    const errorMessage = error?.message || "";
    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("QUOTA_EXCEEDED");
    }
    return undefined;
  }
}

export async function getHint(history: ChatMessage[], setup: ScenarioSetup, profile: UserProfile): Promise<string> {
  try {
    const historyText = history.map(m => `${m.role === 'user' ? 'מוכר' : 'לקוח'}: ${m.content}`).join('\n');
    const lastMessage = history[history.length - 1];
    
    const prompt = `
      אתה מאמן מכירות מלווה. המוכר נתקע ולא יודע מה לענות ללקוח.
      עליך לתת רמז קצר (עד 15 מילים) שיעזור למוכר להתקדם בשיחה בצורה אפקטיבית.
      
      פרטי התרחיש: ${setup.scenario}
      פרופיל המוכר: ${profile.serviceType}
      הודעה אחרונה מהלקוח: ${lastMessage?.content}
      
      היסטוריית שיחה:
      ${historyText}
      
      המטרה: רמז קצר בעברית, פרקטי, שמציע כיוון תשובה או כלי מכירתי (כמו "הצף ערך", "שאל שאלת גילוי", "ענה על ההתנגדות דרך אמפתיה").
    `;
  
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are a concise sales mentor. Output ONLY the short hint in Hebrew. No intro, no quotes, no markdown.",
        temperature: 0.7,
      },
    });
  
    return response.text.trim();
  } catch (error) {
    return handleAiError(error);
  }
}
