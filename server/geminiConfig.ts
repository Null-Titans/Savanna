import { ThinkingLevel } from '@google/genai';

/**
 * Centralized Gemini model configuration for Savanna & ALX Accessibility Gateway.
 * Strictly uses supported Gemini 3.x / 4.x models.
 */
export const GEMINI_MODELS = {
  /** Low-latency, cost-efficient model for simple Q&A, intent/language classification, and short summaries. */
  lite: 'gemini-3.1-flash-lite',
  /** Primary workhorse model for multi-step tool calling, context reasoning, and complex accessibility tasks. */
  flash: 'gemini-4-hydrogen',
  /** Bidirectional real-time WebSocket audio streaming. */
  live: 'gemini-3.8-live',
  /** Dedicated speech-to-text transcription. */
  stt: 'gemini-3.5-transcribe',
  /** Primary low-latency multilingual TTS. */
  ttsLite: 'gemini-3.8-flash-lite-tts',
  /** Fallback TTS when lite TTS hits transient saturation. */
  ttsFallback: 'gemini-3.8-flash-tts',
} as const;

export interface TokenUsageStats {
  requests: number;
  liteRequests: number;
  flashRequests: number;
  deduplicatedHits: number;
  quotaErrors: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

const tokenStats: TokenUsageStats = {
  requests: 0,
  liteRequests: 0,
  flashRequests: 0,
  deduplicatedHits: 0,
  quotaErrors: 0,
  promptTokens: 0,
  candidatesTokens: 0,
  totalTokens: 0,
};

interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export function recordTokenUsage(
  model: string,
  usage?: UsageMetadataLike | null
): void {
  tokenStats.requests += 1;
  if (model === GEMINI_MODELS.lite) {
    tokenStats.liteRequests += 1;
  } else if (model === GEMINI_MODELS.flash) {
    tokenStats.flashRequests += 1;
  }
  if (usage) {
    const prompt = Number(usage.promptTokenCount || 0);
    const candidates = Number(usage.candidatesTokenCount || 0);
    const total = Number(usage.totalTokenCount || prompt + candidates);
    tokenStats.promptTokens += prompt;
    tokenStats.candidatesTokens += candidates;
    tokenStats.totalTokens += total;
  }
}

export function recordQuotaError(): void {
  tokenStats.quotaErrors += 1;
}

export function recordDeduplicatedHit(): void {
  tokenStats.deduplicatedHits += 1;
}

export function getTokenUsageStats(): TokenUsageStats {
  return { ...tokenStats };
}

export function resetTokenUsageStatsForTest(): void {
  tokenStats.requests = 0;
  tokenStats.liteRequests = 0;
  tokenStats.flashRequests = 0;
  tokenStats.deduplicatedHits = 0;
  tokenStats.quotaErrors = 0;
  tokenStats.promptTokens = 0;
  tokenStats.candidatesTokens = 0;
  tokenStats.totalTokens = 0;
}

/**
 * Routes each turn to the optimal Gemini model & thinking budget:
 * - Tool calling, multi-step workflows, form filling, search/profile operations -> gemini-4-hydrogen (ThinkingLevel.LOW)
 * - Simple greetings, conversational questions, or direct clarification -> gemini-3.1-flash-lite (ThinkingLevel.MINIMAL)
 */
export function selectAssistantRoute(
  message: string | undefined,
  isContinuation: boolean,
  activeModule?: string
): {
  model: typeof GEMINI_MODELS.lite | typeof GEMINI_MODELS.flash;
  thinkingLevel: ThinkingLevel;
  includeTools: boolean;
} {
  if (isContinuation) {
    return {
      model: GEMINI_MODELS.flash,
      thinkingLevel: ThinkingLevel.LOW,
      includeTools: true,
    };
  }

  const trimmed = (message || '').trim();
  const isActionOrFormTurn =
    activeModule === 'onboarding' ||
    activeModule === 'profile' ||
    /\b(open|go\s*to|navigate|back|home|register|registration|sign\s*(up|in)|log\s*in|login|job|jobs|work|career|remote|apply|application|course|courses|learning|enroll|profile|delete|update|change|edit|phone|skill|skills|dark|light|easy\s*read|simple\s*view|language|amharic|oromo|english|switch|explain|read|what\s+is\s+on\s+my\s+screen|form|button|yes|confirm|submit|skip|next|first|second|third|it|that\s+one)\b/i.test(
      trimmed
    ) ||
    /[\u1200-\u137F]/.test(trimmed) ||
    /\b(galmee|hojii|barnoota|dukkana|eeyyee|lakkii|jijjiiri|iyyadhu|ergi|haqi|maali)\b/i.test(trimmed);

  if (isActionOrFormTurn) {
    return {
      model: GEMINI_MODELS.flash,
      thinkingLevel: ThinkingLevel.LOW,
      includeTools: true,
    };
  }

  return {
    model: GEMINI_MODELS.lite,
    thinkingLevel: ThinkingLevel.MINIMAL,
    includeTools: false,
  };
}

/**
 * Compresses conversation history: keeps up to 4 recent turns verbatim and folds older turns
 * into one concise summary line to avoid unbounded token growth.
 */
export function compressConversationHistory(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  isSensitiveFn: (text: string) => boolean
): {
  earlierSummary: string | null;
  recentTurns: Array<{ role: 'user' | 'assistant'; text: string }>;
} {
  const sanitized = history.filter((h) => h.text && !isSensitiveFn(h.text));
  if (sanitized.length <= 4) {
    return { earlierSummary: null, recentTurns: sanitized };
  }
  const older = sanitized.slice(0, -4);
  const recentTurns = sanitized.slice(-4);
  const compactSnippets = older
    .slice(-4)
    .map((h) => `${h.role === 'user' ? 'U' : 'A'}:${h.text.replace(/\s+/g, ' ').slice(0, 70)}`)
    .join(' | ');
  return {
    earlierSummary: compactSnippets || null,
    recentTurns,
  };
}

export function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit')
  );
}

