import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Fractional-index key. Optional: when omitted the server appends the card to
   * the end of the list; when supplied it's validated before use.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  positionIdx?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
