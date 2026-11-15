# Integration Guide (`<accessible-gateway>`)

## 1. Plain HTML Website (Zero React on Host)

Add the compiled Web Component script once and place `<accessible-gateway>` anywhere in your HTML. All styles are encapsulated inside Shadow DOM so host CSS never breaks the component and component CSS never leaks into your page.

```html
<script src="/accessible-gateway.js" defer></script>

<accessible-gateway
  tenant-key="PUBLIC_TENANT_KEY"
  module="onboarding"
  theme="alx"
  lang="en"
  api-mode="mock"
  demo="true"
></accessible-gateway>
```

Live reference demos included in this repository:
- `/demo-plain-html.html` — Plain third-party HTML page with conflicting Georgia serif and button styles.
- `/demo-savanna-host.html` — Simulated Savanna host with live attribute controls and event log.

## 2. React Host Website

Import and render the `<accessible-gateway>` element after calling `registerAccessibleGatewayElement()` (or loading the script bundle):

```tsx
import { useEffect, useRef } from 'react';
import { registerAccessibleGatewayElement } from './src/web-component/AccessibleGatewayElement';

registerAccessibleGatewayElement();

export function PartnerPage() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSubmitted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('Onboarding completed:', detail);
    };
    el.addEventListener('gateway:onboarding-submitted', onSubmitted);
    return () => el.removeEventListener('gateway:onboarding-submitted', onSubmitted);
  }, []);

  return (
    <accessible-gateway
      ref={ref}
      tenant-key="UNIVERSITY_PARTNER_01"
      theme="neutral"
      org-name="Addis Open University"
      primary-color="#1e3a8a"
      secondary-color="#0f766e"
      module="all"
      lang="en"
      api-mode="real"
      api-base-url="https://api.example.org"
      demo="false"
    />
  );
}
```

## 3. Supported Attributes

| Attribute | Values | Default | Notes |
| --- | --- | --- | --- |
| `tenant-key` | string | `PUBLIC_TENANT_KEY` | Public tenant identifier (never pass private secrets) |
| `module` | `all` \| `onboarding` \| `career` \| `employer` | `all` | Controls the initial active module |
| `theme` | `alx` \| `neutral` | `alx` | Partner theme preset |
| `org-name` | string | Theme default | Overrides displayed partner organization & logo title |
| `primary-color` | hex color | Theme default | Validated against WCAG 2.2 AA (4.5:1); auto-darkens if contrast fails |
| `secondary-color` | hex color | Theme default | Validated against WCAG 2.2 AA (4.5:1); auto-darkens if contrast fails |
| `intro-text` | string | Theme default | Optional plain-language welcome paragraph |
| `lang` | `en` \| `am` \| `om` | `en` | Active UI language (`en` English, `am` Amharic, `om` Afaan Oromo; `am` and `om` lazy-load on demand) |
| `api-mode` | `mock` \| `real` | `mock` | Explicit Mock vs REST adapter switch |
| `api-base-url` | URL string | `""` | Overrides `VITE_API_BASE_URL` for REST requests |
| `demo` | `true` \| `false` | `true` | Hides Judge Checklist when `false` |

## 4. Custom Events & Privacy Guarantees

All custom events bubble and set `composed: true` so host listeners receive them across the Shadow DOM boundary.

**Strict Privacy Rule:** Event payloads NEVER contain private support preference categories, support notes, or identity reference numbers unless the learner explicitly consents and the host requires them.

| Event Name | Payload Type |
| --- | --- |
| `gateway:onboarding-started` | `{ tenantKey: string, language: string, timestamp: string }` |
| `gateway:step-changed` | `{ flow: 'onboarding' \| 'job_application', stepId: string, stepIndex: number, totalSteps: number }` |
| `gateway:draft-saved` | `{ storage: 'memory_only' \| 'device_indexeddb' \| 'server_saved', sensitiveExcluded: boolean, timestamp: string }` |
| `gateway:onboarding-submitted` | `{ submissionId: string, mode: 'mock' \| 'real', registrationMode: 'self' \| 'partner_assisted', identityRoute: string, supportRequestedFlag: boolean }` |
| `gateway:support-requested` | `{ hasSupportRequest: boolean }` (only boolean flag by default) |
| `gateway:job-applied` | `{ jobId: string, applicationId: string, mode: 'mock' \| 'real', sharedAccommodationConsent: boolean }` |
| `gateway:error` | `{ code: string, message: string, recoverable: boolean }` |

## 5. Full-Stack Backend & Form Builder Administration

The Express + SQLite backend (`server.ts`, `server/`) runs on port `3000` alongside the frontend and provides persistent storage, authentication, and multi-tenant isolation.

### Initial Form Builder Administrator Bootstrap
Set these server-side environment variables before starting the server for the first time:
```env
FORM_BUILDER_ADMIN_USERNAME="savanna_root_admin"
FORM_BUILDER_INITIAL_PASSWORD="ChangeMe!2026Strong"
```
- The backend provisions one `platform_admin` account only when no `platform_admin` exists, hashing the password with salted `scrypt`.
- On first login, the administrator is required to set a new username and strong password (`must_change_credentials`) before accessing `/api/v1/admin/*` routes (`403 CREDENTIAL_CHANGE_REQUIRED` is enforced server-side).
- Public user registration (`/api/v1/auth/register`) only permits `learner` and `employer` roles.

### Core API Groups (`/api/v1`)
- **Admin Auth & Account**: `POST /admin/auth/login`, `GET /admin/auth/me`, `POST /admin/auth/first-login-setup`, `PUT /admin/auth/credentials`, `POST /admin/auth/logout`
- **Admin Form Builder (Protected)**: `/admin/organizations`, `/admin/org-admins`, `/admin/forms`, `/admin/forms/:id`, `/admin/forms/:id/publish`, `/admin/forms/:id/archive`, `/admin/forms/:id/versions`, `/admin/submissions`, `/admin/private-support`, `/admin/analytics`
- **Public Published Forms**: `GET /public/organizations`, `GET /public/forms`, `GET /public/forms/:id`, `POST /public/forms/:id/submissions`
- **User Auth**: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- **Onboarding, Learners & Career**: `/onboarding/sessions`, `/onboarding/submissions`, `/onboarding/resume-sms`, `/learners/*`, `/jobs`, `/jobs/:jobId/applications`, `/employer/*`, `/files`, `/files/:id/download`, `/feedback`, `/analytics/summary`

