import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n';
import { AdminAccountSummary, OrganizationRecord } from '../../types/gateway';
import { adminApi } from '../../services/api/adminApi';
import { isStrongAdminPassword } from './AdminCredentialSetupPage';

interface AdminAccountSettingsPanelProps {
  admin: AdminAccountSummary;
  organizations: OrganizationRecord[];
  onAdminUpdated: (nextAdmin: AdminAccountSummary, notice: string) => void;
  onSessionExpired: (msg: string) => void;
  onLogout: () => Promise<void>;
}

export const AdminAccountSettingsPanel: React.FC<AdminAccountSettingsPanelProps> = ({
  admin,
  organizations,
  onAdminUpdated,
  onSessionExpired,
  onLogout,
}) => {
  const { t } = useI18n();
  const [newUsername, setNewUsername] = useState(admin.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const assignedOrg = admin.organizationId
    ? organizations.find((o) => o.id === admin.organizationId)?.name || admin.organizationId
    : 'All Platform Organizations (Platform Admin)';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('Please enter your current password to verify changes.');
      return;
    }
    if (newUsername.trim().length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      return;
    }
    if (newPassword) {
      if (!isStrongAdminPassword(newPassword)) {
        setErrorMsg(t.formBuilder.passwordWeakError);
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setErrorMsg(t.formBuilder.passwordMismatchError);
        return;
      }
    }

    setIsSaving(true);
    try {
      const res = await adminApi.updateCredentials({
        newUsername: newUsername.trim(),
        currentPassword,
        ...(newPassword ? { newPassword, confirmNewPassword } : {}),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMsg(res.message || 'Credentials updated and session rotated.');
      onAdminUpdated(res.admin, res.message || 'Administrator credentials updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update account settings.';
      if ((err as { status?: number })?.status === 401 && /session/i.test(msg)) {
        onSessionExpired(msg);
        return;
      }
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <ShieldCheck className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
          <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
            {t.formBuilder.accountInfoTitle}
          </h2>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.formBuilder.usernameLabel}
            </dt>
            <dd className="font-bold text-[#0F1E36] dark:text-white mt-0.5">{admin.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.formBuilder.roleLabel}
            </dt>
            <dd className="font-mono text-xs text-slate-800 dark:text-slate-200 mt-0.5">
              {admin.role}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.formBuilder.assignedOrgLabel}
            </dt>
            <dd className="text-slate-800 dark:text-slate-200 mt-0.5">{assignedOrg}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.formBuilder.lastLoginLabel}
            </dt>
            <dd className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
              {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : 'Active session'}
            </dd>
          </div>
        </dl>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-100 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/80 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>{t.formBuilder.logoutButton}</span>
          </button>
        </div>
      </section>

      <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[#0F1E36] dark:text-white">
              {t.formBuilder.changeCredentialsTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords((p) => !p)}
            aria-pressed={showPasswords}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] dark:text-amber-400 hover:underline cursor-pointer"
          >
            {showPasswords ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            <span>{showPasswords ? t.formBuilder.hidePassword : t.formBuilder.showPassword}</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60 p-3.5 text-sm text-red-900 dark:text-red-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 p-3.5 text-sm text-emerald-900 dark:text-emerald-100"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fb-acc-username"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.newUsernameLabel}
              </label>
              <input
                id="fb-acc-username"
                type="text"
                required
                minLength={3}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fb-acc-cur-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.currentPasswordLabel}
              </label>
              <input
                id="fb-acc-cur-pass"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                data-ai-masked="true"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fb-acc-new-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.newPasswordLabel} (optional)
              </label>
              <input
                id="fb-acc-new-pass"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                data-ai-masked="true"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="fb-acc-confirm-pass"
                className="block text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
              >
                {t.formBuilder.confirmNewPasswordLabel}
              </label>
              <input
                id="fb-acc-confirm-pass"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                data-ai-masked="true"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F3F4F6]/60 dark:bg-slate-800 px-3.5 py-2 text-sm text-[#0F1E36] dark:text-white"
              />
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            {t.formBuilder.passwordRulesHint}
          </p>

          <button
            type="submit"
            disabled={isSaving}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#0F1E36] hover:bg-[#1E3A5F] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-[#0F1E36] text-sm font-bold cursor-pointer disabled:opacity-60"
          >
            {isSaving ? t.formBuilder.savingChanges : t.formBuilder.saveChangesButton}
          </button>
        </form>
      </section>
    </div>
  );
};
