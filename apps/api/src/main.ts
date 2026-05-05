import 'reflect-metadata';

import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.2,
  });
}

import { createApiApp } from './server';

async function bootstrap() {
  const app = await createApiApp();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ host, port });
}

bootstrap();
