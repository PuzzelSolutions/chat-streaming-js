import { describe, it, expect } from 'vitest';
import StreamErrors from '../src/StreamErrors';

describe('StreamErrors', () => {
  it('exports all expected error codes', () => {
    expect(StreamErrors.BROKER_DISCONNECTED).toBe(0);
    expect(StreamErrors.BROKER_CONNECT_ERROR).toBe(1);
    expect(StreamErrors.BROKER_RECONNECT_ATTEMPT_ERROR).toBe(2);
    expect(StreamErrors.BROKER_RECONNECT_FATAL_ERROR).toBe(3);
    expect(StreamErrors.BROKER_INVALID_CONNECTION_ERROR).toBe(4);
    expect(StreamErrors.TOPIC_GET_ERROR).toBe(5);
    expect(StreamErrors.TOPIC_SUBSCRIBE_ERROR).toBe(6);
    expect(StreamErrors.TOPIC_STREAM_OUT_OF_ORDER).toBe(7);
  });

  it('contains exactly 8 error codes', () => {
    expect(Object.keys(StreamErrors)).toHaveLength(8);
  });
});
