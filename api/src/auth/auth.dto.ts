import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  @ApiProperty({
    type: String,
    format: 'email',
    example: 'lucas@example.com',
    maxLength: 255,
  })
  email: string;

  @IsString()
  @Length(12, 128)
  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
    example: 'une-phrase-secrete-longue',
  })
  mot_de_passe: string;
}

export class RegisterDto extends LoginDto {
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  @ApiProperty({ type: String, example: 'Lucas', minLength: 1, maxLength: 100 })
  pseudo: string;
}
