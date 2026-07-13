import { IsUUID } from 'class-validator';

export class CreateCardMemberDto {
  @IsUUID()
  userId: string;
}
