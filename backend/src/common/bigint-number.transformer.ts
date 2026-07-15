import { ValueTransformer } from 'typeorm';

/**
 * TypeORM's postgres driver returns `bigint` columns as strings to avoid silent
 * precision loss. Our CRDT clocks are epoch-microsecond values (~1.7e15), well
 * within `Number.MAX_SAFE_INTEGER` (~9.0e15), so it is safe to surface them as
 * `number` in the domain and convert at the column boundary.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined): string | null =>
    value === null || value === undefined ? null : String(value),
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};
