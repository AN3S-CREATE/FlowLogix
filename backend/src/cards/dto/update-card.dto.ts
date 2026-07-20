import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { CreateCardDto } from './create-card.dto';

export class UpdateCardDto extends PartialType(CreateCardDto) {
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  /** Move the card into another list on the same board. */
  @IsOptional()
  @IsUUID()
  listId?: string;

  /**
   * Neighbor immediately before the card in the target list (lower index).
   * Combined with `afterCardId`, the server mints a fractional `positionIdx`
   * so clients never invent ordering keys.
   */
  @IsOptional()
  @IsUUID()
  beforeCardId?: string;

  /** Neighbor immediately after the card in the target list (higher index). */
  @IsOptional()
  @IsUUID()
  afterCardId?: string;
}
