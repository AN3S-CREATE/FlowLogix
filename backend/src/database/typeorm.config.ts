import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { Board } from '../boards/board.entity';
import { BoardMember } from '../board-members/board-member.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { CardMember } from '../card-members/card-member.entity';
import { Comment } from '../comments/comment.entity';

export const entities = [
  Organization,
  User,
  Board,
  BoardMember,
  List,
  Card,
  CardMember,
  Comment,
];

export function buildDataSourceOptions(env: NodeJS.ProcessEnv): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: env.POSTGRES_HOST ?? 'localhost',
    port: Number(env.POSTGRES_PORT ?? 5432),
    username: env.POSTGRES_USER ?? 'logixflow',
    password: env.POSTGRES_PASSWORD ?? 'logixflow',
    database: env.POSTGRES_DB ?? 'logixflow',
    entities,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
  };
}

// The running app connects as an unprivileged, non-owner role rather than
// POSTGRES_USER (the migration/owner role) so that Row-Level Security
// policies are actually enforced — Postgres bypasses RLS for superusers
// and for a table's own owner regardless of FORCE ROW LEVEL SECURITY.
export function buildAppDataSourceOptions(env: NodeJS.ProcessEnv): PostgresConnectionOptions {
  return {
    ...buildDataSourceOptions(env),
    username: env.APP_DB_USER ?? 'logixflow_app',
    password: env.APP_DB_PASSWORD ?? 'logixflow_app',
  };
}
