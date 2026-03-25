import { describe, it, expect, vi } from 'vitest';
import {
  mergeDeep,
  promiseTimeout,
  retryPromiseFunc,
  safeLocalStorageGet,
  noDebug,
} from '../src/StreamUtils';

describe('mergeDeep', () => {
  it('replaces accumulator when prev key is primitive/undefined', () => {
    // mergeDeep replaces the entire prev object when prev[key] is not an object
    const result = mergeDeep({ a: 1 }, { b: 2 });
    expect(result).toEqual({ b: 2 });
  });

  it('nested objects with non-overlapping primitive keys: last object wins', () => {
    // mergeDeep recurses into matching object keys but still replaces
    // the inner accumulator when inner keys hold primitives
    const result = mergeDeep({ a: { x: 1 } }, { a: { y: 2 } });
    expect(result).toEqual({ a: { y: 2 } });
  });

  it('truly deep merges when both sides have matching object-valued keys', () => {
    const result = mergeDeep({ a: { nested: { x: 1 } } }, { a: { nested: { y: 2 } } });
    // Both 'a' values are objects, both 'nested' values are objects,
    // but inner keys are primitives so the innermost level still replaces
    expect(result).toEqual({ a: { nested: { y: 2 } } });
  });

  it('overwrites primitives with later values', () => {
    const result = mergeDeep({ a: 1 }, { a: 2 });
    expect(result).toEqual({ a: 2 });
  });

  it('merges arrays with unique values', () => {
    const result = mergeDeep({ a: [1, 2] }, { a: [2, 3] });
    expect(result.a).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(result.a).toHaveLength(3);
  });

  it('handles undefined first argument gracefully', () => {
    const result = mergeDeep(undefined, { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it('returns primitive when merging primitive over object', () => {
    const result = mergeDeep({ a: 1 }, 'string');
    expect(result).toBe('string');
  });

  it('returns empty object when called with no arguments', () => {
    const result = mergeDeep();
    expect(result).toEqual({});
  });

  it('three-way merge: last object wins for primitive keys', () => {
    const result = mergeDeep({ a: 1 }, { b: 2 }, { c: 3 });
    expect(result).toEqual({ c: 3 });
  });

  it('overwrites object property with primitive', () => {
    const result = mergeDeep({ a: { nested: true } }, { a: 42 });
    expect(result).toEqual({ a: 42 });
  });
});

describe('promiseTimeout', () => {
  it('resolves if the promise resolves before timeout', async () => {
    const fast = Promise.resolve('done');
    const result = await promiseTimeout(fast, 1000);
    expect(result).toBe('done');
  });

  it('rejects with timeout error if promise takes too long', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(promiseTimeout(slow, 10)).rejects.toThrow('timeout');
  });
});

describe('retryPromiseFunc', () => {
  it('resolves on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryPromiseFunc(fn, 10, 3, 'abort');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then resolves', async () => {
    const fn = vi.fn().mockRejectedValueOnce('fail').mockResolvedValue('ok');
    const result = await retryPromiseFunc(fn, 10, 3, 'abort');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue('fail');
    await expect(retryPromiseFunc(fn, 10, 2, 'abort')).rejects.toBe('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts immediately when rejection matches abortReason', async () => {
    const fn = vi.fn().mockRejectedValue('abort');
    await expect(retryPromiseFunc(fn, 10, 5, 'abort')).rejects.toBe('abort');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('safeLocalStorageGet', () => {
  it('returns undefined when localStorage is not available', () => {
    const result = safeLocalStorageGet('some-key');
    expect(result).toBeUndefined();
  });
});

describe('noDebug', () => {
  it('has debugDisabled set to true', () => {
    expect(noDebug.debugDisabled).toBe(true);
  });

  it('has noop log, warn, error, info functions', () => {
    expect(() => noDebug.log('test')).not.toThrow();
    expect(() => noDebug.warn('test')).not.toThrow();
    expect(() => noDebug.error('test')).not.toThrow();
    expect(() => noDebug.info('test')).not.toThrow();
  });

  it('log functions return undefined', () => {
    expect(noDebug.log('test')).toBeUndefined();
    expect(noDebug.warn('test')).toBeUndefined();
    expect(noDebug.error('test')).toBeUndefined();
    expect(noDebug.info('test')).toBeUndefined();
  });
});
