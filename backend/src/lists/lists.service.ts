import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { List } from './list.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import { BoardEventsService } from '../realtime/board-events.service';
import { filterVisible, isSyncDeleted } from '../common/sync-visibility';
import { PositionService } from '../common/ordering/position.service';

@Injectable()
export class ListsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantAccess: TenantAccessService,
    private readonly boardEvents: BoardEventsService,
    private readonly positions: PositionService,
  ) {}

  async create(
    boardId: string,
    orgId: string,
    dto: CreateListDto,
  ): Promise<List> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    // `lists` has RLS: the insert (and the last-key lookup) must run with the
    // tenant set on the same transaction, or the policy rejects/hides the rows.
    const list = await runInTenantContext(this.dataSource, orgId, async (m) => {
      const positionIdx = await this.resolvePosition(m, boardId, dto.positionIdx);
      return m.save(List, m.create(List, { ...dto, boardId, positionIdx }));
    });
    // Fire-and-forget: best-effort broadcast, don't block the response on Redis.
    void this.boardEvents.emit('list.created', boardId, {
      listId: list.id,
      positionIdx: list.positionIdx,
    });
    return list;
  }

  async findAll(boardId: string, orgId: string): Promise<List[]> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    const lists = await runInTenantContext(this.dataSource, orgId, (m) =>
      m.find(List, { where: { boardId } }),
    );
    // Hide records a mobile client has soft-deleted via CRDT sync.
    return filterVisible(lists);
  }

  async findOne(id: string, orgId: string): Promise<List> {
    // assertListInOrg already loads the row inside a tenant transaction.
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    if (isSyncDeleted(list)) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  async update(id: string, orgId: string, dto: UpdateListDto): Promise<List> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    if (dto.positionIdx !== undefined) this.positions.assertValid(dto.positionIdx);
    Object.assign(list, dto);
    const saved = await runInTenantContext(this.dataSource, orgId, (m) =>
      m.save(List, list),
    );
    void this.boardEvents.emit('list.updated', saved.boardId, {
      listId: saved.id,
      positionIdx: saved.positionIdx,
    });
    return saved;
  }

  /**
   * A validated key when the client supplied one, else a fresh key appended
   * after the board's current last list (fractional-index, so O(1)). Runs on
   * the caller's tenant-scoped manager so the RLS-filtered read is correct.
   */
  private async resolvePosition(
    manager: EntityManager,
    boardId: string,
    provided?: string,
  ): Promise<string> {
    if (provided !== undefined) {
      this.positions.assertValid(provided);
      return provided;
    }
    const last = await manager.findOne(List, {
      where: { boardId },
      order: { positionIdx: 'DESC' },
    });
    return this.positions.keyForAppend(last ? last.positionIdx : null);
  }

  async remove(id: string, orgId: string): Promise<void> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    const boardId = list.boardId;
    await runInTenantContext(this.dataSource, orgId, (m) => m.remove(List, list));
    // Fire-and-forget, matching create/update and cards: emit is best-effort
    // (errors swallowed internally), so don't add Redis latency to the delete.
    void this.boardEvents.emit('list.deleted', boardId, { listId: id });
  }
}
