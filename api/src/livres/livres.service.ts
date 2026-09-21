import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import type { CreateLivreDto } from './livres.dto.js';

export interface Livre {
  id: number;
  titre: string;
  auteur: string;
  isbn: string | null;
  date_publication: Date | null;
}

@Injectable()
export class LivresService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list() {
    return (
      await this.db.query<Livre>(
        'SELECT id, titre, auteur, isbn, date_publication FROM livres ORDER BY id LIMIT 100',
      )
    ).rows;
  }

  async findById(id: number) {
    const result = await this.db.query<Livre>(
      'SELECT id, titre, auteur, isbn, date_publication FROM livres WHERE id = $1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Livre introuvable');
    return result.rows[0];
  }

  async create(dto: CreateLivreDto) {
    try {
      return (
        await this.db.query<Livre>(
          'INSERT INTO livres (titre, auteur, isbn, date_publication) VALUES ($1, $2, $3, $4) RETURNING id, titre, auteur, isbn, date_publication',
          [
            dto.titre,
            dto.auteur,
            dto.isbn ?? null,
            dto.date_publication ?? null,
          ],
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('ISBN déjà présent');
      throw error;
    }
  }
}
