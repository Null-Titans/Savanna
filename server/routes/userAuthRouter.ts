import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import {
  type AuthenticatedRequest,
  createSession,
  requireUserAuth,
  revokeSessionByToken,
  USER_COOKIE_NAME,
} from '../auth/sessionAuth.ts';
import { generateId, hashPassword, verifyPassword } from '../security/crypto.ts';
import {
  clearAuthCookie,
  createRateLimiter,
  parseCookies,
  setAuthCookie,
} from '../security/middleware.ts';

interface UserRow {
  id: string;
  username: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'learner' | 'employer' | 'coordinator';
  organization_id: string | null;
  created_at: string;
}

function toUserSummary(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organizationId: row.organization_id,
    createdAt: row.created_at,
  };
}

export function createUserAuthRouter(db: AppDatabase): Router {
  const router = Router();
  const authLimiter = createRateLimiter({
    windowMs: 60_000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 60),
    keyPrefix: 'user-auth',
  });

  // Public self-registration is strictly limited to 'learner' or 'employer'.
  // Platform/Org administrators are NEVER created through this endpoint.
  router.post('/register', authLimiter, (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestedRole = req.body?.role === 'employer' ? 'employer' : 'learner';

    if (username.length < 3 || !email.includes('@') || !fullName || password.length < 8) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Username (3+ chars), valid email, full name, and password (8+ chars) are required.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')
      .get(username, email) as { id?: string } | undefined;
    if (existing?.id) {
      res.status(409).json({
        code: 'ACCOUNT_EXISTS',
        message: 'An account with that username or email already exists.',
      });
      return;
    }

    const id = generateId('usr');
    const now = new Date().toISOString();
    const defaultOrgId = requestedRole === 'employer' ? 'org-selam-partners' : 'org-alx-ethiopia';
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, username, email, full_name, password_hash, role, organization_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, email, fullName, passwordHash, requestedRole, defaultOrgId, now, now);

    const { token, ttlSeconds } = createSession(db, {
      principalType: 'user',
      principalId: id,
      role: requestedRole,
      organizationId: defaultOrgId,
    });
    setAuthCookie(req, res, USER_COOKIE_NAME, token, ttlSeconds);

    res.status(201).json({
      authenticated: true,
      user: {
        id,
        username,
        email,
        fullName,
        role: requestedRole,
        organizationId: defaultOrgId,
        createdAt: now,
      },
    });
  });

  router.post('/login', authLimiter, (req, res) => {
    const identifier =
      typeof req.body?.usernameOrEmail === 'string' ? req.body.usernameOrEmail.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({
        code: 'MISSING_CREDENTIALS',
        message: 'Username/email and password are required.',
      });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE username = ? OR LOWER(email) = LOWER(?) LIMIT 1')
      .get(identifier, identifier) as UserRow | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username/email or password.',
      });
      return;
    }

    const { token, ttlSeconds } = createSession(db, {
      principalType: 'user',
      principalId: row.id,
      role: row.role,
      organizationId: row.organization_id,
    });
    setAuthCookie(req, res, USER_COOKIE_NAME, token, ttlSeconds);

    res.json({
      authenticated: true,
      user: toUserSummary(row),
    });
  });

  router.get('/me', requireUserAuth(db), (req: AuthenticatedRequest, res) => {
    res.json({
      authenticated: true,
      user: req.user,
    });
  });

  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req);
    revokeSessionByToken(db, cookies[USER_COOKIE_NAME]);
    clearAuthCookie(req, res, USER_COOKIE_NAME);
    res.json({ loggedOut: true });
  });

  return router;
}
