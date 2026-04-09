import { describe, it, expect } from 'vitest';
import {
  StreamConnector,
  StreamEventTypes,
  StreamErrors,
  StreamError,
  StreamSubscription,
  createStreamConnector,
} from '../src/PzlStream';

describe('PzlStream (entry point)', () => {
  it('exports StreamConnector with all public methods', () => {
    expect(StreamConnector).toBeDefined();
    expect(typeof StreamConnector.init).toBe('function');
    expect(typeof StreamConnector.updateAccessToken).toBe('function');
    expect(typeof StreamConnector.addStreamSubscription).toBe('function');
    expect(typeof StreamConnector.removeStreamSubscription).toBe('function');
    expect(typeof StreamConnector.getStreamSubscriptions).toBe('function');
    expect(typeof StreamConnector.publishTopicIfConnected).toBe('function');
    expect(typeof StreamConnector.destroy).toBe('function');
  });

  it('does not expose _signalr (internal implementation detail removed)', () => {
    expect((StreamConnector as Record<string, unknown>)['_signalr']).toBeUndefined();
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
    expect(typeof StreamErrors.BROKER_CONNECT_ERROR).toBe('number');
    expect(typeof StreamErrors.TOPIC_GET_ERROR).toBe('number');
    expect(typeof StreamErrors.TOPIC_SUBSCRIBE_ERROR).toBe('number');
  });

  it('exports StreamError class for instanceof checks', () => {
    expect(StreamError).toBeDefined();
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'test error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StreamError);
    expect(err.errorCode).toBe(StreamErrors.BROKER_CONNECT_ERROR);
    expect(err.message).toBe('test error');
    expect(err.name).toBe('StreamError');
  });

  it('exports StreamSubscription as a class', () => {
    expect(StreamSubscription).toBeDefined();
    const sub = new StreamSubscription({ topic: 'test' });
    expect(sub.topic).toBe('test');
    expect(sub.getSubscriptionId()).toBe('test');
  });

  it('exports createStreamConnector factory that returns independent instances', () => {
    expect(typeof createStreamConnector).toBe('function');
    const a = createStreamConnector();
    const b = createStreamConnector();
    expect(a).not.toBe(b);
    expect(typeof a.init).toBe('function');
    expect(typeof b.init).toBe('function');
  });
});
