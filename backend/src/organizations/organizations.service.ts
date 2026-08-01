import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
  ) {}

  create(dto: CreateOrganizationDto): Promise<Organization> {
    return this.organizationsRepo.save(this.organizationsRepo.create(dto));
  }

  // There's no cross-tenant visibility for organizations themselves, so
  // "list" only ever returns the caller's own org, if it still exists.
  async findActive(orgId: string): Promise<Organization[]> {
    const org = await this.organizationsRepo.findOne({ where: { id: orgId } });
    return org ? [org] : [];
  }

  async findOne(id: string, orgId: string): Promise<Organization> {
    this.assertOwnOrg(id, orgId);
    const org = await this.organizationsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.findOne(id, orgId);
    Object.assign(org, dto);
    return this.organizationsRepo.save(org);
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findOne(id, orgId);
    await this.organizationsRepo.delete(id);
  }

  private assertOwnOrg(id: string, orgId: string): void {
    if (id !== orgId) {
      throw new ForbiddenException("Cannot access another organization's data");
    }
  }
}
