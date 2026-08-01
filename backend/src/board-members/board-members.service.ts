import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardMember } from './board-member.entity';
import { CreateBoardMemberDto } from './dto/create-board-member.dto';
import { UpdateBoardMemberDto } from './dto/update-board-member.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

@Injectable()
export class BoardMembersService {
  constructor(
    @InjectRepository(BoardMember)
    private readonly boardMembersRepo: Repository<BoardMember>,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(
    boardId: string,
    orgId: string,
    dto: CreateBoardMemberDto,
  ): Promise<BoardMember> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    await this.tenantAccess.assertUserInOrg(dto.userId, orgId);
    return this.boardMembersRepo.save(
      this.boardMembersRepo.create({
        boardId,
        userId: dto.userId,
        role: dto.role,
      }),
    );
  }

  async findAll(boardId: string, orgId: string): Promise<BoardMember[]> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    const rows = await this.boardMembersRepo.find({
      where: { boardId },
      relations: { user: true },
    });
    // Never leak password hashes to the SPA (relation load includes the column).
    for (const row of rows) {
      if (row.user) {
        delete (row.user as { passwordHash?: string }).passwordHash;
      }
    }
    return rows;
  }

  async findOne(
    boardId: string,
    userId: string,
    orgId: string,
  ): Promise<BoardMember> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    const member = await this.boardMembersRepo.findOne({
      where: { boardId, userId },
    });
    if (!member) {
      throw new NotFoundException('Board member not found');
    }
    return member;
  }

  async update(
    boardId: string,
    userId: string,
    orgId: string,
    dto: UpdateBoardMemberDto,
  ): Promise<BoardMember> {
    const member = await this.findOne(boardId, userId, orgId);
    Object.assign(member, dto);
    return this.boardMembersRepo.save(member);
  }

  async remove(boardId: string, userId: string, orgId: string): Promise<void> {
    await this.findOne(boardId, userId, orgId);
    await this.boardMembersRepo.delete({ boardId, userId });
  }
}
