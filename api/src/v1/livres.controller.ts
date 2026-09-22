import {
  ApiGatewayTimeoutResponse,
  ApiBadGatewayResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsbnDto, IsbnResultDto } from '../livres/isbn.dto.js';
import { IsbnService } from '../livres/isbn.service.js';
import {
  ApiTags,
  ApiParam,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { LivreResponseDto } from '../responses.dto.js';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateLivreDto } from '../livres/livres.dto.js';
import { LivresService } from '../livres/livres.service.js';

@ApiTags('Livres')
@ApiBadRequestResponse({ description: 'Données ou paramètres invalides' })
@ApiTooManyRequestsResponse({ description: 'Trop de requêtes' })
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Jeton absent, invalide ou expiré' })
@Controller('v1/livres')
@UseGuards(AuthGuard)
export class LivresController {
  constructor(
    @Inject(LivresService) private readonly livres: LivresService,
    @Inject(IsbnService) private readonly isbn: IsbnService,
  ) {}

  @ApiOperation({ summary: 'Lister les 100 premiers livres du catalogue' })
  @ApiOkResponse({ type: LivreResponseDto, isArray: true })
  @Get()
  list() {
    return this.livres.list();
  }

  @ApiOperation({ summary: 'Consulter un livre' })
  @ApiOkResponse({ type: LivreResponseDto })
  @ApiNotFoundResponse({ description: 'Livre introuvable' })
  @Get(':id')
  find(@Param('id', ParseIntPipe) id: number) {
    return this.livres.findById(id);
  }

  @Get('isbn/:isbn')
  @ApiParam({
    name: 'isbn',
    type: String,
    example: '9782070612758',
    description: 'ISBN-10 ou ISBN-13 valide, espaces et tirets acceptés.',
  })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Rechercher un livre par ISBN',
    description:
      'Cherche d’abord en base, puis appelle Python uniquement si le livre est absent. Renvoie title et authors, sans enregistrer de livre en base.',
  })
  @ApiOkResponse({ type: IsbnResultDto })
  @ApiNotFoundResponse({
    description: 'Aucun livre trouvé par le script',
  })
  @ApiBadGatewayResponse({
    description: 'Erreur du programme Python ou de sa réponse',
  })
  @ApiGatewayTimeoutResponse({
    description: 'Délai de recherche dépassé (25 secondes)',
  })
  @ApiServiceUnavailableResponse({
    description: 'Trop de recherches simultanées',
  })
  lookupIsbn(@Param() dto: IsbnDto) {
    return this.isbn.lookup(dto.isbn);
  }

  @ApiOperation({ summary: 'Ajouter un livre au catalogue partagé' })
  @ApiCreatedResponse({ type: LivreResponseDto })
  @ApiConflictResponse({ description: 'ISBN déjà présent' })
  @Post()
  create(@Body() dto: CreateLivreDto) {
    return this.livres.create(dto);
  }
}
