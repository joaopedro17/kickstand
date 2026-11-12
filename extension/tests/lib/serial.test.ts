import { describe, it, expect } from 'vitest';
import { serialQueue } from '@/lib/serial';

describe('serialQueue', () => {
  it('runs each task after the previous one has finished', async () => {
    const enqueue = serialQueue();
    const log: string[] = [];
    const step = (name: string, ms: number) => async () => {
      log.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`${name} end`);
      return name;
    };

    const results = await Promise.all([enqueue(step('a', 10)), enqueue(step('b', 0))]);

    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('keeps going after a task fails, and reports the failure to its caller', async () => {
    const enqueue = serialQueue();

    const failed = enqueue(async () => {
      throw new Error('boom');
    });
    const next = enqueue(async () => 'ran');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });
});
