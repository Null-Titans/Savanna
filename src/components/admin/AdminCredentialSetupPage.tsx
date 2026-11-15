import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { useI18n } from '../../i18n';
import { AdminAccountSummary } from '../../types/gateway';
import { adminApi } from '../../services/api/adminApi';

interface AdminCredentialSetupPageProps {
  admin: AdminAccountSummary;
  onSetupComplete: (updatedAdmin: AdminAccountSummary, notice: string) => void;
  onLogout: () => Promise<void>;
}

export function isStrongAdminPassword(pw: string): boolean {
  return (
    pw.length >= 10 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export const AdminCredentialSetupPage: React.FC<AdminCredentialSetupPageProps> = ({
  admin,
  onSetupComplete,
  onLogout,
}) => {
  const { t } = useI18n();
  const [currentUsername, setCurrentUsername] = useState(admin.username);
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checks = useMemo(
    () => ({
      minLength: newPassword.length >= 10,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasNumber: /\d/.test(newPassword),
      hasSymbol: /[^A-Za-z0-9]/.test(newPassword),
      matches: Boolean(newPassword) && newPassword === confirmNewPassword,
    }),
    [newPassword, confirmNewPassword]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentUsername.trim() || !newUsername.trim() || !currentPassword || !newPassword) {
      setErrorMsg('All username and password fields are required.');
      return;
    }
    if (newUsername.trim().length < 3) {
      setErrorMsg('New username must be at least 3 characters.');
      return;
    }
    if (!isStrongAdminPassword(newPassword)) {
      setErrorMsg(t.formBuilder.passwordWeakError);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg(t.formBuilder.passwordMismatchError);
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg('New password must be different from your current initial password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await adminApi.firstLoginSetup({
        currentUsername: currentUsername.trim(),
        newUsername: newUsername.trim(),
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onSetupComplete(res.admin, t.formBuilder.credentialsUpdatedNotice);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update administrator credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="fb-setup-title" className="max-w-xl mx-auto py-4 sm:py-8">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div
          className="bg-[#0F1E36] text-white p-6 sm:p-7 flex items-start justify-between gap-4 border-b border-white/10"
          style={{ backgroundColor: 'var(--gw-primary)', color: 'var(--gw-primary-text)' }}
        >
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Savanna Gateway Security</span>
            </p>
            <h1 id="fb-setup-title" className="text-2xl font-extrabold tracking-tight text-white">
              {t.formBuilder.setupTitle}
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              {t.formBuilder.setupSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg border border-white/25 bg-[#162947] text-xs font-semibold text-white hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>{t.formBuilder.logoutButton}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 p-3.5 text-sm font-medium text-red-900 dark:text-red-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700 dark:text-red-300" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fb-setup-cur-user"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.currentUsernameLabel}
              </label>
              <input
                id="fb-setup-cur-user"
                type="text"
                required
                value={currentUsername}
                onChange={(e) => setCurrentUsername(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fb-setup-new-user"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.newUsernameLabel}
              </label>
              <input
                id="fb-setup-new-user"
                type="text"
                required
                minLength={3}
                autoComplete="username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="fb-setup-cur-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.currentPasswordLabel}
              </label>
              <button
                type="button"
                onClick={() => setShowPasswords((p) => !p)}
                aria-pressed={showPasswords}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] dark:text-amber-400 hover:underline cursor-pointer"
              >
                {showPasswords ? (
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{showPasswords ? t.formBuilder.hidePassword : t.formBuilder.showPassword}</span>
              </button>
            </div>
            <input
              id="fb-setup-cur-pass"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="current-password"
              data-ai-masked="true"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fb-setup-new-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.newPasswordLabel}
              </label>
              <input
                id="fb-setup-new-pass"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                data-ai-masked="true"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fb-setup-confirm-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.confirmNewPasswordLabel}
              </label>
              <input
                id="fb-setup-confirm-pass"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                data-ai-masked="true"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2 text-xs">
            <p className="font-semibold text-[#0F1E36] dark:text-slate-200">
              {t.formBuilder.passwordRulesHint}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-slate-700 dark:text-slate-300">
              {[
                { ok: checks.minLength, label: '10+ characters' },
                { ok: checks.hasUpper, label: 'Uppercase letter' },
                { ok: checks.hasLower, label: 'Lowercase letter' },
                { ok: checks.hasNumber, label: 'Number' },
                { ok: checks.hasSymbol, label: 'Special symbol' },
                { ok: checks.matches, label: 'Passwords match' },
              ].map((item) => (
                <span
                  key={item.label}
                  className={`inline-flex items-center gap-1.5 ${
                    item.ok ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0F1E36] text-base font-bold transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? t.formBuilder.savingChanges : t.formBuilder.saveChangesButton}
          </button>
        </form>
      </div>
    </section>
  );
};
