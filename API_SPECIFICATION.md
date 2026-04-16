# Cross-Platform API Specification

This document defines the public API surface of the Puzzel Streaming Library across all three platforms: JavaScript (reference), Android (Kotlin), and iOS (Swift).

## Transport

All platforms use **Microsoft SignalR** as the transport layer:

| Platform | SignalR Client                                | Package      |
| -------- | --------------------------------------------- | ------------ |
| JS       | `@microsoft/signalr` (peer dep >= 6)          | npm          |
| Android  | `com.microsoft.signalr:signalr:7.0.0`         | Maven/Gradle |
| iOS      | `dotnet/signalr-client-swift` (1.0.0-preview) | SPM          |

Hub methods used: `Get`, `GetReverse` (optional), `Subscribe`, `Publish` (configurable).

## StreamConnector

The main entry point. Singleton on all platforms.

| JS                               | Kotlin                   | Swift                                               |
| -------------------------------- | ------------------------ | --------------------------------------------------- |
| `default export` (module object) | `object StreamConnector` | `final class PzlStreamConnector` (shared singleton) |

### Methods

#### init / initialize

| JS                                                                                | Kotlin                                                                           | Swift                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `init(brokerUrl, initOptions?, brokerEventHandlers?, debugFns?): Promise<string>` | `suspend fun init(brokerUrl, initOptions, brokerEventHandlers, logger?): String` | `func initialize(brokerUrl:options:eventHandlers:logger:) async throws -> String` |

Returns: `"disconnected"`, `"re-connected"`, or `"no change"`.

#### updateAccessToken

| JS                                                                   | Kotlin                                                    | Swift                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `updateAccessToken(new_access_token?): Promise<string \| undefined>` | `suspend fun updateAccessToken(newAccessToken?): String?` | `func updateAccessToken(_:) async throws -> String?` |

Returns: `"re-connected"` or `nil`/`undefined`.

#### addStreamSubscription

| JS                                                                | Kotlin                                                              | Swift                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `addStreamSubscription(subscription, timeout?): Promise<unknown>` | `suspend fun addStreamSubscription(subscription, timeoutMs?): Unit` | `func addStreamSubscription(_:timeout:) async throws` |

#### removeStreamSubscription

| JS                                                       | Kotlin                                                                                                | Swift                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `removeStreamSubscription(subscription \| string): void` | `fun removeStreamSubscription(subscription): Unit` / `fun removeStreamSubscription(id: String): Unit` | `func removeStreamSubscription(_:)` / `func removeStreamSubscription(id:)` |

#### getStreamSubscriptions

| JS                                               | Kotlin                                                   | Swift                                                   |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| `getStreamSubscriptions(): StreamSubscription[]` | `fun getStreamSubscriptions(): List<StreamSubscription>` | `func getStreamSubscriptions() -> [StreamSubscription]` |

#### publishTopicIfConnected

| JS                                                    | Kotlin                                                   | Swift                                                    |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `publishTopicIfConnected(topic, data): Promise<void>` | `suspend fun publishTopicIfConnected(topic, data): Unit` | `func publishTopicIfConnected(topic:data:) async throws` |

Throws `"Not connected"` if broker is not connected.

## StreamSubscription

| JS                                                           | Kotlin                                          | Swift                                           |
| ------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| `class StreamSubscription` (constructor takes config object) | `class StreamSubscription` (constructor params) | `class StreamSubscription` (constructor params) |

### Constructor Parameters

| Property                       | Type (JS)                            | Type (Kotlin)                          | Type (Swift)                       | Default      |
| ------------------------------ | ------------------------------------ | -------------------------------------- | ---------------------------------- | ------------ |
| `topic`                        | `string`                             | `String`                               | `String`                           | `""`         |
| `options`                      | `Partial<StreamSubscriptionOptions>` | `StreamSubscriptionOptions`            | `StreamSubscriptionOptions`        | see below    |
| `fromEventId`                  | `number \| null`                     | `Int?`                                 | `Int?`                             | `null`/`nil` |
| `onDataReceived`               | `(events[], receivedAs) => void`     | `(List<Any>, StreamEventType) -> Unit` | `([Any], StreamEventType) -> Void` | no-op        |
| `onSubscriptionStart`          | `(() => void) \| null`               | `(() -> Unit)?`                        | `(() -> Void)?`                    | `null`/`nil` |
| `onSubscriptionEnd`            | `(() => void) \| null`               | `(() -> Unit)?`                        | `(() -> Void)?`                    | `null`/`nil` |
| `onSubscriptionStreamComplete` | `(() => void) \| null`               | `(() -> Unit)?`                        | `(() -> Void)?`                    | `null`/`nil` |
| `onSubscriptionError`          | `((err) => void) \| null`            | `((Any?) -> Unit)?`                    | `((Error?) -> Void)?`              | `null`/`nil` |
| `extraProps`                   | `Record<string, unknown>`            | `Map<String, Any?>?`                   | `[String: Any]?`                   | `null`/`nil` |
| `streamingSubscribeOnly`       | `boolean?`                           | `Boolean?`                             | `Bool?`                            | `null`/`nil` |
| `streamingSubscribeOnResume`   | `boolean?`                           | `Boolean?`                             | `Bool?`                            | `null`/`nil` |

