import { IsDateString, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  positionIdx: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
