import 'reflect-metadata';

import { createApiApp } from './server';

async function bootstrap() {
  const app = await createApiApp();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ host, port });
}

bootstrap();