### Methods

| Method                | Returns                                  |
| --------------------- | ---------------------------------------- |
| `getSubscriptionId()` | `String` (defaults to `topic` value)     |
| `toString()`          | `String` (same as `getSubscriptionId()`) |

### Internal Mutable State

| Property                | Type                         | Initial      |
| ----------------------- | ---------------------------- | ------------ |
| `subscribeInvocationId` | `Int`                        | `-1`         |
| `subscriberRef`         | Platform-specific disposable | `null`/`nil` |
| `lastReceivedEventId`   | `Int`                        | `-1`         |

## StreamSubscriptionOptions

| Property            | Type      | Default       | Description                         |
| ------------------- | --------- | ------------- | ----------------------------------- |
| `topicProperty`     | `String`  | `"topic"`     | Property name identifying the topic |
| `topicStartEventId` | `Int`     | `1`           | Event ID for beginning of topic     |
| `eventIdProperty`   | `String`  | `"id"`        | Property name holding event ID      |
| `getMethod`         | `String`  | `"Get"`       | Hub method for history fetch        |
| `getReverseMethod`  | `String?` | `null`/`nil`  | Hub method for reverse fetch        |
| `streamMethod`      | `String`  | `"Subscribe"` | Hub method for live events          |

## StreamConnectorInitOptions

| Property                     | Type (JS)                | Type (Kotlin)              | Type (Swift)             | Default                            |
| ---------------------------- | ------------------------ | -------------------------- | ------------------------ | ---------------------------------- |
| `brokerTransport`            | `BrokerTransport`        | `BrokerTransport`          | `BrokerTransport`        | `WebSockets`                       |
| `brokerLogLevel`             | `BrokerLogLevel`         | `String`                   | `String`                 | `"none"`                           |
| `access_token`               | `string?`                | `String?`                  | `String?`                | `nil`                              |
| `accessTokenFactory`         | `() => Promise<string?>` | `(suspend () -> String?)?` | `(() async -> String?)?` | `nil`                              |
| `streamingSubscribeOnly`     | `boolean`                | `Boolean`                  | `Bool`                   | `false`                            |
| `streamingSubscribeOnResume` | `boolean`                | `Boolean`                  | `Bool`                   | `true`                             |
| `reconnectRetryPolicy`       | `number[]`               | `List<Long>`               | `[TimeInterval]`         | `[0, 500, 3000, 5000, 10000]` (ms) |
| `publishMethod`              | —                        | `String`                   | `String`                 | `"Publish"`                        |

## BrokerTransport

| JS                   | Kotlin               | Swift               |
| -------------------- | -------------------- | ------------------- |
| `'None'`             | `NONE`               | `.none`             |
| `'Negotiate'`        | `NEGOTIATE`          | `.negotiate`        |
| `'WebSockets'`       | `WEB_SOCKETS`        | `.webSockets`       |
| `'LongPolling'`      | `LONG_POLLING`       | `.longPolling`      |
| `'ServerSentEvents'` | `SERVER_SENT_EVENTS` | `.serverSentEvents` |

## BrokerState

| JS                 | Kotlin           | Swift            |
| ------------------ | ---------------- | ---------------- |
| `'disconnected'`   | `DISCONNECTED`   | `.disconnected`  |
| `'connecting'`     | `CONNECTING`     | `.connecting`    |
| `'connected'`      | `CONNECTED`      | `.connected`     |
| `'reconnect_wait'` | `RECONNECT_WAIT` | `.reconnectWait` |
| `'reconnecting'`   | `RECONNECTING`   | `.reconnecting`  |
| `'disconnecting'`  | `DISCONNECTING`  | `.disconnecting` |

