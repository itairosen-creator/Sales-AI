export type Personality = 'Traditionalist' | 'Hustler' | 'LowBaller' | 'Influencer' | 'Expert' | 'PoliteSkeptic' | 'Indecisive';

export interface ScenarioSetup {
  scenario: string;
  difficulty: number;
  personality: Personality;
  callType: 'cold' | 'warm';
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface CoachingFeedback {
  scorecard: {
    authority: number;
    objectionHandling: number;
    funnelManagement: number;
    cta: number;
  };
  psychologicalAnalysis: string;
  scriptFixer: Array<{
    original: string;
    improved: string;
    explanation: string;
  }>;
}

export interface UserProfile {
  name: string;
  avatar: string;
  serviceType: string;
  packages: Array<{ name: string; price: string; description: string }>;
}

export interface SimulationHistory {
  id: string;
  date: string;
  setup: ScenarioSetup;
  messages: ChatMessage[];
  feedback: CoachingFeedback;
}
