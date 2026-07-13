import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Board } from './board.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

// Every method here runs through runInTenantContext rather than a plain
// injected repository: the boards table has RLS enabled and the app
// connects as a non-owner role, so app.current_tenant_id must be set on the
// same transaction as the query or Postgres returns zero rows.
@Injectable()
export class BoardsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(orgId: string, dto: CreateBoardDto): Promise<Board> {
    if (dto.createdBy) {
      await this.tenantAccess.assertUserInOrg(dto.createdBy, orgId);
    }
    return runInTenantContext(this.dataSource, orgId, (manager) =>
      manager.save(Board, manager.create(Board, { ...dto, orgId })),
    );
  }

  findAll(orgId: string): Promise<Board[]> {
    return runInTenantContext(this.dataSource, orgId, (manager) =>
      manager.find(Board, { where: { orgId } }),
    );
  }

  findOne(id: string, orgId: string): Promise<Board> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const board = await manager.findOne(Board, { where: { id, orgId } });
      if (!board) {
        throw new NotFoundException('Board not found');
      }
      return board;
    });
  }

  async update(id: string, orgId: string, dto: UpdateBoardDto): Promise<Board> {
    if (dto.createdBy) {
      await this.tenantAccess.assertUserInOrg(dto.createdBy, orgId);
    }
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const board = await manager.findOne(Board, { where: { id, orgId } });
      if (!board) {
        throw new NotFoundException('Board not found');
      }
      Object.assign(board, dto);
      return manager.save(Board, board);
    });
  }

  remove(id: string, orgId: string): Promise<void> {
    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const board = await manager.findOne(Board, { where: { id, orgId } });
      if (!board) {
        throw new NotFoundException('Board not found');
      }
      await manager.remove(Board, board);
    });
  }
}
