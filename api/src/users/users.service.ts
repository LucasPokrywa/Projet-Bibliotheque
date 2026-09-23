import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

const publicFields = { id: true, pseudo: true, email: true, permission: true, date_inscription: true } as const;

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(pseudo: string, email: string, hash: string) {
    try {
      return await this.db.utilisateurs.create({
        data: { pseudo, email: email.trim().toLowerCase(), mot_de_passe: hash },
        select: publicFields,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Adresse email déjà utilisée');
      throw error;
    }
  }

  findCredentials(email: string) {
    // Le mode insensitive utilise ILIKE : les caractères de motif doivent rester littéraux.
    const literalEmail = email.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    return this.db.utilisateurs.findFirst({ where: { email: { equals: literalEmail, mode: 'insensitive' } } });
  }

  async findById(id: number) {
    const user = await this.db.utilisateurs.findUnique({ where: { id }, select: publicFields });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }
}
