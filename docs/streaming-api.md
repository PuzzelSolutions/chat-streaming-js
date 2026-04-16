# Puzzel Chat Streaming JS API

## Introduction

The Puzzel Chat Streaming Library provides real-time, event-driven communication for chat applications
built on the Puzzel Contact Centre platform. It is a managed layer over
[Microsoft SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction)
that handles connection management, automatic reconnection, topic subscriptions, and ordered event delivery.

Instead of polling REST endpoints for new messages and status updates, the streaming library pushes events
to your application the moment they occur — giving your users a responsive, real-time chat experience.

The streaming library is used alongside the Puzzel Chat REST API. Real-time events (incoming messages,
agent allocation updates, typing indicators) arrive through the streaming connection, while outbound
actions (sending messages, requesting an agent, posting metadata) are performed via REST.
For the full REST API reference, see the
[Puzzel Chat API Swagger](https://app-cdn.puzzel.com/public/chat-api-swagger/index.html).

---

## Prerequisites

Install the streaming library and its peer dependency:

```
npm install @puzzel/streaming-lib @microsoft/signalr
```

`@microsoft/signalr` (version 6 or later) is a **peer dependency** and must be installed
alongside the library.

Requires Node.js 18 or later if used in a server-side or build environment.

---

## Authentication

The streaming library and the REST API share the same authentication token.
You obtain a token from the Puzzel Consumer Identity Provider before connecting.

### Obtaining a Token

|                  |                                                    |
| ---------------- | -------------------------------------------------- |
| **Endpoint**     | `https://app-consumeridp.puzzel.com/connect/token` |
| **Method**       | `POST`                                             |
| **Content-Type** | `application/x-www-form-urlencoded`                |

Required body parameters:

| Parameter    | Value                | Description                             |
| ------------ | -------------------- | --------------------------------------- |
| `client_id`  | `oneplatform_engage` | Static value. Always required.          |
| `grant_type` | `visitor`            | Static value. Always required.          |
| `tenant_id`  | _[Your Customer ID]_ | Your Puzzel Customer ID (e.g. `10009`). |

On success, the endpoint returns a JSON object containing `access_token`, `refresh_token`, and
`expires_in`.

### Refreshing a Token

Tokens expire. Refresh before the `expires_in` interval elapses to maintain your session.

|                  |                                                    |
| ---------------- | -------------------------------------------------- |
| **Endpoint**     | `https://app-consumeridp.puzzel.com/connect/token` |
| **Method**       | `POST`                                             |
| **Content-Type** | `application/x-www-form-urlencoded`                |

| Parameter       | Value                  | Description                                                |
| --------------- | ---------------------- | ---------------------------------------------------------- |
| `grant_type`    | `refresh_token`        | Tells the API you are refreshing an existing session.      |
| `refresh_token` | _[Your Refresh Token]_ | The refresh token received from the initial token request. |
| `client_id`     | `oneplatform_engage`   | Static value. Always required.                             |
| `tenant_id`     | _[Your Customer ID]_   | Your Puzzel Customer ID.                                   |

On success, the endpoint returns a new `access_token` and `refresh_token`.
After refreshing, update the streaming connection by calling
`StreamConnector.updateAccessToken(newToken)`.

---

## Streaming vs REST — What Goes Where

The streaming connection is used for **receiving** real-time events.
The REST API is used for **sending** data and performing actions.

### Through Streaming (real-time inbound events)

| Stream Topic                     | What You Receive                                                          |
| -------------------------------- | ------------------------------------------------------------------------- |
| `Conversation::{conversationId}` | Incoming chat messages, conversation data events, link events             |
| `Allocation::{conversationId}`   | Agent allocation status updates (agent assigned, queue position changes)  |
| `MetaData::{conversationId}`     | Metadata events (typing indicators, participant join/leave notifications) |

### Through REST API (outbound actions)

| Action                                | Method   | Endpoint                              |
| ------------------------------------- | -------- | ------------------------------------- |
| Send a chat message                   | `POST`   | `/conversation/{id}/Message`          |
| Send metadata (typing, join, leave)   | `POST`   | `/MetaData/{id}`                      |
| Request an agent (route conversation) | `PUT`    | `/conversation/{id}/route/{queueKey}` |
| Check queue / opening hours           | `GET`    | `/queue/info/{queueKey}`              |
| Disconnect from conversation          | `DELETE` | `/conversation/{id}/disconnect`       |

---

## Streaming Library API Reference

### StreamConnector

The main interface for managing broker connections and subscriptions. Imported from the library:

```js
import {
  StreamConnector,
  StreamSubscription,
  StreamEventTypes,
  StreamErrors,
} from '@puzzel/streaming-lib';
```

#### StreamConnector.init(brokerUrl, options?, callbacks?)

Initialize or reconfigure the streaming connection.

| Parameter   | Type                         | Description                                                                                 |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `brokerUrl` | `string`                     | URL of the SignalR hub endpoint. Use `https://app-commsrv.puzzel.com/hubs/v1/messagebroker` |
| `options`   | `StreamConnectorInitOptions` | Connection and transport settings (see table below)                                         |
| `callbacks` | `BrokerEventCallbacks`       | Lifecycle event handlers                                                                    |

Returns a `Promise<string>` that resolves to `'disconnected'` (first init),
`'re-connected'` (config changed), or `'no change'`.

##### Init Options

| Option                       | Type                              | Default                       | Description                                                                                                                                        |
| ---------------------------- | --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brokerTransport`            | `string`                          | `'WebSockets'`                | Transport type: `'WebSockets'`, `'LongPolling'`, `'ServerSentEvents'`, `'Negotiate'`, `'None'`                                                     |
| `access_token`               | `string`                          | `null`                        | Static access token for authentication                                                                                                             |
| `accessTokenFactory`         | `() => string \| Promise<string>` | `null`                        | Function that returns the current token. Called on each connection attempt. Use this instead of `access_token` to always provide the latest token. |
| `brokerLogLevel`             | `string`                          | `'none'`                      | SignalR log level: `'trace'`, `'debug'`, `'info'`, `'warn'`, `'error'`, `'critical'`, `'none'`                                                     |
| `streamingSubscribeOnly`     | `boolean`                         | `false`                       | If `true`, skips fetching topic history on subscribe and only receives new events                                                                  |
| `streamingSubscribeOnResume` | `boolean`                         | `true`                        | If `true`, skips re-fetching history when resuming a subscription mid-topic                                                                        |
| `reconnectRetryPolicy`       | `number[]`                        | `[0, 500, 3000, 5000, 10000]` | SignalR auto-reconnect intervals in milliseconds                                                                                                   |

##### Lifecycle Callbacks (BrokerEventCallbacks)

| Callback                          | When It Fires                                                             |
| --------------------------------- | ------------------------------------------------------------------------- |
| `onConnectionStarted(connection)` | Successfully connected to the broker                                      |
| `onConnectionFailed(error)`       | Connection attempt failed or auto-reconnect exhausted                     |
| `onDisconnected()`                | Disconnected from the broker (after explicit disconnect or final failure) |
| `onReconnecting(error)`           | SignalR is attempting to auto-reconnect                                   |
| `onReconnected(connectionId)`     | SignalR successfully auto-reconnected                                     |

#### StreamConnector.updateAccessToken(newToken?)

Update the access token. If the new token differs from the current one and the connection is active,
the library automatically reconnects and resubscribes all active subscriptions.
If no argument is passed, the `accessTokenFactory` is called to get the latest token.

#### StreamConnector.addStreamSubscription(subscription, timeout?)

Register a subscription and begin receiving events. Connects to the broker automatically if not already connected.
The optional `timeout` parameter (in milliseconds) causes the promise to reject with
`Error('timeout')` if the subscription is not established in time.

#### StreamConnector.removeStreamSubscription(subscription)

Unsubscribe and remove a subscription. Accepts a `StreamSubscription` instance or its string ID
(e.g. `'Conversation::my-conversation-id'`).
When the last subscription is removed, the broker connection is automatically closed.

#### StreamConnector.getStreamSubscriptions()

Returns an array of all currently active `StreamSubscription` instances.

#### StreamConnector.publishTopicIfConnected(topic, data)

Publish data to a topic. Only works if currently connected; rejects with `'Not connected'` otherwise.

---

### StreamSubscription

Represents a single subscription to a broker topic. Create an instance with a configuration object:

```js
const subscription = new StreamSubscription({
  id: 'Conversation::my-conversation-id',
  fromEventId: 1,
  onDataReceived: (events, receivedAs) => {
    console.log('Received:', receivedAs, events);
  },
  onSubscriptionStart: () => {
    console.log('Subscription is live');
  },
  onSubscriptionEnd: () => {
    console.log('Subscription ended');
  },
  onSubscriptionStreamComplete: () => {
    console.log('Stream completed');
  },
  onSubscriptionError: (err) => {
    console.error('Stream error:', err);
  },
  options: {
    topicProperty: 'id',
    eventIdProperty: 'eventId',
    getMethod: 'Get',
    streamMethod: 'StreamingGet',
  },
});
```

##### Subscription Configuration

| Property                       | Type                           | Description                                                                                                                                                                        |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                           | `string`                       | Topic identifier using the pattern `Type::conversationId`. Valid types: `Conversation`, `Allocation`, `MetaData`.                                                                  |
| `fromEventId`                  | `number`                       | Start receiving from this event ID. Use `1` to get full history, or a higher number to resume. A negative value fetches the N most recent events (e.g. `-10` fetches the last 10). |
| `onDataReceived`               | `(events, receivedAs) => void` | Called when events arrive. `events` is an array; `receivedAs` is a `StreamEventTypes` value.                                                                                       |
| `onSubscriptionStart`          | `() => void`                   | Called when the real-time stream is established.                                                                                                                                   |
| `onSubscriptionEnd`            | `() => void`                   | Called when the subscription is removed.                                                                                                                                           |
| `onSubscriptionStreamComplete` | `() => void`                   | Called when the server-side stream completes.                                                                                                                                      |
| `onSubscriptionError`          | `(err) => void`                | Called on stream errors (network failure, token expiry, etc.).                                                                                                                     |
| `streamingSubscribeOnly`       | `boolean`                      | Override the connector-level setting for this subscription.                                                                                                                        |
| `streamingSubscribeOnResume`   | `boolean`                      | Override the connector-level setting for this subscription.                                                                                                                        |

##### Subscription Options

The `options` object configures how the subscription communicates with the SignalR hub:

| Option              | Default       | Description                                                                                                    |
| ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `topicProperty`     | `'topic'`     | Property name sent to the hub to identify the topic. For Puzzel Chat, use `'id'`.                              |
| `eventIdProperty`   | `'id'`        | Property name on incoming events that holds the event sequence number. For Puzzel Chat, use `'eventId'`.       |
| `topicStartEventId` | `1`           | The event ID that represents the beginning of a topic.                                                         |
| `getMethod`         | `'Get'`       | SignalR hub method for fetching topic history.                                                                 |
| `getReverseMethod`  | _(none)_      | Optional SignalR hub method for fetching topic history in reverse order (used when `fromEventId` is negative). |
| `streamMethod`      | `'Subscribe'` | SignalR hub method for subscribing to real-time events. For Puzzel Chat, use `'StreamingGet'`.                 |

The `id` property value uses the format `Type::conversationId`.
The library splits this on `::` and sends `type` and the topic identifier as separate
parameters to the SignalR hub methods.

---

### StreamEventTypes

Constants describing how data was received, passed as the second argument to `onDataReceived`:

| Constant                          | Value      | Meaning                                            |
| --------------------------------- | ---------- | -------------------------------------------------- |
| `StreamEventTypes.STATE`          | `'state'`  | Full topic history fetched on initial subscription |
| `StreamEventTypes.STREAM`         | `'stream'` | A single real-time event from the live stream      |
| `StreamEventTypes.STREAMED_CHUNK` | `'chunk'`  | Partial history fetched when resuming mid-topic    |

---

## REST API Endpoints

The following REST endpoints complement the streaming connection.
All requests require the `Authorization: Bearer {access_token}` header
and use `Content-Type: application/json` unless noted otherwise.
The base URL is `https://app-commsrv.puzzel.com/api`.

### Send a Chat Message

|              |                                               |
| ------------ | --------------------------------------------- |
| **Endpoint** | `POST /conversation/{conversationId}/Message` |

Request body:

```json
{
  "content": "Hello, I need help with my order.",
  "nickName": "Visitor"
}
```

Returns a JSON object with `eventId` confirming the message was accepted.
The message will also appear on the `Conversation` stream subscription as an incoming event.

### Send Metadata Events

|              |                                   |
| ------------ | --------------------------------- |
| **Endpoint** | `POST /MetaData/{conversationId}` |

Metadata events broadcast real-time status updates to conversation participants.
The following standard event types are used:

| Event Type              | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `typingEvent`           | Signals that a participant is currently typing         |
| `participantJoinEvent`  | Signals that a participant has joined the conversation |
| `participantLeaveEvent` | Signals that a participant has left the conversation   |

Example request body for a typing indicator:

```json
{
  "senderName": "visitor",
  "type": "typingEvent"
}
```

Metadata events from other participants (e.g. agent typing, agent joining) are received
through the `MetaData::{conversationId}` stream subscription.

### Request an Agent

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| **Endpoint** | `PUT /conversation/{conversationId}/route/{queueKey}` |

Routes the conversation to the specified queue, requesting an agent.
The `queueKey` is your Puzzel Chat Queue Key.
The request body may contain request variables (visitor claims / form data) as an array of key-value pairs.

After routing, subscribe to the `Allocation::{conversationId}` stream to receive
real-time updates on agent assignment status.

### Check Queue / Opening Hours

|              |                              |
| ------------ | ---------------------------- |
| **Endpoint** | `GET /queue/info/{queueKey}` |

Returns information about the queue status, including whether the queue is open and agent availability.

### Disconnect from Conversation

|              |                                                    |
| ------------ | -------------------------------------------------- |
| **Endpoint** | `DELETE /conversation/{conversationId}/disconnect` |

Ends the visitor's participation in the conversation. Clean up stream subscriptions after disconnecting.

---

## Complete Example

This example demonstrates the full lifecycle: authenticate, connect to streaming, subscribe to topics, send messages
via REST, and clean up.

```js
import {
  StreamConnector,
  StreamSubscription,
  StreamEventTypes,
  StreamErrors,
} from '@puzzel/streaming-lib';

const BROKER_URL = 'https://app-commsrv.puzzel.com/hubs/v1/messagebroker';
const API_BASE = 'https://app-commsrv.puzzel.com/api';
const IDP_URL = 'https://app-consumeridp.puzzel.com/connect/token';

const CUSTOMER_ID = 'YOUR_CUSTOMER_ID';
const QUEUE_KEY = 'YOUR_QUEUE_KEY';

// ---------------------------------------------------------------
// 1. Authenticate
// ---------------------------------------------------------------
async function getToken() {
  const response = await fetch(IDP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'oneplatform_engage',
      grant_type: 'visitor',
      tenant_id: CUSTOMER_ID,
    }),
  });
  return await response.json();
  // Returns: { access_token, refresh_token, expires_in, ... }
}

let tokenData = await getToken();
let accessToken = tokenData.access_token;

// ---------------------------------------------------------------
// 2. Initialize the StreamConnector
// ---------------------------------------------------------------
await StreamConnector.init(
  BROKER_URL,
  {
    brokerTransport: 'WebSockets',
    accessTokenFactory: () => accessToken,
  },
  {
    onConnectionStarted: () => console.log('Connected to broker'),
    onConnectionFailed: (err) => console.error('Connection failed:', err),
    onDisconnected: () => console.log('Disconnected from broker'),
    onReconnecting: (err) => console.warn('Reconnecting...', err),
    onReconnected: () => console.log('Reconnected'),
  },
);

// ---------------------------------------------------------------
// 3. Generate a conversation ID and request an agent
// ---------------------------------------------------------------
const conversationId = crypto.randomUUID();

await fetch(`${API_BASE}/conversation/${conversationId}/route/${QUEUE_KEY}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([]),
});

