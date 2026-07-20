import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BoardMembersService } from './board-members.service';
import { CreateBoardMemberDto } from './dto/create-board-member.dto';
import { UpdateBoardMemberDto } from './dto/update-board-member.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller('boards/:boardId/members')
export class BoardMembersController {
  constructor(private readonly boardMembersService: BoardMembersService) {}

  @Post()
  create(
    @Param('boardId') boardId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: CreateBoardMemberDto,
  ) {
    return this.boardMembersService.create(boardId, orgId, dto);
  }

  @Get()
  findAll(@Param('boardId') boardId: string, @ActiveOrgId() orgId: string) {
    return this.boardMembersService.findAll(boardId, orgId);
  }

  @Get(':userId')
  findOne(
    @Param('boardId') boardId: string,
    @Param('userId') userId: string,
    @ActiveOrgId() orgId: string,
  ) {
    return this.boardMembersService.findOne(boardId, userId, orgId);
  }

  @Patch(':userId')
  update(
    @Param('boardId') boardId: string,
    @Param('userId') userId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: UpdateBoardMemberDto,
  ) {
    return this.boardMembersService.update(boardId, userId, orgId, dto);
  }

  @Delete(':userId')
  remove(
    @Param('boardId') boardId: string,
    @Param('userId') userId: string,
    @ActiveOrgId() orgId: string,
  ) {
    return this.boardMembersService.remove(boardId, userId, orgId);
  }
}
