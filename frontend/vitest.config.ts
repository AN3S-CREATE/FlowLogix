import { defineConfig } from 'vitest/config';

/**
 * Pure-logic unit tests (store reconciliation, ordering) run in a Node
 * environment — no DOM needed. Component/DOM tests can add jsdom later.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
