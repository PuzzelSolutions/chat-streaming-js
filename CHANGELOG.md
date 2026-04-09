# Changelog

All notable changes to `@puzzel/streaming-lib` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `StreamError` class exported from the package root — extends `Error` so `instanceof` and stack traces work correctly. Replaces the previous plain-object rejection shape.
- `createStreamConnector()` factory function exported from the package root — creates an isolated connector instance with its own connection and subscription state. Enables multi-broker scenarios and proper test isolation.
- `destroy()` method on `StreamConnectorHandle` — disconnects from the broker and resets all internal state. `init()` may be called again after destruction.
- `BrokerLogLevel` union type exported — replaces the previous untyped `string` for `brokerLogLevel`.
- `StreamConnectorHandle` interface exported — describes the full public surface of a connector instance.

### Changed
- **Breaking:** Errors from `addStreamSubscription`, `connectToBroker`, and `publishTopicIfConnected` are now thrown as `StreamError` instances instead of plain objects or strings. Update `catch` handlers to use `e instanceof StreamError`.
- **Breaking:** `publishTopicIfConnected` rejects with `StreamError` (code `BROKER_DISCONNECTED`) instead of the string `'Not connected'`.
- `init` and `updateAccessToken` now throw `Error` instances (not strings) for programming errors such as reconnect failures or calling before initialization.
- `connectToBroker` now rejects with `StreamError` (code `BROKER_DISCONNECTED`) instead of calling `reject()` with no argument.
- `reConnectToBroker` now awaits `reSubscribeAll()` and surfaces resubscription errors via debug logging rather than silently dropping them.
- `accessTokenFactory` is no longer eagerly evaluated at `init()` time. The factory is now called fresh on every connection attempt, ensuring tokens are never stale after reconnects.
- `onDataReceived` callback parameter `receivedAs` is now typed as `StreamEventType` instead of `string`.
- `brokerLogLevel` option is now typed as `BrokerLogLevel` union instead of `string`.
- `_signalr` has been removed from the `StreamConnector` public export. It was an internal implementation detail and should not have been part of the public API.
- Removed `[key: string]: unknown` index signature from `StreamConnectorInitOptions` and `StreamSubscriptionOptions` — pass arbitrary extra data via `extraProps` on `StreamSubscriptionConfig` instead.
- Internal `prepareEventsPayload` debug logging no longer references domain-specific strings (`conversationData`, `conversationMessage`).
- README license section corrected to MIT (was incorrectly marked as UNLICENSED).
- `API_SPECIFICATION.md` corrected `accessToken` → `access_token` to match implementation.

### Fixed
- Module-level singleton state replaced with factory-based instance pattern (`createSubscriptionsStore`, `createStreamConnector`). Each connector instance now has fully isolated state, enabling parallel test execution without cross-test pollution.

---

## [2.0.0] — 2026-01-01

Initial public release as `@puzzel/streaming-lib`.

### Added
- `StreamConnector` singleton with `init`, `updateAccessToken`, `addStreamSubscription`, `removeStreamSubscription`, `getStreamSubscriptions`, `publishTopicIfConnected`.
- `StreamSubscription` class with deep-merge constructor.
- `StreamErrors` numeric error code constants.
- `StreamEventTypes` constants (`STATE`, `STREAM`, `STREAMED_CHUNK`).
- Broker FSM with automatic reconnection (`reconnect_wait` → `reconnecting` cycle, up to 12 retries × 10 s).
- ESM (minified + debug unminified) and CJS builds via tsup.
- Azure Pipelines CI with format, lint, typecheck, test, version guard, and publish stages.
