import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateListDto {
  @IsString()
  @MaxLength(255)
  title: string;

  /**
   * Fractional-index key. Optional: when omitted the server appends the list to
   * the end of the board; when supplied (the client computed it from its
   * optimistic neighbours) it's validated before use.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  positionIdx?: string;
}
