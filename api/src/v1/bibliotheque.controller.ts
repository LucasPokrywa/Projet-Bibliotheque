import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  BibliothequeResponseDto,
  BibliothequeLivreResponseDto,
} from '../responses.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import type { SessionIdentity } from '../auth/auth.service.js';
import { AddLivreDto, LectureDto } from '../bibliotheque/bibliotheque.dto.js';
import { BibliothequeService } from '../bibliotheque/bibliotheque.service.js';

@ApiTags('Bibliothèque')
@ApiBadRequestResponse({ description: 'Données ou paramètres invalides' })
@ApiTooManyRequestsResponse({ description: 'Trop de requêtes' })
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Jeton absent, invalide ou expiré' })
@Controller('v1/bibliotheque')
@UseGuards(AuthGuard)
export class BibliothequeController {
  constructor(
    @Inject(BibliothequeService)
    private readonly bibliotheque: BibliothequeService,
  ) {}

  @ApiOperation({ summary: 'Consulter sa bibliothèque personnelle' })
  @ApiOkResponse({ type: BibliothequeLivreResponseDto, isArray: true })
  @Get()
  list(@CurrentSession() session: SessionIdentity) {
    return this.bibliotheque.list(session.userId);
  }

  @ApiOperation({ summary: 'Ajouter un livre à sa bibliothèque' })
  @ApiCreatedResponse({ type: BibliothequeResponseDto })
  @ApiConflictResponse({ description: 'Livre déjà dans votre bibliothèque' })
  @ApiNotFoundResponse({ description: 'Livre introuvable' })
  @Post()
  add(@CurrentSession() session: SessionIdentity, @Body() dto: AddLivreDto) {
    return this.bibliotheque.add(session.userId, dto.livre_id);
  }

  @ApiOperation({ summary: 'Marquer un livre comme lu ou non lu' })
  @ApiOkResponse({ type: BibliothequeResponseDto })
  @ApiNotFoundResponse({ description: 'Livre absent de votre bibliothèque' })
  @Patch(':livreId')
  setRead(
    @CurrentSession() session: SessionIdentity,
    @Param('livreId', ParseIntPipe) livreId: number,
    @Body() dto: LectureDto,
  ) {
    return this.bibliotheque.setRead(session.userId, livreId, dto.lu);
  }

  @ApiOperation({ summary: 'Retirer un livre de sa bibliothèque' })
  @ApiNoContentResponse({ description: 'Livre retiré de votre bibliothèque' })
  @ApiNotFoundResponse({ description: 'Livre absent de votre bibliothèque' })
  @Delete(':livreId')
  @HttpCode(204)
  remove(
    @CurrentSession() session: SessionIdentity,
    @Param('livreId', ParseIntPipe) livreId: number,
  ) {
    return this.bibliotheque.remove(session.userId, livreId);
  }
}
