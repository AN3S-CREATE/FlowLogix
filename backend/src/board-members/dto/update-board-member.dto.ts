import { IsEnum } from 'class-validator';
import { BoardMemberRole } from '../board-member.entity';

export class UpdateBoardMemberDto {
  @IsEnum(BoardMemberRole)
  role: BoardMemberRole;
}
