/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings2, 
  MessageSquare, 
  TrendingUp, 
  Volume2, 
  Play, 
  StopCircle, 
  ChevronRight, 
  Award, 
  AlertCircle, 
  RefreshCcw,
  User,
  Zap,
  DollarSign,
  History,
  Send,
  Sparkles,
  Mic,
  MicOff,
  Lightbulb,
  ChevronLeft,
  Camera,
  Star,
  Users,
  Clock,
  Settings,
  X,
  Square
} from 'lucide-react';
import { Personality, ScenarioSetup, ChatMessage, CoachingFeedback, SimulationHistory, UserProfile } from './types';
import * as aiService from './services/geminiService';
import { auth, db, loginWithGoogle } from './lib/firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

const PERSONALITY_MAP: Record<Personality, { name: string; description: string; icon: any }> = {
  Traditionalist: {
    name: 'הסוכן הוותיק (The Traditionalist)',
    description: 'מזלזל ברשתות חברתיות, מאמין רק ב"מפה לאוזן".',
    icon: History,
  },
  Hustler: {
    name: 'הסוכן הלחוץ (The Hustler)',
    description: 'חסר סבלנות, מחפש לידים מהרגע להרגע.',
    icon: Zap,
  },
  LowBaller: {
    name: 'הספקן הכלכלי (The Low-Baller)',
    description: 'מחפש הנחות, משווה אותך לצלמי אייפון.',
    icon: DollarSign,
  },
  Influencer: {
    name: 'הכוכב החברתי (The Influencer)',
    description: 'רוצה רק ויראליות, אכפת לו בעיקר מהפרצוף שלו.',
    icon: Star,
  },
  Expert: {
    name: 'חובב הטכנולוגיה (The Expert)',
    description: 'קפדן מאוד על תאורה וסאונד, מבין בציוד (יותר מדי).',
    icon: Camera,
  },
  PoliteSkeptic: {
    name: 'הברוקר המנומס (The Polite Skeptic)',
    description: 'נחמד מאוד, אבל "לא בטוח שהקהל שלי שם".',
    icon: Users,
  },
  Indecisive: {
    name: 'הסוכן המבולגן (The Indecisive)',
    description: 'משנה את דעתו כל דקה, שוכח פגישות.',
    icon: Clock,
  },
};

const PERSONALITIES = Object.keys(PERSONALITY_MAP) as Personality[];

