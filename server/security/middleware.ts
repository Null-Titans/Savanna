import type { NextFunction, Request, Response } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
  next();
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  const allowedRaw = process.env.CORS_ALLOWED_ORIGINS || '';
  const allowedList = allowedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (process.env.APP_URL) {
    allowedList.push(process.env.APP_URL.trim().replace(/\/+$/, ''));
  }

  const requestHostOrigin = `${req.protocol}://${req.get('host')}`;
  const isSameHost = origin === requestHostOrigin || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000';

  if (isSameHost || allowedList.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function createRateLimiter(options: { windowMs: number; max: number; keyPrefix: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const existing = hits.get(key);

    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait a moment before trying again.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function setAuthCookie(
  req: Request,
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number
): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.COOKIE_SECURE === 'true';

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }

  const prev = res.getHeader('Set-Cookie');
  const nextCookies = Array.isArray(prev)
    ? [...prev.map(String), parts.join('; ')]
    : prev
    ? [String(prev), parts.join('; ')]
    : [parts.join('; ')];
  res.setHeader('Set-Cookie', nextCookies);
}

export function clearAuthCookie(req: Request, res: Response, name: string): void {
  const isSecure =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.COOKIE_SECURE === 'true';

  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure) {
    parts.push('Secure');
  }

  const prev = res.getHeader('Set-Cookie');
  const nextCookies = Array.isArray(prev)
    ? [...prev.map(String), parts.join('; ')]
    : prev
    ? [String(prev), parts.join('; ')]
    : [parts.join('; ')];
  res.setHeader('Set-Cookie', nextCookies);
}
