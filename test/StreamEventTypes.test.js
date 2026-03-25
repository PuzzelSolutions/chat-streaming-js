import { describe, it, expect } from 'vitest';
import StreamEventTypes from '../src/StreamEventTypes';

describe('StreamEventTypes', () => {
  it('exports all expected event types', () => {
    expect(StreamEventTypes.STATE).toBe('state');
    expect(StreamEventTypes.STREAM).toBe('stream');
    expect(StreamEventTypes.STREAMED_CHUNK).toBe('chunk');
  });

  it('contains exactly 3 event types', () => {
    expect(Object.keys(StreamEventTypes)).toHaveLength(3);
  });
});
