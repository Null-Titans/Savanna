import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18nProvider, useI18n } from '../i18n';
import { PRESET_THEMES, validateTheme } from '../config/themes';
import { GatewayModule, SupportedLanguage, ThemeConfig } from '../types/gateway';
import { ApiMode, gatewayApi } from '../services/api/client';
import {
  getSimulateFlakyNetwork,
  setSimulateFlakyNetwork,
} from '../services/api/mockAdapter';
import { SkipLink } from '../components/accessibility/SkipLink';
import { GatewayHeader } from '../components/layout/GatewayHeader';
import { GatewayFooter } from '../components/layout/GatewayFooter';
import { DemoBanner } from '../components/layout/DemoBanner';
import { MainGateway } from '../components/layout/MainGateway';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';
import { PageOrientationAnnouncer } from '../components/accessibility/PageOrientationAnnouncer';
import { KeyboardFocusAnnouncer } from '../components/accessibility/KeyboardFocusAnnouncer';
import { LiveRegion } from '../components/accessibility/LiveRegion';
import { WebsiteAgentProvider, useWebsiteAgent } from '../context/WebsiteAgentContext';
import { useVoiceTrigger } from '../hooks/useVoiceTrigger';
import { maskSensitiveDomInputs } from '../utils/privacyGuard';
import { VoiceAssistantPanel } from '../components/accessibility/VoiceAssistantPanel';

export type ColorMode = 'light' | 'dark';

const COLOR_MODE_STORAGE_KEY = 'gw_color_scheme';

function getInitialColorMode(): ColorMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    }
  } catch {
    // Ignore storage access restrictions
  }
  return 'light';
}

// Lazy-load secondary modules so initial onboarding load stays strictly < 150 KB gzipped (Addendum C1)
const ThemeSwitcherDrawer = lazy(() =>
  import('../components/layout/ThemeSwitcherDrawer').then((m) => ({
    default: m.ThemeSwitcherDrawer,
  }))
);
const CareerGateway = lazy(() =>
  import('../components/career/CareerGateway').then((m) => ({ default: m.CareerGateway }))
);
const EmployerAccommodationForm = lazy(() =>
  import('../components/employer/EmployerAccommodationForm').then((m) => ({
    default: m.EmployerAccommodationForm,
  }))
);
const JudgeChecklistPage = lazy(() =>
  import('../components/judge/JudgeChecklistPage').then((m) => ({
    default: m.JudgeChecklistPage,
  }))
);
const JsonQuestionFlow = lazy(() =>
  import('../components/forms/JsonQuestionFlow').then((m) => ({
    default: m.JsonQuestionFlow,
  }))
);
const LearningResourcesPage = lazy(() =>
  import('../components/learning/LearningResourcesPage').then((m) => ({
    default: m.LearningResourcesPage,
  }))
);
const UserDashboardPage = lazy(() =>
  import('../components/dashboard/UserDashboardPage').then((m) => ({
    default: m.UserDashboardPage,
  }))
);
const FormBuilderGuard = lazy(() =>
  import('../components/admin/FormBuilderGuard').then((m) => ({
    default: m.FormBuilderGuard,
  }))
);
const DynamicPublishedFormRunner = lazy(() =>
  import('../components/forms/DynamicPublishedFormRunner').then((m) => ({
    default: m.DynamicPublishedFormRunner,
  }))
);

export interface GatewayShellProps {
  tenantKey?: string;
  initialModule?: GatewayModule;
  initialOnboardingMode?: 'self' | 'partner_assisted' | 'edit';
  initialQuestionsUrl?: string;
  initialTheme?: ThemeConfig;
  initialLanguage?: SupportedLanguage;
  initialApiMode?: ApiMode;
  initialApiBaseUrl?: string;
  isDemoMode?: boolean;
  hostElement?: HTMLElement | null;
}

