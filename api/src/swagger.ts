import { ProblemDetailsDto } from './common/problem-details.dto.js';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, getSchemaPath } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('API Bibliothèque')
    .setDescription(
      'Inscrivez-vous via /auth/register, connectez-vous via /auth/login, puis collez access_token dans Authorize pour tester les routes protégées. Les requêtes modifient réellement la base de données.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ProblemDetailsDto],
  });
  for (const path of Object.values(document.paths)) {
    for (const method of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
      'head',
    ] as const) {
      const operation = path[method];
      if (!operation) continue;
      operation.responses ??= {};
      operation.responses['500'] ??= { description: 'Erreur interne' };
      operation.responses.default ??= {
        description: 'Erreur HTTP au format RFC 9457',
      };
      for (const [status, response] of Object.entries(operation.responses)) {
        if (status !== 'default' && !/^[45](?:\d{2}|XX)$/.test(status))
          continue;
        if (!response || '$ref' in response) continue;
        response.content = {
          'application/problem+json': {
            schema: { $ref: getSchemaPath(ProblemDetailsDto) },
          },
        };
      }
    }
  }
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false, tagsSorter: 'alpha' },
  });
  return document;
}
