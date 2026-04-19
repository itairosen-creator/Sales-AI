# Sales Mastery AI - מפרט פרויקט מלא (Project Specification)

קובץ זה מכיל את כל המידע הטכני, הפונקציונלי והמבני של האפליקציה, במטרה לאפשר העברה חלקה לפלטפורמה אחרת או שחזור מלא של היכולות.

## 1. סקירה כללית (Overview)
**שם הפרויקט:** Sales Mastery AI
**מטרה:** סימולטור מכירות מבוסס בינה מלאכותית המאפשר לסוכנים (בדגש על נדל"ן יוקרה) לתרגל שיחות מכירה מול לקוחות בעלי אופי משתנה, לקבל משוב בזמן אמת ושיפור מיומנויות סגירה.
**ערך מרכזי:** חוויה אימרסיבית המשלבת קול (TTS/STT), ניתוח פסיכולוגי של הלקוח ורמזים אסטרטגיים בזמן אמת.

---

## 2. פיצ'רים מרכזיים (Core Features)
### א. סימולציות מכירה (Simulation Engine)
- **דמויות משתנות:** 7 דמויות לקוח שונות (Traditionalist, Hustler, LowBaller, Influencer, Expert, PoliteSkeptic, Indecisive) עם לוגיקת התנהגות ייחודית לכל אחת.
- **סוגי פנייה:** תמיכה ב-Cold Calls (פנייה יזומה של המוכר) ו-Warm Calls (הלקוח פנה).
- **מחולל תרחישים:** יצירת תרחישי מכירה מותאמים אישית (Scenario Generation) בעזרת AI.

### ב. ממשק קולי מתקדם (Voice Experience)
- **זיהוי דיבור (STT):** זיהוי קולי רציף בעברית כולל תצוגה מקדימה בזמן אמת (Interim Results).
- **ניקוד חכם:** מנגנון הזרקת סימני פיסוק וסימני שאלה אוטומטיים המבוסס על ניתוח תחבירי בעברית.
- **הקראה קולית (TTS):** המרת טקסט ה-AI לקול אנושי (Charon Voice) בסנכרון מלא עם הופעת הטקסט.
- **ניגון אוטומטי:** הפעלת שמע באופן אוטומטי עם קבלת תגובה.

### ג. אימון וליווי (Coaching System)
- **מערכת רמזים (Hints):** כפתור "נורה" המייצר רמז אסטרטגי קצר (עד 15 מילים) המבוסס על היסטוריית השיחה הנוכחית.
- **ניתוח סיום (Review Mode):** דוח מפורט הכולל:
    - **כרטיס ניקוד:** סמכות, טיפול בהתנגדויות, ניהול משפך, קריאה לפעולה.
    - **ניתוח פסיכולוגי:** הסבר מה עבר בראש של הלקוח במהלך השיחה.
    - **The Script Fixer:** טבלת השוואה בין מה שנאמר לבין הניסוח האופטימלי המוצע.

### ד. ניהול פרופיל והיסטוריה
- **פרופיל משתמש:** הגדרת שירות, חבילות ומחירים (המשמשים את ה-AI בבניית התנגדויות).
- **היסטוריית סימולציות:** שמירה מלאה של כל השיחות והציונים ב-Cloud Firestore.
- **אימות משתמשים:** כניסה מאובטחת באמצעות Google Login.

---

## 3. ארכיטקטורה טכנולוגית (Technical Stack)
- **Frontend:** React 19, Vite, TypeScript.
- **Styling:** Tailwind CSS 4.x.
- **Animations:** Framer Motion (@motion/react).
- **Icons:** Lucide-React.
- **Backend/Middleware:** Node.js Express (מארח את ה-Vite ומנהל את ה-API).
- **Database & Auth:** Firebase (Authentication + Firestore).
- **AI Engine:** Google Gemini SDK (`@google/genai`).
    - **Models:** `gemini-3-flash-preview` (Text), `gemini-3.1-flash-tts-preview` (Audio).

---

## 4. מודל נתונים (Data Models)
### ChatMessage
```typescript
{
  role: 'user' | 'model';
  content: string;
}
```

### ScenarioSetup
```typescript
{
  scenario: string;
  difficulty: number; // 1-10
  personality: Personality;
  callType: 'cold' | 'warm';
}
```

### CoachingFeedback
```typescript
{
  scorecard: { authority, objectionHandling, funnelManagement, cta };
  psychologicalAnalysis: string;
  scriptFixer: Array<{ original, improved, explanation }>;
}
```

---

## 5. לוגיקה עסקית ואינטגרציות
### א. טיפול במכסות (Quota Management)
המערכת כוללת מנגנון זיהוי שגיאות `429` (Resource Exhausted) המציג התראה גלובלית למשתמש ומבקש המתנה של דקה להתאפסות המכסה.

### ב. סנכרון קול-טקסט (Sync Logic)
הודעות ה-AI מוצגות רק לאחר שהקובץ הקולי נוצר ומוכן לניגון (או נכשל), כדי למנוע חוסר סנכרון בין הנראה לנשמע.

### ג. אבטחת נתונים (Firebase Rules)
שימוש בחוקי Firestore המבטיחים שכל משתמש יכול לקרוא ולכתוב רק את ההיסטוריה והפרופיל האישי שלו (UID validation).

---

## 6. דרישות סביבה (Environment Variables)
להפעלת הפרויקט נדרשים המפתחות הבאים:
- `GEMINI_API_KEY`: מפתח גישה ל-Google AI Studio.
- `FIREBASE_CONFIG`: אובייקט הגדרות הפרויקט לקריאה מחזית האפליקציה.

---
**סוף מפרט**
