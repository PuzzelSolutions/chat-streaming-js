# @puzzel/streaming-lib

A managed streaming and subscription layer over `@microsoft/signalr` for Puzzel's messaging system.

## Installation

```bash
npm install @puzzel/streaming-lib @microsoft/signalr
```

`@microsoft/signalr` is a **peer dependency** and must be installed alongside this library.

## Quick Start

```typescript
import { StreamConnector, StreamSubscription, StreamEventTypes } from '@puzzel/streaming-lib';

// 1. Initialize the connector
await StreamConnector.init(
  'https://your-broker-endpoint/hubs/v1/messagebroker',
  {
    brokerTransport: 'WebSockets',
    access_token: 'your-token',
  },
  {
    onConnectionStarted: (connection) => console.log('Connected!', connection),
    onConnectionFailed: (error) => console.error('Connection failed', error),
    onDisconnected: () => console.warn('Disconnected from broker'),
  },
);

// 2. Create a subscription
const subscription = new StreamSubscription({
  topic: 'chat/room-42',
  onDataReceived: (events, receivedAs) => {
    if (receivedAs === StreamEventTypes.STATE) {
      console.log('Full topic state:', events);
    } else {
      console.log('New event(s):', events);
    }
  },
});

// 3. Subscribe (connects automatically if needed)
await StreamConnector.addStreamSubscription(subscription);

// 4. Later: unsubscribe
StreamConnector.removeStreamSubscription(subscription);
```

## API Reference

### `StreamConnector`

The main interface for managing broker connections and subscriptions.

#### `init(brokerUrl, initOptions?, brokerEventHandlers?, debugFns?)`

Initialize or reconfigure the connector.

| Parameter             | Type                         | Description                                       |
| --------------------- | ---------------------------- | ------------------------------------------------- |
| `brokerUrl`           | `string`                     | URL of the SignalR hub endpoint                   |
| `initOptions`         | `StreamConnectorInitOptions` | Transport, logging, and streaming settings        |
| `brokerEventHandlers` | `BrokerEventCallbacks`       | Lifecycle callbacks                               |
| `debugFns`            | `DebugLogger`                | Custom logger (pass `console` for verbose output) |

**Returns:** `Promise<string>` -- `'disconnected'`, `'re-connected'`, or `'no change'`.

##### Init Options

| Option                       | Type                    | Default                       | Description                                                                                    |
| ---------------------------- | ----------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `brokerTransport`            | `BrokerTransport`       | `'WebSockets'`                | Transport type: `'WebSockets'`, `'LongPolling'`, `'ServerSentEvents'`, `'Negotiate'`, `'None'` |
| `brokerLogLevel`             | `string`                | `'none'`                      | SignalR log level: `'trace'`, `'debug'`, `'info'`, `'warn'`, `'error'`, `'critical'`, `'none'` |
| `access_token`               | `string`                | `null`                        | Static access token                                                                            |
| `accessTokenFactory`         | `() => Promise<string>` | `null`                        | Dynamic token provider                                                                         |
| `streamingSubscribeOnly`     | `boolean`               | `false`                       | Skip initial `Get` -- stream-only mode                                                         |
| `streamingSubscribeOnResume` | `boolean`               | `true`                        | Skip `Get` when resuming mid-topic                                                             |
| `reconnectRetryPolicy`       | `number[]`              | `[0, 500, 3000, 5000, 10000]` | SignalR auto-reconnect intervals (ms)                                                          |

#### `updateAccessToken(newToken?)`

Update the access token. If connected and the token changed, reconnects automatically.

#### `addStreamSubscription(subscription, timeout?)`

Register a subscription and begin receiving events. Optionally set a `timeout` in ms.

#### `removeStreamSubscription(subscription)`

Unsubscribe and remove a subscription. Accepts a `StreamSubscription` instance or its string ID. Disconnects from the broker when no subscriptions remain.

#### `getStreamSubscriptions()`

Returns all currently active `StreamSubscription` instances.

#### `publishTopicIfConnected(topic, data)`

