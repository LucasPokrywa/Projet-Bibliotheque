import type { Request, Response } from 'express';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../auth/session-cookie.js';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { UserResponseDto, SessionResponseDto } from '../responses.dto.js';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service.js';
import type { SessionIdentity } from '../auth/auth.service.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { LoginDto, RegisterDto } from '../auth/auth.dto.js';

@ApiTags('Authentification')
@ApiBadRequestResponse({ description: 'Données ou paramètres invalides' })
@ApiTooManyRequestsResponse({ description: 'Trop de requêtes' })
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @ApiOperation({ summary: 'Créer un compte' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Adresse email déjà utilisée' })
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @ApiOperation({ summary: 'Se connecter et créer une session d’une heure' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(dto);
    response.cookie(SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(request),
      maxAge: session.expires_in * 1000,
    });
    return { expires_in: session.expires_in };
  }

  @ApiOperation({ summary: 'Révoquer la session courante' })
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Session invalide ou expirée' })
  @ApiNoContentResponse({ description: 'Session révoquée' })
  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(
    @CurrentSession() identity: SessionIdentity,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(identity);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(request));
  }

  @ApiOperation({ summary: 'Révoquer toutes ses sessions' })
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Session invalide ou expirée' })
  @ApiNoContentResponse({ description: 'Sessions révoquées' })
  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logoutAll(
    @CurrentSession() identity: SessionIdentity,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(identity.userId);
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions(request));
  }
}
