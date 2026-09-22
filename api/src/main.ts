import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureProxy } from './proxy.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureProxy(app);
  app.enableCors({
    origin: [
      'http://localhost:4321',
      'https://bibliotheque.lucaspokrywa.site',
      'https://api.bibliotheque.lucaspokrywa.site',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.enableShutdownHooks();
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
  }
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
