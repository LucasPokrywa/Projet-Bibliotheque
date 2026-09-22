import { DatabaseService } from '../database.service.js';
import {
  BadGatewayException,
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
import type { IsbnResultDto } from './isbn.dto.js';

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
    const result = await this.db.query<{ titre: string; auteur: string }>(
      "SELECT titre, auteur FROM livres WHERE upper(regexp_replace(isbn, '[[:space:]-]', '', 'g')) = $1 ORDER BY id LIMIT 1",
      [normalizedIsbn],
    );
    if (result.rows[0]) {
      return { title: result.rows[0].titre, authors: [result.rows[0].auteur] };
    }
    return this.lookupWithPython(normalizedIsbn);
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
