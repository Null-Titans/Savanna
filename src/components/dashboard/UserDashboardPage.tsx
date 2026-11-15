import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Eye,
  LogOut,
  Mic,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { DashboardAnalyticsSummary, GatewayModule, LearnerProfile, UserAccountSummary } from '../../types/gateway';
import type { ColorMode } from '../../app/GatewayShell';
import type { VoiceTriggerStatus } from '../../hooks/useVoiceTrigger';
import { ReadAloudButton } from '../accessibility/ReadAloudButton';
import { useWebsiteAgent } from '../../context/WebsiteAgentContext';
import { gatewayApi } from '../../services/api/client';
import { userApi } from '../../services/api/userApi';

interface UserDashboardPageProps {
  colorMode: ColorMode;
  onToggleColorMode: () => void;
  easyRead: boolean;
  onToggleEasyRead: () => void;
  autoOrientationSpeech: boolean;
  onToggleOrientationSpeech: () => void;
  voiceTriggerStatus: VoiceTriggerStatus;
  onOpenVoiceAssistant: () => void;
  onNavigate: (mod: GatewayModule) => void;
}

function getSafeLearnerOverview(liveProfile: LearnerProfile | null): {
  hasSavedProfile: boolean;
  fullName: string;
  contactMethod: string;
} {
  if (liveProfile?.fullName) {
    return {
      hasSavedProfile: true,
      fullName: liveProfile.fullName,
      contactMethod: liveProfile.contactMethod || 'Saved locally',
    };
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawProfile =
        window.localStorage.getItem('gw_mock_learner_profile_v1') ||
        window.localStorage.getItem('gw_learner_profile');
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile) as {
          fullName?: string;
          contactMethod?: string;
        };
        if (parsed?.fullName) {
          return {
            hasSavedProfile: true,
            fullName: parsed.fullName,
            contactMethod: parsed.contactMethod || 'Saved locally',
          };
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    hasSavedProfile: false,
    fullName: 'Guest Learner (No local profile stored yet)',
    contactMethod: 'Not stored on shared devices',
  };
}

