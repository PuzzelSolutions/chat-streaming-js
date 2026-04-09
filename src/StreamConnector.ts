import * as signalr from '@microsoft/signalr';
import { initBrokerConnectionFsm } from './BrokerFSM';
import type { BrokerConnectionFsm, BrokerEventCallbacks } from './BrokerFSM';
import StreamEventTypes from './StreamEventTypes';
import type { StreamEventType } from './StreamEventTypes';
import StreamErrors from './StreamErrors';
import { StreamError } from './StreamErrors';
import type { StreamErrorCode } from './StreamErrors';
import { Stream } from './Stream';
import { promiseTimeout, retryPromiseFunc, noDebug, safeLocalStorageGet } from './StreamUtils';
import type { DebugLogger } from './StreamUtils';
import { createSubscriptionsStore } from './SubscriptionsStore';
import type { SubscriptionsStoreInstance } from './SubscriptionsStore';
import type StreamSubscription from './StreamSubscription';

export type BrokerTransport =
  | 'None'
  | 'Negotiate'
  | 'WebSockets'
  | 'LongPolling'
  | 'ServerSentEvents';

/** Valid SignalR log level strings. */
export type BrokerLogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'critical'
  | 'none';

export interface StreamConnectorInitOptions {
  brokerTransport?: BrokerTransport;
  brokerLogLevel?: BrokerLogLevel;
  streamingSubscribeOnly?: boolean;
  streamingSubscribeOnResume?: boolean;
  access_token?: string | null;
  accessTokenFactory?: () => Promise<string | null> | string | null;
  reconnectRetryPolicy?: number[];
}

interface ConnectorOptions {
  publishMethod: string;
  brokerUrl: string | null;
  brokerTransport: BrokerTransport;
  brokerLogLevel: BrokerLogLevel;
  streamingSubscribeOnly: boolean;
  streamingSubscribeOnResume: boolean;
  access_token: string | null;
  accessTokenFactory?: () => Promise<string | null> | string | null;
  reconnectRetryPolicy?: number[];
  brokerEventHandlers: BrokerEventCallbacks;
}

interface PreparedEventsData {
  eventsArray: unknown[];
  receivedAs: StreamEventType;
}

/** The public surface of a stream connector instance. */
export interface StreamConnectorHandle {
  /**
   * Initialize or reconfigure the connector.
   *
   * On first call, creates the internal FSM and stores configuration.
   * On subsequent calls with changed parameters, reconnects automatically.
   *
   * @returns `'disconnected'` on first init, `'re-connected'` if config changed, or `'no change'`.
   */
  init: (
    brokerUrl: string,
    initOptions?: StreamConnectorInitOptions,
    brokerEventHandlers?: BrokerEventCallbacks,
    debugFns?: DebugLogger,
  ) => Promise<string>;

  /**
   * Update the access token.
   *
   * If connected and the token changed, reconnects and resubscribes automatically.
   *
   * @throws {@link Error} if `init` has not been called.
   * @returns `'re-connected'` if a reconnect occurred, or `undefined` if no change.
   */
  updateAccessToken: (new_access_token?: string | null) => Promise<string | undefined>;

  /** Return all currently active subscriptions. */
  getStreamSubscriptions: () => StreamSubscription[];

  /**
   * Register a subscription and begin receiving events.
   *
   * Connects to the broker if not already connected, fetches topic history
   * (unless configured otherwise), then subscribes to real-time events.
   *
   * @param subscription - The subscription to add.
   * @param timeout - Optional timeout in ms; rejects with `Error('timeout')` if exceeded.
   * @throws {@link StreamError} on broker or topic errors.
   */
  addStreamSubscription: (subscription: StreamSubscription, timeout?: number) => Promise<unknown>;

  /**
   * Unsubscribe and remove a subscription.
   *
   * Accepts either a {@link StreamSubscription} instance or its string ID.
   * When the last subscription is removed, the broker connection is closed.
   */
  removeStreamSubscription: (subscription: StreamSubscription | string) => void;

