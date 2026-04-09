import { describe, it, expect } from 'vitest';
import StreamEventTypes from '../src/StreamEventTypes';
import type { StreamEventType } from '../src/StreamEventTypes';

describe('StreamEventTypes', () => {
  it('exports all expected event types', () => {
    expect(StreamEventTypes.STATE).toBe('state');
    expect(StreamEventTypes.STREAM).toBe('stream');
    expect(StreamEventTypes.STREAMED_CHUNK).toBe('chunk');
  });

  it('contains exactly 3 event types', () => {
    expect(Object.keys(StreamEventTypes)).toHaveLength(3);
  });

  it('all values are strings', () => {
    Object.values(StreamEventTypes).forEach((val) => {
      expect(typeof val).toBe('string');
    });
  });

  it('StreamEventType union covers all values', () => {
    const state: StreamEventType = StreamEventTypes.STATE;
    const stream: StreamEventType = StreamEventTypes.STREAM;
    const chunk: StreamEventType = StreamEventTypes.STREAMED_CHUNK;
    expect([state, stream, chunk]).toEqual(['state', 'stream', 'chunk']);
  });
});
