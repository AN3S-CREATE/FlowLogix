import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { List } from './list.entity';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { TenantAccessService } from '../common/tenant/tenant-access.service';

@Injectable()
export class ListsService {
  constructor(
    @InjectRepository(List)
    private readonly listsRepo: Repository<List>,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async create(boardId: string, orgId: string, dto: CreateListDto): Promise<List> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    return this.listsRepo.save(this.listsRepo.create({ ...dto, boardId }));
  }

  async findAll(boardId: string, orgId: string): Promise<List[]> {
    await this.tenantAccess.assertBoardInOrg(boardId, orgId);
    return this.listsRepo.find({ where: { boardId } });
  }

  findOne(id: string, orgId: string): Promise<List> {
    return this.tenantAccess.assertListInOrg(id, orgId);
  }

  async update(id: string, orgId: string, dto: UpdateListDto): Promise<List> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    Object.assign(list, dto);
    return this.listsRepo.save(list);
  }

  async remove(id: string, orgId: string): Promise<void> {
    const list = await this.tenantAccess.assertListInOrg(id, orgId);
    await this.listsRepo.remove(list);
  }
}
