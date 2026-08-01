import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller()
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('lists/:listId/cards')
  create(
    @Param('listId') listId: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: CreateCardDto,
  ) {
    return this.cardsService.create(listId, orgId, dto);
  }

  @Get('lists/:listId/cards')
  findAll(@Param('listId') listId: string, @ActiveOrgId() orgId: string) {
    return this.cardsService.findAll(listId, orgId);
  }

  @Get('cards/:id')
  findOne(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.cardsService.findOne(id, orgId);
  }

  @Patch('cards/:id')
  update(
    @Param('id') id: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.cardsService.update(id, orgId, dto);
  }

  @Delete('cards/:id')
  remove(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.cardsService.remove(id, orgId);
  }
}
