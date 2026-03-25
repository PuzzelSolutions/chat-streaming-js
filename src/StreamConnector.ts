import * as signalr from '@microsoft/signalr';
import { initBrokerConnectionFsm } from './BrokerFSM';
import type { BrokerConnectionFsm, BrokerEventCallbacks } from './BrokerFSM';
import StreamEventTypes from './StreamEventTypes';
import type { StreamEventType } from './StreamEventTypes';
import StreamErrors from './StreamErrors';
import { Stream } from './Stream';
import { promiseTimeout, retryPromiseFunc, noDebug, safeLocalStorageGet } from './StreamUtils';
import type { DebugLogger } from './StreamUtils';
import * as SubscriptionsStore from './SubscriptionsStore';
import type StreamSubscription from './StreamSubscription';

export type BrokerTransport =
  | 'None'
  | 'Negotiate'
  | 'WebSockets'
  | 'LongPolling'
  | 'ServerSentEvents';

export interface StreamConnectorInitOptions {
  brokerTransport?: BrokerTransport;
  brokerLogLevel?: string;
  streamingSubscribeOnly?: boolean;
  streamingSubscribeOnResume?: boolean;
  access_token?: string | null;
  accessTokenFactory?: () => Promise<string | null> | string | null;
  reconnectRetryPolicy?: number[] | signalr.IRetryPolicy;
  [key: string]: unknown;
}

interface ConnectorOptions extends StreamConnectorInitOptions {
  publishMethod: string;
  brokerUrl: string | null;
  brokerTransport: BrokerTransport;
  brokerLogLevel: string;
  brokerEventHandlers?: BrokerEventCallbacks;
}

interface StreamError {
  errorCode: number;
  errorMessage: string;
  err: unknown;
}

interface PreparedEventsData {
  eventsArray: unknown[];
  receivedAs: StreamEventType;
}

const resubscribeDelay = 1;
const reconnectMaxRetries = 60; // 60 = 1 minute if resubscribeDelay == 1

let debug: DebugLogger = noDebug;

let options: ConnectorOptions = {
  publishMethod: 'Publish',
  brokerUrl: null,
  brokerTransport: 'WebSockets',
  brokerLogLevel: 'none',
};
let lastSubscribeInvocationId = 0;
let brokerConnection: BrokerConnectionFsm | null = null;

function _connect(): void {
  debug.log('_connect: Connecting to broker url: ' + options.brokerUrl);

  let brokerConnectionOptions: Record<string, unknown>;
  switch (options.brokerTransport) {
    case 'None':
    case 'Negotiate':
      brokerConnectionOptions = {};
      break;
    case 'LongPolling':
      brokerConnectionOptions = {
        transport: signalr.HttpTransportType.LongPolling,
      };
      break;
    case 'ServerSentEvents':
      brokerConnectionOptions = {
        transport: signalr.HttpTransportType.ServerSentEvents,
      };
      break;
    default:
      brokerConnectionOptions = {
        skipNegotiation: true,
        transport: signalr.HttpTransportType.WebSockets,
      };
  }

  brokerConnectionOptions.accessTokenFactory =
    options.accessTokenFactory || (options.access_token && (() => options.access_token)) || null;

  const hubConnectionBuilder = new signalr.HubConnectionBuilder()
    .withUrl(options.brokerUrl!, brokerConnectionOptions as signalr.IHttpConnectionOptions)
    .configureLogging(options.brokerLogLevel as unknown as signalr.LogLevel)
    .withAutomaticReconnect(
      (options.reconnectRetryPolicy as number[]) || [0, 500, 3000, 5000, 10000],
    );
  const connection = hubConnectionBuilder.build();

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
          reject();
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
      const disconnectedTransitionListener = brokerConnection!.on('transition', function (data) {
        if (data.toState === 'disconnected') {
          resolve();
          disconnectedTransitionListener.off();
        }
      });

      brokerConnection!.handle('disconnect');
    }
  });
}

async function reConnectToBroker(): Promise<signalr.HubConnection> {
  await disconnectFromBroker();
  const connection = await connectToBroker();
  reSubscribeAll().then((subscriptions) => {
    debug.log('reConnectToBroker: all topics re-subscribed:', subscriptions);
  });
  return connection;
}

