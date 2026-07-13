import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card } from './card.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly cardsRepo: Repository<Card>,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(listId: string, orgId: string, dto: CreateCardDto): Promise<Card> {
    await this.tenantAccess.assertListInOrg(listId, orgId);
    return this.cardsRepo.save(this.cardsRepo.create({ ...dto, listId }));
  }

  async findAll(listId: string, orgId: string): Promise<Card[]> {
    await this.tenantAccess.assertListInOrg(listId, orgId);
    return this.cardsRepo.find({ where: { listId } });
  }

  findOne(id: string, orgId: string): Promise<Card> {
    return this.tenantAccess.assertCardInOrg(id, orgId);
  }

  async update(id: string, orgId: string, dto: UpdateCardDto): Promise<Card> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    Object.assign(card, dto);
    return this.cardsRepo.save(card);
  }

  async remove(id: string, orgId: string): Promise<void> {
    const card = await this.tenantAccess.assertCardInOrg(id, orgId);
    await this.cardsRepo.remove(card);
  }
}
