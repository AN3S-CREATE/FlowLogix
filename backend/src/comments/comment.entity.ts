import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Card } from '../cards/card.entity';
import { User } from '../users/user.entity';

@Entity({ name: 'comments' })
export class Comment {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Index()
  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @ManyToOne(() => Card, (card) => card.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: Card;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'text_content', type: 'text' })
  textContent: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