// ---------------------------------------------------------------
// 4. Shared subscription options for Puzzel Chat
// ---------------------------------------------------------------
const puzzelChatOptions = {
  options: {
    topicStartEventId: 1,
    topicProperty: 'id',
    eventIdProperty: 'eventId',
    getMethod: 'Get',
    streamMethod: 'StreamingGet',
  },
};

// ---------------------------------------------------------------
// 5. Subscribe to Allocation (agent assignment updates)
// ---------------------------------------------------------------
const allocationSub = new StreamSubscription({
  ...puzzelChatOptions,
  id: `Allocation::${conversationId}`,
  fromEventId: 1,
  onDataReceived: (events, receivedAs) => {
    console.log('Allocation event:', receivedAs, events);
    // Handle agent assignment status updates here
  },
  onSubscriptionStart: () => console.log('Allocation stream started'),
});

await StreamConnector.addStreamSubscription(allocationSub, 5000);

// ---------------------------------------------------------------
// 6. Subscribe to Conversation (chat messages)
// ---------------------------------------------------------------
const conversationSub = new StreamSubscription({
  ...puzzelChatOptions,
  id: `Conversation::${conversationId}`,
  fromEventId: 1,
  onDataReceived: (events, receivedAs) => {
    if (receivedAs === StreamEventTypes.STATE) {
      console.log('Full conversation history:', events);
    } else {
      console.log('New message:', events);
    }
  },
  onSubscriptionStart: () => console.log('Conversation stream started'),
  onSubscriptionError: (err) => console.error('Conversation stream error:', err),
});

