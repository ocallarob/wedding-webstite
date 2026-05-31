import { describe, expect, it } from 'vitest';
import { runThrottledBatch } from '../src/lib/throttledBatch';

describe('runThrottledBatch', () => {
  it('processes all items and counts sent/failed', async () => {
    const seen: number[] = [];
    const result = await runThrottledBatch({
      items: [1, 2, 3, 4],
      intervalMs: 200,
      runItem: async (item) => {
        seen.push(item);
        if (item % 2 === 0) throw new Error('boom');
      },
      sleep: async () => undefined,
    });

    expect(seen).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ sent: 2, failed: 2 });
  });

  it('sleeps between items but not after final item', async () => {
    const sleeps: number[] = [];
    await runThrottledBatch({
      items: ['a', 'b', 'c'],
      intervalMs: 200,
      runItem: async () => undefined,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(sleeps).toEqual([200, 200]);
  });

  it('does not sleep for zero or one item', async () => {
    const sleeps: number[] = [];
    await runThrottledBatch({
      items: [],
      intervalMs: 200,
      runItem: async () => undefined,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await runThrottledBatch({
      items: ['only'],
      intervalMs: 200,
      runItem: async () => undefined,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(sleeps).toEqual([]);
  });
});
