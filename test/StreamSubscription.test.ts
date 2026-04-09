import { describe, it, expect } from 'vitest';
import StreamSubscription from '../src/StreamSubscription';
import type { StreamSubscriptionConfig } from '../src/StreamSubscription';
import type { StreamEventType } from '../src/StreamEventTypes';

describe('StreamSubscription', () => {
  describe('default values', () => {
    it('has correct default options', () => {
      const sub = new StreamSubscription({ topic: 'test-topic' });
      expect(sub.options).toEqual({
        topicProperty: 'topic',
        topicStartEventId: 1,
        eventIdProperty: 'id',
        getMethod: 'Get',
        streamMethod: 'Subscribe',
      });
    });

    it('has correct default topic', () => {
      const sub = new StreamSubscription({ topic: 'my-topic' });
      expect(sub.topic).toBe('my-topic');
    });

    it('has correct default tracking properties', () => {
      const sub = new StreamSubscription({ topic: 't' });
      expect(sub.fromEventId).toBeNull();
      expect(sub.subscribeInvocationId).toBe(-1);
      expect(sub.subscriberRef).toBeNull();
      expect(sub.lastReceivedEventId).toBe(-1);
    });

    it('has noop onDataReceived by default', () => {
      const sub = new StreamSubscription({ topic: 't' });
      expect(typeof sub.onDataReceived).toBe('function');
      expect(sub.onDataReceived([], 'state' as StreamEventType)).toBeUndefined();
    });

    it('has null lifecycle hooks by default', () => {
      const sub = new StreamSubscription({ topic: 't' });
      expect(sub.onSubscriptionStart).toBeNull();
      expect(sub.onSubscriptionEnd).toBeNull();
    });
  });

  describe('getSubscriptionId', () => {
    it('returns the topic by default', () => {
      const sub = new StreamSubscription({ topic: 'my-topic' });
      expect(sub.getSubscriptionId()).toBe('my-topic');
    });

    it('uses custom topicProperty', () => {
      const sub = new StreamSubscription({
        options: { topicProperty: 'channel' },
        channel: 'my-channel',
      } as StreamSubscriptionConfig);
      expect(sub.getSubscriptionId()).toBe('my-channel');
    });
  });

  describe('toString', () => {
    it('returns the subscription id', () => {
      const sub = new StreamSubscription({ topic: 'my-topic' });
      expect(sub.toString()).toBe('my-topic');
      expect('' + sub).toBe('my-topic');
    });
  });

  describe('deep merge behavior', () => {
    it('mergeDeep replaces options when partial options have primitive keys', () => {
      // Due to mergeDeep's behavior: when prev[key] is a primitive and new key doesn't match,
      // the entire accumulator is replaced. A partial options override loses other defaults.
      const sub = new StreamSubscription({
        topic: 'test',
        options: { getMethod: 'CustomGet' },
      });
      expect(sub.options.getMethod).toBe('CustomGet');
      expect(sub.options.topicProperty).toBeUndefined();
    });

    it('preserves full options when all keys are provided', () => {
      const sub = new StreamSubscription({
        topic: 'test',
        options: {
          topicProperty: 'topic',
          topicStartEventId: 1,
          eventIdProperty: 'id',
          getMethod: 'CustomGet',
          streamMethod: 'Subscribe',
        },
      });
      expect(sub.options.getMethod).toBe('CustomGet');
      expect(sub.options.topicProperty).toBe('topic');
      expect(sub.options.streamMethod).toBe('Subscribe');
    });

    it('accepts custom onDataReceived with correct StreamEventType parameter', () => {
      const handler = (events: unknown[], type: StreamEventType) => ({ events, type });
      const sub = new StreamSubscription({
        topic: 'test',
        onDataReceived: handler,
      });
      expect(sub.onDataReceived).toBe(handler);
    });

    it('accepts extraProps', () => {
      const sub = new StreamSubscription({
        topic: 'test',
        extraProps: { customField: 'value' },
      });
      expect(sub.extraProps).toEqual({ customField: 'value' });
    });

    it('accepts fromEventId', () => {
      const sub = new StreamSubscription({
        topic: 'test',
        fromEventId: 42,
      });
      expect(sub.fromEventId).toBe(42);
    });
  });
});