function getConnection(): Promise<signalr.HubConnection> {
  return connectToBroker();
}

/**
 * Register a subscription and begin receiving events.
 *
 * Connects to the broker if not already connected, fetches topic history
 * (unless configured otherwise), then subscribes to real-time events.
 *
 * @param subscription - The subscription to add.
 * @param timeout - Optional timeout in ms; rejects with `Error('timeout')` if exceeded.
 */
function addStreamSubscription(
  subscription: StreamSubscription,
  timeout?: number,
): Promise<unknown> {
  debug.log('addStreamSubscription:', subscription, timeout);
  unsubscribe(subscription);
  SubscriptionsStore.add(subscription);

  if (timeout) {
    return promiseTimeout(getAndStreamSubscription(subscription), timeout);
  } else {
    return getAndStreamSubscription(subscription);
  }
}

/**
 * Unsubscribe and remove a subscription.
 *
 * Accepts either a {@link StreamSubscription} instance or its string ID.
 * When the last subscription is removed, the broker connection is closed.
 */
function removeStreamSubscription(subscription: StreamSubscription | string): void {
  debug.log('removeStreamSubscription:', subscription);

  let resolved: StreamSubscription | null;
  if (typeof subscription === 'string') {
    resolved = SubscriptionsStore.findById(subscription);
  } else {
    resolved = subscription;
  }

  if (resolved) {
    unsubscribe(resolved);
    SubscriptionsStore.remove(resolved);
  }

  if (SubscriptionsStore.getAll().length < 1) {
    debug.log('No more subscriptions - disconnecting from broker');
    disconnectFromBroker();
  }
}

function reSubscribeAll(): Promise<unknown[]> {
  const subscribePromises: Promise<unknown>[] = [];
  SubscriptionsStore.getAll().forEach((subscription) => {
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
  SubscriptionsStore.getAll().forEach(unsubscribe);
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

  let sub = SubscriptionsStore.get(subscription);
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
    throw {
      errorCode: StreamErrors.BROKER_CONNECT_ERROR,
      errorMessage: 'Could not connect to broker (from _getAndStreamSubscription)',
      err,
    } satisfies StreamError;
  }

  debug.log('_getAndStreamSubscription: gotConnection:', connection);

  sub = SubscriptionsStore.get(sub);
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
      throw {
        errorCode: StreamErrors.TOPIC_GET_ERROR,
        errorMessage: 'Error getting topic: ' + sub,
        err,
      } satisfies StreamError;
    }
  }

  sub = SubscriptionsStore.get(sub!);
  if (sub!.subscribeInvocationId !== currentSubscribeInvocationId) {
    debug.log(
      '_getAndStreamSubscription: A newer subscription to this topic has been invoked while waiting for getTopic() - abort this one...',
    );
    throw 'abort';
  }

  if (eventsArray && Array.isArray(eventsArray) && eventsArray.length) {
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

      const receivedAs = getFullTopicState
        ? StreamEventTypes.STATE
        : StreamEventTypes.STREAMED_CHUNK;
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
    throw {
      errorCode: StreamErrors.TOPIC_SUBSCRIBE_ERROR,
      errorMessage: 'Error subscribing to topic: ' + sub,
      err,
    } satisfies StreamError;
  }
}

function unsubscribe(subscription: StreamSubscription): void {
  const sub = SubscriptionsStore.get(subscription);

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
    return await Stream.publish(connection, topic, data, options);
  } catch (e) {
    debug.log('Exception in publishTopic: ', e);
    throw e;
  }
}

/**
 * Publish data to a topic, but only if currently connected.
 *
 * @param topic - Topic name to publish to.
 * @param data - Payload to send.
 * @returns Resolves when the publish completes.
 * @throws Rejects with `'Not connected'` if the broker is not in a connected state.
 */
function publishTopicIfConnected(topic: string, data: unknown): Promise<void> {
  if (!isConnected()) {
    return Promise.reject('Not connected');
  }
  return publishTopicWhenConnected(topic, data);
}

/** Return all currently active subscriptions. */
function getStreamSubscriptions(): StreamSubscription[] {
  return SubscriptionsStore.getAll();
}

