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
import { Board } from '../boards/board.entity';
import { Card } from '../cards/card.entity';
import { bigintToNumber } from '../common/bigint-number.transformer';

@Entity({ name: 'lists' })
export class List {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index()
  @Column({ name: 'board_id', type: 'uuid' })
  boardId: string;

  @ManyToOne(() => Board, (board) => board.lists, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board: Board;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'position_idx', type: 'double precision' })
  positionIdx: number;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean = false;

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

  @OneToMany(() => Card, (card) => card.list)
  cards: Card[];
}
