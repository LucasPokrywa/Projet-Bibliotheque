import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { UserResponseDto } from '../responses.dto.js';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import type { SessionIdentity } from '../auth/auth.service.js';
import { UsersService } from '../users/users.service.js';

@ApiTags('Utilisateurs')
@ApiBadRequestResponse({ description: 'Données ou paramètres invalides' })
@ApiTooManyRequestsResponse({ description: 'Trop de requêtes' })
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Jeton absent, invalide ou expiré' })
@Controller('v1/users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @ApiOperation({ summary: 'Consulter son profil' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  @Get('me')
  me(@CurrentSession() identity: SessionIdentity) {
    return this.users.findById(identity.userId);
  }
}
