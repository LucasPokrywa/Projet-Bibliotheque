import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('API Bibliothèque')
    .setDescription(
      'Inscrivez-vous via /auth/register, connectez-vous via /auth/login, puis collez access_token dans Authorize pour tester les routes protégées. Les requêtes modifient réellement la base de données.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false, tagsSorter: 'alpha' },
  });
  return document;
}