// Extend Window for SpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step, setStep] = useState<'home' | 'setup' | 'roleplay' | 'coaching' | 'history' | 'profile'>('home');
  const [setup, setSetup] = useState<ScenarioSetup>({
    scenario: 'פגישת היכרות ראשונה עם סוכן נדל"ן יוקרה בהרצליה פיתוח',
    difficulty: 5,
    personality: 'Traditionalist',
    callType: 'warm',
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [input, setInput] = useState('');
  const [interimInput, setInterimInput] = useState('');
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLoading, setAudioLoading] = useState<number | null>(null);
  const [history, setHistory] = useState<SimulationHistory[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<SimulationHistory | null>(null);
  const [showRecap, setShowRecap] = useState(false);
  const [isGeneratingHint, setIsGeneratingHint] = useState(false);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'יוסי כהן',
    avatar: 'https://picsum.photos/seed/user/200/200',
    serviceType: 'שיווק דיגיטלי לעסקים קטנים',
    packages: [
      { name: 'חבילת בסיס', price: '₪1,500', description: 'ניהול עמוד פייסבוק ואינסטגרם' },
      { name: 'חבילת פרימיום', price: '₪4,500', description: 'ניהול קמפיינים ממומנים + יצירת תוכן' }
    ]
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [playingAudioIndex, setPlayingAudioIndex] = useState<number | null>(null);

  const lastProcessedIndexRef = useRef<number>(-1);
  const playingIndexRef = useRef<number | null>(null);

  // Sync ref with state for use inside callbacks
  useEffect(() => {
    playingIndexRef.current = playingAudioIndex;
  }, [playingAudioIndex]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Profile and History from Firestore
  useEffect(() => {
    if (!user) {
      // Fallback to local storage for guests
      const saved = localStorage.getItem('rose_sales_history');
      if (saved) setHistory(JSON.parse(saved));
      const savedProfile = localStorage.getItem('rose_user_profile');
      if (savedProfile) setUserProfile(JSON.parse(savedProfile));
      return;
    }

    // Load Profile
    const profileRef = doc(db, 'users', user.uid);
    getDoc(profileRef).then((snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      } else {
        // Init profile for new user
        setDoc(profileRef, userProfile);
      }
    });

    // Load History
    const historyRef = collection(db, 'users', user.uid, 'history');
    const q = query(historyRef, orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ ...d.data() } as SimulationHistory));
      setHistory(items);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const saveToHistory = async (newHistory: SimulationHistory) => {
    if (user) {
      const historyRef = collection(db, 'users', user.uid, 'history');
      await addDoc(historyRef, { ...newHistory, createdAt: serverTimestamp() });
    } else {
      const updated = [newHistory, ...history];
      setHistory(updated);
      localStorage.setItem('rose_sales_history', JSON.stringify(updated));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // STT Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      console.log("Speech Recognition supported");
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'he-IL';
      
      // Attempt to enable auto-punctuation if supported
      // Note: Browser support for this is hit or miss, but good for completeness
      if ('punctuation' in recognition) {
        (recognition as any).punctuation = true;
      }

      recognition.onstart = () => {
        console.log("Recognition started");
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            // Only process each result index once
            if (i > lastProcessedIndexRef.current) {
              lastProcessedIndexRef.current = i;
              
              let cleanTranscript = applyPunctuation(transcript.trim());
              
              setInput(prev => {
                const trimmedPrev = prev.trim();
                return trimmedPrev ? `${trimmedPrev} ${cleanTranscript}` : cleanTranscript;
              });
              setInterimInput('');
            }
          } else {
            interimTranscript += transcript;
          }
        }
        setInterimInput(interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Recognition error", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        console.log("Recognition ended");
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.error("Speech Recognition not supported in this browser");
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("חיפוש קולי אינו נתמך בדפדפן זה");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        lastProcessedIndexRef.current = -1; // Reset processed index for new session
        recognitionRef.current.start();
      } catch (err) {
        console.error("Start recording failed:", err);
      }
    }
  };

  const generateScenario = async () => {
    setIsGeneratingScenario(true);
    try {
      const suggestion = await aiService.generateScenarioSuggestion();
      setSetup(prev => ({ ...prev, scenario: suggestion }));
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  const cyclePersonality = (dir: 'next' | 'prev') => {
    const currentIndex = PERSONALITIES.indexOf(setup.personality);
    let nextIndex = dir === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= PERSONALITIES.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = PERSONALITIES.length - 1;
    setSetup(prev => ({ ...prev, personality: PERSONALITIES[nextIndex] }));
  };

  const startSimulation = async (overriddenSetup?: ScenarioSetup) => {
    const activeSetup = overriddenSetup || setup;
    setStep('roleplay');
    setIsTyping(true);
    try {
      const initialMessage = await aiService.generateInitialMessage(activeSetup, userProfile);
      const content = initialMessage || 'אהלן, מדבר אבי. מה שלומך?';
      
      const modelMsg: ChatMessage = { role: 'model', content };
      setMessages([modelMsg]);

      // Start audio in background
      playAudio(content, 0);
    } catch (error: any) {
      console.error(error);
      if (error.message === 'QUOTA_EXCEEDED') {
        setGlobalError('הגעת למכסה המקסימלית של גוגל. המתן דקה ונסה שוב.');
        setMessages([{ role: 'model', content: 'סליחה, המערכת בעומס כרגע. נסה שוב בעוד דקה.' }]);
      } else {
        setMessages([{ role: 'model', content: 'שגיאה בחיבור לשרת. נסה שוב.' }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const startWithPersonality = async () => {
    setIsGeneratingScenario(true);
    try {
      const generatedScenario = await aiService.generateScenarioForPersonality(personality.name);
      const newSetup = { ...setup, scenario: generatedScenario };
      setSetup(newSetup);
      await startSimulation(newSetup);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  const updateProfile = async (updated: UserProfile) => {
    setUserProfile(updated);
    if (user) {
      const profileRef = doc(db, 'users', user.uid);
      await setDoc(profileRef, updated);
    } else {
      localStorage.setItem('rose_user_profile', JSON.stringify(updated));
    }
    setIsEditingProfile(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg: ChatMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      let response = await aiService.sendMessage(newMessages, setup, userProfile);
      const isEnd = response.includes('[END_CONVERSATION]');
      const cleanResponse = response.replace('[END_CONVERSATION]', '').trim();
      
      const modelMsg: ChatMessage = { role: 'model', content: cleanResponse || '...' };
      
      // SYNC: Wait for audio to be ready before showing message
      // This ensures text and sound appear together
      try {
        await playAudio(modelMsg.content, newMessages.length);
      } catch (audioErr: any) {
        if (audioErr.message === 'QUOTA_EXCEEDED') {
          setGlobalError('מכסת הקול הסתיימה. נסה שוב בעוד דקה.');
        } else {
          console.error("Audio playback failed", audioErr);
        }
      }
      
      const updatedMessages = [...newMessages, modelMsg];
      setMessages(updatedMessages);
      
      if (isEnd) {
        setTimeout(() => handleStop(updatedMessages), 1500);
      }
    } catch (error: any) {
      console.error(error);
      if (error.message === 'QUOTA_EXCEEDED') {
        setGlobalError('הגעת למכסה המקסימלית של גוגל. המתן דקה ונסה שוב.');
      }
    } finally {
      setIsTyping(false);
    }
  };

  const applyPunctuation = (str: string) => {
    const questionWords = [
      'האם', 'למה', 'מדוע', 'איך', 'מתי', 'איפה', 'כמה', 'מה', 'מאיפה', 'לאן', 'מי',
      'תוכל', 'אפשר', 'תסביר', 'מתי תגיע', 'כמה עולה', 'איפה זה'
    ];
    const startsWithQuestion = questionWords.some(word => str.startsWith(word));
    
    if (startsWithQuestion && !str.includes('?')) {
      return str + '?';
    } else if (!str.match(/[.!?]$/)) {
      return str + '.';
    }
    return str;
  };

  const playAudio = async (text: string, index: number) => {
    // If already playing this index, stop it
    if (playingAudioIndex === index) {
      audioSourceRef.current?.stop();
      setPlayingAudioIndex(null);
      return;
    }

    // Stop any existing playback
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Source might have already ended
      }
    }

    setAudioLoading(index);
    try {
      const base64Audio = await aiService.generateAudio(text);
      if (base64Audio) {
        setAudioLoading(null);
        setPlayingAudioIndex(index);
        // Gemini TTS returns raw PCM 16-bit 24kHz
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Int16Array(len / 2);
        for (let i = 0; i < len; i += 2) {
          bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const audioCtx = audioContextRef.current;
        const buffer = audioCtx.createBuffer(1, bytes.length, 24000);
        const channelData = buffer.getChannelData(0);
        
        for (let i = 0; i < bytes.length; i++) {
          channelData[i] = bytes[i] / 32768; // Convert to [-1.0, 1.0]
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        
        source.onended = () => {
          if (playingIndexRef.current === index) {
            setPlayingAudioIndex(null);
          }
        };

        audioSourceRef.current = source;
        source.start();
      }
    } catch (error: any) {
      console.error("TTS Playback Error:", error);
      setAudioLoading(null);
      setPlayingAudioIndex(null);
      
      // Handle Quota Error gracefully
      if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        // We logicially continue so the message still shows in the UI
        throw new Error('QUOTA_EXCEEDED');
      }
    }
  };

  const handleGetHint = async () => {
    if (messages.length === 0 || isGeneratingHint) return;
    setIsGeneratingHint(true);
    setCurrentHint(null);
    try {
      const hint = await aiService.getHint(messages, setup, userProfile);
      setCurrentHint(hint);
    } catch (error: any) {
      console.error(error);
      if (error.message === 'QUOTA_EXCEEDED') {
        setGlobalError('מכסת הרמזים הסתיימה. נסה שוב בעוד דקה.');
      }
    } finally {
      setIsGeneratingHint(false);
    }
  };
  
  const handleStop = async (msgs: ChatMessage[] = messages) => {
    if (msgs.length < 2) return;
    setIsTyping(true);
    try {
      const coachingFeedback = await aiService.getCoachingFeedback(msgs);
      setFeedback(coachingFeedback);
      
      const newHistory: SimulationHistory = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        setup,
        messages: msgs,
        feedback: coachingFeedback
      };
      saveToHistory(newHistory);
      
      setStep('coaching');
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  const resetAll = () => {
    setStep('home');
    setMessages([]);
    setFeedback(null);
    setSelectedHistory(null);
    setShowRecap(false);
  };

  const openHistoryItem = (item: SimulationHistory) => {
    setSelectedHistory(item);
  };

  const personality = PERSONALITY_MAP[setup.personality];

  return (
    <div className="flex h-screen bg-rose-bg text-rose-text font-sans rtl overflow-hidden" dir="rtl">
      {authLoading && (
        <div className="fixed inset-0 z-[200] bg-rose-bg flex items-center justify-center">
           <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-rose-accent border-t-transparent rounded-full animate-spin" />
              <div className="text-[10px] font-black uppercase tracking-[3px] opacity-40">טוען פרופיל...</div>
           </div>
        </div>
      )}
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-20 px-10 border-b border-rose-border flex items-center justify-between bg-white shrink-0 shadow-sm">
          <div className="flex items-center gap-8">
            <div 
              className="text-xl font-black tracking-[3px] text-rose-primary cursor-pointer hover:text-rose-accent transition-colors"
              onClick={resetAll}
            >
              ROSE MEDIA
            </div>
            <div className="w-[1px] h-6 bg-rose-border"></div>
            <h2 className="text-sm font-black uppercase tracking-widest opacity-40">
              {step === 'home' ? 'מנוע סימולציות ומאמן מכירות' : 
               step === 'setup' ? 'הגדרת זירת מכירה' : 
               step === 'roleplay' ? 'סימולציה בזמן אמת' : 
               step === 'history' ? 'ארכיון ביצועים' : 
               'ניתוח ושיפור סגירות'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 bg-rose-bg pr-1 pl-3 py-1 rounded-full border border-rose-border">
                <img src={user.photoURL || userProfile.avatar} alt="User" className="w-8 h-8 rounded-full border border-white" referrerPolicy="no-referrer" />
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold leading-none">{user.displayName || userProfile.name}</span>
                  <button 
                    onClick={() => signOut(auth)}
                    className="text-[8px] font-black uppercase tracking-widest text-rose-accent hover:opacity-70 leading-normal"
                  >
                    התנתק (Logout)
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center gap-2 bg-rose-primary text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-rose-accent transition-all shadow-sm"
              >
                <User className="w-3 h-3" />
                התחבר למערכת
              </button>
            )}
            {step !== 'home' && (
              <button 
                onClick={resetAll}
                className="text-[10px] font-black uppercase tracking-widest text-rose-text/40 hover:text-rose-accent flex items-center gap-2 transition-all group"
              >
                <ChevronRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" />
                חזרה לבית
              </button>
            )}
            {step === 'roleplay' && (
              <div className="bg-rose-accent text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                סימולציה פעילה
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-rose-bg custom-scrollbar relative">
          {/* Global Error Notification */}
          <AnimatePresence>
            {globalError && (
              <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] md:w-96 bg-danger p-4 rounded-2xl shadow-2xl flex items-start gap-3 border-2 border-white/20 backdrop-blur-md"
              >
                <AlertCircle className="text-white w-5 h-5 shrink-0" />
                <div className="flex-1">
                  <p className="text-white text-sm font-bold leading-snug">{globalError}</p>
                </div>
                <button onClick={() => setGlobalError(null)} className="text-white/60 hover:text-white transition-colors p-1">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {step === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-4xl mx-auto h-full flex flex-col justify-center gap-12"
              >
                <div className="text-center space-y-4">
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h1 className="text-6xl font-serif font-light text-rose-primary italic mb-4">Sales Mastery AI</h1>
                    <p className="text-xl text-rose-text opacity-50 max-w-xl mx-auto leading-relaxed">
                      הפוך לסופר-סוגר. תרגל שיחות מכירה קשוחות, קבל משוב אכזרי ושפר את אחוזי הסגירה שלך.
                    </p>
                  </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <motion.button
                    whileHover={{ y: -10, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep('setup')}
                    className="group bg-white p-10 rounded-[40px] border-2 border-rose-border shadow-xl hover:border-rose-accent transition-all text-right flex flex-col items-start gap-6"
                  >
                    <div className="w-16 h-16 rounded-3xl bg-rose-bg flex items-center justify-center text-rose-accent group-hover:bg-rose-accent group-hover:text-white transition-colors">
                      <Play className="w-8 h-8 fill-current" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-rose-primary mb-2">התחל אימון חדש</h3>
                      <p className="text-sm opacity-50 leading-relaxed font-medium">בנה תרחיש, בחר אישיות וצא לדרך. כולל פניות קרות וחמות.</p>
                    </div>
                    <div className="mt-auto flex items-center gap-2 text-rose-accent font-black text-[10px] uppercase tracking-widest">
                      התחל עכשיו <ChevronLeft className="w-4 h-4" />
                    </div>
                  </motion.button>

                  <div className="grid grid-rows-2 gap-8">
                    <motion.button
                      whileHover={{ x: -10, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep('history')}
                      className="group bg-rose-primary p-6 rounded-[30px] shadow-xl text-right flex items-center gap-6"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-rose-accent group-hover:bg-rose-accent group-hover:text-white transition-colors">
                        <History className="w-6 h-6" />
                      </div>
                      <div className="text-white">
                        <h3 className="text-xl font-bold mb-1">ארכיון שיחות</h3>
                        <p className="text-[10px] opacity-40 uppercase tracking-widest font-black">מעקב וניתוח</p>
                      </div>
                    </motion.button>

                    <motion.button
                      whileHover={{ x: -10, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep('profile')}
                      className="group bg-white p-6 rounded-[30px] border-2 border-rose-border shadow-xl text-right flex items-center gap-6 hover:border-rose-accent transition-all"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-rose-bg flex items-center justify-center text-rose-accent group-hover:bg-rose-accent group-hover:text-white transition-colors">
                        <Award className="w-6 h-6" />
                      </div>
                      <div className="text-rose-primary">
                        <h3 className="text-xl font-bold mb-1">פרופיל סוכן</h3>
                        <p className="text-[10px] opacity-40 uppercase tracking-widest font-black">סטטיסטיקות וחוזקות</p>
                      </div>
                    </motion.button>
                  </div>
                </div>

                {history.length > 0 && (
                  <div className="pt-10 border-t border-rose-border">
                    <div className="text-[10px] uppercase font-black tracking-widest opacity-30 mb-6 text-center">שיחות אחרונות</div>
                    <div className="flex justify-center gap-4 overflow-x-auto pb-4 px-4 no-scrollbar">
                      {history.slice(0, 3).map(item => {
                        const Icon = PERSONALITY_MAP[item.setup.personality].icon;
                        return (
                          <button 
                            key={item.id}
                            onClick={() => { setShowRecap(true); setStep('coaching'); setFeedback(item.feedback); setMessages(item.messages); setSetup(item.setup); }}
                            className="bg-white border border-rose-border px-6 py-4 rounded-2xl flex items-center gap-4 hover:border-rose-accent transition-all min-w-[240px] shadow-sm"
                          >
                            <div className="w-10 h-10 rounded-full bg-rose-bg flex items-center justify-center text-rose-accent shrink-0">
                              {Icon && <Icon className="w-5 h-5" />}
                            </div>
                            <div className="text-right overflow-hidden">
                              <div className="text-[10px] opacity-40 font-bold">{item.date}</div>
                              <div className="text-xs font-bold truncate">{item.setup.scenario}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-12 pb-20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl overflow-hidden bg-rose-bg ring-2 ring-rose-border">
                      <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <h2 className="text-4xl font-serif font-light text-rose-primary italic">{userProfile.name}.</h2>
                      <div className="flex items-center gap-2">
                        <p className="text-rose-text opacity-50">{userProfile.serviceType}</p>
                        {!user && (
                          <span className="bg-rose-accent/10 text-rose-accent text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Guest Mode</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setIsEditingProfile(true)}
                      className="text-[10px] font-black uppercase tracking-widest text-rose-accent bg-white px-6 py-2.5 rounded-full border border-rose-accent/20 hover:bg-rose-accent hover:text-white transition-all shadow-sm"
                    >
                      ערוך פרופיל עסקי
                    </button>
                    <button onClick={() => setStep('home')} className="text-rose-accent font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:opacity-70">
                      <ChevronRight className="w-4 h-4 rotate-180" /> חזרה לבית
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Business Context Card */}
                    <div className="bg-white p-8 rounded-[40px] border-2 border-rose-border shadow-xl">
                      <div className="flex items-center justify-between mb-6">
                        <div className="section-title mb-0">החבילות והשירותים שלך</div>
                        <Settings className="w-4 h-4 opacity-20" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {userProfile.packages.map((pkg, i) => (
                          <div key={i} className="p-5 rounded-2xl bg-rose-bg border border-rose-border group hover:border-rose-accent transition-all">
                            <div className="text-xs font-black uppercase tracking-widest text-rose-accent mb-1">{pkg.name}</div>
                            <div className="text-lg font-bold text-rose-primary mb-2">{pkg.price}</div>
                            <div className="text-xs opacity-50 font-medium leading-relaxed">{pkg.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-[40px] border-2 border-rose-border shadow-xl">
                      <div className="section-title">מדדי ביצוע ממוצעים</div>
                      <div className="grid grid-cols-2 gap-8 my-8">
                        {[
                          { label: 'בניית סמכות', key: 'authority' as const },
                          { label: 'טיפול בהתנגדויות', key: 'objectionHandling' as const },
                          { label: 'ניהול המשפך', key: 'funnelManagement' as const },
                          { label: 'הנעה לפעולה', key: 'cta' as const }
                        ].map((metric) => {
                          const avg = history.length > 0 
                            ? (history.reduce((acc, curr) => acc + curr.feedback.scorecard[metric.key], 0) / history.length).toFixed(1)
                            : '0.0';
                          return (
                            <div key={metric.key} className="space-y-2">
                              <div className="flex justify-between text-xs font-bold uppercase tracking-wider opacity-60">
                                <span>{metric.label}</span>
                                <span>{avg}/10</span>
                              </div>
                              <div className="h-3 bg-rose-bg rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }} 
                                  animate={{ width: `${parseFloat(avg) * 10}%` }} 
                                  className="h-full bg-rose-accent" 
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-[40px] border-2 border-rose-border shadow-xl grid grid-cols-2 gap-8">
                      <div>
                        <div className="section-title text-success">חוזקות מרכזיות</div>
                        <div className="space-y-3">
                          {history.length > 0 ? (
                             Array.from(new Set(history.flatMap(h => h.feedback.scriptFixer.filter(f => f.explanation.includes('טוב') || f.explanation.includes('נכון')).map(f => f.improved)))).slice(0, 3).map((v, i) => (
                               <div key={i} className="flex items-start gap-2 text-xs font-medium opacity-80 leading-relaxed bg-green-50/30 p-3 rounded-xl border border-green-200/50">
                                  <Award className="w-4 h-4 text-success shrink-0 mt-0.5" />
                                  {v}
                               </div>
                             ))
                          ) : (
                            <div className="text-xs opacity-40 italic">בצע סימולציות כדי לראות חוזקות</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="section-title text-danger">נקודות לשיפור</div>
                        <div className="space-y-3">
                        {history.length > 0 ? (
                             Array.from(new Set(history.flatMap(h => h.feedback.scriptFixer.filter(f => f.explanation.includes('להימנע') || f.explanation.includes('עדיף')).map(f => f.explanation)))).slice(0, 3).map((v, i) => (
                               <div key={i} className="flex items-start gap-2 text-xs font-medium opacity-80 leading-relaxed bg-red-50/30 p-3 rounded-xl border border-red-200/50">
                                  <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                                  {v}
                               </div>
                             ))
                          ) : (
                            <div className="text-xs opacity-40 italic">בצע סימולציות כדי לראות נקודות לשיפור</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="bg-rose-primary p-8 rounded-[40px] shadow-xl text-white text-center">
                      <div className="text-[10px] uppercase font-black tracking-widest opacity-40 mb-6">ציון סוכן כולל</div>
                      <div className="text-7xl font-serif italic text-rose-accent mb-2">
                        {history.length > 0 
                          ? (history.reduce((acc, curr) => {
                              const s = curr.feedback.scorecard;
                              return acc + (s.authority + s.objectionHandling + s.funnelManagement + s.cta) / 4;
                            }, 0) / history.length).toFixed(1)
                          : '0.0'}
                      </div>
                      <div className="text-xs opacity-40 font-bold uppercase tracking-widest mb-10">ממוצע היסטורי</div>
                      <div className="space-y-4 text-right">
                         <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <div className="text-[10px] opacity-40 font-bold uppercase mb-1">סך הכל סימולציות</div>
                            <div className="text-2xl font-bold">{history.length}</div>
                         </div>
                         <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <div className="text-[10px] opacity-40 font-bold uppercase mb-1">רמת קושי ממוצעת</div>
                            <div className="text-2xl font-bold">
                              {(history.reduce((acc, curr) => acc + curr.setup.difficulty, 0) / Math.max(1, history.length)).toFixed(1)}
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Profile Edit Overlay */}
            <AnimatePresence>
              {isEditingProfile && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-rose-primary/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} 
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl p-10 space-y-8 relative my-auto"
                  >
                    <div className="flex items-center justify-between border-b border-rose-border pb-6">
                      <h3 className="text-2xl font-serif italic text-rose-primary">עריכת פרופיל עסקי</h3>
                      <button onClick={() => setIsEditingProfile(false)} className="text-rose-text/30 hover:text-rose-accent transition-colors">
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-widest opacity-40">שם מלא</label>
                        <input 
                          type="text" 
                          value={userProfile.name} 
                          onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
                          className="w-full bg-rose-bg border-2 border-rose-border p-4 rounded-xl focus:border-rose-accent outline-none font-bold"
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] uppercase font-black tracking-widest opacity-40">קישור לתמונת פרופיל</label>
                        <input 
                          type="text" 
                          value={userProfile.avatar} 
                          onChange={(e) => setUserProfile({...userProfile, avatar: e.target.value})}
                          className="w-full bg-rose-bg border-2 border-rose-border p-4 rounded-xl focus:border-rose-accent outline-none font-medium text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] uppercase font-black tracking-widest opacity-40">מה אתה מוכר? (סוג השירות)</label>
                      <input 
                        type="text" 
                        value={userProfile.serviceType} 
                        onChange={(e) => setUserProfile({...userProfile, serviceType: e.target.value})}
                        placeholder="למשל: בניית אתרים, צילום וידאו לנדלניסטים..."
                        className="w-full bg-rose-bg border-2 border-rose-border p-4 rounded-xl focus:border-rose-accent outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase font-black tracking-widest opacity-40">חבילות מחיר</label>
                        <button 
                          onClick={() => setUserProfile({
                            ...userProfile, 
                            packages: [...userProfile.packages, { name: 'חבילה חדשה', price: '₪0', description: '' }]
                          })}
                          className="text-[10px] font-black text-rose-accent hover:opacity-70"
                        >
                          + הוסף חבילה
                        </button>
                      </div>
                      <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {userProfile.packages.map((pkg, i) => (
                          <div key={i} className="p-4 rounded-2xl bg-rose-bg border border-rose-border space-y-3 relative group">
                            <button 
                              onClick={() => setUserProfile({
                                ...userProfile,
                                packages: userProfile.packages.filter((_, idx) => idx !== i)
                              })}
                              className="absolute top-4 left-4 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <History className="w-4 h-4 rotate-45" />
                            </button>
                            <div className="grid grid-cols-2 gap-3">
                              <input 
                                type="text" 
                                value={pkg.name} 
                                onChange={(e) => {
                                  const newPkgs = [...userProfile.packages];
                                  newPkgs[i].name = e.target.value;
                                  setUserProfile({...userProfile, packages: newPkgs});
                                }}
                                className="bg-white border border-rose-border p-2 rounded-lg font-bold text-xs" 
                                placeholder="שם החבילה"
                              />
                              <input 
                                type="text" 
                                value={pkg.price} 
                                onChange={(e) => {
                                  const newPkgs = [...userProfile.packages];
                                  newPkgs[i].price = e.target.value;
                                  setUserProfile({...userProfile, packages: newPkgs});
                                }}
                                className="bg-white border border-rose-border p-2 rounded-lg font-bold text-xs" 
                                placeholder="מחיר"
                              />
                            </div>
                            <textarea 
                              value={pkg.description} 
                               onChange={(e) => {
                                  const newPkgs = [...userProfile.packages];
                                  newPkgs[i].description = e.target.value;
                                  setUserProfile({...userProfile, packages: newPkgs});
                                }}
                              className="w-full bg-white border border-rose-border p-2 rounded-lg text-[10px] font-medium resize-none h-16" 
                              placeholder="תיאור קצר..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={() => updateProfile(userProfile)}
                      className="w-full bg-rose-primary text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-accent shadow-xl transition-all"
                    >
                      שמור את כל השינויים
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {step === 'setup' && (
              <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-4xl mx-auto space-y-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-serif font-light text-rose-primary italic">בנה את הסמכות שלך.</h2>
                    <p className="text-rose-text opacity-50">הגדר את זירת הלחימה והתחל לתרגל סגירות.</p>
                  </div>
                  <button onClick={() => setStep('home')} className="text-rose-accent font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:opacity-70">
                    <ChevronRight className="w-4 h-4 rotate-180" /> חזרה לבית
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-3xl border-2 border-rose-border shadow-md space-y-4">
                    <div className="section-title text-xs mb-0">רמת אגרסיביות (גלובלי)</div>
                    <div className="flex items-center gap-4">
                      <div className="bg-rose-primary text-white px-3 py-1 rounded-full text-xs font-bold">{setup.difficulty}/10</div>
                      <input type="range" min="1" max="10" value={setup.difficulty} onChange={(e) => setSetup({...setup, difficulty: parseInt(e.target.value)})} className="flex-1 h-2 bg-rose-border rounded-lg appearance-none cursor-pointer accent-rose-accent" />
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border-2 border-rose-border shadow-md space-y-4">
                    <div className="section-title text-xs mb-0">סוג פנייה (Dynamics)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setSetup({...setup, callType: 'cold'})}
                        className={`py-3 rounded-xl border-2 font-bold text-xs transition-all ${setup.callType === 'cold' ? 'bg-rose-primary text-white border-transparent' : 'bg-rose-bg border-rose-border hover:border-rose-accent text-rose-text/50'}`}
                      >
                        פנייה קרה (Cold)
                        <span className="block text-[8px] opacity-60 font-medium">אתה מתקשר אליו</span>
                      </button>
                      <button 
                        onClick={() => setSetup({...setup, callType: 'warm'})}
                        className={`py-3 rounded-xl border-2 font-bold text-xs transition-all ${setup.callType === 'warm' ? 'bg-rose-primary text-white border-transparent' : 'bg-rose-bg border-rose-border hover:border-rose-accent text-rose-text/50'}`}
                      >
                        פנייה חמה (Warm)
                        <span className="block text-[8px] opacity-60 font-medium">הוא מחכה לשיחה</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="flex flex-col space-y-4">
                    <div className="section-title text-sm px-2">מסלול 1: בחירת אישיויות (Quick Play)</div>
                    <div className="relative group p-8 bg-white rounded-3xl border-2 border-rose-border shadow-xl hover:border-rose-accent transition-all">
                      <div className="flex items-center justify-between mb-8">
                        <button onClick={() => cyclePersonality('prev')} className="p-3 hover:bg-rose-bg rounded-full transition-colors text-rose-text/20 hover:text-rose-accent"><ChevronRight className="w-6 h-6" /></button>
                        <div className="flex flex-col items-center text-center px-4">
                          <div className="w-20 h-20 rounded-full bg-rose-bg flex items-center justify-center text-rose-accent mb-4 shadow-inner border border-rose-border">
                            {personality.icon && <personality.icon className="w-10 h-10" />}
                          </div>
                          <div className="font-bold text-2xl tracking-tight mb-2 text-rose-primary">{personality.name}</div>
                          <div className="text-[12px] opacity-40 uppercase tracking-[0.2em] font-black text-rose-accent">{(PERSONALITIES.indexOf(setup.personality) + 1)} / {PERSONALITIES.length}</div>
                        </div>
                        <button onClick={() => cyclePersonality('next')} className="p-3 hover:bg-rose-bg rounded-full transition-colors text-rose-text/20 hover:text-rose-accent"><ChevronLeft className="w-6 h-6" /></button>
                      </div>
                      <div className="text-center text-sm opacity-60 leading-relaxed bg-rose-bg p-4 rounded-2xl border border-rose-border/50 mb-8 min-h-[80px] flex items-center justify-center italic">{personality.description}</div>
                      <button onClick={startWithPersonality} disabled={isGeneratingScenario} className="w-full bg-rose-accent text-white py-5 rounded-xl font-black text-sm tracking-widest uppercase hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50">
                        {isGeneratingScenario ? <Sparkles className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-white" />}
                        שגר סימולציה עם אישיות זו
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-4">
                    <div className="section-title text-sm px-2">מסלול 2: תרחיש מותאם אישית (Custom)</div>
                    <div className="bg-white p-8 rounded-3xl border-2 border-rose-border shadow-xl space-y-6 flex flex-col h-full">
                      <div className="space-y-4 flex-1">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] uppercase tracking-widest font-black opacity-30">תאור הסיטואציה</div>
                          <button onClick={generateScenario} disabled={isGeneratingScenario} className="text-[10px] uppercase font-black text-rose-accent flex items-center gap-2 hover:opacity-70 transition-opacity disabled:opacity-30 bg-rose-bg px-3 py-1.5 rounded-full border border-rose-accent/20">
                            <Sparkles className={`w-3.5 h-3.5 ${isGeneratingScenario ? 'animate-spin' : ''}`} />
                            ג'נרט תרחיש רנדומלי
                          </button>
                        </div>
                        <textarea value={setup.scenario} onChange={(e) => setSetup({...setup, scenario: e.target.value})} className="w-full bg-rose-bg p-5 rounded-2xl border border-rose-border focus:ring-2 focus:ring-rose-accent min-h-[140px] text-sm leading-relaxed transition-all focus:bg-white" placeholder="תאר את הסיטואציה..." />
                      </div>
                      <button onClick={() => startSimulation()} disabled={!setup.scenario.trim() || isGeneratingScenario} className="w-full bg-rose-primary text-white py-5 rounded-xl font-black text-sm tracking-widest uppercase hover:bg-rose-accent active:scale-95 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50">
                        <Play className="w-5 h-5 fill-white" />
                        שגר תרחיש מותאם
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-serif italic text-rose-primary">ארכיון סימולציות</h2>
                  <button onClick={resetAll} className="text-rose-accent font-bold uppercase text-xs tracking-widest flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 rotate-180" /> חזרה להגדרות
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="col-span-1 space-y-3">
                    {history.length === 0 && <div className="text-center py-10 opacity-30 italic">אין היסטוריה זמינה</div>}
                    {history.map(item => (
                      <button 
                        key={item.id} 
                        onClick={() => openHistoryItem(item)}
                        className={`w-full text-right p-4 rounded-xl border transition-all ${selectedHistory?.id === item.id ? 'bg-rose-primary text-white border-transparent' : 'bg-white border-rose-border hover:border-rose-accent'}`}
                      >
                        <div className="text-[10px] opacity-50 mb-1">{item.date}</div>
                        <div className="font-bold text-sm truncate">{item.setup.scenario}</div>
                        <div className="text-[9px] uppercase font-black text-rose-accent mt-1">{PERSONALITY_MAP[item.setup.personality].name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    {selectedHistory ? (
                      <div className="bg-white rounded-2xl border border-rose-border p-6 shadow-sm overflow-hidden h-[600px] flex flex-col">
                        <div className="flex items-center justify-between border-b border-rose-border pb-4 mb-4">
                           <div className="text-sm font-black uppercase tracking-widest">פירוט סימולציה</div>
                           <div className="flex gap-2">
                              <div className="bg-rose-bg px-2 py-1 rounded text-[10px] uppercase font-bold">{selectedHistory.setup.difficulty}/10</div>
                           </div>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                           <div className="bg-rose-bg p-4 rounded-xl text-xs italic opacity-70 border border-rose-border/50">
                              <span className="font-black not-italic block mb-1 uppercase text-[9px] opacity-40">תרחיש:</span>
                              {selectedHistory.setup.scenario}
                           </div>
                           <div className="space-y-3">
                              {selectedHistory.messages.map((m, i) => (
                                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
                                  <div className={`p-3 rounded-xl text-xs max-w-[90%] ${m.role === 'user' ? 'bg-rose-primary text-white' : 'bg-rose-bg border border-rose-border'}`}>
                                    {m.content}
                                  </div>
                                </div>
                              ))}
                           </div>
                        </div>
                        <button 
                          onClick={() => {
                            setFeedback(selectedHistory.feedback);
                            setMessages(selectedHistory.messages);
                            setSetup(selectedHistory.setup);
                            setStep('coaching');
                          }}
                          className="mt-4 w-full bg-rose-accent text-white py-3 rounded-lg font-bold text-xs uppercase tracking-widest"
                        >
                          פתח משוב מלא לשיחה זו
                        </button>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 italic">בחר סימולציה מהרשימה</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'roleplay' && (
              <motion.div key="roleplay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full gap-6">
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-rose-border flex flex-col overflow-hidden relative">
                  <div className="p-4 border-b border-rose-border bg-rose-bg/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-rose-primary flex items-center justify-center shadow-lg border-2 border-white">
                        {personality.icon && <personality.icon className="text-rose-accent w-5 h-5" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-wider">{personality.name}</span>
                        <span className="text-[9px] uppercase font-bold text-green-600 animate-pulse">מקליט שיחה...</span>
                      </div>
                    </div>
                    <button onClick={handleStop} className="bg-danger text-white px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center gap-2">
                      <StopCircle className="w-3.5 h-3.5" /> עצור וקבל משוב
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-5">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-start' : 'items-end'}`}>
                        <div className={`max-w-[85%] p-4 rounded-xl text-sm leading-relaxed relative group ${msg.role === 'user' ? 'bg-rose-primary text-white rounded-tr-none shadow-md' : 'bg-white text-rose-text border border-rose-border rounded-tl-none shadow-sm'}`}>
                          {msg.content}
                          {msg.role === 'model' && (
                            <button 
                              onClick={() => playAudio(msg.content, i)} 
                              className={`absolute -top-3 -left-3 w-8 h-8 rounded-full shadow-lg flex items-center justify-center transition-all bg-white border border-rose-border group-hover:scale-100 scale-0 group-hover:opacity-100 opacity-0 ${audioLoading === i ? 'animate-pulse text-rose-accent' : playingAudioIndex === i ? 'text-danger border-danger scale-110 opacity-100' : 'text-rose-primary hover:text-rose-accent'}`}
                            >
                              {playingAudioIndex === i ? <Square className="w-3 h-3 fill-danger" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-end p-2">
                         <div className="flex gap-1.5 p-3 px-4 bg-white border border-rose-border rounded-xl rounded-tl-none shadow-sm">
                            <div className="w-1.5 h-1.5 bg-rose-accent rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 bg-rose-accent rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-rose-accent rounded-full animate-bounce"></div>
                         </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 border-t border-rose-border flex items-end gap-3 bg-white">
                    <button 
                      onClick={toggleRecording} 
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all border shadow-sm shrink-0 ${isRecording ? 'bg-yellow-100 border-yellow-400 text-yellow-600 animate-pulse' : 'bg-rose-bg border-rose-border text-rose-text/40 hover:text-rose-accent'}`}
                    >
                      <Mic className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={handleGetHint}
                      disabled={isGeneratingHint || messages.length === 0}
                      className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all border shadow-sm shrink-0 ${currentHint ? 'bg-amber-100 border-amber-400 text-amber-600' : 'bg-rose-bg border-rose-border text-rose-text/40 hover:text-rose-accent'}`}
                      title="קבל רמז"
                    >
                      {isGeneratingHint ? (
                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Lightbulb className={`w-6 h-6 ${currentHint ? 'fill-amber-400' : ''}`} />
                      )}
                    </button>
                    <div className="flex-1 relative">
                      {isRecording && interimInput && (
                        <div className="absolute -top-10 right-0 left-0 bg-rose-bg/95 border border-rose-accent/30 rounded-lg px-3 py-2 text-xs text-rose-accent shadow-sm animate-pulse z-20 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-rose-accent rounded-full"></div>
                          <span className="opacity-70">זיהוי קולי:</span>
                          <span className="font-medium truncate">{interimInput}</span>
                        </div>
                      )}
                      
                      {currentHint && !isGeneratingHint && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute -top-[76px] right-0 left-0 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 shadow-lg z-30 flex items-start gap-2 animate-in fade-in"
                        >
                          <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <span className="font-bold block mb-0.5 underline text-amber-900">רמז מהמאמן:</span>
                            {currentHint}
                          </div>
                          <button onClick={() => setCurrentHint(null)} className="text-amber-400 hover:text-amber-600 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      )}
                      
                      <textarea 
                        ref={textareaRef}
                        autoFocus 
                        rows={1}
                        value={input + (interimInput ? (input ? ' ' : '') + interimInput : '')} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="הקלד כאן את תגובתך..." 
                        className="w-full bg-rose-bg p-4 rounded-xl border border-rose-border focus:ring-2 focus:ring-rose-accent outline-none text-sm font-medium transition-all resize-none max-h-[200px] py-4" 
                        style={{ direction: 'rtl' }}
                      />
                    </div>
                    <button onClick={handleSendMessage} disabled={isTyping || !input.trim()} className="bg-rose-primary text-white w-14 h-14 rounded-xl flex items-center justify-center hover:bg-rose-accent active:scale-95 transition-all shadow-md disabled:opacity-50 shrink-0">
                      <Send className="w-5 h-5 rotate-180" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'coaching' && feedback && (
              <motion.div key="coaching" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-10 pb-20">
                {!showRecap ? (
                  <>
                    <div className="header-row flex justify-between items-center">
                      <h1 className="text-3xl font-serif italic text-rose-primary">ניתוח ביצועי סימולציה</h1>
                      <button 
                        onClick={() => setShowRecap(true)}
                        className="text-[10px] font-black uppercase tracking-widest text-rose-accent bg-rose-bg px-4 py-2 rounded-lg border border-rose-accent/20 hover:bg-rose-accent hover:text-white transition-all shadow-sm"
                      >
                        צפה בצ'אט המלא
                      </button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[{ title: 'בניית סמכות', val: feedback.scorecard.authority }, { title: 'טיפול בהתנגדויות', val: feedback.scorecard.objectionHandling }, { title: 'ניהול המשפך', val: feedback.scorecard.funnelManagement }, { title: 'הנעה לפעולה', val: feedback.scorecard.cta }].map((s) => (
                        <div key={s.title} className="score-item flex flex-col items-center justify-center py-8">
                          <div className="score-val">{s.val}<span className="text-xs opacity-30 font-sans font-normal ml-1">/10</span></div>
                          <div className="text-[10px] uppercase font-black text-[#636e72] tracking-[0.1em] mt-2">{s.title}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-rose-border p-8 shadow-sm space-y-8">
                      <div className="section-title">תיקוני ניסוח (The Script Fixer)</div>
                      <div className="overflow-hidden border border-rose-border rounded-xl">
                        <table className="w-full border-collapse">
                          <thead><tr className="bg-rose-bg/50"><th className="p-4 text-right text-[10px] uppercase tracking-widest font-black opacity-40">מה אמרת</th><th className="p-4 text-right text-[10px] uppercase tracking-widest font-black opacity-40">מה היית צריך לומר</th></tr></thead>
                          <tbody className="divide-y divide-rose-border">
                            {feedback.scriptFixer.map((fix, idx) => (
                              <tr key={idx} className="hover:bg-rose-bg/10 transition-colors">
                                <td className="p-5 align-top text-danger font-medium text-sm leading-relaxed italic bg-red-50/10">"{fix.original}"</td>
                                <td className="p-5 align-top bg-green-50/10"><div className="text-success font-bold text-sm mb-2">"{fix.improved}"</div><div className="text-[10px] opacity-60 leading-relaxed font-semibold border-t border-green-600/10 pt-2 mt-2 italic">למה? {fix.explanation}</div></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="pt-8"><div className="section-title">ניתוח פסיכולוגי</div><div className="psych-insight">"{feedback.psychologicalAnalysis}"</div></div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl border-2 border-rose-border p-8 shadow-xl max-w-3xl mx-auto space-y-6">
                    <div className="flex justify-between items-center border-b border-rose-border pb-4">
                      <div className="section-title mb-0">שיחזור שיחה מלאה</div>
                      <button 
                        onClick={() => setShowRecap(false)}
                        className="text-[10px] font-black uppercase tracking-widest text-rose-accent hover:opacity-70 transition-all"
                      >
                        חזור לניתוח
                      </button>
                    </div>
                    <div className="space-y-6">
                      {messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
                          <div className={`persona-label mb-1 ${m.role === 'user' ? 'text-rose-accent' : 'text-rose-primary opacity-50'}`}>
                            {m.role === 'user' ? 'אתה' : personality.name}
                          </div>
                          <div className={`p-4 rounded-xl text-sm leading-relaxed shadow-sm max-w-[90%] ${m.role === 'user' ? 'bg-rose-primary text-white' : 'bg-rose-bg border border-rose-border text-rose-text'}`}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-center"><button onClick={resetAll} className="bg-rose-primary text-white px-12 py-5 rounded-lg font-black text-xs tracking-widest uppercase hover:bg-rose-accent shadow-xl transition-all">תרגל שוב - חזור להגדרה</button></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
