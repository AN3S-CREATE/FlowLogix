import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BoardMemberRole } from '../board-member.entity';

export class CreateBoardMemberDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(BoardMemberRole)
  role?: BoardMemberRole;
}
