import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CardMembersService } from './card-members.service';
import { CreateCardMemberDto } from './dto/create-card-member.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller('cards/:cardId/members')
export class CardMembersController {
  constructor(private readonly cardMembersService: CardMembersService) {}

  @Post()
  create(
    @Param('cardId') cardId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: CreateCardMemberDto,
  ) {
    return this.cardMembersService.create(cardId, orgId, dto);
  }

  @Get()
  findAll(@Param('cardId') cardId: string, @ActiveOrgId() orgId: string) {
    return this.cardMembersService.findAll(cardId, orgId);
  }

  @Get(':userId')
  findOne(
    @Param('cardId') cardId: string,
    @Param('userId') userId: string,
    @ActiveOrgId() orgId: string,
  ) {
    return this.cardMembersService.findOne(cardId, userId, orgId);
  }

  @Delete(':userId')
  remove(
    @Param('cardId') cardId: string,
    @Param('userId') userId: string,
    @ActiveOrgId() orgId: string,
  ) {
    return this.cardMembersService.remove(cardId, userId, orgId);
  }
}
