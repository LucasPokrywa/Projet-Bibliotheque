import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

const fields = { id: true, livre_id: true, lu: true } as const;

@Injectable()
export class BibliothequeService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(userId: number) {
    const entries = await this.db.bibliotheque.findMany({
      where: { utilisateur_id: userId }, orderBy: { id: 'asc' },
      select: { ...fields, livre: { select: { titre: true, auteur: true, isbn: true, date_publication: true } } },
    });
    return entries.map(({ livre, ...entry }) => ({ ...entry, ...livre }));
  }

  async add(userId: number, livreId: number) {
    try {
      return await this.db.bibliotheque.create({ data: { utilisateur_id: userId, livre_id: livreId }, select: fields });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') throw new ConflictException('Livre déjà dans votre bibliothèque');
      if (code === 'P2003') throw new NotFoundException('Livre ou utilisateur introuvable');
      throw error;
    }
  }

  async setRead(userId: number, livreId: number, lu: boolean) {
    try {
      return await this.db.bibliotheque.update({
        where: { utilisateur_id_livre_id: { utilisateur_id: userId, livre_id: livreId } }, data: { lu }, select: fields,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') throw new NotFoundException('Livre absent de votre bibliothèque');
      throw error;
    }
  }

  async remove(userId: number, livreId: number): Promise<void> {
    const result = await this.db.bibliotheque.deleteMany({ where: { utilisateur_id: userId, livre_id: livreId } });
    if (!result.count) throw new NotFoundException('Livre absent de votre bibliothèque');
  }
}
