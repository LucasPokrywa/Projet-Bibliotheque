import { DatabaseService } from '../database.service.js';
import {
  BadGatewayException,
  UnprocessableEntityException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { IsbnResultDto, IsbnScanResultDto } from './isbn.dto.js';

const execute = promisify(execFile);
// Fonctionne depuis src/ en développement et dist/ dans l'image Docker.
const scriptDirectory = fileURLToPath(
  new URL('../../python_script/', import.meta.url),
);

@Injectable()
export class IsbnService {
  private running = 0;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async lookup(isbn: string): Promise<IsbnResultDto> {
    const normalizedIsbn = isbn.replace(/[\s-]/g, '').toUpperCase();
    const book = await this.findStored(normalizedIsbn);
    if (book) return { title: book.titre, authors: [book.auteur] };
    return this.lookupWithPython(normalizedIsbn);
  }

  async scan(isbn: string): Promise<IsbnScanResultDto> {
    const normalized = isbn.replace(/[\s-]/g, '').toUpperCase();
    const existing = await this.findStored(normalized);
    if (existing) return { id: existing.id, title: existing.titre, authors: [existing.auteur] };

    const result = await this.lookupWithPython(normalized);
    const titre = result.title?.trim() ?? '';
    const auteur = result.authors.join(', ').trim();
    if (!titre || !auteur || titre.length > 255 || auteur.length > 255) {
      throw new UnprocessableEntityException('Les informations trouvées sont incomplètes ou trop longues pour le catalogue.');
    }
    // Le conflit d'un scan concurrent ne modifie jamais les informations existantes.
    try {
      const inserted = await this.db.livres.create({ data: { titre, auteur, isbn: normalized }, select: { id: true } });
      return { id: inserted.id, title: titre, authors: result.authors };
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const concurrent = await this.findStored(normalized);
      if (!concurrent) throw new ServiceUnavailableException('Le catalogue a changé pendant la recherche. Réessayez.');
      return { id: concurrent.id, title: concurrent.titre, authors: [concurrent.auteur] };
    }
  }

  private async findStored(isbn: string) {
    // Prisma ne représente pas regexp_replace : préserver les ISBN historiques avec espaces/tirets.
    // Le template tag lie l'ISBN comme paramètre SQL, sans concaténation.
    const books = await this.db.$queryRaw<{ id: number; titre: string; auteur: string }[]>`
      SELECT id, titre, auteur FROM livres
      WHERE upper(regexp_replace(isbn, '[[:space:]-]', '', 'g')) = ${isbn}
      ORDER BY id LIMIT 1
    `;
    return books[0];
  }

  private async lookupWithPython(isbn: string): Promise<IsbnResultDto> {
    if (this.running >= 4)
      throw new ServiceUnavailableException('Trop de recherches ISBN en cours');
    this.running++;
    try {
      let stdout: string;
      try {
        ({ stdout } = await execute(
          process.env.PYTHON_BIN || 'python3',
          [resolve(scriptDirectory, 'isbn_scrap.py'), isbn],
          {
            cwd: scriptDirectory,
            timeout: 25000,
            killSignal: 'SIGKILL',
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
            env: {
              ...process.env,
              PYTHONDONTWRITEBYTECODE: '1',
              PYTHONIOENCODING: 'utf-8',
            },
          },
        ));
      } catch (error) {
        const failure = error as {
          code?: number | string;
          killed?: boolean;
          stdout?: string;
        };
        if (failure.killed)
          throw new GatewayTimeoutException(
            'Le script de recherche ISBN a dépassé le délai de 25 secondes',
          );
        if (failure.code === 1 && failure.stdout) {
          let result: unknown;
          try {
            result = JSON.parse(failure.stdout);
          } catch {
            /* Erreur de programme, traitée ci-dessous. */
          }
          if (
            result &&
            typeof result === 'object' &&
            'error' in result &&
            typeof result.error === 'string'
          ) {
            throw new HttpException(result, HttpStatus.NOT_FOUND);
          }
        }
        throw new BadGatewayException('Le script de recherche ISBN a échoué');
      }
      let result: unknown;
      try {
        result = JSON.parse(stdout);
      } catch {
        throw new BadGatewayException('Réponse JSON invalide du script ISBN');
      }
      if (
        !result ||
        typeof result !== 'object' ||
        !('title' in result) ||
        !(result.title === null || typeof result.title === 'string') ||
        !('authors' in result) ||
        !Array.isArray(result.authors) ||
        !result.authors.every((author: unknown) => typeof author === 'string')
      ) {
        throw new BadGatewayException(
          'Format de réponse inattendu du script ISBN',
        );
      }
      return result as IsbnResultDto;
    } finally {
      this.running--;
    }
  }
}
