import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ActiveOrgId } from '../common/tenant/active-org-id.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@ActiveOrgId() orgId: string, @Body() dto: CreateUserDto) {
    return this.usersService.create(orgId, dto);
  }

  @Get()
  findAll(@ActiveOrgId() orgId: string) {
    return this.usersService.findAll(orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.usersService.findOne(id, orgId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @ActiveOrgId() orgId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, orgId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActiveOrgId() orgId: string) {
    return this.usersService.remove(id, orgId);
  }
}
