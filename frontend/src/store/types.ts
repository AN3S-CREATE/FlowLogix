export type Id = string;

export type CardPriority = 'low' | 'medium' | 'high';

export interface Member {
  id: Id;
  firstName: string;
  lastName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface ChecklistItem {
  id: Id;
  label: string;
  done: boolean;
}

export interface Card {
  id: Id;
  title: string;
  description?: string;
  priority: CardPriority;
  /** User ids of assignees (rendered as BrandedAvatars). */
  assigneeIds: Id[];
  checklist: ChecklistItem[];
  isComplete: boolean;
}

export interface List {
  id: Id;
  title: string;
  cardIds: Id[];
}

export interface BoardSummary {
  id: Id;
  title: string;
  memberIds: Id[];
}
