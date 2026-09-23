import type { Request, Response } from 'express';
import type { SessionIdentity } from '../auth/auth.service.js';
import {
  BookProofService,
  BOOK_COOKIE,
  BOOK_TTL,
  bookCookieOptions,
} from '../livres/book-proof.service.js';
import {
  ApiForbiddenResponse,
  ApiUnprocessableEntityResponse,
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
  Header,
  HttpCode,
  Req,
  Res,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
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
    @Inject(BookProofService) private readonly proofs: BookProofService,
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
    summary: 'Rechercher un ISBN et préparer son ajout',
    description:
      'Renvoie title et authors et pose un cookie HttpOnly signé, valable 10 minutes et lié à la session. Remplace la recherche précédente.',
  })
  @ApiOkResponse({ type: IsbnResultDto })
  @ApiNotFoundResponse({ description: 'Livre introuvable' })
  @ApiUnprocessableEntityResponse({
    description: 'Informations incomplètes ou trop volumineuses',
  })
  @ApiBadGatewayResponse({ description: 'Erreur du programme Python' })
  @ApiGatewayTimeoutResponse({ description: 'Délai de recherche dépassé' })
  @ApiServiceUnavailableResponse({
    description: 'Trop de recherches simultanées',
  })
  async prepare(
    @Body() dto: IsbnDto,
    @CurrentSession() identity: SessionIdentity,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(BOOK_COOKIE, bookCookieOptions(request));
    const result = await this.isbn.lookup(dto.isbn);
    const token = await this.proofs.issue(dto.isbn, result, identity);
    response.cookie(BOOK_COOKIE, token, {
      ...bookCookieOptions(request),
      maxAge: BOOK_TTL * 1000,
    });
    return result;
  }

  @ApiOperation({
    summary: 'Ajouter le livre validé au catalogue',
    description:
      'Envoyer uniquement l’ISBN et les cookies de session et de livre. Le titre et l’auteur viennent exclusivement du cookie signé. Le cookie est effacé après ajout.',
  })
  @ApiCreatedResponse({ type: LivreResponseDto })
  @ApiConflictResponse({ description: 'ISBN déjà présent' })
  @ApiForbiddenResponse({
    description:
      'Cookie livre absent, altéré, expiré ou appartenant à une autre session/recherche',
  })
  @Header('Cache-Control', 'no-store')
  @Post()
  async create(
    @Body() dto: IsbnDto,
    @CurrentSession() identity: SessionIdentity,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const book = await this.proofs.verify(
      request.headers.cookie,
      dto.isbn,
      identity,
    );
    const result = await this.livres.create(book);
    response.clearCookie(BOOK_COOKIE, bookCookieOptions(request));
    return result;
  }
}
