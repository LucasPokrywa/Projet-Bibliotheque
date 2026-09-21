import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class AddLivreDto {
  @IsInt()
  @Min(1)
  @ApiProperty({ type: Number, example: 1, minimum: 1 })
  livre_id: number;
}

export class LectureDto {
  @IsBoolean()
  @ApiProperty({ type: Boolean, example: true })
  lu: boolean;
}
