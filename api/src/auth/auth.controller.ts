import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { UserResponseDto, TokenResponseDto } from '../responses.dto.js';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import type { SessionIdentity } from './auth.service.js';
import { AuthGuard, CurrentSession } from './auth.guard.js';
import { LoginDto, RegisterDto } from './auth.dto.js';

@ApiTags('Authentification')
@ApiBadRequestResponse({ description: 'Données ou paramètres invalides' })
@ApiTooManyRequestsResponse({ description: 'Trop de requêtes' })
@Controller('auth')
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
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiOperation({ summary: 'Révoquer la session courante' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Session invalide ou expirée' })
  @ApiNoContentResponse({ description: 'Session révoquée' })
  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logout(@CurrentSession() identity: SessionIdentity) {
    return this.auth.logout(identity);
  }

  @ApiOperation({ summary: 'Révoquer toutes ses sessions' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Session invalide ou expirée' })
  @ApiNoContentResponse({ description: 'Sessions révoquées' })
  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logoutAll(@CurrentSession() identity: SessionIdentity) {
    return this.auth.logoutAll(identity.userId);
  }
}
