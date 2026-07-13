import { IsNumber, IsString, MaxLength } from 'class-validator';

export class CreateListDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsNumber()
  positionIdx: number;
}
