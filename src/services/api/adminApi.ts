import {
  AdminAccountSummary,
  DashboardAnalyticsSummary,
  FormBuilderForm,
  FormSubmissionRecord,
  FormVersionRecord,
  OrganizationRecord,
  PrivateSupportRecord,
} from '../../types/gateway';
import { gatewayApi } from './client';

export class AdminApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = gatewayApi.getBaseUrl();
  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new AdminApiError('Unable to reach the administration server. Check your connection.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body?.message) message = body.message;
      if (body?.code) code = body.code;
    } catch {
      // ignore non-json error body
    }
    throw new AdminApiError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const adminApi = {
  async getSession(): Promise<{ authenticated: boolean; admin: AdminAccountSummary | null }> {
    try {
      return await adminRequest<{ authenticated: boolean; admin: AdminAccountSummary }>(
        '/api/v1/admin/auth/me'
      );
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        return { authenticated: false, admin: null };
      }
      throw err;
    }
  },

  login(username: string, password: string): Promise<{ authenticated: boolean; admin: AdminAccountSummary }> {
    return adminRequest('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  firstLoginSetup(payload: {
    currentUsername: string;
    newUsername: string;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Promise<{ authenticated: boolean; admin: AdminAccountSummary; message: string }> {
    return adminRequest('/api/v1/admin/auth/first-login-setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateCredentials(payload: {
    newUsername?: string;
    currentPassword: string;
    newPassword?: string;
    confirmNewPassword?: string;
  }): Promise<{ authenticated: boolean; admin: AdminAccountSummary; message: string }> {
    return adminRequest('/api/v1/admin/auth/credentials', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  logout(): Promise<{ loggedOut: boolean }> {
    return adminRequest('/api/v1/admin/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listOrganizations(): Promise<OrganizationRecord[]> {
    return adminRequest('/api/v1/admin/organizations');
  },

  createOrganization(payload: {
    name: string;
    slug: string;
    type: OrganizationRecord['type'];
    branding?: Partial<OrganizationRecord['branding']>;
  }): Promise<OrganizationRecord> {
    return adminRequest('/api/v1/admin/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateOrganization(
    orgId: string,
    patch: Partial<Pick<OrganizationRecord, 'name' | 'type' | 'branding' | 'onboardingConfig'>>
  ): Promise<OrganizationRecord> {
    return adminRequest(`/api/v1/admin/organizations/${encodeURIComponent(orgId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  listOrgAdmins(): Promise<AdminAccountSummary[]> {
    return adminRequest('/api/v1/admin/org-admins');
  },

  createOrgAdmin(payload: {
    username: string;
    password: string;
    organizationId: string;
  }): Promise<AdminAccountSummary> {
    return adminRequest('/api/v1/admin/org-admins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listForms(organizationId?: string): Promise<FormBuilderForm[]> {
    const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    return adminRequest(`/api/v1/admin/forms${qs}`);
  },

  getForm(formId: string): Promise<FormBuilderForm> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}`);
  },

  createForm(payload: Partial<FormBuilderForm> & { organizationId: string }): Promise<FormBuilderForm> {
    return adminRequest('/api/v1/admin/forms', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  saveForm(formId: string, payload: Partial<FormBuilderForm>): Promise<FormBuilderForm> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteForm(formId: string): Promise<{ deleted: boolean }> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}`, {
      method: 'DELETE',
    });
  },

  publishForm(formId: string): Promise<{ form: FormBuilderForm; version: FormVersionRecord }> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  archiveForm(formId: string): Promise<FormBuilderForm> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listFormVersions(formId: string): Promise<FormVersionRecord[]> {
    return adminRequest(`/api/v1/admin/forms/${encodeURIComponent(formId)}/versions`);
  },

  listSubmissions(params?: { organizationId?: string; formId?: string }): Promise<FormSubmissionRecord[]> {
    const sp = new URLSearchParams();
    if (params?.organizationId) sp.set('organizationId', params.organizationId);
    if (params?.formId) sp.set('formId', params.formId);
    const qs = sp.toString();
    return adminRequest(`/api/v1/admin/submissions${qs ? `?${qs}` : ''}`);
  },

  getAnalytics(organizationId?: string): Promise<DashboardAnalyticsSummary> {
    const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    return adminRequest(`/api/v1/admin/analytics${qs}`);
  },

  listPrivateSupportRequests(organizationId?: string): Promise<PrivateSupportRecord[]> {
    const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    return adminRequest(`/api/v1/admin/private-support${qs}`);
  },
};
