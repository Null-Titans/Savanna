import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { type AuthenticatedRequest, optionalUserAuth } from '../auth/sessionAuth.ts';
import { generateId } from '../security/crypto.ts';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface SnapshotQuestion {
  id: string;
  fieldKey: string;
  questionType: string;
  label: { en: string; am: string; om: string };
  required?: boolean;
  validation?: { min?: number; max?: number; minLength?: number; maxLength?: number };
  conditionalLogic?: {
    dependsOnKey: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy';
    value?: string;
  } | null;
}

function isQuestionVisibleServer(q: SnapshotQuestion, answers: Record<string, unknown>): boolean {
  if (!q.conditionalLogic || !q.conditionalLogic.dependsOnKey) return true;
  const targetVal = answers[q.conditionalLogic.dependsOnKey];
  const expected = q.conditionalLogic.value ?? '';
  switch (q.conditionalLogic.operator) {
    case 'is_truthy':
      return Array.isArray(targetVal)
        ? targetVal.length > 0
        : Boolean(targetVal && String(targetVal).trim() !== '');
    case 'equals':
      return String(targetVal ?? '').toLowerCase() === expected.toLowerCase();
    case 'not_equals':
      return String(targetVal ?? '').toLowerCase() !== expected.toLowerCase();
    case 'contains':
      return Array.isArray(targetVal)
        ? targetVal.includes(expected)
        : String(targetVal ?? '').toLowerCase().includes(expected.toLowerCase());
    default:
      return true;
  }
}

export function createPublicFormsRouter(db: AppDatabase): Router {
  const router = Router();

  router.get('/organizations', (_req, res) => {
    const rows = db
      .prepare('SELECT id, slug, name, type, branding_json, onboarding_config_json, created_at, updated_at FROM organizations ORDER BY name ASC')
      .all() as Array<Record<string, unknown>>;

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

  router.get('/forms', (req, res) => {
    const orgSlug = typeof req.query.org === 'string' ? req.query.org.trim() : '';
    let sql = `
      SELECT f.id, f.organization_id, f.slug, f.type, f.title_json, f.description_json,
             v.id AS version_id, v.version_number
      FROM forms f
      JOIN form_versions v ON v.id = f.active_version_id
      JOIN organizations o ON o.id = f.organization_id
      WHERE f.status = 'published'
    `;
    const params: string[] = [];
    if (orgSlug) {
      sql += ' AND o.slug = ?';
      params.push(orgSlug);
    }
    sql += ' ORDER BY f.updated_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: String(r.id),
        organizationId: String(r.organization_id),
        slug: String(r.slug),
        type: String(r.type),
        versionId: String(r.version_id),
        versionNumber: Number(r.version_number),
        title: parseJson(String(r.title_json), { en: '', am: '', om: '' }),
        description: parseJson(String(r.description_json), { en: '', am: '', om: '' }),
      }))
    );
  });

  router.get('/forms/:id', (req, res) => {
    const row = db
      .prepare(`
        SELECT f.id, f.status, v.id AS version_id, v.version_number, v.schema_snapshot_json
        FROM forms f
        JOIN form_versions v ON v.id = f.active_version_id
        WHERE f.id = ? AND f.status = 'published'
        LIMIT 1
      `)
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ message: 'Published form not found.' });
      return;
    }

    const snapshot = parseJson<Record<string, unknown>>(String(row.schema_snapshot_json), {});
    res.json({
      ...snapshot,
      versionId: String(row.version_id),
      versionNumber: Number(row.version_number),
    });
  });

  router.post('/forms/:id/submissions', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const row = db
      .prepare(`
        SELECT f.id, f.organization_id, f.status, v.id AS version_id, v.schema_snapshot_json
        FROM forms f
        JOIN form_versions v ON v.id = f.active_version_id
        WHERE f.id = ? AND f.status = 'published'
        LIMIT 1
      `)
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ message: 'Published form is not available for submissions.' });
      return;
    }

    const answers = (req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}) as Record<
      string,
      unknown
    >;
    const snapshot = parseJson<{ questions?: SnapshotQuestion[] }>(
      String(row.schema_snapshot_json),
      {}
    );
    const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];

    for (const q of questions) {
      if (!isQuestionVisibleServer(q, answers)) continue;
      const val = answers[q.fieldKey];

      if (q.questionType === 'consent') {
        if (q.required && val !== true) {
          res.status(400).json({ message: `Consent is required for "${q.label?.en || q.fieldKey}".` });
          return;
        }
        continue;
      }

      if (q.questionType === 'checkbox') {
        if (q.required && (!Array.isArray(val) || val.length === 0)) {
          res.status(400).json({ message: `"${q.label?.en || q.fieldKey}" requires at least one selection.` });
          return;
        }
        continue;
      }

      if (q.questionType === 'address') {
        const addr = (val as { street?: string; city?: string }) || {};
        if (q.required && (!addr.street?.trim() || !addr.city?.trim())) {
          res.status(400).json({ message: `Address street and city are required for "${q.label?.en || q.fieldKey}".` });
          return;
        }
        continue;
      }

      const str = typeof val === 'string' || typeof val === 'number' ? String(val).trim() : '';
      if (q.required && !str) {
        res.status(400).json({ message: `"${q.label?.en || q.fieldKey}" is required.` });
        return;
      }
      if (str && q.questionType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
        res.status(400).json({ message: `Invalid email address for "${q.label?.en || q.fieldKey}".` });
        return;
      }
      if (str && q.questionType === 'number') {
        const num = Number(str);
        if (Number.isNaN(num)) {
          res.status(400).json({ message: `Invalid number for "${q.label?.en || q.fieldKey}".` });
          return;
        }
        if (typeof q.validation?.min === 'number' && num < q.validation.min) {
          res.status(400).json({ message: `"${q.label?.en || q.fieldKey}" must be at least ${q.validation.min}.` });
          return;
        }
        if (typeof q.validation?.max === 'number' && num > q.validation.max) {
          res.status(400).json({ message: `"${q.label?.en || q.fieldKey}" must be at most ${q.validation.max}.` });
          return;
        }
      }
    }

    const subId = generateId('fsub');
    const submittedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO form_submissions (id, organization_id, form_id, form_version_id, user_id, status, answers_json, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)
    `).run(
      subId,
      String(row.organization_id),
      String(row.id),
      String(row.version_id),
      req.user?.id || null,
      JSON.stringify(answers),
      submittedAt
    );

    res.status(201).json({
      id: subId,
      formVersionId: String(row.version_id),
      status: 'submitted',
      submittedAt,
    });
  });

  return router;
}
