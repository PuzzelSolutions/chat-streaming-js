/**
 * Enumeration of error codes emitted by the streaming library.
 *
 * These numeric codes are used in {@link StreamError} instances
 * so callers can programmatically distinguish failure modes.
 */
const StreamErrors = {
  BROKER_DISCONNECTED: 0,
  BROKER_CONNECT_ERROR: 1,
  BROKER_RECONNECT_ATTEMPT_ERROR: 2,
  BROKER_RECONNECT_FATAL_ERROR: 3,
  BROKER_INVALID_CONNECTION_ERROR: 4,
  TOPIC_GET_ERROR: 5,
  TOPIC_SUBSCRIBE_ERROR: 6,
  TOPIC_STREAM_OUT_OF_ORDER: 7,
} as const;

/** Union of all numeric error codes defined in {@link StreamErrors}. */
export type StreamErrorCode = (typeof StreamErrors)[keyof typeof StreamErrors];

/**
 * Error thrown by the streaming library for all domain-level failures.
 *
 * Extends the native `Error` class so standard `instanceof` checks and
 * stack traces work as expected. Use `errorCode` to distinguish error
 * modes programmatically, `message` for a human-readable description,
 * and `err` for the underlying cause (e.g. the original SignalR error).
 *
 * @example
 * ```ts
 * try {
 *   await StreamConnector.addStreamSubscription(sub);
 * } catch (e) {
 *   if (e instanceof StreamError && e.errorCode === StreamErrors.BROKER_CONNECT_ERROR) {
 *     console.error('Could not connect:', e.message, e.err);
 *   }
 * }
 * ```
 */
export class StreamError extends Error {
  readonly errorCode: StreamErrorCode;
  readonly err: unknown;

  constructor(errorCode: StreamErrorCode, errorMessage: string, err?: unknown) {
    super(errorMessage);
    this.name = 'StreamError';
    this.errorCode = errorCode;
    this.err = err;
  }
}

export default StreamErrors;
