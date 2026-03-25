/**
 * Enumeration of error codes emitted by the streaming library.
 *
 * These numeric codes are used in {@link StreamError} rejection payloads
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

export default StreamErrors;
