import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

export interface Livre {
  id: number;
  titre: string;
  auteur: string;
  isbn: string | null;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new Pool({ connectionTimeoutMillis: 5000 });

  constructor() {
    this.pool.on('error', (error) => {
      this.logger.error('Erreur PostgreSQL', error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ) {
    return this.pool.query<T>(sql, values);
  }

  async checkHealth(): Promise<void> {
    // L'acquisition est déjà limitée à 5 s par connectionTimeoutMillis.
    const client = await this.pool.connect();
    let failed = false;
    try {
      const healthQuery = { text: 'SELECT 1', query_timeout: 2000 };
      await client.query(healthQuery);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // Détruire une connexion défaillante, notamment après un délai dépassé.
      client.release(failed);
    }
  }

  async trouverLivre(id: number): Promise<Livre | null> {
    const result = await this.pool.query<Livre>(
      'SELECT id, titre, auteur, isbn FROM livres WHERE id = $1',
      [id],
    );

    return result.rows[0] ?? null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
