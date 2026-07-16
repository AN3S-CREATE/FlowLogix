import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';

@Injectable()
export class CommentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(
    cardId: string,
    orgId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    await this.tenantAccess.assertUserInOrg(dto.userId, orgId);
    // `comments` has RLS; the insert must run with the tenant set.
    return runInTenantContext(this.dataSource, orgId, (m) =>
      m.save(Comment, m.create(Comment, { ...dto, cardId })),
    );
  }

  async findAll(cardId: string, orgId: string): Promise<Comment[]> {
    await this.tenantAccess.assertCardInOrg(cardId, orgId);
    return runInTenantContext(this.dataSource, orgId, (m) =>
      m.find(Comment, { where: { cardId } }),
    );
  }

  async findOne(id: string, orgId: string): Promise<Comment> {
    // RLS already scopes this to the tenant's comments; a cross-org id simply
    // isn't visible. The app-layer card check below is defense-in-depth and
    // keeps a uniform "not found" whether the comment is missing or foreign.
    const comment = await runInTenantContext(this.dataSource, orgId, (m) =>
      m.findOne(Comment, { where: { id } }),
    );
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    try {
      await this.tenantAccess.assertCardInOrg(comment.cardId, orgId);
    } catch {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateCommentDto,
  ): Promise<Comment> {
    const comment = await this.findOne(id, orgId);
    Object.assign(comment, dto);
    return runInTenantContext(this.dataSource, orgId, (m) =>
      m.save(Comment, comment),
    );
  }

  async remove(id: string, orgId: string): Promise<void> {
    const comment = await this.findOne(id, orgId);
    await runInTenantContext(this.dataSource, orgId, (m) =>
      m.remove(Comment, comment),
    );
  }
}
