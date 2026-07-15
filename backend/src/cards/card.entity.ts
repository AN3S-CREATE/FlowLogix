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
import { List } from '../lists/list.entity';
import { Comment } from '../comments/comment.entity';
import { CardMember } from '../card-members/card-member.entity';
import { bigintToNumber } from '../common/bigint-number.transformer';

@Entity({ name: 'cards' })
export class Card {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index()
  @Column({ name: 'list_id', type: 'uuid' })
  listId: string;

  @ManyToOne(() => List, (list) => list.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'list_id' })
  list: List;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'position_idx', type: 'double precision' })
  positionIdx: number;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'is_complete', type: 'boolean', default: false })
  isComplete: boolean = false;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean = false;

  @Column({ name: 'custom_fields', type: 'jsonb', default: {} })
  customFields: Record<string, unknown> = {};

  // --- CRDT sync metadata (mobile offline-first LWW; see sync/ module) ---
  @Column({ name: 'sync_clocks', type: 'jsonb', default: {} })
  syncClocks: Record<string, number> = {};

  @Column({ name: 'node_id', type: 'varchar', length: 64, nullable: true })
  nodeId: string | null = null;

  @Column({
    name: 'sync_deleted_at',
    type: 'bigint',
    nullable: true,
    transformer: bigintToNumber,
  })
  syncDeletedAt: number | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Comment, (comment) => comment.card)
  comments: Comment[];

  @OneToMany(() => CardMember, (cardMember) => cardMember.card)
  members: CardMember[];
}
