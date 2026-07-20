import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller()
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post('boards/:boardId/lists')
  create(
    @Param('boardId') boardId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: CreateListDto,
  ) {
    return this.listsService.create(boardId, orgId, dto);
  }

  @Get('boards/:boardId/lists')
  findAll(@Param('boardId') boardId: string, @ActiveOrgId() orgId: string) {
    return this.listsService.findAll(boardId, orgId);
  }

  @Get('lists/:id')
  findOne(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.listsService.findOne(id, orgId);
  }

  @Patch('lists/:id')
  update(
    @Param('id') id: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: UpdateListDto,
  ) {
    return this.listsService.update(id, orgId, dto);
  }

  @Delete('lists/:id')
  remove(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.listsService.remove(id, orgId);
  }
}
