/**
 * Constants describing how data was received from the broker.
 *
 * - `STATE` -- the full topic state fetched via `Get`
 * - `STREAM` -- a single real-time event from `Subscribe`
 * - `STREAMED_CHUNK` -- a partial array fetched via `Get` (resuming mid-topic)
 */
const StreamEventTypes = {
  STATE: 'state',
  STREAM: 'stream',
  STREAMED_CHUNK: 'chunk',
} as const;

/** Union of the string literal event-type values. */
export type StreamEventType = (typeof StreamEventTypes)[keyof typeof StreamEventTypes];

export default StreamEventTypes;
