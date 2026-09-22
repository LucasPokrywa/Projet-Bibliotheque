import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class BibliothequeService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(userId: number) {
    return (
      await this.db.query(
        'SELECT b.id, b.livre_id, b.lu, l.titre, l.auteur, l.isbn, l.date_publication FROM bibliotheque b JOIN livres l ON l.id = b.livre_id WHERE b.utilisateur_id = $1 ORDER BY b.id',
        [userId],
      )
    ).rows;
  }

  async add(userId: number, livreId: number) {
    try {
      return (
        await this.db.query(
          'INSERT INTO bibliotheque (utilisateur_id, livre_id) VALUES ($1, $2) RETURNING id, livre_id, lu',
          [userId, livreId],
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Livre déjà dans votre bibliothèque');
      if ((error as { code?: string }).code === '23503')
        throw new NotFoundException('Livre ou utilisateur introuvable');
      throw error;
    }
  }

  async setRead(userId: number, livreId: number, lu: boolean) {
    const result = await this.db.query(
      'UPDATE bibliotheque SET lu = $3 WHERE utilisateur_id = $1 AND livre_id = $2 RETURNING id, livre_id, lu',
      [userId, livreId, lu],
    );
    if (!result.rows[0])
      throw new NotFoundException('Livre absent de votre bibliothèque');
    return result.rows[0];
  }

  async remove(userId: number, livreId: number): Promise<void> {
    const result = await this.db.query(
      'DELETE FROM bibliotheque WHERE utilisateur_id = $1 AND livre_id = $2 RETURNING id',
      [userId, livreId],
    );
    if (!result.rows[0])
      throw new NotFoundException('Livre absent de votre bibliothèque');
  }
}