export const UserDashboardPage: React.FC<UserDashboardPageProps> = ({
  colorMode,
  onToggleColorMode,
  easyRead,
  onToggleEasyRead,
  autoOrientationSpeech,
  onToggleOrientationSpeech,
  voiceTriggerStatus,
  onOpenVoiceAssistant,
  onNavigate,
}) => {
  const { language, t } = useI18n();
  const agent = useWebsiteAgent();
  const profileSummary = getSafeLearnerOverview(agent?.savedLearnerProfile ?? null);

  const [currentUser, setCurrentUser] = useState<UserAccountSummary | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regRole, setRegRole] = useState<'learner' | 'employer'>('learner');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsSummary | null>(null);

  useEffect(() => {
    if (gatewayApi.getMode() !== 'real') return;
    void userApi.getCurrentUser().then((res) => setCurrentUser(res.user)).catch(() => {});
    void userApi.getAnalyticsSummary().then(setAnalytics).catch(() => {});
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const res = await userApi.login(identifier.trim(), password);
        setCurrentUser(res.user);
      } else {
        const res = await userApi.register({
          username: regUsername.trim(),
          email: regEmail.trim(),
          fullName: regFullName.trim(),
          password,
          role: regRole,
        });
        setCurrentUser(res.user);
      }
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUserLogout = async () => {
    await userApi.logout().catch(() => {});
    setCurrentUser(null);
  };

  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-[#0F1E36] text-white p-6 sm:p-8 shadow-lg space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.dashboard.domShieldBadge}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {t.dashboard.pageTitle}
        </h1>
        <p className="text-sm sm:text-base text-slate-200 max-w-3xl leading-relaxed">
          {t.dashboard.pageSubtitle}
        </p>
        <ReadAloudButton
          textToRead={`${t.dashboard.pageTitle}. ${t.dashboard.pageSubtitle} Profile status: ${profileSummary.fullName}.`}
        />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Profile Status */}
        <section
          aria-labelledby="dash-profile-heading"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
        >
          <h2
            id="dash-profile-heading"
            className="text-lg font-bold text-[#0F1E36] dark:text-white flex items-center gap-2"
          >
            <UserCheck className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
            <span>{t.dashboard.statusHeading}</span>
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Learner
              </dt>
              <dd className="font-semibold text-[#0F1E36] dark:text-slate-100">
                {profileSummary.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Contact Route
              </dt>
              <dd className="text-slate-700 dark:text-slate-300">
                {profileSummary.contactMethod}
              </dd>
            </div>
          </dl>
          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate(profileSummary.hasSavedProfile ? 'profile' : 'onboarding')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] text-white text-sm font-semibold cursor-pointer"
            >
              <span>{profileSummary.hasSavedProfile ? t.nav.profile : t.nav.startAction}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Card 2: Accessibility Controls */}
        <section
          aria-labelledby="dash-prefs-heading"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
        >
          <h2
            id="dash-prefs-heading"
            className="text-lg font-bold text-[#0F1E36] dark:text-white flex items-center gap-2"
          >
            <SlidersHorizontal
              className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400"
              aria-hidden="true"
            />
            <span>{t.dashboard.preferencesHeading}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            Active language: <strong>{language.toUpperCase()}</strong> · Hands-free mic:{' '}
            <strong>{voiceTriggerStatus}</strong>
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onToggleColorMode}
              aria-pressed={colorMode === 'dark'}
              className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-start text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
                <span>{colorMode === 'dark' ? t.common.lightModeLabel : t.common.darkModeLabel}</span>
              </span>
              <span className="text-xs font-bold uppercase">{colorMode}</span>
            </button>
            <button
              type="button"
              onClick={onToggleEasyRead}
              aria-pressed={easyRead}
              className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-start text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
                <span>{easyRead ? t.common.easyReadOn : t.common.easyReadOff}</span>
              </span>
              <span className="text-xs font-bold uppercase">{easyRead ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleOrientationSpeech}
              aria-pressed={autoOrientationSpeech}
              className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-start text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
            >
              <span>{autoOrientationSpeech ? t.orientation.autoSpeechOn : t.orientation.autoSpeechOff}</span>
              <span className="text-xs font-bold uppercase">{autoOrientationSpeech ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </section>

        {/* Card 3: Security & Privacy Guardrails */}
        <section
          aria-labelledby="dash-security-heading"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
        >
          <h2
            id="dash-security-heading"
            className="text-lg font-bold text-[#0F1E36] dark:text-white flex items-center gap-2"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>{t.dashboard.securityHeading}</span>
          </h2>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Passwords, PINs, tokens, and financial details are blocked from chat and scrubbed on DOM context reads.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Google AI Studio API calls run strictly through server-side Express proxies (`GEMINI_API_KEY`).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Voice recordings are transcribed transiently and never persisted.</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={onOpenVoiceAssistant}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-sm font-bold cursor-pointer"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>{t.footer.openAssistantBtn}</span>
          </button>
        </section>
      </div>

      {/* Learner / Employer Account Sign-In & Live Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-labelledby="dash-auth-heading"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="dash-auth-heading" className="text-lg font-bold text-[#0F1E36] dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
              <span>{currentUser ? t.auth.signedInAs : authMode === 'login' ? t.auth.signInTitle : t.auth.registerTitle}</span>
            </h2>
            {!currentUser && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-[#0F1E36] text-white border-[#0F1E36] dark:bg-amber-500 dark:text-[#0F1E36]'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {t.auth.signInButton}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-[#0F1E36] text-white border-[#0F1E36] dark:bg-amber-500 dark:text-[#0F1E36]'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {t.auth.registerButton}
                </button>
              </div>
            )}
          </div>

          {currentUser ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm space-y-1">
                <p className="font-bold text-[#0F1E36] dark:text-white">{currentUser.fullName}</p>
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300">
                  @{currentUser.username} · {currentUser.role} · {currentUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleUserLogout()}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>{t.auth.signOutButton}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">{t.auth.guestStatus}</p>

              {authError && (
                <p role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 rounded-lg p-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{authError}</span>
                </p>
              )}

              {authMode === 'login' ? (
                <div className="space-y-1">
                  <label htmlFor="dash-auth-ident" className="block text-xs font-semibold">
                    {t.auth.usernameOrEmailLabel}
                  </label>
                  <input
                    id="dash-auth-ident"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="dash-reg-name" className="block text-xs font-semibold">
                      {t.auth.fullNameLabel}
                    </label>
                    <input
                      id="dash-reg-name"
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="dash-reg-user" className="block text-xs font-semibold">
                      Username
                    </label>
                    <input
                      id="dash-reg-user"
                      type="text"
                      required
                      minLength={3}
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="dash-reg-email" className="block text-xs font-semibold">
                      {t.auth.emailLabel}
                    </label>
                    <input
                      id="dash-reg-email"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="dash-reg-role" className="block text-xs font-semibold">
                      {t.auth.roleLabel}
                    </label>
                    <select
                      id="dash-reg-role"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as 'learner' | 'employer')}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                    >
                      <option value="learner">{t.auth.roleLearner}</option>
                      <option value="employer">{t.auth.roleEmployer}</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="dash-auth-pass" className="block text-xs font-semibold">
                  {t.auth.passwordLabel}
                </label>
                <input
                  id="dash-auth-pass"
                  type="password"
                  data-ai-masked="true"
                  required
                  minLength={authMode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] dark:bg-amber-500 dark:text-[#0F1E36] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                {authBusy ? t.common.loadingStatus : authMode === 'login' ? t.auth.signInButton : t.auth.registerButton}
              </button>
            </form>
          )}
        </section>

        {/* Live Database Summary */}
        <section
          aria-labelledby="dash-metrics-heading"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
        >
          <h2 id="dash-metrics-heading" className="text-lg font-bold text-[#0F1E36] dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
            <span>Gateway Activity Summary</span>
          </h2>
          {analytics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Organizations', value: analytics.organizationCount },
                { label: 'Published Forms', value: analytics.publishedFormCount },
                { label: 'Active Jobs', value: analytics.jobCount },
                { label: 'Registrations', value: analytics.completedRegistrationCount },
                { label: 'Form Submissions', value: analytics.formSubmissionCount },
                { label: 'Job Applications', value: analytics.applicationCount },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3.5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {m.label}
                  </p>
                  <p className="text-2xl font-extrabold text-[#0F1E36] dark:text-white tabular-nums mt-0.5">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Live database counters display here when connected to the backend server.
            </p>
          )}
        </section>
      </div>

      {/* Quick Jump Directory */}
      <section
        aria-labelledby="dash-jumps-heading"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4"
      >
        <h2 id="dash-jumps-heading" className="text-lg font-bold text-[#0F1E36] dark:text-white">
          {t.dashboard.quickLinksHeading}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('career')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            <Briefcase className="w-4 h-4 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
            <span>{t.nav.careers}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('learning')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
            <span>{t.nav.learning}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('employer')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            <span>{t.nav.employers}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('form_builder')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            <span>{t.nav.formBuilder}</span>
          </button>
        </div>
      </section>
    </div>
  );
};