function prepareEventsPayload(
  events: unknown,
  receivedAs: StreamEventType,
  extraLoggingArg?: string,
): PreparedEventsData {
  if (debug && !debug.debugDisabled) {
    const debugData: unknown[] = [];
    if (receivedAs === StreamEventTypes.STREAM) {
      const evtRecord = events as Record<string, Record<string, unknown>>;
      const eventType =
        (evtRecord.data && evtRecord.data.type) || (events as Record<string, unknown>).type;
      const messageType =
        (evtRecord.data && evtRecord.data.messageType) ||
        (events as Record<string, unknown>).messageType;
      debugData.push(
        'conversationData STREAM-event:',
        (eventType as string) +
          ((eventType as string) === 'conversationMessage' ? ' (' + messageType + ')' : ''),
      );
    } else if (receivedAs === StreamEventTypes.STREAMED_CHUNK) {
      debugData.push('conversationData STREAMED_CHUNK-array:');
    } else if (receivedAs === StreamEventTypes.STATE) {
      debugData.push('conversationData STATE-array:');
    } else {
      debugData.push('conversationData (receivedAs = unknown)):');
    }
    debugData.push(events, extraLoggingArg);
    debug.log.apply(null, debugData);
  }

  return {
    eventsArray: receivedAs === StreamEventTypes.STREAM ? [events] : (events as unknown[]),
    receivedAs: receivedAs,
  };
}

/**
 * Initialize or reconfigure the StreamConnector.
 *
 * On first call, creates the internal FSM and stores configuration.
 * On subsequent calls with changed parameters, reconnects automatically.
 *
 * @param brokerUrl - URL of the SignalR broker endpoint.
 * @param initOptions - Transport, logging, and streaming behaviour settings.
 * @param brokerEventHandlers - Optional lifecycle callbacks (connect, reconnect, disconnect).
 * @param debugFns - Optional logger; pass `console` for verbose output.
 * @returns `'disconnected'` on first init, `'re-connected'` if config changed, or `'no change'`.
 */
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

  initOptions.brokerTransport = initOptions.brokerTransport || 'WebSockets';
  initOptions.brokerLogLevel = brokerLogLevelOverride || initOptions.brokerLogLevel || 'none';
  initOptions.streamingSubscribeOnly = !!initOptions.streamingSubscribeOnly || false;
  initOptions.streamingSubscribeOnResume =
    initOptions.streamingSubscribeOnResume === false ? false : true;
  initOptions.access_token =
    initOptions.access_token || (await initOptions.accessTokenFactory?.()) || null;

  if (
    (brokerUrl && brokerUrl !== options.brokerUrl) ||
    initOptions.access_token !== options.access_token ||
    initOptions.brokerTransport !== options.brokerTransport ||
    initOptions.brokerLogLevel !== options.brokerLogLevel
  ) {
    options = {
      ...options,
      brokerUrl,
      ...initOptions,
      brokerEventHandlers,
    };

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
        throw 'Error re-connecting';
      }
    } else {
      return 'disconnected';
    }
  } else {
    return 'no change';
  }
};

/**
 * Update the access token used for broker authentication.
 *
 * If a new token differs from the current one and the connector is connected,
 * it will automatically reconnect and resubscribe all active subscriptions.
 *
 * @param new_access_token - New token string, or omit to re-evaluate the `accessTokenFactory`.
 * @returns `'re-connected'` if a reconnect occurred, or `undefined` if no change was needed.
 * @throws If the connector has not been initialized via {@link init}.
 */
const updateAccessToken = async (new_access_token?: string | null): Promise<string | undefined> => {
  if (!brokerConnection) {
    throw new Error(
      'StreamConnection not initialized. This function can only be called after init',
    );
  }

  const resolvedToken = new_access_token || (await options.accessTokenFactory?.()) || null;

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
        throw 'Error re-connecting';
      }
    }
  } else {
    debug.log('StreamConnector.updateAccessToken(): access_token not changed => Do nothing');
  }
};

export default {
  _signalr: signalr,
  init,
  updateAccessToken,
  getStreamSubscriptions,
  addStreamSubscription,
  removeStreamSubscription,
  publishTopicIfConnected,
};
