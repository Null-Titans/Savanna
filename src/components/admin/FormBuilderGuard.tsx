import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { AdminAccountSummary } from '../../types/gateway';
import { adminApi } from '../../services/api/adminApi';
import { FormBuilderLoginPage } from './FormBuilderLoginPage';
import { AdminCredentialSetupPage } from './AdminCredentialSetupPage';
import { FormBuilderWorkspace } from './FormBuilderWorkspace';

interface FormBuilderGuardProps {
  onBackToGateway: () => void;
  onOpenPublicForm: (formId: string) => void;
}

export const FormBuilderGuard: React.FC<FormBuilderGuardProps> = ({
  onBackToGateway,
  onOpenPublicForm,
}) => {
  const { t } = useI18n();
  const [checkingSession, setCheckingSession] = useState(true);
  const [admin, setAdmin] = useState<AdminAccountSummary | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  const verifySession = useCallback(async () => {
    setCheckingSession(true);
    try {
      const res = await adminApi.getSession();
      if (res.authenticated && res.admin) {
        setAdmin(res.admin);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    void verifySession();
  }, [verifySession]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // Clear local session view regardless
    }
    setAdmin(null);
    setWorkspaceNotice(null);
    setSessionNotice(null);
  };

  if (checkingSession) {
    return (
      <div
        role="status"
        className="max-w-md mx-auto my-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-sm font-semibold text-[#0F1E36] dark:text-slate-100"
      >
        {t.formBuilder.checkingSession}
      </div>
    );
  }

  if (!admin) {
    return (
      <FormBuilderLoginPage
        sessionExpiredNotice={sessionNotice}
        onLoginSuccess={(loggedInAdmin) => {
          setSessionNotice(null);
          setWorkspaceNotice(null);
          setAdmin(loggedInAdmin);
        }}
        onBackToGateway={onBackToGateway}
      />
    );
  }

  if (admin.mustChangeCredentials) {
    return (
      <AdminCredentialSetupPage
        admin={admin}
        onSetupComplete={(updatedAdmin, notice) => {
          setWorkspaceNotice(notice);
          setAdmin(updatedAdmin);
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <FormBuilderWorkspace
      admin={admin}
      initialNotice={workspaceNotice}
      onAdminUpdated={(nextAdmin, notice) => {
        setAdmin(nextAdmin);
        if (notice) setWorkspaceNotice(notice);
      }}
      onSessionExpired={(message) => {
        setAdmin(null);
        setWorkspaceNotice(null);
        setSessionNotice(message || t.formBuilder.sessionExpired);
      }}
      onLogout={handleLogout}
      onOpenPublicForm={onOpenPublicForm}
    />
  );
};
