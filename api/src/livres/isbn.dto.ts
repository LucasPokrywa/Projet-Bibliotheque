import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISBN, IsString, MaxLength } from 'class-validator';

export class IsbnDto {
  @ApiProperty({
    type: String,
    example: '9782070612758',
    description: 'ISBN-10 ou ISBN-13 valide. Espaces et tirets acceptés.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @IsString()
  @MaxLength(13)
  @IsISBN()
  isbn: string;
}

export class IsbnResultDto {
  @ApiProperty({ type: String, nullable: true, example: 'Le Petit Prince' })
  title: string | null;

  @ApiProperty({ type: [String], example: ['Antoine de Saint-Exupéry'] })
  authors: string[];
}