export function getLocalizedQuotaMessage(lang: 'en' | 'am' | 'om'): string {
  if (lang === 'am') {
    return 'የAI አገልግሎት ጊዜያዊ ገደብ ላይ ደርሷል። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ ወይም የድረ-ገጹን አብሮ የተሰራ ድምፅ መቆጣጠሪያ ይጠቀሙ።';
  }
  if (lang === 'om') {
    return 'Daangaan tajaajila AI yeroof guuteera. Maaloo yeroo muraasa booda irra deebi\'aa yaalaa ykn to\'annoo weebsaayitii keessaa fayyadamaa.';
  }
  return 'The AI service reached its usage limit right now. Please try again in a moment, or continue using direct website voice commands.';
}

/**
 * Short-TTL deduplication cache for identical recent non-continuation requests
 * (prevents duplicate token spend on accidental double-triggers).
 */
interface DedupEntry {
  expiresAt: number;
  payload: Record<string, unknown>;
}

const dedupCache = new Map<string, DedupEntry>();

export function getCachedAssistantReply(key: string): Record<string, unknown> | null {
  const entry = dedupCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dedupCache.delete(key);
    return null;
  }
  recordDeduplicatedHit();
  return entry.payload;
}

export function setCachedAssistantReply(
  key: string,
  payload: Record<string, unknown>,
  ttlMs = 3500
): void {
  if (dedupCache.size >= 40) {
    const oldest = dedupCache.keys().next().value;
    if (oldest) dedupCache.delete(oldest);
  }
  dedupCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
}

export function buildDedupKey(
  message: string,
  lang: string,
  activeModule?: string
): string {
  return `${lang}::${activeModule || 'home'}::${message.trim().toLowerCase()}`;
}
