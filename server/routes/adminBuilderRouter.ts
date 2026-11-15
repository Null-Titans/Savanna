import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { writeAuditLog } from '../db/database.ts';
import {
  type AuthenticatedRequest,
  requireAdminAuth,
  requireCompletedCredentials,
  requirePlatformAdmin,
} from '../auth/sessionAuth.ts';
import {
  generateId,
  hashPassword,
  isStrongAdminPassword,
} from '../security/crypto.ts';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveTenantScope(
  admin: NonNullable<AuthenticatedRequest['admin']>,
  requestedOrgId?: string
): { allowed: true; organizationId: string | null } | { allowed: false } {
  if (admin.role === 'org_admin') {
    if (!admin.organizationId) return { allowed: false };
    if (requestedOrgId && requestedOrgId !== admin.organizationId) {
      return { allowed: false };
    }
    return { allowed: true, organizationId: admin.organizationId };
  }
  return { allowed: true, organizationId: requestedOrgId || null };
}

function hydrateForm(db: AppDatabase, formRow: Record<string, unknown>) {
  const formId = String(formRow.id);
  const sections = (
    db
      .prepare('SELECT * FROM form_sections WHERE form_id = ? ORDER BY sort_order ASC')
      .all(formId) as Array<Record<string, unknown>>
  ).map((s) => ({
    id: String(s.id),
    sortOrder: Number(s.sort_order),
    title: parseJson(String(s.title_json), { en: '', am: '', om: '' }),
    description: parseJson(String(s.description_json), { en: '', am: '', om: '' }),
  }));

  const questions = (
    db
      .prepare('SELECT * FROM form_questions WHERE form_id = ? ORDER BY sort_order ASC')
      .all(formId) as Array<Record<string, unknown>>
  ).map((q) => ({
    id: String(q.id),
    sectionId: String(q.section_id),
    fieldKey: String(q.field_key),
    sortOrder: Number(q.sort_order),
    questionType: String(q.question_type),
    label: parseJson(String(q.label_json), { en: '', am: '', om: '' }),
    helpText: parseJson(String(q.help_text_json), { en: '', am: '', om: '' }),
    whyWeAsk: parseJson(String(q.why_we_ask_json), { en: '', am: '', om: '' }),
    placeholder: parseJson(String(q.placeholder_json), { en: '', am: '', om: '' }),
    required: Boolean(q.required),
    sensitive: Boolean(q.sensitive),
    options: parseJson(String(q.options_json), []),
    validation: parseJson(String(q.validation_json), {}),
    conditionalLogic: q.conditional_logic_json ? parseJson(String(q.conditional_logic_json), null) : null,
  }));

  return {
    id: formId,
    organizationId: String(formRow.organization_id),
    slug: String(formRow.slug),
    type: String(formRow.type),
    status: String(formRow.status),
    isTemplate: Boolean(formRow.is_template),
    activeVersionId: formRow.active_version_id ? String(formRow.active_version_id) : null,
    title: parseJson(String(formRow.title_json), { en: '', am: '', om: '' }),
    description: parseJson(String(formRow.description_json), { en: '', am: '', om: '' }),
    submitLabel: parseJson(String(formRow.submit_label_json), { en: 'Submit', am: 'አስገባ', om: 'Ergi' }),
    doneMessage: parseJson(String(formRow.done_message_json), { en: 'Submitted.', am: 'ገብቷል።', om: 'Ergameera.' }),
    branding: parseJson(String(formRow.branding_json), {
      primaryColor: '#0F1E36',
      secondaryColor: '#1E3A5F',
      logoText: 'Savanna Gateway',
      introText: '',
      defaultLanguage: 'en',
    }),
    sections,
    questions,
    createdBy: String(formRow.created_by),
    createdAt: String(formRow.created_at),
    updatedAt: String(formRow.updated_at),
  };
}

