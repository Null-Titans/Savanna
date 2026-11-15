import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { LANGUAGE_REGISTRY } from '../../i18n/types';
import { useReadAloud } from '../../hooks/useReadAloud';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { useGeminiLive } from '../../hooks/useGeminiLive';
import { GatewayModule, SupportedLanguage } from '../../types/gateway';
import {
  detectSensitiveInput,
  extractSafeDomSummary,
  getSensitiveRefusalMessage,
} from '../../utils/privacyGuard';
import { resolveOrientationIntent } from '../../utils/pageOrientation';
import { ToolCallRequest, useWebsiteAgent } from '../../context/WebsiteAgentContext';
import {
  createOfflineAgentSessionState,
  OfflineAgentSessionState,
  runOfflineVoiceAgent,
} from '../../utils/offlineVoiceAgent';
import { speakTextAndWait } from '../../services/speech/speechService';
import { isGoodbyeCommand } from '../../utils/voiceCommands';

export { isGoodbyeCommand };

export type ConversationLifecycleState =
  | 'waiting'
  | 'activated'
  | 'listening'
  | 'processing'
  | 'responding'
  | 'active_conversation'
  | 'ended';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  language: SupportedLanguage;
  provider?: string;
}

interface VoiceAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  activeModule: GatewayModule;
  handsFreeActive?: boolean;
  liveActivationNonce?: number;
  liveDeactivationNonce?: number;
  expandNonce?: number;
  onLiveStatusChange?: (active: boolean) => void;
  colorMode?: 'light' | 'dark';
  easyRead?: boolean;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
  onNavigate?: (mod: GatewayModule) => void;
}

