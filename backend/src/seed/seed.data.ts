/**
 * Pure seed definitions for the FlowLogix development environment — no I/O, so
 * the shapes are unit-testable and the `SeedService` stays a thin writer over
 * them. Board backgrounds use the Veralogix corporate palette (.cursorrules §3).
 */

export const SEED_ORG = {
  name: 'Veralogix Group',
  domain: 'veralogix.co.za',
} as const;

export interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  /** Plaintext test password — hashed with bcrypt before it ever touches the DB. */
  password: string;
  /** Board-membership role granted on every seeded board. */
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'andries@veralogix.co.za',
    firstName: 'Andries',
    lastName: 'Liebenberg',
    password: 'Veralogix#2026',
    role: 'admin',
  },
];

export interface SeedBoard {
  title: string;
  /** Persisted into `boards.bg_properties` (jsonb). */
  bgProperties: { background: string; theme: string };
}

export const SEED_BOARDS: readonly SeedBoard[] = [
  {
    title: 'LogixFlow Enterprise Deployment',
    bgProperties: { background: '#231F20', theme: 'charcoal' }, // Secondary / Charcoal
  },
  {
    title: 'Bioniq Network Infrastructure',
    bgProperties: { background: '#8DC63F', theme: 'lime' }, // Primary / Lime Green
  },
  {
    title: 'Smart Mining Hub Analytics',
    bgProperties: { background: '#231F20', theme: 'dark' }, // Dark theme
  },
] as const;

/** Each board gets these three lists, in order. */
export const SEED_LIST_NAMES = ['To Do', 'In Progress', 'Done'] as const;

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface SeedCard {
  title: string;
  description: string;
  isComplete: boolean;
  /** Persisted into `cards.custom_fields.checklist` (jsonb). */
  checklist: ChecklistItem[];
}

/**
 * Build 5 richly-populated cards for a given list. Cards in the `Done` list are
 * marked complete with every subtask ticked; `In Progress` cards are partially
 * ticked; `To Do` cards are untouched — so the seeded board looks realistic.
 */
export function buildCards(listName: string): SeedCard[] {
  const complete = listName === 'Done';
  const partial = listName === 'In Progress';

  return Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    const subtasks = [
      'Draft scope & acceptance criteria',
      'Assign owner and reviewers',
      'Implement / execute',
      'Verify against staging',
      'Sign-off & document',
    ];
    const ticked = complete
      ? subtasks.length
      : partial
        ? Math.min(subtasks.length, n % 4)
        : 0;

    return {
      title: `${listName} · Task ${n}`,
      description: `Auto-seeded ${listName} work item ${n} for the FlowLogix development environment.`,
      isComplete: complete,
      checklist: subtasks.map((text, idx) => ({ text, done: idx < ticked })),
    };
  });
}
