import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ type: Number, enum: [0, 1], example: 0, description: '0 : utilisateur normal ; 1 : administrateur.' })
  permission: 0 | 1;
  @ApiProperty({ type: Number, example: 1 })
  id: number;
  @ApiProperty({ type: String, example: 'Lucas' })
  pseudo: string;
  @ApiProperty({ type: String, format: 'email', example: 'lucas@example.com' })
  email: string;
  @ApiProperty({ type: String, format: 'date-time' })
  date_inscription: string;
}

export class SessionResponseDto {
  @ApiProperty({ type: Number, example: 3600 })
  expires_in: number;
}

export class LivreResponseDto {
  @ApiProperty({ type: Number, example: 1 })
  id: number;
  @ApiProperty({ type: String, example: 'Le Petit Prince' })
  titre: string;
  @ApiProperty({ type: String, example: 'Antoine de Saint-Exupéry' })
  auteur: string;
  @ApiProperty({ type: String, nullable: true, example: '9782070612758' })
  isbn: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  date_publication: string | null;
}

export class BibliothequeResponseDto {
  @ApiProperty({
    type: Number,
    example: 1,
    description: 'Identifiant de l’entrée dans la bibliothèque.',
  })
  id: number;
  @ApiProperty({ type: Number, example: 1 })
  livre_id: number;
  @ApiProperty({ type: Boolean, example: false })
  lu: boolean;
}

export class BibliothequeLivreResponseDto extends LivreResponseDto {
  @ApiProperty({
    type: Number,
    example: 1,
    description:
      'Identifiant de l’entrée dans la bibliothèque, et non du livre.',
  })
  declare id: number;
  @ApiProperty({ type: Number, example: 1 })
  livre_id: number;
  @ApiProperty({ type: Boolean, example: false })
  lu: boolean;
}
