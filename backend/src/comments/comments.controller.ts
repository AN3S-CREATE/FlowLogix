import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('cards/:cardId/comments')
  create(
    @Param('cardId') cardId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(cardId, orgId, dto);
  }

  @Get('cards/:cardId/comments')
  findAll(@Param('cardId') cardId: string, @ActiveOrgId() orgId: string) {
    return this.commentsService.findAll(cardId, orgId);
  }

  @Get('comments/:id')
  findOne(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.commentsService.findOne(id, orgId);
  }

  @Patch('comments/:id')
  update(@Param('id') id: string, @ActiveOrgId() orgId: string, @Body() dto: UpdateCommentDto) {
    return this.commentsService.update(id, orgId, dto);
  }

  @Delete('comments/:id')
  remove(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.commentsService.remove(id, orgId);
  }
}
