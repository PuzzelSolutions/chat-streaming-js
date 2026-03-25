import { describe, it, expect } from 'vitest';
import { StreamConnector, StreamEventTypes, StreamErrors, StreamSubscription } from '../src/PzlStream';

describe('PzlStream (entry point)', () => {
  it('exports StreamConnector', () => {
    expect(StreamConnector).toBeDefined();
    expect(typeof StreamConnector.init).toBe('function');
    expect(typeof StreamConnector.updateAccessToken).toBe('function');
    expect(typeof StreamConnector.addStreamSubscription).toBe('function');
    expect(typeof StreamConnector.removeStreamSubscription).toBe('function');
    expect(typeof StreamConnector.getStreamSubscriptions).toBe('function');
    expect(typeof StreamConnector.publishTopicIfConnected).toBe('function');
  });

  it('exports StreamEventTypes', () => {
    expect(StreamEventTypes).toBeDefined();
    expect(StreamEventTypes.STATE).toBe('state');
    expect(StreamEventTypes.STREAM).toBe('stream');
    expect(StreamEventTypes.STREAMED_CHUNK).toBe('chunk');
  });

  it('exports StreamErrors', () => {
    expect(StreamErrors).toBeDefined();
    expect(typeof StreamErrors.BROKER_DISCONNECTED).toBe('number');
  });

  it('exports StreamSubscription as a class', () => {
    expect(StreamSubscription).toBeDefined();
    const sub = new StreamSubscription({ topic: 'test' });
    expect(sub.topic).toBe('test');
    expect(sub.getSubscriptionId()).toBe('test');
  });

  it('exposes _signalr on StreamConnector', () => {
    expect(StreamConnector._signalr).toBeDefined();
    expect(typeof StreamConnector._signalr.HubConnectionBuilder).toBe('function');
  });
});
