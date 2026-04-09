import { describe, it, expect } from 'vitest';
import StreamErrors, { StreamError } from '../src/StreamErrors';
import type { StreamErrorCode } from '../src/StreamErrors';

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

  it('all values are numbers', () => {
    Object.values(StreamErrors).forEach((val) => {
      expect(typeof val).toBe('number');
    });
  });
});

describe('StreamError', () => {
  it('extends Error', () => {
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'test');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of StreamError', () => {
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'test');
    expect(err).toBeInstanceOf(StreamError);
  });

  it('has correct name', () => {
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'test');
    expect(err.name).toBe('StreamError');
  });

  it('sets errorCode', () => {
    const code: StreamErrorCode = StreamErrors.TOPIC_GET_ERROR;
    const err = new StreamError(code, 'topic error');
    expect(err.errorCode).toBe(5);
  });

  it('sets message from errorMessage', () => {
    const err = new StreamError(StreamErrors.BROKER_DISCONNECTED, 'not connected');
    expect(err.message).toBe('not connected');
  });

  it('stores underlying err cause', () => {
    const cause = new Error('network down');
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'connect failed', cause);
    expect(err.err).toBe(cause);
  });

  it('err defaults to undefined when not provided', () => {
    const err = new StreamError(StreamErrors.BROKER_CONNECT_ERROR, 'msg');
    expect(err.err).toBeUndefined();
  });
});
