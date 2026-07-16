import { BadRequestException } from '@nestjs/common';
import { PositionService } from './position.service';

describe('PositionService', () => {
  const positions = new PositionService();

  it('produces a key that sorts strictly between two neighbours', () => {
    const mid = positions.keyBetween('B', 'g');
    expect(mid > 'B').toBe(true);
    expect(mid < 'g').toBe(true);
  });

  it('appends after the last key (and seeds an empty column)', () => {
    const first = positions.keyForAppend(null);
    const second = positions.keyForAppend(first);
    expect(second > first).toBe(true);
  });

  it('accepts a valid key and rejects a malformed one', () => {
    expect(() => positions.assertValid('M')).not.toThrow();
    // Keys may not end in the alphabet's lowest char ('0') — un-insertable.
    expect(() => positions.assertValid('10')).toThrow(BadRequestException);
  });

  it('rebalances into evenly-spaced ascending keys', () => {
    const keys = positions.rebalancedKeys(5);
    expect(keys).toHaveLength(5);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted); // already ascending
    expect(new Set(keys).size).toBe(5); // all distinct
  });
});
