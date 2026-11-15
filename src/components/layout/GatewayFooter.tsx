import React, { useEffect, useRef, useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Globe,
  MapPin,
  Mic,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { GatewayModule } from '../../types/gateway';
import type { VoiceTriggerStatus } from '../../hooks/useVoiceTrigger';
import { detectSensitiveInput, getSensitiveRefusalMessage } from '../../utils/privacyGuard';
import { userApi } from '../../services/api/userApi';
import { gatewayApi } from '../../services/api/client';

type FooterModalType = 'accessibility' | 'feedback' | 'privacy' | 'terms' | null;

interface GatewayFooterProps {
  organizationName: string;
  voiceTriggerStatus: VoiceTriggerStatus;
  voiceTriggerPaused: boolean;
  onOpenVoiceAssistant: () => void;
  onToggleWakeMic: () => void;
  onNavigate: (mod: GatewayModule) => void;
}

export const GatewayFooter: React.FC<GatewayFooterProps> = ({
  organizationName,
  voiceTriggerStatus,
  voiceTriggerPaused,
  onOpenVoiceAssistant,
  onToggleWakeMic,
  onNavigate,
}) => {
  const { language, t, setLanguage } = useI18n();
  const [activeModal, setActiveModal] = useState<FooterModalType>(null);
  const [feedbackCategory, setFeedbackCategory] = useState('Screen reader or navigation');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const openModal = (type: Exclude<FooterModalType, null>) => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setTimeout(() => {
      lastFocusedRef.current?.focus();
    }, 0);
  };

  useEffect(() => {
    if (!activeModal) return;
    modalCloseRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal]);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setFeedbackError('Please enter your accessibility feedback before submitting.');
      return;
    }
    if (detectSensitiveInput(trimmed).isSensitive) {
      setFeedbackText('');
      setFeedbackError(getSensitiveRefusalMessage(language));
      return;
    }
    setFeedbackError(null);
    setFeedbackSubmitting(true);
    try {
      if (gatewayApi.getMode() === 'real') {
        await userApi.submitFeedback({
          category: feedbackCategory,
          message: trimmed,
          language,
        });
      }
      setFeedbackSuccess(true);
      setFeedbackText('');
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Unable to send feedback right now.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const statusText =
    voiceTriggerStatus === 'unsupported'
      ? t.voiceTrigger.statusUnsupported
      : voiceTriggerStatus === 'listening' && voiceTriggerPaused
      ? t.voiceTrigger.statusPaused
      : voiceTriggerStatus === 'listening'
      ? t.voiceTrigger.statusListening
      : t.voiceTrigger.statusMuted;

  return (
    <footer
      role="contentinfo"
      aria-label={t.footer.regionLabel}
      className="border-t border-white/10 dark:border-slate-800 bg-[#0F1E36] dark:bg-slate-950 text-white"
    >
      <div className="gw-container py-10 sm:py-12 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Explicit About ALX & Addis Ababa Hub */}
          <section aria-labelledby="gw-footer-about-alx" className="lg:col-span-2 space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.footer.addisHubBadge}</span>
            </div>
            <h2 id="gw-footer-about-alx" className="text-lg font-bold text-white">
              {t.footer.aboutAlxHeading}
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed max-w-2xl">
              {t.footer.aboutAlxBody}
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onNavigate('learning')}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                <span>{t.footer.exploreLearningBtn}</span>
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Column 2: Accessibility & Governance Links */}
          <nav aria-label={t.footer.linksHeading} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              {t.footer.linksHeading}
            </h2>
            <ul className="space-y-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => openModal('accessibility')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm text-slate-100 hover:text-amber-400 underline-offset-4 hover:underline cursor-pointer text-start"
                >
                  <Accessibility className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                  <span>{t.footer.accessibilityStmt}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openModal('feedback')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm text-slate-100 hover:text-amber-400 underline-offset-4 hover:underline cursor-pointer text-start"
                >
                  <span>{t.footer.feedbackForm}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openModal('privacy')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm text-slate-100 hover:text-amber-400 underline-offset-4 hover:underline cursor-pointer text-start"
                >
                  <span>{t.footer.privacyPolicy}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openModal('terms')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm text-slate-100 hover:text-amber-400 underline-offset-4 hover:underline cursor-pointer text-start"
                >
                  <span>{t.footer.termsOfService}</span>
                </button>
              </li>
            </ul>
          </nav>

          {/* Column 3: Voice Assistant Live Status & Bilingual Toggle */}
          <section aria-labelledby="gw-footer-voice-status" className="space-y-4">
            <div className="space-y-2">
              <h2
                id="gw-footer-voice-status"
                className="text-sm font-bold uppercase tracking-wider text-amber-400"
              >
                {t.footer.assistantStatusHeading}
              </h2>
              <div
                aria-live="polite"
                className="rounded-xl border border-white/15 bg-[#162947] px-3.5 py-2.5 text-xs sm:text-sm space-y-2"
              >
                <p className="flex items-center justify-between gap-2 text-slate-100">
                  <span>{t.footer.voiceStatusLabel}:</span>
                  <strong className="text-amber-400">{statusText}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenVoiceAssistant}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-xs font-bold cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.footer.openAssistantBtn}</span>
                  </button>
                  {voiceTriggerStatus !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={onToggleWakeMic}
                      aria-pressed={voiceTriggerStatus === 'listening'}
                      className="inline-flex items-center min-h-[44px] px-3 py-1.5 rounded-lg border border-white/25 bg-transparent hover:bg-white/10 text-white text-xs font-semibold cursor-pointer"
                    >
                      <span>{t.voiceTrigger.buttonPrefix}: {statusText}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>{t.footer.languageHeading}</span>
              </h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t.footer.languageHeading}>
                <button
                  type="button"
                  onClick={() => void setLanguage('en')}
                  aria-pressed={language === 'en'}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                    language === 'en'
                      ? 'border-amber-400 bg-amber-500 text-[#0F1E36]'
                      : 'border-white/25 bg-[#162947] text-white hover:bg-white/10'
                  }`}
                >
                  {t.footer.bilingualEnBtn}
                </button>
                <button
                  type="button"
                  onClick={() => void setLanguage('am')}
                  aria-pressed={language === 'am'}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                    language === 'am'
                      ? 'border-amber-400 bg-amber-500 text-[#0F1E36]'
                      : 'border-white/25 bg-[#162947] text-white hover:bg-white/10'
                  }`}
                >
                  {t.footer.bilingualAmBtn}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-slate-300">
          <span className="font-semibold text-white">
            {organizationName} · Accessible Onboarding, Learning &amp; Career Gateway
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span>WCAG 2.2 AA · Privacy-First · Server-Proxied AI</span>
          </span>
        </div>
      </div>

      {/* Accessible Footer Modal Dialog for Statement / Feedback / Privacy / Terms */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gw-footer-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0F1E36] dark:text-slate-100 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h2 id="gw-footer-dialog-title" className="text-xl font-bold">
                {activeModal === 'accessibility'
                  ? t.footer.accessibilityStmt
                  : activeModal === 'feedback'
                  ? t.footer.feedbackForm
                  : activeModal === 'privacy'
                  ? t.footer.privacyPolicy
                  : t.footer.termsOfService}
              </h2>
              <button
                ref={modalCloseRef}
                type="button"
                onClick={closeModal}
                aria-label={t.footer.modalCloseLabel}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 dark:border-slate-700 text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {activeModal === 'accessibility' && (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>
                  We design and test this gateway to conform to <strong>WCAG 2.2 Level AA</strong> across
                  screen readers (NVDA, JAWS, VoiceOver), keyboard-only navigation, 200% zoom, Easy Read
                  typography, and bilingual Amharic / English / Afaan Oromo speech interfaces.
                </p>
                <p>
                  <strong>Orientation shortcut:</strong> Press <code>Alt + Shift + L</code> on any page
                  or select <strong>Where am I?</strong> to hear your exact location and available actions.
                </p>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>
                  Your spoken audio is processed transiently for transcription and never saved to disk.
                  Password fields and sensitive controls remain masked in the DOM (`data-ai-masked="true"`).
                </p>
                <p>
                  The AI assistant blocks passwords, PINs, OTP codes, security tokens, and financial records,
                  and never requires Kebele ID or medical proof to access training or jobs.
                </p>
              </div>
            )}

            {activeModal === 'terms' && (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>
                  Employers listing jobs on this gateway agree to describe concrete workplace and interview
                  accommodations without requesting medical diagnoses or disability proof.
                </p>
                <p>
                  Learners stay in full control of what support preferences are stored locally, exported as JSON,
                  or deleted from shared devices.
                </p>
              </div>
            )}

            {activeModal === 'feedback' && (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="gw-feedback-category"
                    className="block text-sm font-semibold mb-1.5"
                  >
                    {t.footer.feedbackCategoryLabel}
                  </label>
                  <select
                    id="gw-feedback-category"
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#0F1E36] dark:text-slate-100"
                  >
                    <option value="Screen reader or navigation">Screen reader or navigation</option>
                    <option value="Voice wake microphone or audio">Voice wake microphone or audio</option>
                    <option value="Amharic / Afaan Oromo wording">Amharic / Afaan Oromo wording</option>
                    <option value="Job accommodation barrier">Job accommodation barrier</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="gw-feedback-msg" className="block text-sm font-semibold mb-1.5">
                    {t.footer.feedbackMessageLabel}
                  </label>
                  <textarea
                    id="gw-feedback-msg"
                    rows={3}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#0F1E36] dark:text-slate-100"
                  />
                </div>

                {feedbackError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 p-3 text-xs sm:text-sm text-red-900 dark:text-red-100"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{feedbackError}</span>
                  </p>
                )}

                {feedbackSuccess && (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 p-3 text-xs sm:text-sm text-emerald-900 dark:text-emerald-100"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t.footer.feedbackSuccessNotice}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-[#0F1E36] text-sm font-bold cursor-pointer disabled:opacity-60"
                >
                  {feedbackSubmitting ? t.common.loadingStatus : t.footer.feedbackSubmitBtn}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </footer>
  );
};