function replaceSectionsAndQuestions(
  db: AppDatabase,
  formId: string,
  sections: Array<Record<string, unknown>>,
  questions: Array<Record<string, unknown>>
) {
  db.prepare('DELETE FROM form_sections WHERE form_id = ?').run(formId);
  db.prepare('DELETE FROM form_questions WHERE form_id = ?').run(formId);

  const insertSec = db.prepare(`
    INSERT INTO form_sections (id, form_id, sort_order, title_json, description_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    insertSec.run(
      String(s.id || generateId('sec')),
      formId,
      Number.isFinite(Number(s.sortOrder)) ? Number(s.sortOrder) : i,
      JSON.stringify(s.title || { en: `Section ${i + 1}`, am: '', om: '' }),
      JSON.stringify(s.description || { en: '', am: '', om: '' })
    );
  }

  const insertQ = db.prepare(`
    INSERT INTO form_questions (
      id, form_id, section_id, field_key, sort_order, question_type,
      label_json, help_text_json, why_we_ask_json, placeholder_json,
      required, sensitive, options_json, validation_json, conditional_logic_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    insertQ.run(
      String(q.id || generateId('q')),
      formId,
      String(q.sectionId || sections[0]?.id || 'sec-1'),
      String(q.fieldKey || `field_${i + 1}`),
      Number.isFinite(Number(q.sortOrder)) ? Number(q.sortOrder) : i,
      String(q.questionType || 'text'),
      JSON.stringify(q.label || { en: `Question ${i + 1}`, am: '', om: '' }),
      JSON.stringify(q.helpText || { en: '', am: '', om: '' }),
      JSON.stringify(q.whyWeAsk || { en: '', am: '', om: '' }),
      JSON.stringify(q.placeholder || { en: '', am: '', om: '' }),
      q.required ? 1 : 0,
      q.sensitive ? 1 : 0,
      JSON.stringify(Array.isArray(q.options) ? q.options : []),
      JSON.stringify(q.validation || {}),
      q.conditionalLogic ? JSON.stringify(q.conditionalLogic) : null
    );
  }
}

export function createAdminBuilderRouter(db: AppDatabase): Router {
  const router = Router();

  // Enforce verified administrator session AND completed first-login setup on ALL Form Builder routes
  router.use(requireAdminAuth(db), requireCompletedCredentials());

  // Organizations
  router.get('/organizations', (req: AuthenticatedRequest, res) => {
    const admin = req.admin!;
    const rows =
      admin.role === 'platform_admin'
        ? (db.prepare('SELECT * FROM organizations ORDER BY created_at ASC').all() as Array<Record<string, unknown>>)
        : (db
            .prepare('SELECT * FROM organizations WHERE id = ?')
            .all(admin.organizationId || '') as Array<Record<string, unknown>>);

    res.json(
      rows.map((r) => ({
        id: String(r.id),
        slug: String(r.slug),
        name: String(r.name),
        type: String(r.type),
        branding: parseJson(String(r.branding_json), {}),
        onboardingConfig: parseJson(String(r.onboarding_config_json), {}),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }))
    );
  });

  router.post('/organizations', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim().toLowerCase() : '';
    const type = typeof req.body?.type === 'string' ? req.body.type : 'company';

    if (!name || !slug) {
      res.status(400).json({ message: 'Organization name and slug are required.' });
      return;
    }

    const exists = db
      .prepare('SELECT id FROM organizations WHERE slug = ? LIMIT 1')
      .get(slug) as { id?: string } | undefined;
    if (exists?.id) {
      res.status(409).json({ message: 'An organization with that slug already exists.' });
      return;
    }

    const id = generateId('org');
    const now = new Date().toISOString();
    const branding = {
      primaryColor: '#0F1E36',
      secondaryColor: '#1E3A5F',
      logoText: name,
      introText: `Accessible onboarding and services for ${name}.`,
      defaultLanguage: 'en',
      ...(req.body?.branding || {}),
    };
    const onboardingConfig = {
      allowAnonymousOnboarding: true,
      requireConsentRecord: true,
      defaultFormId: null,
    };

    db.prepare(`
      INSERT INTO organizations (id, slug, name, type, branding_json, onboarding_config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, slug, name, type, JSON.stringify(branding), JSON.stringify(onboardingConfig), now, now);

    writeAuditLog(db, {
      actorType: 'admin',
      actorId: req.admin!.id,
      organizationId: id,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: id,
    });

    res.status(201).json({
      id,
      slug,
      name,
      type,
      branding,
      onboardingConfig,
      createdAt: now,
      updatedAt: now,
    });
  });

  router.patch('/organizations/:orgId', (req: AuthenticatedRequest, res) => {
    const orgId = req.params.orgId;
    const scope = resolveTenantScope(req.admin!, orgId);
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization access denied.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM organizations WHERE id = ? LIMIT 1')
      .get(orgId) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const nextName = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : String(row.name);
    const nextType = typeof req.body?.type === 'string' ? req.body.type : String(row.type);
    const nextBranding = { ...parseJson(String(row.branding_json), {}), ...(req.body?.branding || {}) };
    const nextOnboardingConfig = {
      ...parseJson(String(row.onboarding_config_json), {}),
      ...(req.body?.onboardingConfig || {}),
    };
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE organizations
      SET name = ?, type = ?, branding_json = ?, onboarding_config_json = ?, updated_at = ?
      WHERE id = ?
    `).run(nextName, nextType, JSON.stringify(nextBranding), JSON.stringify(nextOnboardingConfig), now, orgId);

    res.json({
      id: orgId,
      slug: String(row.slug),
      name: nextName,
      type: nextType,
      branding: nextBranding,
      onboardingConfig: nextOnboardingConfig,
      createdAt: String(row.created_at),
      updatedAt: now,
    });
  });

  // Organization Admins
  router.get('/org-admins', requirePlatformAdmin, (_req, res) => {
    const rows = db
      .prepare("SELECT id, username, role, organization_id, must_change_credentials, created_at, updated_at, last_login_at FROM admin_accounts WHERE role = 'org_admin' ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;

    res.json(
      rows.map((r) => ({
        id: String(r.id),
        username: String(r.username),
        role: 'org_admin',
        organizationId: r.organization_id ? String(r.organization_id) : null,
        mustChangeCredentials: Boolean(r.must_change_credentials),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
      }))
    );
  });

  router.post('/org-admins', requirePlatformAdmin, (req: AuthenticatedRequest, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const organizationId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : '';

    if (username.length < 3 || !organizationId) {
      res.status(400).json({ message: 'Valid username and organizationId are required.' });
      return;
    }
    if (!isStrongAdminPassword(password)) {
      res.status(400).json({
        message: 'Password must be at least 10 characters with uppercase, lowercase, number, and symbol.',
      });
      return;
    }

    const org = db.prepare('SELECT id FROM organizations WHERE id = ? LIMIT 1').get(organizationId) as { id?: string } | undefined;
    if (!org?.id) {
      res.status(404).json({ message: 'Target organization not found.' });
      return;
    }

    const dup = db.prepare('SELECT id FROM admin_accounts WHERE username = ? LIMIT 1').get(username) as { id?: string } | undefined;
    if (dup?.id) {
      res.status(409).json({ message: 'Administrator username already exists.' });
      return;
    }

    const id = generateId('adm');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO admin_accounts (id, username, password_hash, role, organization_id, must_change_credentials, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, 'org_admin', ?, 1, ?, ?, NULL)
    `).run(id, username, hashPassword(password), organizationId, now, now);

    res.status(201).json({
      id,
      username,
      role: 'org_admin',
      organizationId,
      mustChangeCredentials: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  });

  // Forms CRUD
  router.get('/forms', (req: AuthenticatedRequest, res) => {
    const requestedOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const scope = resolveTenantScope(req.admin!, requestedOrgId);
    if (!scope.allowed) {
      res.status(403).json({ message: 'Access to requested organization forms denied.' });
      return;
    }

    const rows = scope.organizationId
      ? (db.prepare('SELECT * FROM forms WHERE organization_id = ? ORDER BY updated_at DESC').all(scope.organizationId) as Array<Record<string, unknown>>)
      : (db.prepare('SELECT * FROM forms ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>);

    res.json(rows.map((r) => hydrateForm(db, r)));
  });

  router.get('/forms/:id', (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(row.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization form access denied.' });
      return;
    }
    res.json(hydrateForm(db, row));
  });

  router.post('/forms', (req: AuthenticatedRequest, res) => {
    const requestedOrgId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : '';
    const scope = resolveTenantScope(req.admin!, requestedOrgId);
    if (!scope.allowed || !scope.organizationId) {
      res.status(403).json({ message: 'Unauthorized organization target.' });
      return;
    }

    const org = db.prepare('SELECT * FROM organizations WHERE id = ? LIMIT 1').get(scope.organizationId) as Record<string, unknown> | undefined;
    if (!org) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const id = generateId('form');
    const slug =
      typeof req.body?.slug === 'string' && req.body.slug.trim()
        ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        : `form-${Date.now()}`;
    const type = typeof req.body?.type === 'string' ? req.body.type : 'custom';
    const now = new Date().toISOString();
    const defaultSectionId = generateId('sec');
    const sections =
      Array.isArray(req.body?.sections) && req.body.sections.length > 0
        ? req.body.sections
        : [{ id: defaultSectionId, sortOrder: 0, title: { en: 'Section 1', am: 'ክፍል 1', om: 'Kutaa 1' }, description: { en: '', am: '', om: '' } }];
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];

    db.prepare(`
      INSERT INTO forms (
        id, organization_id, slug, type, status, is_template, active_version_id,
        title_json, description_json, submit_label_json, done_message_json, branding_json,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      scope.organizationId,
      slug,
      type,
      req.body?.isTemplate ? 1 : 0,
      JSON.stringify(req.body?.title || { en: 'Untitled Form', am: '', om: '' }),
      JSON.stringify(req.body?.description || { en: '', am: '', om: '' }),
      JSON.stringify(req.body?.submitLabel || { en: 'Submit', am: 'አስገባ', om: 'Ergi' }),
      JSON.stringify(req.body?.doneMessage || { en: 'Submitted successfully.', am: 'ገብቷል።', om: 'Ergameera.' }),
      JSON.stringify(req.body?.branding || parseJson(String(org.branding_json), {})),
      req.admin!.id,
      now,
      now
    );

    replaceSectionsAndQuestions(db, id, sections, questions);
    const createdRow = db.prepare('SELECT * FROM forms WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(hydrateForm(db, createdRow));
  });

  router.put('/forms/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(existing.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization form update denied.' });
      return;
    }

    const now = new Date().toISOString();
    const slug =
      typeof req.body?.slug === 'string' && req.body.slug.trim()
        ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
        : String(existing.slug);

    db.prepare(`
      UPDATE forms
      SET slug = ?, type = ?, title_json = ?, description_json = ?, submit_label_json = ?,
          done_message_json = ?, branding_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      slug,
      typeof req.body?.type === 'string' ? req.body.type : String(existing.type),
      JSON.stringify(req.body?.title || parseJson(String(existing.title_json), {})),
      JSON.stringify(req.body?.description || parseJson(String(existing.description_json), {})),
      JSON.stringify(req.body?.submitLabel || parseJson(String(existing.submit_label_json), {})),
      JSON.stringify(req.body?.doneMessage || parseJson(String(existing.done_message_json), {})),
      JSON.stringify(req.body?.branding || parseJson(String(existing.branding_json), {})),
      now,
      req.params.id
    );

    if (Array.isArray(req.body?.sections) && Array.isArray(req.body?.questions)) {
      replaceSectionsAndQuestions(db, req.params.id, req.body.sections, req.body.questions);
    }

    const updated = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json(hydrateForm(db, updated));
  });

  router.delete('/forms/:id', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(existing.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization delete denied.' });
      return;
    }

    db.prepare('DELETE FROM forms WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  });

  router.post('/forms/:id/publish', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(existing.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization publish denied.' });
      return;
    }

    const hydrated = hydrateForm(db, existing);
    const maxVerRow = db
      .prepare('SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM form_versions WHERE form_id = ?')
      .get(hydrated.id) as { max_ver: number };
    const nextVersionNumber = Number(maxVerRow.max_ver) + 1;
    const versionId = generateId('ver');
    const now = new Date().toISOString();

    const snapshot = {
      id: hydrated.id,
      organizationId: hydrated.organizationId,
      slug: hydrated.slug,
      type: hydrated.type,
      title: hydrated.title,
      description: hydrated.description,
      submitLabel: hydrated.submitLabel,
      doneMessage: hydrated.doneMessage,
      branding: hydrated.branding,
      sections: hydrated.sections,
      questions: hydrated.questions,
    };

    db.prepare(`
      INSERT INTO form_versions (id, form_id, organization_id, version_number, status, schema_snapshot_json, published_by, published_at)
      VALUES (?, ?, ?, ?, 'published', ?, ?, ?)
    `).run(versionId, hydrated.id, hydrated.organizationId, nextVersionNumber, JSON.stringify(snapshot), req.admin!.id, now);

    db.prepare(`
      UPDATE forms SET status = 'published', active_version_id = ?, updated_at = ? WHERE id = ?
    `).run(versionId, now, hydrated.id);

    writeAuditLog(db, {
      actorType: 'admin',
      actorId: req.admin!.id,
      organizationId: hydrated.organizationId,
      action: 'form.published',
      resourceType: 'form',
      resourceId: hydrated.id,
      metadata: { versionNumber: nextVersionNumber, versionId },
    });

    const updated = db.prepare('SELECT * FROM forms WHERE id = ?').get(hydrated.id) as Record<string, unknown>;
    res.json({
      form: hydrateForm(db, updated),
      version: {
        id: versionId,
        formId: hydrated.id,
        organizationId: hydrated.organizationId,
        versionNumber: nextVersionNumber,
        status: 'published',
        publishedBy: req.admin!.id,
        publishedAt: now,
        schemaSnapshot: snapshot,
      },
    });
  });

  router.post('/forms/:id/archive', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(existing.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization archive denied.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE forms SET status = 'archived', updated_at = ? WHERE id = ?").run(now, req.params.id);
    const updated = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json(hydrateForm(db, updated));
  });

  router.get('/forms/:id/versions', (req: AuthenticatedRequest, res) => {
    const existing = db.prepare('SELECT * FROM forms WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ message: 'Form not found.' });
      return;
    }
    const scope = resolveTenantScope(req.admin!, String(existing.organization_id));
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization access denied.' });
      return;
    }

    const rows = db
      .prepare('SELECT * FROM form_versions WHERE form_id = ? ORDER BY version_number DESC')
      .all(req.params.id) as Array<Record<string, unknown>>;

    res.json(
      rows.map((v) => ({
        id: String(v.id),
        formId: String(v.form_id),
        organizationId: String(v.organization_id),
        versionNumber: Number(v.version_number),
        status: String(v.status),
        publishedBy: String(v.published_by),
        publishedAt: String(v.published_at),
        schemaSnapshot: parseJson(String(v.schema_snapshot_json), {}),
      }))
    );
  });

  router.get('/submissions', (req: AuthenticatedRequest, res) => {
    const requestedOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const formId = typeof req.query.formId === 'string' ? req.query.formId : undefined;
    const scope = resolveTenantScope(req.admin!, requestedOrgId);
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization submissions access denied.' });
      return;
    }

    let sql = 'SELECT * FROM form_submissions WHERE 1=1';
    const params: string[] = [];
    if (scope.organizationId) {
      sql += ' AND organization_id = ?';
      params.push(scope.organizationId);
    }
    if (formId) {
      sql += ' AND form_id = ?';
      params.push(formId);
    }
    sql += ' ORDER BY submitted_at DESC LIMIT 200';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: String(r.id),
        organizationId: String(r.organization_id),
        formId: String(r.form_id),
        formVersionId: String(r.form_version_id),
        userId: r.user_id ? String(r.user_id) : null,
        status: String(r.status),
        answers: parseJson(String(r.answers_json), {}),
        submittedAt: String(r.submitted_at),
      }))
    );
  });

  router.get('/private-support', (req: AuthenticatedRequest, res) => {
    const requestedOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const scope = resolveTenantScope(req.admin!, requestedOrgId);
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization private support access denied.' });
      return;
    }

    const rows = scope.organizationId
      ? (db
          .prepare('SELECT * FROM private_accessibility_requests WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 100')
          .all(scope.organizationId) as Array<Record<string, unknown>>)
      : (db
          .prepare('SELECT * FROM private_accessibility_requests ORDER BY updated_at DESC LIMIT 100')
          .all() as Array<Record<string, unknown>>);

    res.json(
      rows.map((r) => ({
        id: String(r.id),
        learnerId: String(r.learner_id),
        organizationId: String(r.organization_id),
        supportPreferences: parseJson<string[]>(String(r.support_preferences_json), []),
        supportNotes: String(r.support_notes || ''),
        consentToShareWithEmployer: Boolean(r.consent_to_share_with_employer),
        updatedAt: String(r.updated_at),
      }))
    );
  });

  router.get('/analytics', (req: AuthenticatedRequest, res) => {
    const requestedOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const scope = resolveTenantScope(req.admin!, requestedOrgId);
    if (!scope.allowed) {
      res.status(403).json({ message: 'Cross-organization analytics denied.' });
      return;
    }
    const orgId = scope.organizationId;

    const count = (table: string, extraWhere = ''): number => {
      if (orgId) {
        const row = db
          .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE organization_id = ? ${extraWhere}`)
          .get(orgId) as { c: number };
        return Number(row.c);
      }
      const row = db
        .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE 1=1 ${extraWhere}`)
        .get() as { c: number };
      return Number(row.c);
    };

    const orgCountRow = orgId
      ? ({ c: 1 })
      : (db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number });
    const feedbackCountRow = db.prepare('SELECT COUNT(*) AS c FROM feedback_submissions').get() as { c: number };

    res.json({
      organizationCount: Number(orgCountRow.c),
      learnerCount: count('learners'),
      onboardingSessionCount: count('onboarding_sessions'),
      completedRegistrationCount: count('learners'),
      formCount: count('forms'),
      publishedFormCount: count('forms', "AND status = 'published'"),
      formSubmissionCount: count('form_submissions'),
      jobCount: count('jobs', 'AND is_active = 1'),
      applicationCount: count('job_applications'),
      privateSupportRequestCount: count('private_accessibility_requests'),
      feedbackCount: Number(feedbackCountRow.c),
    });
  });

  return router;
}
