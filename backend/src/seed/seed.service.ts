import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { Board } from '../boards/board.entity';
import {
  BoardMember,
  BoardMemberRole,
} from '../board-members/board-member.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import {
  buildCards,
  SEED_BOARDS,
  SEED_LIST_NAMES,
  SEED_ORG,
  SEED_USERS,
} from './seed.data';

const BCRYPT_ROUNDS = 10;

const ROLE_BY_NAME: Record<string, BoardMemberRole> = {
  owner: BoardMemberRole.OWNER,
  admin: BoardMemberRole.ADMIN,
  member: BoardMemberRole.MEMBER,
  viewer: BoardMemberRole.VIEWER,
};

export interface SeedSummary {
  orgId: string;
  users: number;
  boards: number;
  lists: number;
  cards: number;
}

/**
 * Populates a development environment with the Veralogix Group workspace:
 * the org, corporate user accounts (bcrypt-hashed passwords), three themed
 * boards, board memberships, the To Do / In Progress / Done lists, and five
 * richly-populated cards per list. Idempotent — re-running rebuilds the seed
 * boards from scratch, so it's safe to invoke repeatedly in dev.
 *
 * Board writes go through `runInTenantContext` because `boards` has RLS enabled
 * and the app connects as a non-owner role.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async seed(): Promise<SeedSummary> {
    const org = await this.upsertOrg();
    const users = await this.upsertUsers(org.id);

    const summary = await runInTenantContext(
      this.dataSource,
      org.id,
      async (manager) => {
        // Repeatable dev seed: drop existing boards (cascades to lists, cards,
        // and memberships) before recreating them.
        const existing = await manager.find(Board, {
          where: { orgId: org.id },
        });
        if (existing.length > 0) await manager.remove(existing);

        const admin = users[0]?.user;
        let boards = 0;
        let lists = 0;
        let cards = 0;

        for (const def of SEED_BOARDS) {
          const board = await manager.save(
            manager.create(Board, {
              orgId: org.id,
              title: def.title,
              bgProperties: def.bgProperties,
              createdBy: admin ? admin.id : null,
            }),
          );
          boards++;

          // Associate every seed user with the board at their configured role.
          // Role travels with the user (no parallel-array indexing).
          for (const { user, role } of users) {
            await manager.save(
              manager.create(BoardMember, {
                boardId: board.id,
                userId: user.id,
                role,
              }),
            );
          }

          let listPosition = 1;
          for (const listName of SEED_LIST_NAMES) {
            const list = await manager.save(
              manager.create(List, {
                boardId: board.id,
                title: listName,
                // position_idx is still double precision (FractionalIndexer
                // column migration pending); ascending integers suffice for seed.
                positionIdx: listPosition++,
              }),
            );
            lists++;

            let cardPosition = 1;
            for (const card of buildCards(listName)) {
              await manager.save(
                manager.create(Card, {
                  listId: list.id,
                  title: card.title,
                  description: card.description,
                  positionIdx: cardPosition++,
                  isComplete: card.isComplete,
                  customFields: { checklist: card.checklist },
                }),
              );
              cards++;
            }
          }
        }

        return { orgId: org.id, users: users.length, boards, lists, cards };
      },
    );

    this.logger.log(
      `Seeded org ${summary.orgId}: ${summary.users} users, ${summary.boards} boards, ${summary.lists} lists, ${summary.cards} cards`,
    );
    return summary;
  }

  /** Find the Veralogix org by its domain, or create it. (Not RLS-scoped.) */
  private async upsertOrg(): Promise<Organization> {
    const repo = this.dataSource.getRepository(Organization);
    const existing = await repo.findOne({ where: { domain: SEED_ORG.domain } });
    if (existing) {
      existing.name = SEED_ORG.name;
      return repo.save(existing);
    }
    return repo.save(
      repo.create({ name: SEED_ORG.name, domain: SEED_ORG.domain }),
    );
  }

  /**
   * Upsert each seed user by email (hashing the test password with bcrypt) and
   * pair it with its resolved board-membership role, so callers never have to
   * index back into SEED_USERS by position.
   */
  private async upsertUsers(
    orgId: string,
  ): Promise<Array<{ user: User; role: BoardMemberRole }>> {
    const repo = this.dataSource.getRepository(User);
    const users: Array<{ user: User; role: BoardMemberRole }> = [];
    for (const seed of SEED_USERS) {
      const passwordHash = await bcrypt.hash(seed.password, BCRYPT_ROUNDS);
      const existing = await repo.findOne({ where: { email: seed.email } });
      const user = existing ?? repo.create({ email: seed.email });
      user.orgId = orgId;
      user.firstName = seed.firstName;
      user.lastName = seed.lastName;
      user.passwordHash = passwordHash;
      users.push({
        user: await repo.save(user),
        role: ROLE_BY_NAME[seed.role],
      });
    }
    return users;
  }
}
