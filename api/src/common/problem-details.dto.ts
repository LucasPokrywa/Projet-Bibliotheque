import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemDetailsDto {
  @ApiProperty({
    type: String,
    format: 'uri-reference',
    example: 'about:blank',
  })
  type: string;

  @ApiProperty({ type: String, example: 'Not Found' })
  title: string;

  @ApiProperty({ type: Number, minimum: 400, maximum: 599, example: 404 })
  status: number;

  @ApiProperty({ type: String, example: 'Livre introuvable' })
  detail: string;

  @ApiProperty({ type: String, format: 'uri-reference', example: '/livres/12' })
  instance: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Liste des erreurs de validation.',
    example: ['email must be an email'],
  })
  errors?: string[];
}
