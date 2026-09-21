import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export interface User {
  id: number;
  pseudo: string;
  email: string;
  permission: 0 | 1;
  date_inscription: Date;
}
export interface Credentials extends User {
  mot_de_passe: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(pseudo: string, email: string, hash: string): Promise<User> {
    try {
      const result = await this.db.query<User>(
        'INSERT INTO utilisateurs (pseudo, email, mot_de_passe) VALUES ($1, $2, $3) RETURNING id, pseudo, email, permission, date_inscription',
        [pseudo, email.trim().toLowerCase(), hash],
      );
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Adresse email déjà utilisée');
      throw error;
    }
  }

  async findCredentials(email: string): Promise<Credentials | undefined> {
    const result = await this.db.query<Credentials>(
      'SELECT id, pseudo, email, permission, date_inscription, mot_de_passe FROM utilisateurs WHERE lower(email) = $1',
      [email.trim().toLowerCase()],
    );
    return result.rows[0];
  }

  async findById(id: number): Promise<User> {
    const result = await this.db.query<User>(
      'SELECT id, pseudo, email, permission, date_inscription FROM utilisateurs WHERE id = $1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Utilisateur introuvable');
    return result.rows[0];
  }
}
