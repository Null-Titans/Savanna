import {
  DashboardAnalyticsSummary,
  FormVersionRecord,
  JobApplicationRecord,
  JobPosting,
  OrganizationRecord,
  UploadedFileMeta,
  UserAccountSummary,
} from '../../types/gateway';
import { gatewayApi } from './client';

export class UserApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'UserApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new UserApiError('Unable to reach server. Check your internet connection.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body?.message) message = body.message;
      if (body?.code) code = body.code;
    } catch {
      // ignore non-json
    }
    throw new UserApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const userApi = {
  async getCurrentUser(): Promise<{ authenticated: boolean; user: UserAccountSummary | null }> {
    try {
      return await apiJson<{ authenticated: boolean; user: UserAccountSummary }>('/api/v1/auth/me');
    } catch (err) {
      if (err instanceof UserApiError && err.status === 401) {
        return { authenticated: false, user: null };
      }
      return { authenticated: false, user: null };
    }
  },

  register(payload: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: 'learner' | 'employer';
    organizationName?: string;
  }): Promise<{ authenticated: boolean; user: UserAccountSummary }> {
    return apiJson('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(usernameOrEmail: string, password: string): Promise<{ authenticated: boolean; user: UserAccountSummary }> {
    return apiJson('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password }),
    });
  },

  logout(): Promise<{ loggedOut: boolean }> {
    return apiJson('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listPublicOrganizations(): Promise<OrganizationRecord[]> {
    return apiJson('/api/v1/public/organizations');
  },

  listPublicForms(organizationSlug?: string): Promise<Array<{
    id: string;
    organizationId: string;
    slug: string;
    type: string;
    versionId: string;
    versionNumber: number;
    title: { en: string; am: string; om: string };
    description: { en: string; am: string; om: string };
  }>> {
    const qs = organizationSlug ? `?org=${encodeURIComponent(organizationSlug)}` : '';
    return apiJson(`/api/v1/public/forms${qs}`);
  },

  getPublicForm(formId: string): Promise<FormVersionRecord['schemaSnapshot'] & { versionId: string; versionNumber: number }> {
    return apiJson(`/api/v1/public/forms/${encodeURIComponent(formId)}`);
  },

  submitPublicForm(
    formId: string,
    payload: { answers: Record<string, unknown>; language: string }
  ): Promise<{ id: string; submittedAt: string; formVersionId: string; status: string }> {
    return apiJson(`/api/v1/public/forms/${encodeURIComponent(formId)}/submissions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  saveOnboardingSession(payload: {
    sessionId?: string;
    organizationId?: string;
    currentStep: number;
    draft: Record<string, unknown>;
  }): Promise<{ id: string; updatedAt: string }> {
    return apiJson('/api/v1/onboarding/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listMyApplications(): Promise<JobApplicationRecord[]> {
    return apiJson('/api/v1/jobs/applications/mine');
  },

  listEmployerJobs(): Promise<JobPosting[]> {
    return apiJson('/api/v1/employer/jobs');
  },

  listEmployerApplications(): Promise<JobApplicationRecord[]> {
    return apiJson('/api/v1/employer/applications');
  },

  updateApplicationStatus(
    applicationId: string,
    status: JobApplicationRecord['status']
  ): Promise<JobApplicationRecord> {
    return apiJson(`/api/v1/employer/applications/${encodeURIComponent(applicationId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async uploadFile(file: File, options?: { organizationId?: string; purpose?: string }): Promise<UploadedFileMeta> {
    const baseUrl = gatewayApi.getBaseUrl();
    const formData = new FormData();
    formData.append('file', file);
    if (options?.organizationId) formData.append('organizationId', options.organizationId);
    if (options?.purpose) formData.append('purpose', options.purpose);

    const response = await fetch(`${baseUrl}/api/v1/files`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      let msg = 'File upload failed.';
      try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) msg = body.message;
      } catch {
        // ignore
      }
      throw new UserApiError(msg, response.status);
    }
    return (await response.json()) as UploadedFileMeta;
  },

  getFileDownloadUrl(fileId: string): string {
    return `${gatewayApi.getBaseUrl()}/api/v1/files/${encodeURIComponent(fileId)}/download`;
  },

  submitFeedback(payload: { category: string; message: string; language: string }): Promise<{ id: string; createdAt: string }> {
    return apiJson('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAnalyticsSummary(): Promise<DashboardAnalyticsSummary> {
    return apiJson('/api/v1/analytics/summary');
  },
};
