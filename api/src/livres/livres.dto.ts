import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateLivreDto {
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  @ApiProperty({
    type: String,
    example: 'Le Petit Prince',
    minLength: 1,
    maxLength: 255,
  })
  titre: string;

  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  @ApiProperty({
    type: String,
    example: 'Antoine de Saint-Exupéry',
    minLength: 1,
    maxLength: 255,
  })
  auteur: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  @ApiPropertyOptional({
    type: String,
    example: '9782070612758',
    minLength: 1,
    maxLength: 20,
    nullable: true,
  })
  isbn?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '1943-04-06',
    nullable: true,
  })
  date_publication?: string;
}
