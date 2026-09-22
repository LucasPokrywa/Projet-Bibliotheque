import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database.service.js';

@ApiTags('Santé')
@Controller('v1/health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Vérifier la disponibilité de l’API et de PostgreSQL',
    description:
      'Route publique utilisée par Docker. Vérifie une connexion du pool applicatif et exécute SELECT 1.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'database'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        database: { type: 'string', enum: ['up'] },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL indisponible ou délai de réponse dépassé',
  })
  async check() {
    try {
      await this.db.checkHealth();
    } catch {
      throw new ServiceUnavailableException(
        'La connexion à PostgreSQL est indisponible.',
      );
    }
    return { status: 'ok', database: 'up' };
  }
}
