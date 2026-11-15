import express, { type NextFunction, type Request, type Response } from 'express';
import { createDatabase, type AppDatabase } from './db/database.ts';
import { createSpeechRouter } from './speechRouter.ts';
import { corsMiddleware, securityHeaders } from './security/middleware.ts';
import { createAdminAuthRouter } from './routes/adminAuthRouter.ts';
import { createAdminBuilderRouter } from './routes/adminBuilderRouter.ts';
import { createUserAuthRouter } from './routes/userAuthRouter.ts';
import { createPublicFormsRouter } from './routes/publicFormsRouter.ts';
import { createGatewayApiRouter } from './routes/gatewayApiRouter.ts';

export interface CreateServerAppOptions {
  db?: AppDatabase;
  dbPath?: string;
  uploadDir?: string;
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'savanna-gateway' });
  });

  app.use('/api/speech', createSpeechRouter());
  app.use('/api/v1/admin/auth', createAdminAuthRouter(db));
  app.use('/api/v1/admin', createAdminBuilderRouter(db));
  app.use('/api/v1/auth', createUserAuthRouter(db));
  app.use('/api/v1/public', createPublicFormsRouter(db));
  app.use('/api/v1', createGatewayApiRouter(db, options.uploadDir));

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'API endpoint not found.' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ code: 'FILE_TOO_LARGE', message: 'Uploaded file exceeds the 5 MB limit.' });
      return;
    }
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message =
      status < 500 && typeof err?.message === 'string'
        ? err.message
        : 'An unexpected server error occurred.';
    res.status(status).json({ code: 'SERVER_ERROR', message });
  });

  return { app, db };
}