export const VoiceAssistantPanel: React.FC<VoiceAssistantPanelProps> = ({
  open,
  onClose,
  activeModule,
  handsFreeActive = false,
  liveActivationNonce = 0,
  liveDeactivationNonce = 0,
  expandNonce = 0,
  onLiveStatusChange,
  colorMode = 'light',
  easyRead = false,
  initialPrompt = null,
  onConsumeInitialPrompt,
  onNavigate,
}) => {
  const { language, t, setLanguage, format } = useI18n();
  const agent = useWebsiteAgent();
  const [autoDetect, setAutoDetect] = useState(true);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lifecycleState, setLifecycleState] = useState<ConversationLifecycleState>(() =>
    open ? (handsFreeActive ? 'activated' : 'active_conversation') : 'waiting'
  );

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const handledVoiceTranscriptRef = useRef<string | null>(null);
  const offlineSessionRef = useRef<OfflineAgentSessionState>(createOfflineAgentSessionState());
  const isOpenRef = useRef(open);
  isOpenRef.current = open;
  const handsFreeRef = useRef(handsFreeActive);
  handsFreeRef.current = handsFreeActive;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const endedSessionRef = useRef(false);
  const handsFreeBootstrappedRef = useRef(false);
  const lastLiveNonceRef = useRef(0);
  const lastDeactivateNonceRef = useRef(0);
  const unclearRetryCountRef = useRef(0);
  const lastHandledErrorRef = useRef(false);
  const relistenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isSpeaking,
    isLoadingAudio,
    hasAuthenticVoice,
    usingNeuralVoice,
    voiceStatusNote,
    read,
    stop: stopAudio,
  } = useReadAloud(language);

  const handleDetectedLanguage = useCallback(
    (detected: SupportedLanguage) => {
      if (autoDetect && detected !== language) {
        const meta = LANGUAGE_REGISTRY.find((l) => l.code === detected);
        setLanguageNotice(
          format(t.voiceAssistant.switchedLanguageNotice, {
            language: meta ? meta.nativeName : detected.toUpperCase(),
          })
        );
        void setLanguage(detected);
      }
    },
    [autoDetect, format, language, setLanguage, t.voiceAssistant.switchedLanguageNotice]
  );

  const {
    status: micStatus,
    transcript: micTranscript,
    detectedLanguage: micDetectedLang,
    errorDetail: micErrorDetail,
    recognitionAvailable,
    browserSttAvailable,
    languageNotSupportedInBrowser,
    canFallbackToBrowserEnglish,
    micPermission,
    startListening,
    stopListening,
    discardTranscript,
  } = useSpeechInput(autoDetect ? 'auto' : language, handleDetectedLanguage);

  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;
  const recognitionAvailableRef = useRef(recognitionAvailable);
  recognitionAvailableRef.current = recognitionAvailable;
  const browserSttAvailableRef = useRef(browserSttAvailable);
  browserSttAvailableRef.current = browserSttAvailable;

  const handleLiveToolCall = useCallback(
    async (call: ToolCallRequest) => {
      if (!agent) {
        return {
          ok: false,
          toolName: call.name,
          data: { error: 'Website agent context is unavailable.' },
        };
      }
      return agent.executeWebsiteTool(call.name, call.args || {});
    },
    [agent]
  );

  const clearRelistenTimer = useCallback(() => {
    if (relistenTimerRef.current !== null) {
      clearTimeout(relistenTimerRef.current);
      relistenTimerRef.current = null;
    }
  }, []);

  const handleLiveExit = useCallback(() => {
    endedSessionRef.current = true;
    clearRelistenTimer();
    stopListening();
    setLifecycleState('ended');
    const goodbyeText = t.voiceAssistant.handsFreeGoodbye;
    void (async () => {
      await speakTextAndWait(goodbyeText, language);
      if (isOpenRef.current) {
        onClose();
      }
    })();
  }, [clearRelistenTimer, language, onClose, stopListening, t.voiceAssistant.handsFreeGoodbye]);

  const {
    status: liveStatus,
    errorMessage: liveError,
    liveInputDraft,
    liveOutputDraft,
    entries: liveEntries,
    startSession: startLiveSession,
    stopSession: stopLiveSession,
    sendText: sendLiveText,
    syncContext: syncLiveContext,
  } = useGeminiLive(language, activeModule, {
    onToolCall: agent ? handleLiveToolCall : undefined,
    getStateSnapshot: agent?.getWebsiteStateSnapshot,
    onExitCommand: handleLiveExit,
    onSessionReady: () => {
      setLifecycleState('active_conversation');
    },
  });

  const liveStatusRef = useRef(liveStatus);
  liveStatusRef.current = liveStatus;

  useEffect(() => {
    onLiveStatusChange?.(liveStatus === 'connecting' || liveStatus === 'connected');
  }, [liveStatus, onLiveStatusChange]);

  useEffect(() => {
    if (expandNonce > 0) {
      setIsMinimized(false);
    }
  }, [expandNonce]);

  // Synchronize live page/form state to Gemini Live mid-conversation (initial context is already sent on ready)
  useEffect(() => {
    if (liveStatusRef.current === 'connected') {
      syncLiveContext();
    }
  }, [
    activeModule,
    agent?.onboardingStepIndex,
    agent?.onboardingIsReview,
    agent?.applyingJob?.id,
    agent?.jobAppStepIndex,
    syncLiveContext,
  ]);

  // Activate Gemini Live immediately when Ctrl+Tab / Ctrl+Shift+A / Ctrl+Alt+Shift+A shortcut is pressed (idempotent guard)
  useEffect(() => {
    if (liveActivationNonce === 0) {
      lastLiveNonceRef.current = 0;
      return;
    }
    if (!open || liveActivationNonce < 0 || lastLiveNonceRef.current === liveActivationNonce) {
      return;
    }
    lastLiveNonceRef.current = liveActivationNonce;
    if (liveStatusRef.current === 'connecting' || liveStatusRef.current === 'connected') {
      return;
    }
    endedSessionRef.current = false;
    setIsMinimized(false);
    setLiveNotice(null);
    stopListening();
    stopAudio();
    setLifecycleState('activated');
    void startLiveSession({ greetOnReady: true });
  }, [liveActivationNonce, open, startLiveSession, stopAudio, stopListening]);

  // Immediately stop Gemini Live, release microphone tracks, and return to Idle on Ctrl+Shift+A toggle-off
  useEffect(() => {
    if (liveDeactivationNonce === 0) {
      lastDeactivateNonceRef.current = 0;
      return;
    }
    if (
      !open ||
      liveDeactivationNonce < 0 ||
      lastDeactivateNonceRef.current === liveDeactivationNonce
    ) {
      return;
    }
    lastDeactivateNonceRef.current = liveDeactivationNonce;
    clearRelistenTimer();
    stopLiveSession();
    stopListening();
    stopAudio();
    setLifecycleState('waiting');
    setLiveNotice(t.voiceAssistant.liveStoppedNotice);
  }, [
    clearRelistenTimer,
    liveDeactivationNonce,
    open,
    stopAudio,
    stopListening,
    stopLiveSession,
    t.voiceAssistant.liveStoppedNotice,
  ]);

  // Timer cleanup helper declared above handleLiveExit

  const scheduleHandsFreeListen = useCallback(
    (delayMs = 120) => {
      clearRelistenTimer();
      if (
        !isOpenRef.current ||
        !handsFreeRef.current ||
        endedSessionRef.current ||
        (!recognitionAvailable && !browserSttAvailable)
      ) {
        return;
      }
      relistenTimerRef.current = setTimeout(() => {
        relistenTimerRef.current = null;
        if (
          !isOpenRef.current ||
          !handsFreeRef.current ||
          endedSessionRef.current
        ) {
          return;
        }
        handledVoiceTranscriptRef.current = null;
        setLifecycleState('listening');
        startListening(recognitionAvailable ? undefined : 'en');
      }, delayMs);
    },
    [browserSttAvailable, clearRelistenTimer, recognitionAvailable, startListening]
  );

  useEffect(() => {
    if (open) {
      setIsMinimized(false);
      closeBtnRef.current?.focus();
    } else {
      clearRelistenTimer();
      handsFreeBootstrappedRef.current = false;
      endedSessionRef.current = false;
      unclearRetryCountRef.current = 0;
      lastHandledErrorRef.current = false;
      setLiveNotice(null);
      setLifecycleState('waiting');
      stopListening();
      stopAudio();
      stopLiveSession();
    }
  }, [clearRelistenTimer, open, stopAudio, stopListening, stopLiveSession]);

  useEffect(() => {
    return () => {
      isOpenRef.current = false;
      clearRelistenTimer();
    };
  }, [clearRelistenTimer]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        endedSessionRef.current = true;
        clearRelistenTimer();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearRelistenTimer, open, onClose]);

  const speakAndContinueIfHandsFree = useCallback(
    async (replyText: string, replyLang: SupportedLanguage) => {
      setLifecycleState('responding');
      if (handsFreeRef.current && !endedSessionRef.current) {
        await speakTextAndWait(replyText, replyLang);
        if (!isOpenRef.current || endedSessionRef.current) return;
        setLifecycleState('active_conversation');
        scheduleHandsFreeListen(120);
      } else {
        void read(replyText, replyLang);
        setLifecycleState('active_conversation');
      }
    },
    [read, scheduleHandsFreeListen]
  );

  const sendMessage = useCallback(
    async (rawText: string, explicitLang?: SupportedLanguage) => {
      const cleaned = rawText.trim();
      if (!cleaned || isSending) return;

      clearRelistenTimer();
      // Barge-in / Echo Guard: stop active playback before handling next turn
      stopAudio();

      const userLang = explicitLang || language;

      // Hands-free exit phrases ("Goodbye", "Stop listening", "End conversation", AM/OM equivalents)
      if (isGoodbyeCommand(cleaned)) {
        stopListening();
        endedSessionRef.current = true;
        setInputText('');
        setAssistantError(null);
        setLifecycleState('ended');
        const userMsg: ChatMessage = {
          id: `u-${Date.now()}`,
          role: 'user',
          text: cleaned,
          language: userLang,
        };
        const goodbyeText = t.voiceAssistant.handsFreeGoodbye;
        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: goodbyeText,
          language: userLang,
          provider: 'hands-free-exit',
        };
        setMessages((prev) => [...prev, userMsg, botMsg]);
        await speakTextAndWait(goodbyeText, userLang);
        if (isOpenRef.current) {
          onClose();
        }
        return;
      }

      // Strict Data & Privacy Guardrail: never store, display, or forward passwords, PINs, tokens, or financial data
      if (detectSensitiveInput(cleaned).isSensitive) {
        setInputText('');
        const refusal = getSensitiveRefusalMessage(userLang);
        setAssistantError(refusal);
        await speakAndContinueIfHandsFree(refusal, userLang);
        return;
      }

      unclearRetryCountRef.current = 0;
      setAssistantError(null);
      setNavigationNotice(null);
      setLifecycleState('processing');
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: cleaned,
        language: userLang,
      };
      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      setInputText('');

      // Fast, deterministic spatial orientation response for "Where am I?" / "What can I do?"
      const orientationReply = resolveOrientationIntent(cleaned, activeModule, userLang);
      if (orientationReply) {
        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: orientationReply,
          language: userLang,
          provider: 'spatial-orientation',
        };
        setMessages((prev) => [...prev, botMsg]);
        await speakAndContinueIfHandsFree(orientationReply, userLang);
        return;
      }

      setIsSending(true);
      let completedTurn = false;
      try {
        const safePageSummary = extractSafeDomSummary();
        const postAssistant = async (payload: Record<string, unknown>) => {
          const response = await fetch('/api/speech/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const body = (await response.json().catch(() => ({}))) as {
            status?: string;
            replyText?: string;
            language?: SupportedLanguage;
            provider?: string;
            error?: string;
            code?: string;
            toolCalls?: ToolCallRequest[];
            contentsSoFar?: unknown[];
          };
          return { response, body };
        };

        let { response: res, body: data } = await postAssistant({
          message: cleaned,
          language: userLang,
          autoDetect,
          context: {
            activeModule,
            colorMode,
            easyRead,
            safePageSummary,
            websiteState: agent?.getWebsiteStateSnapshot(),
          },
          history: nextHistory.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
        });

        // Multi-round Gemini FunctionDeclaration execution loop against real website controls
        let toolRound = 0;
        while (
          res.ok &&
          data.status === 'tool_calls' &&
          Array.isArray(data.toolCalls) &&
          data.toolCalls.length > 0 &&
          Array.isArray(data.contentsSoFar) &&
          agent &&
          toolRound < 4
        ) {
          toolRound += 1;
          const toolResponses: Array<{
            id?: string;
            name: string;
            response: Record<string, unknown>;
          }> = [];
          for (const fc of data.toolCalls) {
            const execRes = await agent.executeWebsiteTool(fc.name, fc.args || {});
            toolResponses.push({
              id: fc.id,
              name: fc.name,
              response: execRes.data,
            });
          }

          const followUp = await postAssistant({
            language: data.language || userLang,
            autoDetect: false,
            context: {
              activeModule: agent.activeModule,
              colorMode: agent.colorMode,
              easyRead: agent.easyRead,
              safePageSummary: extractSafeDomSummary(),
              websiteState: agent.getWebsiteStateSnapshot(),
            },
            continuation: {
              contents: data.contentsSoFar,
              toolResponses,
            },
          });
          res = followUp.response;
          data = followUp.body;
        }

        // Quota resilience: HTTP 429 / ASSISTANT_QUOTA switches smoothly to local website voice agent
        if ((res.status === 429 || data.code === 'ASSISTANT_QUOTA') && agent) {
          setLanguageNotice(data.error || t.voiceAssistant.quotaReachedNotice);
          const targetLang: SupportedLanguage = data.language || userLang;
          const offlineResult = await runOfflineVoiceAgent(
            cleaned,
            targetLang,
            agent.getWebsiteStateSnapshot(),
            agent.executeWebsiteTool,
            offlineSessionRef.current
          );
          res = new Response('{}', { status: 200 });
          data = {
            status: 'complete',
            replyText: offlineResult.replyText,
            language: offlineResult.language,
            provider: 'website-voice-agent-quota-fallback',
          };
        } else if (
          res.ok &&
          (data.provider === 'offline-fallback' || data.status === 'offline') &&
          agent
        ) {
          // Offline/unconfigured Gemini fallback -> execute real website controls via multilingual local agent
          const targetLang: SupportedLanguage = data.language || userLang;
          const offlineResult = await runOfflineVoiceAgent(
            cleaned,
            targetLang,
            agent.getWebsiteStateSnapshot(),
            agent.executeWebsiteTool,
            offlineSessionRef.current
          );
          data = {
            status: 'complete',
            replyText: offlineResult.replyText,
            language: offlineResult.language,
            provider: 'website-voice-agent',
          };
        }

        if (!res.ok || !data.replyText) {
          throw new Error(data.error || 'Voice assistant could not answer right now.');
        }

        const replyLang: SupportedLanguage = data.language || userLang;
        if (autoDetect && replyLang !== language) {
          const meta = LANGUAGE_REGISTRY.find((l) => l.code === replyLang);
          setLanguageNotice(
            format(t.voiceAssistant.switchedLanguageNotice, {
              language: meta ? meta.nativeName : replyLang.toUpperCase(),
            })
          );
          await setLanguage(replyLang);
        }

        const botMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.replyText,
          language: replyLang,
          provider: data.provider,
        };
        setMessages((prev) => [...prev, botMsg]);
        completedTurn = true;

        // Speak response strictly in its matched language, and resume listening if hands-free is active
        await speakAndContinueIfHandsFree(data.replyText, replyLang);
      } catch (err) {
        // If fetch itself failed cleanly (true offline/network unreachable, not explicit HTTP error)
        if (err instanceof TypeError && agent) {
          const offlineResult = await runOfflineVoiceAgent(
            cleaned,
            userLang,
            agent.getWebsiteStateSnapshot(),
            agent.executeWebsiteTool,
            offlineSessionRef.current
          );
          const botMsg: ChatMessage = {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: offlineResult.replyText,
            language: offlineResult.language,
            provider: 'website-voice-agent',
          };
          setMessages((prev) => [...prev, botMsg]);
          completedTurn = true;
          await speakAndContinueIfHandsFree(offlineResult.replyText, offlineResult.language);
        } else {
          setAssistantError(
            err instanceof Error
              ? err.message
              : 'Unable to reach voice assistant. Please try again.'
          );
          setLifecycleState('active_conversation');
        }
      } finally {
        setIsSending(false);
        if (!completedTurn && !endedSessionRef.current) {
          setLifecycleState('active_conversation');
        }
      }
    },
    [
      activeModule,
      agent,
      autoDetect,
      clearRelistenTimer,
      colorMode,
      easyRead,
      format,
      isSending,
      language,
      onClose,
      setLanguage,
      speakAndContinueIfHandsFree,
      stopAudio,
      stopListening,
      t.voiceAssistant.handsFreeGoodbye,
      t.voiceAssistant.quotaReachedNotice,
      t.voiceAssistant.switchedLanguageNotice,
    ]
  );

  // Wake-phrase ("Hey Access") automatic activation greeting -> speaks greeting aloud, then opens mic automatically
  useEffect(() => {
    if (!open || !handsFreeActive || handsFreeBootstrappedRef.current || initialPrompt) {
      return;
    }
    handsFreeBootstrappedRef.current = true;
    endedSessionRef.current = false;
    unclearRetryCountRef.current = 0;

    const greetingText = t.voiceAssistant.handsFreeGreeting;
    setLifecycleState('activated');
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.provider === 'hands-free-greeting') return prev;
      return [
        ...prev,
        {
          id: `a-greeting-${Date.now()}`,
          role: 'assistant',
          text: greetingText,
          language,
          provider: 'hands-free-greeting',
        },
      ];
    });

    void (async () => {
      await speakTextAndWait(greetingText, language);
      if (!isOpenRef.current || endedSessionRef.current || !handsFreeRef.current) {
        return;
      }
      if (recognitionAvailableRef.current || browserSttAvailableRef.current) {
        handledVoiceTranscriptRef.current = null;
        setLifecycleState('listening');
        startListeningRef.current(recognitionAvailableRef.current ? undefined : 'en');
      } else {
        setLifecycleState('active_conversation');
      }
    })();
  }, [
    handsFreeActive,
    initialPrompt,
    language,
    open,
    t.voiceAssistant.handsFreeGreeting,
  ]);

  // Synchronize mic status transitions & recover politely from empty/unclear speech during hands-free loop
  useEffect(() => {
    if (!open || endedSessionRef.current) return;

    if (micStatus === 'listening') {
      lastHandledErrorRef.current = false;
      setLifecycleState('listening');
      return;
    }
    if (micStatus === 'transcribing') {
      lastHandledErrorRef.current = false;
      setLifecycleState('processing');
      return;
    }
    if (micStatus !== 'error') {
      lastHandledErrorRef.current = false;
      return;
    }

    if (
      handsFreeActive &&
      !isSending &&
      !lastHandledErrorRef.current &&
      !languageNotSupportedInBrowser &&
      !/no microphone|could not access microphone|could not start/i.test(micErrorDetail || '')
    ) {
      lastHandledErrorRef.current = true;
      if (unclearRetryCountRef.current < 2) {
        unclearRetryCountRef.current += 1;
        void (async () => {
          setLifecycleState('responding');
          await speakTextAndWait(t.voiceAssistant.unclearSpeechRetry, language);
          if (!isOpenRef.current || endedSessionRef.current || !handsFreeRef.current) return;
          scheduleHandsFreeListen(120);
        })();
      } else {
        setLifecycleState('active_conversation');
      }
    }
  }, [
    handsFreeActive,
    isSending,
    language,
    languageNotSupportedInBrowser,
    micErrorDetail,
    micStatus,
    open,
    scheduleHandsFreeListen,
    t.voiceAssistant.unclearSpeechRetry,
  ]);

  // Automatically submit finalized voice transcripts from the microphone
  useEffect(() => {
    if (
      micStatus === 'reviewing' &&
      micTranscript.trim() &&
      handledVoiceTranscriptRef.current !== micTranscript
    ) {
      handledVoiceTranscriptRef.current = micTranscript;
      const textToSend = micTranscript.trim();
      const langToSend = micDetectedLang || language;
      discardTranscript();
      void sendMessage(textToSend, langToSend);
    }
  }, [discardTranscript, language, micDetectedLang, micStatus, micTranscript, sendMessage]);

  // Execute external quick orientation prompts ("Where am I?", "What can I do?") when opened
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      const promptToRun = initialPrompt.trim();
      onConsumeInitialPrompt?.();
      void sendMessage(promptToRun, language);
    }
  }, [initialPrompt, language, onConsumeInitialPrompt, open, sendMessage]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="gw-voice-assistant-title"
      className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-50 w-[calc(100vw-1.5rem)] sm:w-[440px] max-w-lg pointer-events-auto"
    >
      <div
        className={`w-full bg-white dark:bg-slate-900 text-[#0F1E36] dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 flex flex-col overflow-hidden ${
          isMinimized ? '' : 'max-h-[min(82vh,680px)]'
        }`}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-3 bg-[#0F1E36] text-white shrink-0 border-b border-white/10 dark:border-slate-800"
          style={{ backgroundColor: 'var(--gw-primary)', color: 'var(--gw-primary-text)' }}
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-amber-500 text-[#0F1E36] flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4" aria-hidden="true" />
              </span>
              <h2
                id="gw-voice-assistant-title"
                className="text-lg font-bold text-white tracking-tight truncate"
              >
                {t.voiceAssistant.title}
              </h2>
            </div>
            <p className="text-xs text-slate-200 flex flex-wrap items-center gap-1.5">
              <span>
                {usingNeuralVoice
                  ? t.voiceAssistant.providerBadgeNeural
                  : t.voiceAssistant.providerBadgeBrowser}
              </span>
              <span aria-hidden="true">·</span>
              <span aria-live="polite" data-testid="va-lifecycle-state">
                {t.voiceAssistant.stateLabels[lifecycleState]}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsMinimized((m) => !m)}
              aria-expanded={!isMinimized}
              aria-label={
                isMinimized ? t.voiceAssistant.expandButton : t.voiceAssistant.minimizeButton
              }
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md border border-white/25 bg-[#162947] text-white hover:bg-white/15 transition-colors cursor-pointer"
            >
              {isMinimized ? (
                <ChevronUp className="w-5 h-5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label={t.voiceAssistant.closeButton}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md border border-white/25 bg-[#162947] text-white hover:bg-white/15 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={isMinimized ? 'hidden' : 'flex flex-col flex-1 min-h-0 overflow-hidden'}>
          {/* Strictly 3-Language Selector, Auto-Detect & Gemini Live Control */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
                <label
                  htmlFor="gw-va-lang-select"
                  className="text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
                >
                  {t.common.languageLabel}:
                </label>
                <select
                  id="gw-va-lang-select"
                  value={language}
                  onChange={(e) => {
                    const next = e.target.value as SupportedLanguage;
                    setLanguageNotice(null);
                    void setLanguage(next);
                  }}
                  className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3 py-1.5 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0F1E36] dark:focus:border-amber-400"
                >
                  {LANGUAGE_REGISTRY.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    setMessages([]);
                    setAssistantError(null);
                    setLanguageNotice(null);
                    setLiveNotice(null);
                  }}
                  className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-[#F3F4F6] dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.voiceAssistant.clearChat}</span>
                </button>
              )}
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-[#0F1E36] dark:text-slate-200">
              <input
                type="checkbox"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400 dark:border-slate-600 accent-[#0F1E36] dark:accent-amber-500"
              />
              <span>{t.voiceAssistant.autoDetectLabel}</span>
            </label>

            {languageNotice && (
              <p
                role="status"
                className="text-xs font-medium text-[#0F1E36] dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2"
              >
                {languageNotice}
              </p>
            )}

            {/* Real-Time Gemini Live (gemini-3.8-live) Conversation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F3F4F6] dark:bg-slate-800/80 px-3 py-2">
              <span className="text-xs font-semibold text-[#0F1E36] dark:text-slate-100">
                {liveStatus === 'connected'
                  ? 'Live Voice Active (gemini-3.8-live)'
                  : liveStatus === 'connecting'
                  ? 'Connecting Live Voice…'
                  : 'Real-Time Voice (gemini-3.8-live)'}
              </span>
              {liveStatus === 'connected' || liveStatus === 'connecting' ? (
                <button
                  type="button"
                  onClick={() => {
                    stopLiveSession();
                    setLifecycleState('waiting');
                    setLiveNotice(t.voiceAssistant.liveStoppedNotice);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1 rounded-lg border-2 border-red-700 dark:border-red-500 bg-red-50 dark:bg-red-950/60 text-xs font-bold text-red-950 dark:text-red-100 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>End Live</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setLiveNotice(null);
                    stopListening();
                    stopAudio();
                    void startLiveSession({ greetOnReady: true });
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Start Live Voice</span>
                </button>
              )}
            </div>

            {liveNotice && (
              <p
                role="status"
                className="text-xs font-medium text-[#0F1E36] dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5"
              >
                {liveNotice}
              </p>
            )}

            {liveError && (
              <p
                role="alert"
                className="text-xs font-medium text-red-900 dark:text-red-100 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700 rounded-xl px-3 py-2"
              >
                {liveError}
              </p>
            )}

            {/* Site-Wide Quick Guidance & Section Navigation */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Site-wide quick help">
                <button
                  type="button"
                  onClick={() => void sendMessage('Where am I?', language)}
                  disabled={isSending}
                  className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  {t.orientation.whereAmIButton}
                </button>
                <button
                  type="button"
                  onClick={() => void sendMessage('What can I do here?', language)}
                  disabled={isSending}
                  className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  {t.orientation.whatCanIDoButton}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void sendMessage('How do I change Dark Mode, Easy Read, or Language?', language)
                  }
                  disabled={isSending}
                  className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Accessibility settings
                </button>
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('onboarding');
                        setNavigationNotice(`Confirmed: opened ${t.nav.onboarding}.`);
                      }}
                      className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Go to {t.nav.onboarding}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('career');
                        setNavigationNotice(`Confirmed: opened ${t.nav.careers}.`);
                      }}
                      className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Go to {t.nav.careers}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('learning');
                        setNavigationNotice(`Confirmed: opened ${t.nav.learning}.`);
                      }}
                      className="min-h-[38px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Go to {t.nav.learning}
                    </button>
                  </>
                )}
              </div>
              {navigationNotice && (
                <p
                  role="status"
                  className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-1.5"
                >
                  {navigationNotice}
                </p>
              )}
            </div>
          </div>

          {/* Conversation Transcript */}
          <div className="flex-1 p-5 space-y-3 overflow-y-auto overscroll-contain bg-[#F3F4F6] dark:bg-slate-950" aria-live="polite">
          {messages.length === 0 && liveEntries.length === 0 && !liveInputDraft && !liveOutputDraft ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
              <p>{t.voiceAssistant.emptyState}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Privacy notice: Never share passwords, PINs, security tokens, or financial details here.
              </p>
            </div>
          ) : (
            <>
              {liveEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-2xl border p-3.5 text-sm shadow-xs ${
                    entry.role === 'user'
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ml-6'
                      : 'bg-amber-50/70 dark:bg-slate-800 border-amber-300 dark:border-slate-700 mr-4'
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    {entry.role === 'user' ? 'You (Live)' : 'Gemini Live'}
                  </div>
                  <p className="text-[#0F1E36] dark:text-slate-100">{entry.text}</p>
                </div>
              ))}
              {liveInputDraft && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-900 p-3 text-sm ml-6">
                  {liveInputDraft}
                </div>
              )}
              {liveOutputDraft && (
                <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mr-4">
                  {liveOutputDraft}
                </div>
              )}
              {messages.map((msg) => {
              const langMeta = LANGUAGE_REGISTRY.find((l) => l.code === msg.language);
              return (
                <div
                  key={msg.id}
                  lang={msg.language}
                  className={`rounded-2xl border p-4 space-y-2 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ml-6'
                      : 'bg-[#0F1E36]/[0.04] dark:bg-slate-800/90 border-[#0F1E36]/20 dark:border-slate-700 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <span>
                      {msg.role === 'user' ? 'You' : t.voiceAssistant.title} ·{' '}
                      {langMeta ? langMeta.nativeName : msg.language.toUpperCase()}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => void read(msg.text, msg.language)}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-[#F3F4F6] dark:hover:bg-slate-700 normal-case tracking-normal transition-colors cursor-pointer"
                      >
                        {isSpeaking ? (
                          <>
                            <Square className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.common.stopReading}</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.common.readAloud}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-sm sm:text-base text-[#0F1E36] dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </p>
                </div>
              );
            })}
            </>
          )}

          {isSending && (
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 shadow-xs text-sm font-medium text-[#0F1E36] dark:text-slate-100"
            >
              <Loader2 className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>{t.voiceAssistant.thinkingStatus}</span>
            </div>
          )}

          {(isLoadingAudio || isSpeaking) && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 shadow-xs text-sm text-[#0F1E36] dark:text-slate-100"
            >
              <span className="inline-flex items-center gap-2 font-medium">
                {isLoadingAudio ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                )}
                <span>
                  {isLoadingAudio ? t.common.loadingAudio : t.voiceAssistant.speakingStatus}
                </span>
              </span>
              <button
                type="button"
                onClick={stopAudio}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-[#F3F4F6] dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.voiceAssistant.stopSpeakingButton}</span>
              </button>
            </div>
          )}

          {voiceStatusNote && (
            <p
              role="status"
              className="text-xs text-[#0F1E36] dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-xl px-3.5 py-2.5"
            >
              {voiceStatusNote}
            </p>
          )}

          {!hasAuthenticVoice && messages.some((m) => m.role === 'assistant') && !voiceStatusNote && (
            <p
              role="note"
              className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5"
            >
              {t.voiceAssistant.providerUnavailable}
            </p>
          )}

          {(micStatus === 'permission_denied' || micPermission === 'denied') && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 px-3.5 py-3 text-xs sm:text-sm text-[#0F1E36] dark:text-amber-100 space-y-2"
            >
              <p className="font-medium">{t.voice.permissionDeniedMessage}</p>
              <button
                type="button"
                onClick={() => {
                  handledVoiceTranscriptRef.current = null;
                  stopAudio();
                  startListening();
                }}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-md border border-amber-400 dark:border-amber-600 bg-white dark:bg-slate-900 text-xs font-semibold text-[#0F1E36] dark:text-amber-100 hover:bg-amber-100/60 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.voice.retryMic}</span>
              </button>
            </div>
          )}

          {(assistantError || (micErrorDetail && micStatus !== 'permission_denied')) && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-sm text-red-900 dark:text-red-100"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{assistantError || micErrorDetail}</span>
              </div>
              {(languageNotSupportedInBrowser || canFallbackToBrowserEnglish) &&
                browserSttAvailable && (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        handledVoiceTranscriptRef.current = null;
                        stopAudio();
                        startListening('en');
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                      <span>{t.voice.fallbackEnglishButton}</span>
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Input & Microphone Controls */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (liveStatus === 'connected') {
              const txt = inputText.trim();
              if (txt && sendLiveText(txt)) {
                setInputText('');
                return;
              }
            }
            void sendMessage(inputText);
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shrink-0"
        >
          <label
            htmlFor="gw-va-input"
            className="block text-sm font-semibold text-[#0F1E36] dark:text-white"
          >
            {t.voiceAssistant.speakOrTypePrompt}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="gw-va-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t.voiceAssistant.inputPlaceholder}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-base text-[#0F1E36] dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0F1E36] dark:focus:border-amber-400"
            />
            <div className="flex items-center gap-2">
              {(recognitionAvailable || browserSttAvailable) && (
                <button
                  type="button"
                  onClick={() => {
                    handledVoiceTranscriptRef.current = null;
                    if (micStatus === 'listening') {
                      stopListening();
                    } else {
                      stopAudio();
                      startListening(recognitionAvailable ? undefined : 'en');
                    }
                  }}
                  disabled={micStatus === 'transcribing' || isSending}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-md text-sm font-semibold border transition-colors cursor-pointer ${
                    micStatus === 'listening'
                      ? 'border-2 border-red-700 dark:border-red-500 bg-red-50 dark:bg-red-950/60 text-red-950 dark:text-red-100'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 hover:border-amber-400 dark:hover:border-amber-400'
                  }`}
                >
                  {micStatus === 'transcribing' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400" aria-hidden="true" />
                      <span>{t.voice.transcribingState}</span>
                    </>
                  ) : micStatus === 'listening' ? (
                    <>
                      <Square className="w-4 h-4 text-red-800 dark:text-red-400" aria-hidden="true" />
                      <span>{t.voice.stopMic}</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                      <span>{t.voiceAssistant.speakButton}</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md text-sm font-bold bg-amber-500 hover:bg-amber-400 text-[#0F1E36] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>{t.voiceAssistant.sendButton}</span>
              </button>
            </div>
          </div>
          {micPermission === 'prompt' && recognitionAvailable && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t.voice.permissionPromptNote}
            </p>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400">{t.voice.noAudioStoredNote}</p>
        </form>
        </div>
      </div>
    </div>
  );
};
