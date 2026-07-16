import { BadRequestException, Injectable } from '@nestjs/common';
import { FractionalIndexer } from './fractional-indexer';

/**
 * Thin injectable wrapper over a single {@link FractionalIndexer} so services
 * share one configured instance (Base62) for computing/validating card & list
 * position keys. Keeping the ordering policy here means Lists/Cards never touch
 * the raw indexer and can't drift on alphabet or seed.
 */
@Injectable()
export class PositionService {
  private readonly indexer = new FractionalIndexer();

  /** A key that sorts strictly between `prev` and `next` (nulls = open end). */
  keyBetween(prev: string | null, next: string | null): string {
    return this.indexer.getIntermediateKey(prev, next);
  }

  /** A key that sorts after `last` (append to the end of a column). */
  keyForAppend(last: string | null): string {
    return this.indexer.getIntermediateKey(last, null);
  }

  /** Validate a client-supplied key, throwing 400 rather than corrupting order. */
  assertValid(key: string): void {
    if (!this.indexer.isValidKey(key)) {
      throw new BadRequestException(`Invalid position key: ${key}`);
    }
  }

  /** `count` evenly-spaced keys in ascending order (used to rebalance a column). */
  rebalancedKeys(count: number): string[] {
    return this.indexer.rebalance(count);
  }
}
