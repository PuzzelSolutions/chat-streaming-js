import { describe, it, expect, beforeEach } from 'vitest';
import * as Store from '../src/SubscriptionsStore';
import { createSubscriptionsStore } from '../src/SubscriptionsStore';
import StreamSubscription from '../src/StreamSubscription';

function makeSub(topic: string): StreamSubscription {
  return new StreamSubscription({ topic });
}

describe('SubscriptionsStore (module-level singleton)', () => {
  beforeEach(() => {
    Store.removeAll();
  });

  describe('add / getAll', () => {
    it('starts empty', () => {
      expect(Store.getAll()).toHaveLength(0);
    });

    it('adds a subscription', () => {
      Store.add(makeSub('topic-1'));
      expect(Store.getAll()).toHaveLength(1);
    });

    it('replaces duplicate subscription with same id', () => {
      Store.add(makeSub('topic-1'));
      Store.add(makeSub('topic-1'));
      expect(Store.getAll()).toHaveLength(1);
    });

    it('keeps different subscriptions', () => {
      Store.add(makeSub('topic-1'));
      Store.add(makeSub('topic-2'));
      expect(Store.getAll()).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('returns the stored subscription matching by id', () => {
      const sub = makeSub('topic-1');
      Store.add(sub);
      const found = Store.get(sub);
      expect(found).toBe(sub);
    });

    it('returns null for unknown subscription', () => {
      const found = Store.get(makeSub('unknown'));
      expect(found).toBeNull();
    });

    it('returns null for null input', () => {
      expect(Store.get(null)).toBeNull();
    });
  });

  describe('findById', () => {
    it('finds a subscription by string id', () => {
      const sub = makeSub('topic-1');
      Store.add(sub);
      expect(Store.findById('topic-1')).toBe(sub);
    });

    it('returns null for unknown id', () => {
      expect(Store.findById('unknown')).toBeNull();
    });

    it('returns null for falsy input', () => {
      expect(Store.findById(null)).toBeNull();
      expect(Store.findById('')).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns true when subscription exists', () => {
      const sub = makeSub('topic-1');
      Store.add(sub);
      expect(Store.exists(sub)).toBe(true);
    });

    it('returns false when subscription does not exist', () => {
      expect(Store.exists(makeSub('unknown'))).toBe(false);
    });
  });

  describe('remove', () => {
    it('removes an existing subscription', () => {
      const sub = makeSub('topic-1');
      Store.add(sub);
      const result = Store.remove(sub);
      expect(result).toBe(true);
      expect(Store.getAll()).toHaveLength(0);
    });

    it('returns false for null input', () => {
      expect(Store.remove(null)).toBe(false);
    });

    it('returns false for non-object input', () => {
      // Passing a non-subscription value is a runtime guard; cast needed for TS.
      expect(Store.remove('topic-1' as unknown as StreamSubscription)).toBe(false);
    });

    it('does not affect other subscriptions', () => {
      Store.add(makeSub('topic-1'));
      Store.add(makeSub('topic-2'));
      Store.remove(makeSub('topic-1'));
      expect(Store.getAll()).toHaveLength(1);
      expect(Store.getAll()[0].topic).toBe('topic-2');
    });
  });

  describe('removeAll', () => {
    it('removes all subscriptions', () => {
      Store.add(makeSub('topic-1'));
      Store.add(makeSub('topic-2'));
      Store.removeAll();
      expect(Store.getAll()).toHaveLength(0);
    });
  });
});

describe('createSubscriptionsStore (factory)', () => {
  it('returns an isolated store — mutations do not affect other instances', () => {
    const storeA = createSubscriptionsStore();
    const storeB = createSubscriptionsStore();

    storeA.add(makeSub('topic-1'));
    expect(storeA.getAll()).toHaveLength(1);
    expect(storeB.getAll()).toHaveLength(0);
  });

  it('isolated store does not share state with the module singleton', () => {
    Store.removeAll();
    const isolated = createSubscriptionsStore();
    isolated.add(makeSub('isolated-topic'));
    expect(Store.getAll()).toHaveLength(0);
  });
});
