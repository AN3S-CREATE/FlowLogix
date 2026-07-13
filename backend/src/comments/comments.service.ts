import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepo: Repository<Comment>,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(cardId: string, orgId: string, dto: CreateCommentDto): Promise<Comment> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    return this.commentsRepo.save(this.commentsRepo.create({ ...dto, cardId }));
  }

  async findAll(cardId: string, orgId: string): Promise<Comment[]> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    return this.commentsRepo.find({ where: { cardId } });
  }

  async findOne(id: string, orgId: string): Promise<Comment> {
    const comment = await this.commentsRepo.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    await this.tenantAccess.assertCardInOrg(comment.cardId, orgId);
    return comment;
  }

  async update(id: string, orgId: string, dto: UpdateCommentDto): Promise<Comment> {
    const comment = await this.findOne(id, orgId);
    Object.assign(comment, dto);
    return this.commentsRepo.save(comment);
  }

  async remove(id: string, orgId: string): Promise<void> {
    const comment = await this.findOne(id, orgId);
    await this.commentsRepo.remove(comment);
  }
}