## StreamEventType

| JS                                | Kotlin                           | Swift     | Raw Value  |
| --------------------------------- | -------------------------------- | --------- | ---------- |
| `StreamEventTypes.STATE`          | `StreamEventType.STATE`          | `.state`  | `"state"`  |
| `StreamEventTypes.STREAM`         | `StreamEventType.STREAM`         | `.stream` | `"stream"` |
| `StreamEventTypes.STREAMED_CHUNK` | `StreamEventType.STREAMED_CHUNK` | `.chunk`  | `"chunk"`  |

## StreamErrorCode

| JS Constant                       | Value | Kotlin                             | Swift                           |
| --------------------------------- | ----- | ---------------------------------- | ------------------------------- |
| `BROKER_DISCONNECTED`             | `0`   | `.BROKER_DISCONNECTED`             | `.brokerDisconnected`           |
| `BROKER_CONNECT_ERROR`            | `1`   | `.BROKER_CONNECT_ERROR`            | `.brokerConnectError`           |
| `BROKER_RECONNECT_ATTEMPT_ERROR`  | `2`   | `.BROKER_RECONNECT_ATTEMPT_ERROR`  | `.brokerReconnectAttemptError`  |
| `BROKER_RECONNECT_FATAL_ERROR`    | `3`   | `.BROKER_RECONNECT_FATAL_ERROR`    | `.brokerReconnectFatalError`    |
| `BROKER_INVALID_CONNECTION_ERROR` | `4`   | `.BROKER_INVALID_CONNECTION_ERROR` | `.brokerInvalidConnectionError` |
| `TOPIC_GET_ERROR`                 | `5`   | `.TOPIC_GET_ERROR`                 | `.topicGetError`                |
| `TOPIC_SUBSCRIBE_ERROR`           | `6`   | `.TOPIC_SUBSCRIBE_ERROR`           | `.topicSubscribeError`          |
| `TOPIC_STREAM_OUT_OF_ORDER`       | `7`   | `.TOPIC_STREAM_OUT_OF_ORDER`       | `.topicStreamOutOfOrder`        |

## StreamError

| JS                                                                          | Kotlin                                                              | Swift                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `class StreamError extends Error` with `errorCode`, `message`, `err` fields | `class StreamError(errorCode, message, cause?)` extends `Exception` | `struct StreamError: LocalizedError` with `code`, `message`, `cause` |

## BrokerEventCallbacks

| Callback           | JS                                 | Kotlin                            | Swift                              |
| ------------------ | ---------------------------------- | --------------------------------- | ---------------------------------- |
| Connection started | `onConnectionStarted?(connection)` | `onConnectionStarted(connection)` | `onConnectionStarted(connection:)` |
| Connection failed  | `onConnectionFailed?(error)`       | `onConnectionFailed(error)`       | `onConnectionFailed(error:)`       |
| Disconnected       | `onDisconnected?()`                | `onDisconnected()`                | `onDisconnected()`                 |
| Reconnecting       | `onReconnecting?(error)`           | `onReconnecting(error)`           | `onReconnecting(error:)`           |
| Reconnected        | `onReconnected?(connectionId)`     | `onReconnected(connectionId)`     | `onReconnected(connectionId:)`     |

All callbacks have default no-op implementations.

## PzlLogger / DebugLogger

| JS                                                                            | Kotlin                                                             | Swift                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `DebugLogger` interface with `log`, `warn`, `error`, `info`, `debugDisabled?` | `interface PzlLogger` with `log`, `warn`, `error`, `info` (vararg) | `protocol PzlLogger` with `log`, `warn`, `error`, `info` (variadic) |

## Async Pattern Mapping

| Concept                | JS                                               | Kotlin                                                 | Swift                                                                                |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Async result           | `Promise<T>`                                     | `suspend fun(): T`                                     | `async throws -> T`                                                                  |
| Subscription callbacks | Function properties                              | Lambda properties                                      | Closure properties                                                                   |
| SignalR streaming      | `connection.stream().subscribe(handlers)`        | `connection.stream(type, method, args): Observable<T>` | `connection.stream(method:arguments:): StreamResult<T>` iterable via `for try await` |
| SignalR invoke         | `connection.invoke(method, ...args): Promise<T>` | `connection.invoke(method, args): Completable`         | `connection.invoke(method:arguments:): async throws`                                 |
| Disposable             | `subscription.dispose()`                         | `Disposable.dispose()` (RxJava3)                       | `Task.cancel()`                                                                      |
