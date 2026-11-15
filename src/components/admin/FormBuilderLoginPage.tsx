import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n';
import { AdminAccountSummary } from '../../types/gateway';
import { adminApi, AdminApiError } from '../../services/api/adminApi';

interface FormBuilderLoginPageProps {
  sessionExpiredNotice?: string | null;
  onLoginSuccess: (admin: AdminAccountSummary) => void;
  onBackToGateway: () => void;
}

export const FormBuilderLoginPage: React.FC<FormBuilderLoginPageProps> = ({
  sessionExpiredNotice,
  onLoginSuccess,
  onBackToGateway,
}) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const nextErrors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      nextErrors.username = t.formBuilder.usernameRequired;
    }
    if (!password) {
      nextErrors.password = t.formBuilder.passwordRequired;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await adminApi.login(username.trim(), password);
      setPassword('');
      onLoginSuccess(res.admin);
    } catch (err) {
      if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        setServerError(err.message || t.formBuilder.invalidCredentials);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(t.formBuilder.invalidCredentials);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="fb-login-title"
      className="max-w-md mx-auto py-4 sm:py-8 space-y-5"
    >
      <button
        type="button"
        onClick={onBackToGateway}
        className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>{t.formBuilder.backToGateway}</span>
      </button>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div
          className="bg-[#0F1E36] text-white p-6 sm:p-7 space-y-3 border-b border-white/10"
          style={{ backgroundColor: 'var(--gw-primary)', color: 'var(--gw-primary-text)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <svg
                width="30"
                height="30"
                viewBox="0 0 36 36"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M14 4H22V14H32V22H22V32H14V22H4V14H14V4Z" fill="#FFFFFF" />
                <circle cx="18" cy="18" r="5.5" fill="#F59E0B" />
                <path
                  d="M15.8 18.2L17.4 19.7L20.5 16.5"
                  stroke="#0F1E36"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-base font-extrabold tracking-tight text-white">
                Savanna Gateway
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Admin</span>
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              {t.formBuilder.restrictedBadge}
            </p>
            <h1 id="fb-login-title" className="text-2xl font-extrabold tracking-tight text-white">
              {t.formBuilder.loginTitle}
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              {t.formBuilder.loginSubtitle}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 sm:p-7 space-y-5">
          {sessionExpiredNotice && !serverError && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-3.5 text-sm text-[#0F1E36] dark:text-amber-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>{sessionExpiredNotice}</span>
            </div>
          )}

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 p-3.5 text-sm font-medium text-red-900 dark:text-red-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700 dark:text-red-300" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="fb-login-username"
              className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
            >
              {t.formBuilder.usernameLabel}
            </label>
            <input
              id="fb-login-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? 'fb-login-username-err' : undefined}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: undefined }));
              }}
              className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2.5 text-base text-[#0F1E36] dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-[#0F1E36] dark:focus:border-amber-400"
            />
            {fieldErrors.username && (
              <p id="fb-login-username-err" role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="fb-login-password"
              className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
            >
              {t.formBuilder.passwordLabel}
            </label>
            <div className="relative flex items-center">
              <input
                id="fb-login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                data-ai-masked="true"
                required
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'fb-login-password-err' : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                className="w-full min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 ps-3.5 pe-12 py-2.5 text-base text-[#0F1E36] dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-[#0F1E36] dark:focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t.formBuilder.hidePassword : t.formBuilder.showPassword}
                className="absolute end-1 inline-flex items-center justify-center min-h-[42px] min-w-[42px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="fb-login-password-err" role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-[#0F1E36] text-base font-bold transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? t.formBuilder.signingIn : t.formBuilder.signInButton}
          </button>

          <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>HttpOnly server-verified session · Credentials never exposed in client code.</span>
          </p>
        </form>
      </div>
    </section>
  );
};
