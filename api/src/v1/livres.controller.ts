import {
  ApiUnprocessableEntityResponse,
  ApiGatewayTimeoutResponse,
  ApiBadGatewayResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsbnDto, IsbnResultDto, IsbnScanResultDto } from '../livres/isbn.dto.js';
import { IsbnService } from '../livres/isbn.service.js';
import {
  ApiTags,
  ApiParam,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { LivreResponseDto } from '../responses.dto.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
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

  @Post('isbn')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Rechercher un ISBN et enregistrer le livre au catalogue',
    description:
      'Réutilise le livre présent en base, sinon recherche avec Python et enregistre ses informations. Renvoie id, title et authors.',
  })
  @ApiOkResponse({ type: IsbnScanResultDto })
  @ApiNotFoundResponse({ description: 'Livre introuvable' })
  @ApiUnprocessableEntityResponse({
    description: 'Informations incomplètes ou trop volumineuses',
  })
  @ApiBadGatewayResponse({ description: 'Erreur du programme Python' })
  @ApiGatewayTimeoutResponse({ description: 'Délai de recherche dépassé' })
  @ApiServiceUnavailableResponse({
    description: 'Trop de recherches simultanées',
  })
  scan(@Body() dto: IsbnDto) {
    return this.isbn.scan(dto.isbn);
  }
}