const AgentActionLiveRegion: React.FC = () => {
  const agent = useWebsiteAgent();
  return <LiveRegion message={agent?.lastActionFeedback || ''} politeness="polite" />;
};

function parseUrlNavigation(): { module?: GatewayModule; publicFormId?: string | null } {
  if (typeof window === 'undefined') return {};
  try {
    const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    const sp = new URLSearchParams(window.location.search);
    const formId = sp.get('form');
    if (formId) {
      return { publicFormId: formId };
    }
    if (pathname === '/form-builder' || pathname === '/admin/form-builder') {
      return { module: 'form_builder', publicFormId: null };
    }
    const modParam = (sp.get('module') || '').toLowerCase();
    if (modParam === 'form-builder' || modParam === 'form_builder') {
      return { module: 'form_builder', publicFormId: null };
    }
    if (
      modParam === 'home' ||
      modParam === 'onboarding' ||
      modParam === 'profile' ||
      modParam === 'career' ||
      modParam === 'learning' ||
      modParam === 'dashboard' ||
      modParam === 'employer' ||
      modParam === 'judge'
    ) {
      return { module: modParam as GatewayModule, publicFormId: null };
    }
  } catch {
    // ignore URL parse error
  }
  return {};
}

const GatewayShellInner: React.FC<GatewayShellProps> = ({
  tenantKey = 'savanna-demo-tenant',
  initialModule = 'home',
  initialOnboardingMode = 'self',
  initialQuestionsUrl,
  initialTheme = PRESET_THEMES.alx,
  isDemoMode = true,
  hostElement = null,
}) => {
  const { t, metadata } = useI18n();
  const initialUrlState = useMemo(() => parseUrlNavigation(), []);
  const [activeModule, setActiveModule] = useState<GatewayModule>(
    initialUrlState.module || initialModule
  );
  const [activePublicFormId, setActivePublicFormId] = useState<string | null>(
    initialUrlState.publicFormId || null
  );
  const moduleHistoryRef = useRef<GatewayModule[]>([]);
  const [partnerAssisted, setPartnerAssisted] = useState(
    initialOnboardingMode === 'partner_assisted'
  );
  const [easyRead, setEasyRead] = useState(false);
  const [rawTheme, setRawTheme] = useState<ThemeConfig>(initialTheme);
  const [colorMode, setColorMode] = useState<ColorMode>(getInitialColorMode);
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  const [voiceAssistantOpen, setVoiceAssistantOpen] = useState(false);
  const [handsFreeSessionActive, setHandsFreeSessionActive] = useState(false);
  const [liveActivationNonce, setLiveActivationNonce] = useState(0);
  const [liveDeactivationNonce, setLiveDeactivationNonce] = useState(0);
  const [assistantExpandNonce, setAssistantExpandNonce] = useState(0);
  const liveActivationSeqRef = useRef(0);
  const liveDeactivationSeqRef = useRef(0);
  const assistantExpandSeqRef = useRef(0);
  const [isLiveVoiceActive, setIsLiveVoiceActive] = useState(false);
  const isLiveVoiceActiveRef = useRef(false);
  isLiveVoiceActiveRef.current = isLiveVoiceActive;
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [autoOrientationSpeech, setAutoOrientationSpeech] = useState(false);
  const lastFocusedBeforeAssistantRef = useRef<HTMLElement | null>(null);
  const [apiMode, setApiMode] = useState<ApiMode>(gatewayApi.getMode());
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(gatewayApi.getBaseUrl());
  const [flakyNetwork, setFlakyNetwork] = useState<boolean>(getSimulateFlakyNetwork());
  const [prefillApplicant, setPrefillApplicant] = useState<{ name: string; contact: string } | null>(
    null
  );

  const restoreFocusToPage = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const target = lastFocusedBeforeAssistantRef.current;
        if (target && target.isConnected) {
          target.focus();
        } else {
          document.getElementById('gw-main-content')?.focus();
        }
      });
    }
  }, []);

  const openAssistantDrawer = useCallback((options?: { handsFree?: boolean; startLive?: boolean }) => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      if (!document.activeElement.closest('[role="dialog"]')) {
        lastFocusedBeforeAssistantRef.current = document.activeElement;
      }
    }
    setLiveDeactivationNonce(0);
    assistantExpandSeqRef.current += 1;
    setAssistantExpandNonce(assistantExpandSeqRef.current);
    if (options?.handsFree) {
      setHandsFreeSessionActive(true);
    } else if (options?.handsFree === false) {
      setHandsFreeSessionActive(false);
    }
    if (options?.startLive) {
      setHandsFreeSessionActive(false);
      liveActivationSeqRef.current += 1;
      setLiveActivationNonce(liveActivationSeqRef.current);
    } else if (!isLiveVoiceActiveRef.current) {
      setLiveActivationNonce(0);
    }
    setVoiceAssistantOpen(true);
  }, []);

  const stopLiveActivation = useCallback(() => {
    setLiveActivationNonce(0);
    setIsLiveVoiceActive(false);
    isLiveVoiceActiveRef.current = false;
    liveDeactivationSeqRef.current += 1;
    setLiveDeactivationNonce(liveDeactivationSeqRef.current);
    restoreFocusToPage();
  }, [restoreFocusToPage]);

  const closeAssistantDrawer = useCallback(() => {
    setHandsFreeSessionActive(false);
    setLiveActivationNonce(0);
    setLiveDeactivationNonce(0);
    setIsLiveVoiceActive(false);
    isLiveVoiceActiveRef.current = false;
    setVoiceAssistantOpen(false);
    restoreFocusToPage();
  }, [restoreFocusToPage]);

  const wakePhrase = 'Hey Access';
  const voiceTrigger = useVoiceTrigger({
    wakePhrase,
    wakeAliases: ['hey assistant', 'open assistant', 'open voice assistant'],
    lang: 'en-US',
    paused: voiceAssistantOpen || themeDrawerOpen,
    onTrigger: () => {
      openAssistantDrawer({ handsFree: true });
    },
  });

  // Global keyboard shortcuts:
  // - Alt+Shift+A & Ctrl+Shift+A toggle Gemini Live ON / OFF (opening chat + starting mic/session, or stopping session + mic)
  // - Ctrl+Tab & Ctrl+Alt+Shift+A activate Gemini Live without duplicate sessions
  // - Alt+Shift+M toggles Wake Mic
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const isKeyA = e.key.toLowerCase() === 'a' || e.code === 'KeyA';
      const isCtrlTab =
        e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === 'Tab';
      const isCtrlShiftA =
        e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && isKeyA;
      const isCtrlAltShiftA =
        e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && isKeyA;
      const isAltShiftA =
        e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && isKeyA;

      if (isCtrlShiftA || isAltShiftA) {
        e.preventDefault();
        if (isLiveVoiceActiveRef.current) {
          stopLiveActivation();
        } else {
          openAssistantDrawer({ startLive: true });
        }
        return;
      }

      if (isCtrlTab || isCtrlAltShiftA) {
        e.preventDefault();
        openAssistantDrawer({ startLive: true });
        return;
      }

      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        voiceTrigger.toggleListening();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openAssistantDrawer, stopLiveActivation, voiceTrigger]);

  // Enforce client-side DOM masking on password & sensitive inputs across React & Shadow DOM
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root: ParentNode = hostElement?.shadowRoot || hostElement || document.body;
    maskSensitiveDomInputs(root);

    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      maskSensitiveDomInputs(root);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeModule, hostElement]);

  useEffect(() => {
    const urlState = parseUrlNavigation();
    if (!urlState.module && !urlState.publicFormId) {
      setActiveModule(initialModule);
    }
  }, [initialModule]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const next = parseUrlNavigation();
      setActivePublicFormId(next.publicFormId || null);
      if (next.module) setActiveModule(next.module);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    setPartnerAssisted(initialOnboardingMode === 'partner_assisted');
  }, [initialOnboardingMode]);

  useEffect(() => {
    setRawTheme(initialTheme);
  }, [initialTheme]);

  // Synchronize .dark class on <html>, Shadow DOM host, and localStorage
  useEffect(() => {
    const isDark = colorMode === 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    if (hostElement) {
      hostElement.classList.toggle('dark', isDark);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [colorMode, hostElement]);

  // Lock background page scroll only when the full-height Theme drawer is open (floating chatbot stays non-blocking)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!themeDrawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [themeDrawerOpen]);

  const validatedTheme = useMemo(() => validateTheme(rawTheme), [rawTheme]);

  const handleToggleColorMode = () => {
    setColorMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleNavigate = useCallback(
    (mod: GatewayModule, opts?: { partnerAssisted?: boolean }) => {
      setActivePublicFormId(null);
      setActiveModule((prevMod) => {
        if (prevMod !== mod) {
          moduleHistoryRef.current = [...moduleHistoryRef.current.slice(-14), prevMod];
        }
        return mod;
      });
      if (opts && typeof opts.partnerAssisted === 'boolean') {
        setPartnerAssisted(opts.partnerAssisted);
      } else if (mod === 'onboarding') {
        setPartnerAssisted(false);
      }
      if (typeof window !== 'undefined' && !hostElement) {
        try {
          if (mod === 'form_builder') {
            if (!window.location.pathname.toLowerCase().endsWith('/form-builder')) {
              window.history.pushState({}, '', '/form-builder');
            }
          } else {
            const p = window.location.pathname.toLowerCase();
            const s = window.location.search.toLowerCase();
            if (p.includes('form-builder') || s.includes('form=') || s.includes('module=form')) {
              window.history.pushState({}, '', '/');
            }
          }
        } catch {
          // Ignore pushState restrictions in custom elements
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [hostElement]
  );

  const handleGoBack = useCallback((): GatewayModule => {
    const prev = moduleHistoryRef.current.pop() || 'home';
    setActiveModule(prev);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    return prev;
  }, []);

  const handleChangeApiMode = (nextMode: ApiMode, nextBaseUrl: string) => {
    gatewayApi.setMode(nextMode);
    gatewayApi.setBaseUrl(nextBaseUrl);
    setApiMode(nextMode);
    setApiBaseUrl(nextBaseUrl);
  };

  const handleToggleFlaky = (enabled: boolean) => {
    setSimulateFlakyNetwork(enabled);
    setFlakyNetwork(enabled);
  };

  const themeCssVars = {
    '--gw-primary': validatedTheme.effectivePrimary,
    '--gw-primary-text': validatedTheme.effectivePrimaryText,
    '--gw-secondary': validatedTheme.effectiveSecondary,
    '--gw-secondary-text': validatedTheme.effectiveSecondaryText,
    '--gw-font-sans': validatedTheme.fontFamily,
  } as React.CSSProperties;

  return (
    <WebsiteAgentProvider
      activeModule={activeModule}
      onNavigate={(mod) => handleNavigate(mod)}
      onGoBack={handleGoBack}
      colorMode={colorMode}
      onSetColorMode={setColorMode}
      easyRead={easyRead}
      onSetEasyRead={setEasyRead}
      autoOrientationSpeech={autoOrientationSpeech}
      onSetAutoOrientationSpeech={setAutoOrientationSpeech}
      hostElement={hostElement}
      initialOnboardingMode={initialOnboardingMode}
    >
      <div
        dir={metadata.dir}
        lang={metadata.code}
        style={themeCssVars}
        className={`${colorMode === 'dark' ? 'dark' : ''} ${
          easyRead ? 'gw-easy-read' : ''
        } min-h-screen flex flex-col bg-[var(--gw-bg-canvas)] text-[var(--gw-text-primary)] font-[var(--gw-font-sans)] transition-colors`}
      >
        <AgentActionLiveRegion />
        <KeyboardFocusAnnouncer activeModule={activeModule} />
        <SkipLink targetId="gw-main-content" />

      <GatewayHeader
        theme={validatedTheme}
        activeModule={activeModule}
        isDemoMode={isDemoMode}
        onNavigate={(mod) => handleNavigate(mod)}
      />

      <DemoBanner
        apiMode={apiMode}
        colorMode={colorMode}
        onToggleColorMode={handleToggleColorMode}
        easyRead={easyRead}
        onToggleEasyRead={() => setEasyRead((prev) => !prev)}
        onOpenThemeDrawer={() => setThemeDrawerOpen(true)}
        onOpenVoiceAssistant={() => openAssistantDrawer({ handsFree: false })}
        voiceTrigger={voiceTrigger}
        wakePhrase={wakePhrase}
      />

      <main id="gw-main-content" tabIndex={-1} className="flex-1 gw-container py-6 sm:py-10 focus:outline-none">
        {!initialQuestionsUrl && (
          <PageOrientationAnnouncer
            activeModule={activeModule}
            autoSpeechEnabled={autoOrientationSpeech}
            onToggleAutoSpeech={() => setAutoOrientationSpeech((prev) => !prev)}
            onAskWhatCanIDo={() => {
              setPendingAssistantPrompt('What can I do here?');
              openAssistantDrawer({ handsFree: false });
            }}
          />
        )}
        {initialQuestionsUrl ? (
          <Suspense
            fallback={
              <div
                role="status"
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-base font-medium text-[#0F1E36] dark:text-slate-100 shadow-sm"
              >
                {t.common.loadingStatus}
              </div>
            }
          >
            <JsonQuestionFlow questionsUrl={initialQuestionsUrl} hostElement={hostElement} />
          </Suspense>
        ) : activePublicFormId ? (
          <Suspense
            fallback={
              <div
                role="status"
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-base font-medium text-[#0F1E36] dark:text-slate-100 shadow-sm"
              >
                {t.common.loadingStatus}
              </div>
            }
          >
            <DynamicPublishedFormRunner
              formId={activePublicFormId}
              onBackToGateway={() => handleNavigate('home')}
            />
          </Suspense>
        ) : (
          <>
            {activeModule === 'home' && (
              <MainGateway theme={validatedTheme} onNavigate={handleNavigate} />
            )}

            {activeModule === 'onboarding' && (
              <OnboardingWizard
                tenantKey={tenantKey}
                initialMode={
                  partnerAssisted
                    ? 'partner_assisted'
                    : initialOnboardingMode === 'edit'
                    ? 'edit'
                    : 'self'
                }
                hostElement={hostElement}
                onNavigateToCareers={(prefill) => {
                  if (prefill) setPrefillApplicant(prefill);
                  handleNavigate('career');
                }}
              />
            )}

            {activeModule === 'profile' && (
              <OnboardingWizard
                tenantKey={tenantKey}
                initialMode="edit"
                hostElement={hostElement}
                onNavigateToCareers={(prefill) => {
                  if (prefill) setPrefillApplicant(prefill);
                  handleNavigate('career');
                }}
              />
            )}

            <Suspense
              fallback={
                <div
                  role="status"
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-base font-medium text-[#0F1E36] dark:text-slate-100 shadow-sm"
                >
                  {t.common.loadingStatus}
                </div>
              }
            >
              {activeModule === 'career' && (
                <CareerGateway
                  prefillApplicant={prefillApplicant}
                  hostElement={hostElement}
                  onOpenPublicForm={(formId) => {
                    setActivePublicFormId(formId);
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', `/?form=${encodeURIComponent(formId)}`);
                    }
                  }}
                />
              )}

              {activeModule === 'learning' && (
                <LearningResourcesPage onNavigate={handleNavigate} />
              )}

              {activeModule === 'dashboard' && (
                <UserDashboardPage
                  colorMode={colorMode}
                  onToggleColorMode={handleToggleColorMode}
                  easyRead={easyRead}
                  onToggleEasyRead={() => setEasyRead((prev) => !prev)}
                  autoOrientationSpeech={autoOrientationSpeech}
                  onToggleOrientationSpeech={() => setAutoOrientationSpeech((prev) => !prev)}
                  voiceTriggerStatus={voiceTrigger.status}
                  onOpenVoiceAssistant={() => openAssistantDrawer({ handsFree: false })}
                  onNavigate={handleNavigate}
                />
              )}

              {activeModule === 'employer' && (
                <EmployerAccommodationForm
                  onPublishedNavigateToCareers={() => handleNavigate('career')}
                />
              )}

              {activeModule === 'form_builder' && (
                <FormBuilderGuard
                  onBackToGateway={() => handleNavigate('home')}
                  onOpenPublicForm={(formId) => {
                    setActivePublicFormId(formId);
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', `/?form=${encodeURIComponent(formId)}`);
                    }
                  }}
                />
              )}

              {activeModule === 'judge' && isDemoMode && (
                <JudgeChecklistPage
                  onNavigate={handleNavigate}
                  onOpenThemeDrawer={() => setThemeDrawerOpen(true)}
                />
              )}
            </Suspense>
          </>
        )}
      </main>

      <GatewayFooter
        organizationName={validatedTheme.organizationName}
        voiceTriggerStatus={voiceTrigger.status}
        voiceTriggerPaused={voiceTrigger.isPaused}
        onOpenVoiceAssistant={() => openAssistantDrawer({ handsFree: false })}
        onToggleWakeMic={voiceTrigger.toggleListening}
        onNavigate={(mod) => handleNavigate(mod)}
      />

      {themeDrawerOpen && (
        <Suspense fallback={null}>
          <ThemeSwitcherDrawer
            open={themeDrawerOpen}
            onClose={() => setThemeDrawerOpen(false)}
            rawTheme={rawTheme}
            validatedTheme={validatedTheme}
            onUpdateTheme={setRawTheme}
            colorMode={colorMode}
            onToggleColorMode={handleToggleColorMode}
            apiMode={apiMode}
            apiBaseUrl={apiBaseUrl}
            onChangeApiMode={handleChangeApiMode}
            flakyNetwork={flakyNetwork}
            onToggleFlakyNetwork={handleToggleFlaky}
          />
        </Suspense>
      )}

      {voiceAssistantOpen && (
        <VoiceAssistantPanel
          open={voiceAssistantOpen}
          handsFreeActive={handsFreeSessionActive}
          liveActivationNonce={liveActivationNonce}
          liveDeactivationNonce={liveDeactivationNonce}
          expandNonce={assistantExpandNonce}
          onLiveStatusChange={(active) => {
            isLiveVoiceActiveRef.current = active;
            setIsLiveVoiceActive(active);
          }}
          onClose={closeAssistantDrawer}
          activeModule={activeModule}
          colorMode={colorMode}
          easyRead={easyRead}
          initialPrompt={pendingAssistantPrompt}
          onConsumeInitialPrompt={() => setPendingAssistantPrompt(null)}
          onNavigate={handleNavigate}
        />
      )}
      </div>
    </WebsiteAgentProvider>
  );
};

export const GatewayShell: React.FC<GatewayShellProps> = (props) => {
  useEffect(() => {
    if (props.initialApiMode) {
      gatewayApi.setMode(props.initialApiMode);
    }
    if (props.initialApiBaseUrl) {
      gatewayApi.setBaseUrl(props.initialApiBaseUrl);
    }
  }, [props.initialApiBaseUrl, props.initialApiMode]);

  return (
    <I18nProvider initialLanguage={props.initialLanguage || 'en'}>
      <GatewayShellInner {...props} />
    </I18nProvider>
  );
};
