import { mergeDeep } from './StreamUtils';

/** Configuration for how a subscription interacts with the broker. */
export interface StreamSubscriptionOptions {
    /** Property name used to identify the topic (default `'topic'`). */
    topicProperty: string;
    /** Event ID that represents the beginning of a topic (default `1`). */
    topicStartEventId: number;
    /** Property name on incoming events that holds the event ID (default `'id'`). */
    eventIdProperty: string;
    /** SignalR hub method for fetching topic history (default `'Get'`). */
    getMethod: string;
    /** SignalR hub method for fetching events in reverse order. */
    getReverseMethod?: string;
    /** SignalR hub method for subscribing to real-time events (default `'Subscribe'`). */
    streamMethod: string;
    [key: string]: unknown;
}

/**
 * Props accepted by the {@link StreamSubscription} constructor.
 * Any property present here is deep-merged onto the default subscription.
 */
export interface StreamSubscriptionConfig {
    topic?: string;
    options?: Partial<StreamSubscriptionOptions>;
    fromEventId?: number | null;
    onDataReceived?: (events: unknown[], receivedAs: string) => void;
    onSubscriptionStart?: (() => void) | null;
    onSubscriptionEnd?: (() => void) | null;
    onSubscriptionStreamComplete?: (() => void) | null;
    onSubscriptionError?: ((err: unknown) => void) | null;
    extraProps?: Record<string, unknown>;
    streamingSubscribeOnly?: boolean;
    streamingSubscribeOnResume?: boolean;
    [key: string]: unknown;
}

class DefaultSubscription {
    options: StreamSubscriptionOptions;
    topic: string;
    fromEventId: number | null;
    subscribeInvocationId: number;
    subscriberRef: { dispose: () => void } | null;
    lastReceivedEventId: number;
    onDataReceived: (events: unknown[], receivedAs: string) => void;
    onSubscriptionStart: (() => void) | null;
    onSubscriptionEnd: (() => void) | null;
    onSubscriptionStreamComplete?: (() => void) | null;
    onSubscriptionError?: ((err: unknown) => void) | null;
    extraProps?: Record<string, unknown>;
    streamingSubscribeOnly?: boolean;
    streamingSubscribeOnResume?: boolean;
    getSubscriptionId: () => string;
    toString: () => string;
    [key: string]: unknown;

    constructor() {
        this.options = {
            topicProperty: 'topic',
            topicStartEventId: 1,
            eventIdProperty: 'id',
            getMethod: 'Get',
            streamMethod: 'Subscribe',
        };
        this.topic = '';
        this.fromEventId = null;
        this.subscribeInvocationId = -1;
        this.subscriberRef = null;
        this.lastReceivedEventId = -1;
        this.onDataReceived = function () {};
        this.onSubscriptionStart = null;
        this.onSubscriptionEnd = null;
        this.getSubscriptionId = function (this: DefaultSubscription) {
            return (this as Record<string, unknown>)[this.options.topicProperty] as string;
        };
        this.toString = function (this: DefaultSubscription) {
            return this.getSubscriptionId();
        };
    }
}

/**
 * Represents a single subscription to a broker topic.
 *
 * Create an instance with a configuration object whose properties are
 * deep-merged onto sensible defaults. Two subscriptions with the same
 * {@link getSubscriptionId} are considered to target the same stream.
 *
 * @example
 * ```ts
 * const sub = new StreamSubscription({
 *   topic: 'chat/room-42',
 *   onDataReceived: (events, receivedAs) => console.log(events),
 * });
 * ```
 */
class StreamSubscription extends DefaultSubscription {
    constructor(props: StreamSubscriptionConfig) {
        super();
        for (const [prop, value] of Object.entries(props)) {
            (this as Record<string, unknown>)[prop] = mergeDeep(
                (this as Record<string, unknown>)[prop],
                value
            );
        }
    }
}

export default StreamSubscription;
