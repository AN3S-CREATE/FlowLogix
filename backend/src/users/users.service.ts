import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  create(orgId: string, dto: CreateUserDto): Promise<User> {
    return this.usersRepo.save(this.usersRepo.create({ ...dto, orgId }));
  }

  findAll(orgId: string): Promise<User[]> {
    return this.usersRepo.find({ where: { orgId } });
  }

  async findOne(id: string, orgId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id, orgId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async update(id: string, orgId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id, orgId);
    Object.assign(user, dto);
    return this.usersRepo.save(user);
  }

  async remove(id: string, orgId: string): Promise<void> {
    await this.findOne(id, orgId);
    await this.usersRepo.delete(id);
  }
}
