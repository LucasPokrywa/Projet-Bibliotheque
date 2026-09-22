import { CsrfGuard } from './auth/csrf.guard.js';
import { HealthController } from './v1/health.controller.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { IsbnService } from './livres/isbn.service.js';
import { Module } from '@nestjs/common';
import { AppController } from './v1/app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './database.service.js';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './v1/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { UsersController } from './v1/users.controller.js';
import { UsersService } from './users/users.service.js';
import { LivresController } from './v1/livres.controller.js';
import { LivresService } from './livres/livres.service.js';
import { BibliothequeController } from './v1/bibliotheque.controller.js';
import { BibliothequeService } from './bibliotheque/bibliotheque.service.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    HealthController,
    AppController,
    AuthController,
    UsersController,
    LivresController,
    BibliothequeController,
  ],
  providers: [
    AppService,
    DatabaseService,
    AuthService,
    AuthGuard,
    UsersService,
    LivresService,
    IsbnService,
    BibliothequeService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
    },
  ],
})
export class AppModule {}
