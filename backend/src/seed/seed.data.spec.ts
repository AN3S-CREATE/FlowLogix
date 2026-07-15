import {
  buildCards,
  SEED_BOARDS,
  SEED_LIST_NAMES,
  SEED_ORG,
} from './seed.data';

describe('seed.data', () => {
  it('defines the Veralogix org and three themed boards on the brand palette', () => {
    expect(SEED_ORG).toEqual({
      name: 'Veralogix Group',
      domain: 'veralogix.co.za',
    });
    expect(SEED_BOARDS.map((b) => b.title)).toEqual([
      'LogixFlow Enterprise Deployment',
      'Bioniq Network Infrastructure',
      'Smart Mining Hub Analytics',
    ]);
    // Charcoal + Lime from the corporate palette (.cursorrules §3).
    expect(SEED_BOARDS[0].bgProperties.background).toBe('#231F20');
    expect(SEED_BOARDS[1].bgProperties.background).toBe('#8DC63F');
  });

  it('has the standard three lists', () => {
    expect(SEED_LIST_NAMES).toEqual(['To Do', 'In Progress', 'Done']);
  });

  it('builds 5 cards per list, each with a 5-item checklist', () => {
    const cards = buildCards('To Do');
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.checklist).toHaveLength(5);
    }
  });

  it('marks Done cards complete with every subtask ticked', () => {
    const done = buildCards('Done');
    expect(done.every((c) => c.isComplete)).toBe(true);
    expect(done.every((c) => c.checklist.every((s) => s.done))).toBe(true);
  });

  it('leaves To Do cards untouched (incomplete, no subtasks ticked)', () => {
    const todo = buildCards('To Do');
    expect(todo.every((c) => !c.isComplete)).toBe(true);
    expect(todo.every((c) => c.checklist.every((s) => !s.done))).toBe(true);
  });
});
