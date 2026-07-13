import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BoardVisibility } from '../board.entity';

export class CreateBoardDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(BoardVisibility)
  visibility?: BoardVisibility;

  @IsOptional()
  @IsObject()
  bgProperties?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  createdBy?: string;
}