  /**
   * Publish data to a topic, but only if currently connected.
   *
   * @throws {@link StreamError} with `BROKER_DISCONNECTED` if not connected.
   */
  publishTopicIfConnected: (topic: string, data: unknown) => Promise<void>;

  /**
   * Disconnect from the broker and reset all internal state.
   *
   * After calling this, `init` may be called again to start fresh.
   */
  destroy: () => Promise<void>;
}

const resubscribeDelay = 1;
const reconnectMaxRetries = 60; // 60 = 1 minute if resubscribeDelay == 1

const defaultOptions: ConnectorOptions = {
  publishMethod: 'Publish',
  brokerUrl: null,
  brokerTransport: 'WebSockets',
  brokerLogLevel: 'none',
  streamingSubscribeOnly: false,
  streamingSubscribeOnResume: true,
  access_token: null,
  brokerEventHandlers: {},
};

// Exported only for the StreamError type — StreamErrorCode is re-exported via PzlStream.ts
export type { StreamErrorCode };

/**
 * Create an isolated StreamConnector instance with its own connection and subscription state.
 *
 * The default export from `@puzzel/streaming-lib` is a singleton created by this factory.
 * Advanced users (e.g. for testing or multi-broker scenarios) can call this directly.
 *
 * @example
 * ```ts
 * import { createStreamConnector } from '@puzzel/streaming-lib';
 * const connector = createStreamConnector();
 * await connector.init('https://my-broker/hub');
 * ```
 */
