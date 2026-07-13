import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(1)
  textContent: string;
}
