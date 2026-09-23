import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import type { CreateLivreDto } from './livres.dto.js';

@Injectable()
export class LivresService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  list() {
    return this.db.livres.findMany({ orderBy: { id: 'asc' }, take: 100 });
  }

  async findById(id: number) {
    const book = await this.db.livres.findUnique({ where: { id } });
    if (!book) throw new NotFoundException('Livre introuvable');
    return book;
  }

  async create(dto: CreateLivreDto) {
    try {
      return await this.db.livres.create({ data: {
        titre: dto.titre, auteur: dto.auteur, isbn: dto.isbn ?? null,
        date_publication: dto.date_publication ? new Date(`${dto.date_publication}T00:00:00.000Z`) : null,
      } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('ISBN déjà présent');
      throw error;
    }
  }
}