export function createStreamConnector(): StreamConnectorHandle {
  let debug: DebugLogger = noDebug;
  let options: ConnectorOptions = { ...defaultOptions };
  let lastSubscribeInvocationId = 0;
  let brokerConnection: BrokerConnectionFsm | null = null;
  const store: SubscriptionsStoreInstance = createSubscriptionsStore();

  function _connect(): void {
    debug.log('_connect: Connecting to broker url: ' + options.brokerUrl);

    let brokerConnectionOptions: Record<string, unknown>;
    switch (options.brokerTransport) {
      case 'None':
      case 'Negotiate':
        brokerConnectionOptions = {};
        break;
      case 'LongPolling':
        brokerConnectionOptions = { transport: signalr.HttpTransportType.LongPolling };
        break;
      case 'ServerSentEvents':
        brokerConnectionOptions = { transport: signalr.HttpTransportType.ServerSentEvents };
        break;
      default:
        brokerConnectionOptions = {
          skipNegotiation: true,
          transport: signalr.HttpTransportType.WebSockets,
        };
    }

    // Use factory if provided — this is called on every connect attempt,
    // so a factory always yields a fresh token (fixes eager evaluation).
    brokerConnectionOptions.accessTokenFactory =
      options.accessTokenFactory || (options.access_token && (() => options.access_token)) || null;

    const connection = new signalr.HubConnectionBuilder()
      .withUrl(options.brokerUrl!, brokerConnectionOptions as signalr.IHttpConnectionOptions)
      .configureLogging(options.brokerLogLevel as unknown as signalr.LogLevel)
      .withAutomaticReconnect(options.reconnectRetryPolicy || [0, 500, 3000, 5000, 10000])
      .build();

    const conn = connection as unknown as Record<string, unknown>;

    connection.onreconnecting((err) => {
      debug.warn(
        '_connect: Broker connection onreconnecting:',
        err,
        conn.connectionState,
        conn.receivedHandshakeResponse,
      );
      typeof options.brokerEventHandlers?.onReconnecting === 'function' &&
        options.brokerEventHandlers.onReconnecting(err);
      unSubscribeAll();
    });

    connection.onreconnected(async (connectionId) => {
      debug.warn(
        '_connect: Broker connection onreconnected:',
        conn.connectionState,
        conn.receivedHandshakeResponse,
      );
      typeof options.brokerEventHandlers?.onReconnected === 'function' &&
        options.brokerEventHandlers.onReconnected(connectionId);
      await reSubscribeAll();
    });

    connection.onclose((err) => {
      debug.log(
        '_connect: Broker connection closed:',
        err,
        conn.connectionState,
        conn.receivedHandshakeResponse,
      );
      brokerConnection!.handle('connection_failed');
    });

    connection.start().then(
      () => {
        debug.log(
          '_connect: Broker connection.start() successful:',
          connection,
          conn.connectionState,
          conn.receivedHandshakeResponse,
        );
        brokerConnection!.handle('connection_ok', connection);
      },
      (err) => {
        debug.log(
          '_connect: Broker connection.start() error: ',
          err,
          connection,
          conn.connectionState,
        );
        brokerConnection!.handle('connection_failed', err);
      },
    );
  }

  function isConnected(): boolean {
    return !!(brokerConnection && brokerConnection.getState() === 'connected');
  }

  function isDisconnected(): boolean {
    return !brokerConnection || brokerConnection.getState() === 'disconnected';
  }

  function connectToBroker(): Promise<signalr.HubConnection> {
    return new Promise(function (resolve, reject) {
      if (isConnected()) {
        resolve(brokerConnection!.getConnection()!);
      } else {
        const transitionListener = brokerConnection!.on('transition', function (data) {
          if (data.toState === 'connected') {
            resolve(brokerConnection!.getConnection()!);
            transitionListener.off();
          } else if (data.toState === 'disconnected' || data.toState === 'reconnect_wait') {
            reject(
              new StreamError(
                StreamErrors.BROKER_DISCONNECTED,
                'Broker transitioned to ' + data.toState + ' while waiting for connection',
              ),
            );
            transitionListener.off();
          }
        });

        brokerConnection!.handle('connect');
      }
    });
  }

  function disconnectFromBroker(): Promise<void> {
    return new Promise(function (resolve) {
      if (isDisconnected()) {
        resolve();
      } else {
        const listener = brokerConnection!.on('transition', function (data) {
          if (data.toState === 'disconnected') {
            resolve();
            listener.off();
          }
        });

        brokerConnection!.handle('disconnect');
      }
    });
  }

  async function reConnectToBroker(): Promise<signalr.HubConnection> {
    await disconnectFromBroker();
    const connection = await connectToBroker();
    try {
      const subscriptions = await reSubscribeAll();
      debug.log('reConnectToBroker: all topics re-subscribed:', subscriptions);
    } catch (err) {
      debug.warn('reConnectToBroker: error re-subscribing after reconnect:', err);
    }
    return connection;
  }

  function getConnection(): Promise<signalr.HubConnection> {
    return connectToBroker();
  }

  function addStreamSubscription(
    subscription: StreamSubscription,
    timeout?: number,
  ): Promise<unknown> {
    debug.log('addStreamSubscription:', subscription, timeout);
    unsubscribe(subscription);
    store.add(subscription);

    if (timeout) {
      return promiseTimeout(getAndStreamSubscription(subscription), timeout);
    } else {
      return getAndStreamSubscription(subscription);
    }
  }

  function removeStreamSubscription(subscription: StreamSubscription | string): void {
    debug.log('removeStreamSubscription:', subscription);

    let resolved: StreamSubscription | null;
    if (typeof subscription === 'string') {
      resolved = store.findById(subscription);
    } else {
      resolved = subscription;
    }

    if (resolved) {
      unsubscribe(resolved);
      store.remove(resolved);
    }

    if (store.getAll().length < 1) {
      debug.log('No more subscriptions - disconnecting from broker');
      disconnectFromBroker();
    }
  }

  function reSubscribeAll(): Promise<unknown[]> {
    const subscribePromises: Promise<unknown>[] = [];
    store.getAll().forEach((subscription) => {
      debug.log('reSubscribeAll: Re-subscribing to subscription: ', subscription);
      subscribePromises.push(
        getAndStreamSubscription(subscription, true).catch((err) => {
          debug.warn(
            'reSubscribeAll: Error re-subscribing to subscription: "' + subscription + '"',
            err,
          );
        }),
      );
    });
    return Promise.all(subscribePromises);
  }

  function unSubscribeAll(): void {
    store.getAll().forEach(unsubscribe);
  }

  function getTopic(
    connection: signalr.HubConnection,
    subscription: StreamSubscription,
    fromId: number,
  ): Promise<unknown[]> {
    return new Promise(function (resolve, reject) {
      const resultArray: unknown[] = [];
      const reverse = fromId < 0;
      const handlers = {
        next: function (event: unknown) {
          resultArray.push(event);
        },
        complete: function () {
          resolve(reverse ? resultArray.reverse() : resultArray);
        },
        error: function (err: unknown) {
          debug.error('getTopic(): Get stream error:', err);
          reject(err);
        },
      };
      if (reverse) {
        Stream.getReverse(connection, subscription, -fromId).subscribe(handlers);
      } else {
        Stream.get(connection, subscription, fromId).subscribe(handlers);
      }
    });
  }

  function getAndStreamSubscription(
    subscription: StreamSubscription,
    keepRetrying?: boolean,
  ): Promise<unknown> {
    if (keepRetrying) {
      return retryPromiseFunc(
        _getAndStreamSubscription.bind(null, subscription) as () => Promise<unknown>,
        resubscribeDelay * 1000,
        reconnectMaxRetries,
        'abort',
      );
    } else {
      return _getAndStreamSubscription(subscription);
    }
  }

  async function _getAndStreamSubscription(subscription: StreamSubscription): Promise<unknown> {
    debug.log('_getAndStreamSubscription:', subscription);

    unsubscribe(subscription);

    let sub = store.get(subscription);
    if (!sub) {
      throw 'abort';
    }

    const currentSubscribeInvocationId = ++lastSubscribeInvocationId;
    sub.subscribeInvocationId = currentSubscribeInvocationId;
    debug.log(
      '_getAndStreamSubscription currentSubscribeInvocationId:',
      currentSubscribeInvocationId,
    );

    let connection: signalr.HubConnection;
    try {
      connection = await getConnection();
    } catch (err: unknown) {
      debug.error(
        '_getAndStreamSubscription: Exception from getConnection("' + sub + '"):',
        err,
        'invocationId:',
        currentSubscribeInvocationId,
      );
      throw new StreamError(
        StreamErrors.BROKER_CONNECT_ERROR,
        'Could not connect to broker (from _getAndStreamSubscription)',
        err,
      );
    }

    debug.log('_getAndStreamSubscription: gotConnection:', connection);

    sub = store.get(sub);
    if (sub!.subscribeInvocationId !== currentSubscribeInvocationId) {
      debug.log(
        '_getAndStreamSubscription: A newer subscription has been invoked while waiting for connection - abort this one...',
      );
      throw 'abort';
    }
    if (sub!.subscriberRef) {
      unsubscribe(sub!);
    }

    const getFullTopicState =
      sub!.lastReceivedEventId < 0 &&
      (typeof sub!.fromEventId !== 'number' || sub!.fromEventId === sub!.options.topicStartEventId);
    let fromEventId: number = getFullTopicState
      ? sub!.options.topicStartEventId
      : sub!.lastReceivedEventId >= 0
        ? sub!.lastReceivedEventId + 1
        : (sub!.fromEventId as number);

    const streamingSubscribeOnly =
      typeof sub!.streamingSubscribeOnly === 'boolean'
        ? sub!.streamingSubscribeOnly
        : options.streamingSubscribeOnly;
    const streamingSubscribeOnResume =
      typeof sub!.streamingSubscribeOnResume === 'boolean'
        ? sub!.streamingSubscribeOnResume
        : options.streamingSubscribeOnResume;

    let eventsArray: unknown[];
    if (streamingSubscribeOnly || (streamingSubscribeOnResume && !getFullTopicState)) {
      eventsArray = [];
    } else {
      debug.log(
        "_getAndStreamSubscription: 'Get': ",
        sub,
        ' from: ',
        fromEventId,
        'invocationId:',
        currentSubscribeInvocationId,
      );
      try {
        eventsArray = await getTopic(connection, sub!, fromEventId);
      } catch (err: unknown) {
        debug.error(
          '_getAndStreamSubscription: Exception from getTopic("' + sub + '"):',
          err,
          'invocationId:',
          currentSubscribeInvocationId,
          connection,
          (connection as unknown as Record<string, unknown>).connectionState,
        );
        throw new StreamError(StreamErrors.TOPIC_GET_ERROR, 'Error getting topic: ' + sub, err);
      }
    }

    sub = store.get(sub!);
    if (sub!.subscribeInvocationId !== currentSubscribeInvocationId) {
      debug.log(
        '_getAndStreamSubscription: A newer subscription to this topic has been invoked while waiting for getTopic() - abort this one...',
      );
      throw 'abort';
    }

    if (eventsArray.length) {
      debug.log(
        '_getAndStreamSubscription: Got topic eventsArray:',
        eventsArray,
        'invocationId:',
        currentSubscribeInvocationId,
      );

      try {
        eventsArray = eventsArray.filter(function (event: unknown) {
          const eventRecord = event as Record<string, number>;
          const eventId = eventRecord[sub!.options.eventIdProperty];
          if (eventId < sub!.lastReceivedEventId + 1) {
            debug.error(
              "Error: Broker event id in response-array from 'Get' out of order (old event received). Expected " +
                (sub!.lastReceivedEventId + 1) +
                ', received ' +
                eventId,
              event,
              'invocationId:',
              currentSubscribeInvocationId,
            );
            debug.log('Skipping event...');
            return false;
          } else if (sub!.lastReceivedEventId != -1 && eventId > sub!.lastReceivedEventId + 1) {
            debug.error(
              "Error: Broker event id in response-array from 'Get' out of order (gap - event(s) missing). Expected " +
                (sub!.lastReceivedEventId + 1) +
                ', received ' +
                eventId,
              event,
              'invocationId:',
              currentSubscribeInvocationId,
            );
            throw StreamErrors.TOPIC_STREAM_OUT_OF_ORDER;
          }
          sub!.lastReceivedEventId = eventId;
          return true;
        });

        const receivedAs = getFullTopicState ? StreamEventTypes.STATE : StreamEventTypes.STREAMED_CHUNK;
        const preparedEventsData = prepareEventsPayload(
          eventsArray,
          receivedAs,
          'invocationId: ' + currentSubscribeInvocationId,
        );
        sub!.onDataReceived(preparedEventsData.eventsArray, preparedEventsData.receivedAs);
      } catch (e) {
        if (e === StreamErrors.TOPIC_STREAM_OUT_OF_ORDER) {
          debug.log('Unrecoverable error: Re-subscribing to topic...');
        } else {
          debug.log('Unknown error:', e);
        }
        return getAndStreamSubscription(sub!);
      }
      fromEventId = sub!.lastReceivedEventId + 1;
    }

    try {
      debug.log(
        "_getAndStreamSubscription: 'Subscribe': ",
        sub,
        ' from id: ',
        fromEventId,
        'invocationId:',
        currentSubscribeInvocationId,
      );

      sub!.subscriberRef = Stream.stream(connection, sub!, fromEventId).subscribe({
        next(event: unknown) {
          const eventRecord = event as Record<string, number>;
          const eventId = eventRecord[sub!.options.eventIdProperty];
          if (eventId < sub!.lastReceivedEventId + 1) {
            debug.error(
              "Error: Broker event id in 'Subscribe'-stream out of order (old event received). Expected " +
                (sub!.lastReceivedEventId + 1) +
                ', received ' +
                eventId,
              event,
              'invocationId:',
              currentSubscribeInvocationId,
            );
            debug.log('Skipping event...');
          } else if (sub!.lastReceivedEventId != -1 && eventId > sub!.lastReceivedEventId + 1) {
            debug.error(
              "Error: Broker event id in 'Subscribe'-stream out of order: (gap - event(s) missing). Expected " +
                (sub!.lastReceivedEventId + 1) +
                ', received ' +
                eventId,
              event,
              'invocationId:',
              currentSubscribeInvocationId,
            );
            debug.log('Re-subscribing to topic...');
            getAndStreamSubscription(sub!, true).catch((err: unknown) => {
              debug.log('Error resubscribing to topic (subscribe, stream out of order, gap)', err);
            });
          } else {
            const preparedEventsData = prepareEventsPayload(
              event,
              StreamEventTypes.STREAM,
              'invocationId: ' + currentSubscribeInvocationId,
            );
            sub!.onDataReceived(preparedEventsData.eventsArray, preparedEventsData.receivedAs);
            sub!.lastReceivedEventId = eventId;
          }
        },
        complete() {
          debug.log(
            'Stream completed on "' + sub + '"',
            'invocationId:',
            currentSubscribeInvocationId,
          );
          sub!.onSubscriptionStreamComplete?.();
        },
        error(err: unknown) {
          debug.error(
            'Stream error on "' + sub + '":',
            err,
            connection,
            (connection as unknown as Record<string, unknown>).connectionState,
            'invocationId:',
            currentSubscribeInvocationId,
          );
          sub!.onSubscriptionError?.(err);
        },
      });

      sub!.onSubscriptionStart?.();

      return sub!.subscriberRef;
    } catch (err) {
      debug.error(
        'Exception subscribing to topic "' + sub + '":',
        err,
        'invocationId:',
        currentSubscribeInvocationId,
        connection,
        (connection as unknown as Record<string, unknown>).connectionState,
      );
      throw new StreamError(
        StreamErrors.TOPIC_SUBSCRIBE_ERROR,
        'Error subscribing to topic: ' + sub,
        err,
      );
    }
  }

  function unsubscribe(subscription: StreamSubscription): void {
    const sub = store.get(subscription);

    if (sub && sub.subscriberRef) {
      sub.onSubscriptionEnd && sub.onSubscriptionEnd();

      try {
        sub.subscriberRef.dispose();
        debug.log('topic subscriber disposed');
      } catch (e) {
        debug.log('Exception disposing topic subscriber:', e);
      }
      sub.subscriberRef = null;
    }
  }

  async function publishTopicWhenConnected(topic: string, data: unknown): Promise<void> {
    const connection = await getConnection();
    try {
      return await Stream.publish(connection, topic, data, { publishMethod: options.publishMethod });
    } catch (e) {
      debug.log('Exception in publishTopic: ', e);
      throw e;
    }
  }

  function publishTopicIfConnected(topic: string, data: unknown): Promise<void> {
    if (!isConnected()) {
      return Promise.reject(
        new StreamError(StreamErrors.BROKER_DISCONNECTED, 'Not connected to broker'),
      );
    }
    return publishTopicWhenConnected(topic, data);
  }

  function getStreamSubscriptions(): StreamSubscription[] {
    return store.getAll();
  }

  function prepareEventsPayload(
    events: unknown,
    receivedAs: StreamEventType,
    extraLoggingArg?: string,
  ): PreparedEventsData {
    if (debug && !debug.debugDisabled) {
      let label: string;
      if (receivedAs === StreamEventTypes.STREAM) {
        label = 'stream event';
      } else if (receivedAs === StreamEventTypes.STREAMED_CHUNK) {
        label = 'streamed chunk array';
      } else {
        label = 'state array';
      }
      debug.log('streaming event (' + label + '):', events, extraLoggingArg);
    }

    return {
      eventsArray: receivedAs === StreamEventTypes.STREAM ? [events] : (events as unknown[]),
      receivedAs: receivedAs,
    };
  }

  const init = async (
    brokerUrl: string,
    initOptions: StreamConnectorInitOptions = {},
    brokerEventHandlers: BrokerEventCallbacks = {},
    debugFns?: DebugLogger,
  ): Promise<string> => {
    const debugOverride = safeLocalStorageGet('pzl-streaming-debug') === 'true';
    debug = (debugOverride && console) || debugFns || noDebug;
    const brokerLogLevelOverride =
      safeLocalStorageGet('pzl-broker-log-level') || (debugOverride && 'info') || null;

    if (!brokerConnection) {
      brokerConnection = initBrokerConnectionFsm(
        {
          _connect,
          reSubscribeAll,
          unSubscribeAll,
        },
        brokerEventHandlers,
        debug,
      );
    }

    const newOptions: ConnectorOptions = {
      publishMethod: 'Publish',
      brokerUrl,
      brokerTransport: initOptions.brokerTransport || 'WebSockets',
      brokerLogLevel: (brokerLogLevelOverride as BrokerLogLevel) || initOptions.brokerLogLevel || 'none',
      streamingSubscribeOnly: !!initOptions.streamingSubscribeOnly,
      streamingSubscribeOnResume: initOptions.streamingSubscribeOnResume !== false,
      access_token: initOptions.access_token || null,
      // Store the factory reference — it is called fresh on every _connect() invocation.
      accessTokenFactory: initOptions.accessTokenFactory,
      reconnectRetryPolicy: initOptions.reconnectRetryPolicy,
      brokerEventHandlers,
    };

    const configChanged =
      brokerUrl !== options.brokerUrl ||
      newOptions.access_token !== options.access_token ||
      newOptions.accessTokenFactory !== options.accessTokenFactory ||
      newOptions.brokerTransport !== options.brokerTransport ||
      newOptions.brokerLogLevel !== options.brokerLogLevel;

    if (configChanged) {
      options = newOptions;
      brokerConnection.setEventCallbacks(brokerEventHandlers);

      debug.log('Initializing StreamConnector');
      debug.log('SignalR client lib version:', signalr.VERSION);

      if (!isDisconnected()) {
        try {
          const connection = await reConnectToBroker();
          debug.log(
            'StreamConnector: broker config changed: Successfully re-connected to broker',
            connection,
          );
          return 're-connected';
        } catch (err) {
          debug.error('StreamConnector: broker config changed: Error re-connecting to broker', err);
          throw new Error('Error re-connecting to broker', { cause: err });
        }
      } else {
        return 'disconnected';
      }
    } else {
      return 'no change';
    }
  };

  const updateAccessToken = async (new_access_token?: string | null): Promise<string | undefined> => {
    if (!brokerConnection) {
      throw new Error('StreamConnector not initialized. Call init() before updateAccessToken().');
    }

    const resolvedToken =
      new_access_token !== undefined
        ? new_access_token
        : ((await options.accessTokenFactory?.()) ?? null);

    if (resolvedToken !== options.access_token) {
      options.access_token = resolvedToken;
      debug.log('StreamConnector.updateAccessToken(): new access_token');
      if (!isDisconnected()) {
        try {
          const connection = await reConnectToBroker();
          debug.log(
            'StreamConnector.updateAccessToken(): Successfully re-connected to broker',
            connection,
          );
          return 're-connected';
        } catch (err) {
          debug.error('StreamConnector.updateAccessToken(): Error re-connecting to broker', err);
          throw new Error('Error re-connecting to broker', { cause: err });
        }
      }
    } else {
      debug.log('StreamConnector.updateAccessToken(): access_token not changed => Do nothing');
    }
  };

  async function destroy(): Promise<void> {
    if (!isDisconnected()) {
      await disconnectFromBroker();
    }
    store.removeAll();
    brokerConnection = null;
    lastSubscribeInvocationId = 0;
    debug = noDebug;
    options = { ...defaultOptions };
  }

  return {
    init,
    updateAccessToken,
    getStreamSubscriptions,
    addStreamSubscription,
    removeStreamSubscription,
    publishTopicIfConnected,
    destroy,
  };
}
