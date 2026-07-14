import { BoardSummary, Card, List, Member } from './types';

export const seedMembers: Member[] = [
  { id: 'u1', firstName: 'Andries', lastName: 'Liebenberg', role: 'owner' },
  { id: 'u2', firstName: 'Priya', lastName: 'Naidoo', role: 'admin' },
  { id: 'u3', firstName: 'Marcus', lastName: 'Okoye', role: 'member' },
  { id: 'u4', firstName: 'Sofia', lastName: 'Castellano', role: 'member' },
  { id: 'u5', firstName: 'Wei', lastName: 'Zhang', role: 'viewer' },
];

export const seedBoard: BoardSummary = {
  id: 'b1',
  title: 'Q3 Delivery Board',
  memberIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
};

export const seedCards: Record<string, Card> = {
  c1: {
    id: 'c1',
    title: 'Design multi-region websocket topology',
    priority: 'high',
    assigneeIds: ['u2', 'u3'],
    isComplete: false,
    checklist: [
      { id: 'c1k1', label: 'Redis pub/sub channels', done: true },
      { id: 'c1k2', label: 'Board room fan-out', done: true },
      { id: 'c1k3', label: 'Reconnect backoff', done: false },
    ],
  },
  c2: {
    id: 'c2',
    title: 'Fractional index migration for cards',
    priority: 'medium',
    assigneeIds: ['u1'],
    isComplete: false,
    checklist: [
      { id: 'c2k1', label: 'position_idx -> varchar', done: false },
      { id: 'c2k2', label: 'Backfill existing rows', done: false },
    ],
  },
  c3: {
    id: 'c3',
    title: 'RLS policy for lists & cards',
    priority: 'high',
    assigneeIds: ['u1', 'u4'],
    isComplete: false,
    checklist: [{ id: 'c3k1', label: 'Join up to owning board', done: false }],
  },
  c4: {
    id: 'c4',
    title: 'Branded avatar component',
    priority: 'low',
    assigneeIds: ['u4'],
    isComplete: true,
    checklist: [
      { id: 'c4k1', label: 'Initials + mesh watermark', done: true },
      { id: 'c4k2', label: 'Ring variant for headers', done: true },
    ],
  },
  c5: {
    id: 'c5',
    title: 'Optimistic drag-and-drop store',
    priority: 'medium',
    assigneeIds: ['u3', 'u5'],
    isComplete: false,
    checklist: [
      { id: 'c5k1', label: 'Instant reorder', done: true },
      { id: 'c5k2', label: 'Rollback on failure', done: true },
      { id: 'c5k3', label: 'Toast on error', done: false },
    ],
  },
  c6: {
    id: 'c6',
    title: 'Corporate palette audit',
    priority: 'low',
    assigneeIds: ['u2'],
    isComplete: true,
    checklist: [],
  },
};

export const seedLists: List[] = [
  { id: 'l1', title: 'Backlog', cardIds: ['c2', 'c3'] },
  { id: 'l2', title: 'In Progress', cardIds: ['c1', 'c5'] },
  { id: 'l3', title: 'Review', cardIds: ['c6'] },
  { id: 'l4', title: 'Done', cardIds: ['c4'] },
];
