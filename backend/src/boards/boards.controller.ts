import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  create(@ActiveOrgId() orgId: string, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(orgId, dto);
  }

  @Get()
  findAll(@ActiveOrgId() orgId: string) {
    return this.boardsService.findAll(orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.boardsService.findOne(id, orgId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @ActiveOrgId() orgId: string, @Body() dto: UpdateBoardDto) {
    return this.boardsService.update(id, orgId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.boardsService.remove(id, orgId);
  }
}
