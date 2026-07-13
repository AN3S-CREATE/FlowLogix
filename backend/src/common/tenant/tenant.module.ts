import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/user.entity';
import { TenantAccessService } from './tenant-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class TenantModule {}
