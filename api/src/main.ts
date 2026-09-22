import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureProxy } from './proxy.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureProxy(app);
  app.enableShutdownHooks();
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
