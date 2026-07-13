import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardMember } from './card-member.entity';
import { CreateCardMemberDto } from './dto/create-card-member.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

@Injectable()
export class CardMembersService {
  constructor(
    @InjectRepository(CardMember)
    private readonly cardMembersRepo: Repository<CardMember>,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(cardId: string, orgId: string, dto: CreateCardMemberDto): Promise<CardMember> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    return this.cardMembersRepo.save(
      this.cardMembersRepo.create({ cardId, userId: dto.userId }),
    );
  }

  async findAll(cardId: string, orgId: string): Promise<CardMember[]> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    return this.cardMembersRepo.find({ where: { cardId } });
  }

  async findOne(cardId: string, userId: string, orgId: string): Promise<CardMember> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    const member = await this.cardMembersRepo.findOne({ where: { cardId, userId } });
    if (!member) {
      throw new NotFoundException('Card member not found');
    }
    return member;
  }

  async remove(cardId: string, userId: string, orgId: string): Promise<void> {
    await this.findOne(cardId, userId, orgId);
    await this.cardMembersRepo.delete({ cardId, userId });
  }
}
