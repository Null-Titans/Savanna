export interface LearningTrack {
  id: string;
  category: 'se' | 'data' | 'ai' | 'a11y';
  title: string;
  duration: string;
  summary: string;
  assistiveNotes: string[];
  outcomes: string[];
}

export const LEARNING_TRACKS: LearningTrack[] = [
  {
    id: 'alx-se',
    category: 'se',
    title: 'ALX Software Engineering Foundations',
    duration: '12 Months · Hub & Hybrid',
    summary:
      'Build real-world backend, web, and accessible system engineering skills using semantic HTML, TypeScript, Python, and keyboard-first terminal workflows.',
    assistiveNotes: [
      'Full keyboard workflow for Git, Linux shell, and VS Code with NVDA / VoiceOver.',
      'Semantic ARIA landmark labs and automated WCAG 2.2 AA testing modules.',
    ],
    outcomes: ['Semantic TypeScript & React', 'REST API Proxying', 'Automated Accessibility Testing'],
  },
  {
    id: 'alx-data',
    category: 'data',
    title: 'ALX Data Science & Analytics',
    duration: '6 Months · Addis Ababa Hub',
    summary:
      'Learn structured data cleaning, SQL reasoning, Python analytics, and screen-reader accessible table and audio-chart storytelling.',
    assistiveNotes: [
      'High-contrast charts paired with descriptive CSV summaries and alt-text tables.',
      'Structured screen-reader navigation exercises for Jupyter Notebooks.',
    ],
    outcomes: ['Structured Data Summaries', 'Python & SQL Pipelines', 'Accessible Data Briefs'],
  },
  {
    id: 'alx-ai',
    category: 'ai',
    title: 'ALX AI Career Essentials',
    duration: '8 Weeks · Guided Labs',
    summary:
      'Master practical AI workflows, prompt engineering, privacy-safe tool design, and voice-first assistive AI assistants tailored for workplace productivity.',
    assistiveNotes: [
      'Voice-first prompt templates tested with browser Speech Recognition and TTS.',
      'Strict privacy guardrails covering token hygiene and zero sensitive input leaks.',
    ],
    outcomes: ['Accessible Prompt Workflows', 'Voice & Audio Tooling', 'AI Privacy Guardrails'],
  },
  {
    id: 'a11y-mastery',
    category: 'a11y',
    title: 'Screen-Reader & Voice Navigation Clinic',
    duration: 'Self-Paced · Audio Ready',
    summary:
      'Short practical guides for navigating Savanna Gateway, configuring Amharic/English speech synthesis, and preparing for inclusive tech interviews.',
    assistiveNotes: [
      'Keyboard quick-jump shortcuts: Alt+Shift+L repeats your exact location and page actions.',
      'Hands-free "Hey Access" activation setup over HTTPS with fallback text entry.',
    ],
    outcomes: ['Landmark Navigation', 'Hands-Free Wake Mic Setup', 'Interview Accommodation Prep'],
  },
];