Publish data to a topic. Rejects with a `StreamError` (code `BROKER_DISCONNECTED`) if the broker is not connected.

#### `destroy()`

Disconnect from the broker and reset all internal state. After calling this, `init` may be called again to start fresh. Useful for logout flows or test teardown.

---

### `createStreamConnector()`

Returns a new, isolated `StreamConnectorHandle` instance with its own connection and subscription state. Use this instead of the default `StreamConnector` singleton when you need multiple simultaneous broker connections or test isolation.

```typescript
import { createStreamConnector } from '@puzzel/streaming-lib';

const connector = createStreamConnector();
await connector.init('https://your-broker-endpoint/hub');
```

---

### `StreamSubscription`

```typescript
const sub = new StreamSubscription({
  topic: 'my-topic',
  onDataReceived: (events, receivedAs) => {
    /* handle events */
  },
  onSubscriptionStart: () => {
    /* subscription is live */
  },
  onSubscriptionEnd: () => {
    /* subscription was removed */
  },
  options: {
    getMethod: 'Get', // SignalR method for fetching history
    streamMethod: 'Subscribe', // SignalR method for real-time events
  },
});
```

Two subscriptions with the same `getSubscriptionId()` value are considered duplicates. By default, `getSubscriptionId()` returns the `topic` string.

---

### `StreamEventTypes`

Constants describing how data was received:

| Constant         | Value      | Meaning                                 |
| ---------------- | ---------- | --------------------------------------- |
| `STATE`          | `'state'`  | Full topic history from `Get`           |
| `STREAM`         | `'stream'` | Single real-time event from `Subscribe` |
| `STREAMED_CHUNK` | `'chunk'`  | Partial history (resuming mid-topic)    |

---

### `StreamErrors`

Numeric error codes used in rejection payloads:

| Constant                          | Value |
| --------------------------------- | ----- |
| `BROKER_DISCONNECTED`             | `0`   |
| `BROKER_CONNECT_ERROR`            | `1`   |
| `BROKER_RECONNECT_ATTEMPT_ERROR`  | `2`   |
| `BROKER_RECONNECT_FATAL_ERROR`    | `3`   |
| `BROKER_INVALID_CONNECTION_ERROR` | `4`   |
| `TOPIC_GET_ERROR`                 | `5`   |
| `TOPIC_SUBSCRIBE_ERROR`           | `6`   |
| `TOPIC_STREAM_OUT_OF_ORDER`       | `7`   |

---

## Error Handling

Domain errors are thrown as `StreamError` instances (which extend `Error`):

```typescript
import { StreamConnector, StreamError, StreamErrors } from '@puzzel/streaming-lib';

try {
  await StreamConnector.addStreamSubscription(subscription, 10000);
} catch (e) {
  if (e instanceof StreamError) {
    if (e.errorCode === StreamErrors.BROKER_CONNECT_ERROR) {
      console.error('Could not connect to broker:', e.message, e.err);
    }
  }
}
```

| Property    | Type              | Description                              |
| ----------- | ----------------- | ---------------------------------------- |
| `errorCode` | `StreamErrorCode` | Numeric code — one of `StreamErrors.*`   |
| `message`   | `string`          | Human-readable description               |
| `err`       | `unknown`         | Original error from SignalR or the broker |

---

## Debugging

Set `localStorage` keys to enable debug logging in the browser:

```javascript
localStorage.setItem('pzl-streaming-debug', 'true');
localStorage.setItem('pzl-broker-log-level', 'info');
```

Or pass `console` as the fourth argument to `init()`:

```typescript
await StreamConnector.init(brokerUrl, options, handlers, console);
```

An unminified ESM bundle is available for debugging:

```typescript
import { StreamConnector } from '@puzzel/streaming-lib/debug';
```

---

## Build

```bash
npm run build       # Build ESM, CJS, and declaration files
npm run typecheck   # Run tsc --noEmit
npm test            # Run Vitest test suite
```

## License

MIT — see [LICENSE](LICENSE) for details.
