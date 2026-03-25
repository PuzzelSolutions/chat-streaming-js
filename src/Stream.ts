import type { HubConnection, IStreamResult } from '@microsoft/signalr';
import type StreamSubscription from './StreamSubscription';

interface PublishOptions {
    publishMethod?: string;
    [key: string]: unknown;
}

function parseTopicValue(subscription: StreamSubscription): [string, string | undefined] {
    const raw = (subscription as Record<string, unknown>)[subscription.options.topicProperty] as string;
    const [topic, type] = raw.split('::').reverse();
    return [topic, type];
}

/** Fetch topic history from the broker via the configured `getMethod`. */
const get = (connection: HubConnection, subscription: StreamSubscription, fromId: number): IStreamResult<unknown> => {
    const method = subscription.options.getMethod || 'Get';
    const [topic, type] = parseTopicValue(subscription);
    return connection.stream(method, {
        type,
        [subscription.options.topicProperty]: topic,
        skip: Math.max(0, fromId - 1) || undefined,
        ...(subscription.extraProps || {})
    });
};

/** Fetch topic events in reverse chronological order. */
const getReverse = (connection: HubConnection, subscription: StreamSubscription, take: number, skip: number = 0): IStreamResult<unknown> => {
    const method = (subscription.options.getReverseMethod as string) || 'GetReverse';
    const [topic, type] = parseTopicValue(subscription);
    return connection.stream(method, {
        type,
        [subscription.options.topicProperty]: topic,
        skip: Math.max(0, skip) || undefined,
        take,
        ...(subscription.extraProps || {})
    });
};

/** Subscribe to real-time events on a topic via the configured `streamMethod`. */
const stream = (connection: HubConnection, subscription: StreamSubscription, fromId: number): IStreamResult<unknown> => {
    const method = subscription.options.streamMethod || 'Subscribe';
    const [topic, type] = parseTopicValue(subscription);
    return connection.stream(method, {
        type,
        [subscription.options.topicProperty]: topic,
        skip: Math.max(0, fromId - 1) || undefined,
        ...(subscription.extraProps || {})
    });
};

/** Publish data to a topic via the configured `publishMethod`. */
const publish = (connection: HubConnection, topic: string, data: unknown, options: PublishOptions, extraProps: Record<string, unknown> = {}): Promise<void> => {
    const method = options.publishMethod || 'Publish';
    return connection.invoke(method, {
        topic,
        data,
        ...extraProps
    });
};

export const Stream = {
    get,
    getReverse,
    stream,
    publish
};
