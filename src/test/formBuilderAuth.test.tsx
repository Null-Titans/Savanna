import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { FormBuilderGuard } from '../components/admin/FormBuilderGuard';
import { adminApi, AdminApiError } from '../services/api/adminApi';
import App from '../App';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nProvider initialLanguage="en">
      {ui}
    </I18nProvider>
  );
}

describe('Form Builder Administrator Authentication & Route Guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('blocks Form Builder in App header navigation and renders dedicated Admin Login screen when unauthenticated', async () => {
    vi.spyOn(adminApi, 'getSession').mockResolvedValue({ authenticated: false, admin: null });
    const user = userEvent.setup();
    render(<App />);

    const fbNav = screen.getByRole('button', { name: /Form Builder/i });
    await user.click(fbNav);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Form Builder Administration/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create form/i })).not.toBeInTheDocument();
  });

  it('validates inputs, toggles password visibility, and shows invalid credentials error on 401', async () => {
    vi.spyOn(adminApi, 'getSession').mockResolvedValue({ authenticated: false, admin: null });
    const loginSpy = vi
      .spyOn(adminApi, 'login')
      .mockRejectedValue(new AdminApiError('Invalid administrator username or password.', 401, 'INVALID_CREDENTIALS'));

    const user = userEvent.setup();
    renderWithProviders(
      <FormBuilderGuard onBackToGateway={() => {}} onOpenPublicForm={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Form Builder Administration/i })).toBeInTheDocument();
    });

    // Submit empty fields -> accessible field validation alerts
    await user.click(screen.getByRole('button', { name: /Sign In/i }));
    expect(await screen.findByText(/Enter your administrator username/i)).toBeInTheDocument();
    expect(screen.getByText(/Please enter your password/i)).toBeInTheDocument();

    // Toggle show/hide password
    const pwdInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    expect(pwdInput.type).toBe('password');
    await user.click(screen.getByRole('button', { name: /Show password/i }));
    expect(pwdInput.type).toBe('text');

    // Submit wrong credentials
    await user.type(screen.getByLabelText(/Username/i), 'wrong_admin');
    await user.type(pwdInput, 'BadPass123!');
    await user.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('wrong_admin', 'BadPass123!');
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid administrator username or password/i);
    });
  });

  it('enforces mandatory first-login credential change before entering Form Builder Workspace', async () => {
    vi.spyOn(adminApi, 'getSession').mockResolvedValue({ authenticated: false, admin: null });
    vi.spyOn(adminApi, 'login').mockResolvedValue({
      authenticated: true,
      admin: {
        id: 'adm-1',
        username: 'initial_admin',
        role: 'platform_admin',
        organizationId: null,
        mustChangeCredentials: true,
        createdAt: '2026-11-15T09:00:00Z',
        updatedAt: '2026-11-15T09:00:00Z',
        lastLoginAt: null,
      },
    });
    vi.spyOn(adminApi, 'firstLoginSetup').mockResolvedValue({
      authenticated: true,
      message: 'Credentials updated.',
      admin: {
        id: 'adm-1',
        username: 'savanna_admin',
        role: 'platform_admin',
        organizationId: null,
        mustChangeCredentials: false,
        createdAt: '2026-11-15T09:00:00Z',
        updatedAt: '2026-11-15T10:00:00Z',
        lastLoginAt: '2026-11-15T10:00:00Z',
      },
    });
    vi.spyOn(adminApi, 'listOrganizations').mockResolvedValue([
      {
        id: 'org-alx-ethiopia',
        slug: 'alx-ethiopia',
        name: 'ALX Ethiopia',
        type: 'training_institution',
        branding: {
          primaryColor: '#0F1E36',
          secondaryColor: '#1E3A5F',
          logoText: 'ALX Ethiopia',
          introText: 'Accessible onboarding',
          defaultLanguage: 'en',
        },
        onboardingConfig: {
          allowAnonymousOnboarding: true,
          requireConsentRecord: true,
          defaultFormId: null,
        },
        createdAt: '2026-11-15T09:00:00Z',
        updatedAt: '2026-11-15T09:00:00Z',
      },
    ]);
    vi.spyOn(adminApi, 'listForms').mockResolvedValue([]);
    vi.spyOn(adminApi, 'listSubmissions').mockResolvedValue([]);
    vi.spyOn(adminApi, 'listPrivateSupportRequests').mockResolvedValue([]);
    vi.spyOn(adminApi, 'listOrgAdmins').mockResolvedValue([]);
    vi.spyOn(adminApi, 'getAnalytics').mockResolvedValue({
      organizationCount: 1,
      learnerCount: 0,
      onboardingSessionCount: 0,
      completedRegistrationCount: 0,
      formCount: 1,
      publishedFormCount: 1,
      formSubmissionCount: 0,
      jobCount: 6,
      applicationCount: 0,
      privateSupportRequestCount: 0,
      feedbackCount: 0,
    });

    const user = userEvent.setup();
    renderWithProviders(
      <FormBuilderGuard onBackToGateway={() => {}} onOpenPublicForm={() => {}} />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Username/i), 'initial_admin');
    await user.type(screen.getByLabelText(/^Password$/i), 'InitialSecret!2026');
    await user.click(screen.getByRole('button', { name: /Sign In/i }));

    // Must land on mandatory credential setup screen
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Mandatory Credential Setup/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/New username/i), 'savanna_admin');
    await user.type(screen.getByLabelText(/Current password/i), 'InitialSecret!2026');
    await user.type(screen.getByLabelText(/^New password$/i), 'RotatedStrong!2026');
    await user.type(screen.getByLabelText(/Confirm new password/i), 'RotatedStrong!2026');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    // Now transitions into Form Builder Workspace
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Organization & Form Builder Console/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Administrator credentials updated securely/i)).toBeInTheDocument();
  });

  it('supports Amharic and Afaan Oromoo translations on the Form Builder login page', async () => {
    vi.spyOn(adminApi, 'getSession').mockResolvedValue({ authenticated: false, admin: null });

    const { rerender } = render(
      <I18nProvider initialLanguage="am">
        <FormBuilderGuard onBackToGateway={() => {}} onOpenPublicForm={() => {}} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /የቅጽ ገንቢ አስተዳደር/i })).toBeInTheDocument();
    });

    rerender(
      <I18nProvider initialLanguage="om">
        <FormBuilderGuard onBackToGateway={() => {}} onOpenPublicForm={() => {}} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Bulchiinsa Ijaarsa Unkaa/i })).toBeInTheDocument();
    });
  });
});
