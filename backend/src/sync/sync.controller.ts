import { Body, Controller, Post } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncRequestDto, SyncResponseDto } from './dto/sync.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

/**
 * `POST /sync` — the mobile offline-first sync endpoint. The client posts its
 * field-level change log for one collection; the server merges each record by
 * Last-Write-Wins against the PostgreSQL master and returns the records where it
 * holds something newer, plus the ids it accepted and a fresh checkpoint. Tenant
 * scoping comes from the authenticated principal (the JWT bearer token), so the
 * mobile client must send `Authorization: Bearer <token>`.
 */
@Controller()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('sync')
  sync(
    @ActiveOrgId() orgId: string,
    @Body() dto: SyncRequestDto,
  ): Promise<SyncResponseDto> {
    return this.syncService.sync(orgId, dto);
  }
}
