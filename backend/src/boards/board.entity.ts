import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { List } from '../lists/list.entity';
import { BoardMember } from '../board-members/board-member.entity';

export enum BoardVisibility {
  PRIVATE = 'private',
  ORG = 'org',
  PUBLIC = 'public',
}

@Entity({ name: 'boards' })
export class Board {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index()
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @ManyToOne(() => Organization, (organization) => organization.boards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'org_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: BoardVisibility,
    enumName: 'board_visibility',
    default: BoardVisibility.PRIVATE,
  })
  visibility: BoardVisibility;

  @Column({ name: 'bg_properties', type: 'jsonb', default: {} })
  bgProperties: Record<string, unknown>;

  @Index()
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => List, (list) => list.board)
  lists: List[];

  @OneToMany(() => BoardMember, (boardMember) => boardMember.board)
  members: BoardMember[];
}
