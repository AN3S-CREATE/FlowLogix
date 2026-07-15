import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { List } from './list.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { filterVisible, isSyncDeleted } from '../common/sync-visibility';

@Injectable()
export class ListsService {
  constructor(
    @InjectRepository(List)
    private readonly listsRepo: Repository<List>,
    private readonly tenantAccess: TenantAccessService,
    private readonly boardEvents: BoardEventsService,
  ) {}

  async create(
    boardId: string,
    orgId: string,
    dto: CreateListDto,
  ): Promise<List> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    const list = await this.listsRepo.save(
      this.listsRepo.create({ ...dto, boardId }),
    );
    // Fire-and-forget: best-effort broadcast, don't block the response on Redis.
    void this.boardEvents.emit('list.created', boardId, {
      listId: list.id,
      positionIdx: list.positionIdx,
    });
    return list;
  }

  async findAll(boardId: string, orgId: string): Promise<List[]> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    // Hide records a mobile client has soft-deleted via CRDT sync.
    return filterVisible(await this.listsRepo.find({ where: { boardId } }));
  }

  async findOne(id: string, orgId: string): Promise<List> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    if (isSyncDeleted(list)) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  async update(id: string, orgId: string, dto: UpdateListDto): Promise<List> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    Object.assign(list, dto);
    const saved = await this.listsRepo.save(list);
    void this.boardEvents.emit('list.updated', saved.boardId, {
      listId: saved.id,
      positionIdx: saved.positionIdx,
    });
    return saved;
  }

  async remove(id: string, orgId: string): Promise<void> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    const boardId = list.boardId;
    await this.listsRepo.remove(list);
    // Fire-and-forget, matching create/update and cards: emit is best-effort
    // (errors swallowed internally), so don't add Redis latency to the delete.
    void this.boardEvents.emit('list.deleted', boardId, { listId: id });
  }
}
