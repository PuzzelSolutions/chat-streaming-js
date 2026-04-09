import { createStreamConnector } from './StreamConnector';
import StreamErrors from './StreamErrors';
import { StreamError } from './StreamErrors';
import StreamEventTypes from './StreamEventTypes';
import StreamSubscription from './StreamSubscription';

/** Default singleton connector — the primary entry point for most applications. */
const StreamConnector = createStreamConnector();

export {
  StreamConnector,
  StreamErrors,
  StreamError,
  StreamEventTypes,
  StreamSubscription,
  createStreamConnector,
};

export type { BrokerEventCallbacks, BrokerState, TransitionEvent } from './BrokerFSM';
export type {
  BrokerTransport,
  BrokerLogLevel,
  StreamConnectorInitOptions,
  StreamConnectorHandle,
} from './StreamConnector';
export type { StreamErrorCode } from './StreamErrors';
export type { StreamEventType } from './StreamEventTypes';
export type { StreamSubscriptionConfig, StreamSubscriptionOptions } from './StreamSubscription';
export type { DebugLogger } from './StreamUtils';