await StreamConnector.addStreamSubscription(conversationSub, 5000);

// ---------------------------------------------------------------
// 7. Subscribe to MetaData (typing indicators, join/leave)
// ---------------------------------------------------------------
const metaDataSub = new StreamSubscription({
  ...puzzelChatOptions,
  id: `MetaData::${conversationId}`,
  fromEventId: 1,
  onDataReceived: (events, receivedAs) => {
    console.log('MetaData event:', receivedAs, events);
    // Handle typing indicators, participant join/leave, etc.
  },
  onSubscriptionStart: () => console.log('MetaData stream started'),
});

await StreamConnector.addStreamSubscription(metaDataSub, 5000);

// ---------------------------------------------------------------
// 8. Send a message via REST
// ---------------------------------------------------------------
await fetch(`${API_BASE}/conversation/${conversationId}/Message`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    content: 'Hello, I need help!',
    nickName: 'Visitor',
  }),
});

// ---------------------------------------------------------------
// 9. Send a typing indicator via REST
// ---------------------------------------------------------------
await fetch(`${API_BASE}/MetaData/${conversationId}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    senderName: 'visitor',
    type: 'typingEvent',
  }),
});

// ---------------------------------------------------------------
// 10. Token refresh
// ---------------------------------------------------------------
async function refreshToken() {
  const response = await fetch(IDP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'oneplatform_engage',
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
      tenant_id: CUSTOMER_ID,
    }),
  });
  tokenData = await response.json();
  accessToken = tokenData.access_token;
  await StreamConnector.updateAccessToken(accessToken);
}

// ---------------------------------------------------------------
// 11. Clean up when done
// ---------------------------------------------------------------
function cleanup() {
  StreamConnector.removeStreamSubscription(`Allocation::${conversationId}`);
  StreamConnector.removeStreamSubscription(`Conversation::${conversationId}`);
  StreamConnector.removeStreamSubscription(`MetaData::${conversationId}`);
}
```

---

## Connection Lifecycle and Error Handling

### Automatic Reconnection

The library handles reconnection at two levels:

1. **SignalR auto-reconnect:** When the WebSocket connection drops, SignalR automatically
   attempts to reconnect using the `reconnectRetryPolicy` intervals (default:
   `[0, 500, 3000, 5000, 10000]` ms). During this phase, the `onReconnecting`
   callback fires. On success, `onReconnected` fires and all subscriptions are automatically
   resubscribed.

2. **Library-level reconnect:** If SignalR auto-reconnect fails, the library enters its own
   retry loop, attempting to reconnect every 1 second for up to 1 minute (60 retries).
   If this also fails, `onConnectionFailed` fires.

You can customise the SignalR auto-reconnect policy by passing an array of delay values (in ms):

```js
await StreamConnector.init(
  BROKER_URL,
  {
    accessTokenFactory: () => accessToken,
    reconnectRetryPolicy: [0, 1000, 2000, 5000, 10000, 30000],
  },
  callbacks,
);
```

### Error Handling

Subscription errors from `addStreamSubscription` are thrown as `StreamError` instances, which
extend the native `Error` class and carry the following fields:

```js
{
    errorCode: number,  // One of StreamErrors.*
    message: string,    // Human-readable description (inherited from Error)
    err: unknown        // Original error from SignalR
}
```

Handle them with try/catch:

```js
try {
  await StreamConnector.addStreamSubscription(subscription, 5000);
} catch (error) {
  if (error instanceof StreamError) {
    if (error.errorCode === StreamErrors.BROKER_CONNECT_ERROR) {
      console.error('Could not connect to broker');
    } else if (error.errorCode === StreamErrors.TOPIC_SUBSCRIBE_ERROR) {
      console.error('Could not subscribe to topic');
    }
  } else if (error.message === 'timeout') {
    console.error('Subscription timed out');
  }
}
```

### StreamErrors

| Constant                          | Value | Description                                                       |
| --------------------------------- | ----- | ----------------------------------------------------------------- |
| `BROKER_DISCONNECTED`             | `0`   | The broker is disconnected                                        |
| `BROKER_CONNECT_ERROR`            | `1`   | Failed to establish initial connection                            |
| `BROKER_RECONNECT_ATTEMPT_ERROR`  | `2`   | A reconnection attempt failed                                     |
| `BROKER_RECONNECT_FATAL_ERROR`    | `3`   | All reconnection attempts exhausted                               |
| `BROKER_INVALID_CONNECTION_ERROR` | `4`   | Connection is in an invalid state                                 |
| `TOPIC_GET_ERROR`                 | `5`   | Failed to fetch topic history                                     |
| `TOPIC_SUBSCRIBE_ERROR`           | `6`   | Failed to subscribe to real-time stream                           |
| `TOPIC_STREAM_OUT_OF_ORDER`       | `7`   | Events received out of order (library automatically resubscribes) |

---

## Debugging

Enable debug logging in the browser by setting localStorage keys:

```js
localStorage.setItem('pzl-streaming-debug', 'true');
localStorage.setItem('pzl-broker-log-level', 'info');
```

Or pass `console` as the fourth argument to `init()`:

```js
await StreamConnector.init(brokerUrl, options, callbacks, console);
```

An unminified ESM bundle is available for easier debugging:

```js
import { StreamConnector } from '@puzzel/streaming-lib/debug';
```
