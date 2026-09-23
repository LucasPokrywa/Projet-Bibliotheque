import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const logger = new Logger(DatabaseService.name);
    super({ adapter: new PrismaPg({
      // Sans DATABASE_URL, pg utilise les variables PG* existantes du Compose.
      connectionString: process.env.DATABASE_URL || undefined,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    }, { onPoolError: () => logger.error('Erreur de connexion PostgreSQL') }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.checkHealth();
  }

  async checkHealth(): Promise<void> {
    await this.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
      await tx.$queryRaw`SELECT 1`;
    }, { maxWait: 5000, timeout: 3000 });
  }

  trouverLivre(id: number) {
    return this.livres.findUnique({ where: { id }, select: { id: true, titre: true, auteur: true, isbn: true } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
