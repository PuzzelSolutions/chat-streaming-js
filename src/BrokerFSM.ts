import type { HubConnection } from '@microsoft/signalr';
import type { DebugLogger } from './StreamUtils';
import { noDebug } from './StreamUtils';

const reconnectRetryDelay = 10;
const reconnectMaxRetries = 12; // 12 retries x 10 sec = 2 minutes

export interface BrokerEventCallbacks {
  onConnectionStarted?: (connection: HubConnection) => void;
  onConnectionFailed?: (error: unknown) => void;
  onDisconnected?: () => void;
  onReconnecting?: (error?: unknown) => void;
  onReconnected?: (connectionId?: string) => void;
}

export interface BrokerExternals {
  _connect: () => void;
  reSubscribeAll: () => Promise<unknown[]>;
  unSubscribeAll: () => void;
}

export type BrokerState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnect_wait'
  | 'reconnecting'
  | 'disconnecting';

export interface TransitionEvent {
  fromState: BrokerState;
  toState: BrokerState;
}

export interface TransitionListener {
  eventName: string;
  callback: (data: TransitionEvent) => void;
  off: () => void;
}

export interface BrokerConnectionFsm {
  handle: (action: string, ...args: unknown[]) => void;
  on: (eventName: string, callback: (data: TransitionEvent) => void) => TransitionListener;
  off: (eventName: string, callback: (data: TransitionEvent) => void) => void;
  getState: () => BrokerState;
  getConnection: () => HubConnection | null;
  setEventCallbacks: (callbacks: BrokerEventCallbacks) => void;
}

interface StateDefinition {
  _onEnter?: (action: string, prevState: string) => void;
  _onExit?: (action: string, fromState: string, toState: string) => void;
  [action: string]:
    | ((...args: unknown[]) => BrokerState | void)
    | ((action: string, prevState: string) => void)
    | ((action: string, fromState: string, toState: string) => void)
    | undefined;
}

export const initBrokerConnectionFsm = (
  externals: BrokerExternals,
  brokerEventCallbacks: BrokerEventCallbacks = {},
  debug?: DebugLogger,
): BrokerConnectionFsm => {
  const _debug = debug || noDebug;
  _debug.log('initBrokerConnectionFsm');

  const fsm_state = {
    currentState: 'disconnected' as BrokerState,
    connection: null as HubConnection | null,
    reconnectCounter: 0,
    reconnectTimer: null as ReturnType<typeof setTimeout> | null,
    eventListeners: {} as Record<string, Array<(data: TransitionEvent) => void>>,
    brokerEventCallbacks,
  };

  const on = (eventName: string, callback: (data: TransitionEvent) => void): TransitionListener => {
    fsm_state.eventListeners[eventName] = (fsm_state.eventListeners[eventName] || []).concat(
      callback,
    );
    return {
      eventName,
      callback,
      off: () => off(eventName, callback),
    };
  };

  const off = (eventName: string, callback: (data: TransitionEvent) => void): void => {
    fsm_state.eventListeners[eventName] = (fsm_state.eventListeners[eventName] || []).filter(
      (cb) => callback && cb !== callback,
    );
  };

  const emitEvent = (eventName: string, ...args: unknown[]): void => {
    (fsm_state.eventListeners[eventName] || []).forEach((callback) => {
      callback(args[0] as TransitionEvent);
    });
  };

  function applyTransition(fromState: BrokerState, toState: BrokerState, action: string): void {
    if (fromState === toState) return;

    const exitHandler = states[fromState]?._onExit;
    if (typeof exitHandler === 'function') {
      exitHandler(action, fromState, toState);
    }

    fsm_state.currentState = toState;

    emitEvent('transition', { fromState, toState });

    const enterHandler = states[toState]?._onEnter;
    if (typeof enterHandler === 'function') {
      enterHandler(action, fromState);
    }
  }

  function handle(action: string, ...args: unknown[]): void {
    const stateHandlers = states[fsm_state.currentState];
    const handler = stateHandlers?.[action] as
      | ((...a: unknown[]) => BrokerState | void)
      | undefined;
    if (typeof handler !== 'function') return;

    const prevState = fsm_state.currentState;
    const nextState = handler(...args);

    if (typeof nextState === 'string' && nextState !== prevState) {
      applyTransition(prevState, nextState as BrokerState, action);
    }
  }

  const states: Record<BrokerState, StateDefinition> = {
    disconnected: {
      _onEnter() {
        _debug.log('FSM: disconnected._onEnter()');
        fsm_state.connection = null;
      },
      connect() {
        return 'connecting' as const;
      },
    },
    connecting: {
      _onEnter() {
        _debug.log('FSM: connecting._onEnter()');
        externals._connect();
      },
      connection_ok(connection: unknown) {
        fsm_state.connection = connection as HubConnection;
        return 'connected' as const;
      },
      connection_failed() {
        return 'disconnected' as const;
      },
      disconnect() {
        return 'disconnecting' as const;
      },
    },
    connected: {
      _onEnter(action: string, prevState: string) {
        _debug.log('FSM: connected._onEnter()', action, prevState);
        if (prevState === 'reconnecting') {
          externals.reSubscribeAll();
        }
        typeof fsm_state?.brokerEventCallbacks?.onConnectionStarted === 'function' &&
          fsm_state.brokerEventCallbacks.onConnectionStarted(fsm_state.connection!);
      },
      connection_failed() {
        typeof fsm_state?.brokerEventCallbacks?.onConnectionFailed === 'function' &&
          fsm_state.brokerEventCallbacks.onConnectionFailed('connection failed');
        fsm_state.connection = null;
        fsm_state.reconnectCounter = 0;
        return 'reconnect_wait' as const;
      },
      disconnect() {
        return 'disconnecting' as const;
      },
    },
    reconnect_wait: {
      _onEnter() {
        _debug.log('FSM: reconnect_wait._onEnter()');
        if (fsm_state.reconnectCounter < reconnectMaxRetries) {
          handle('schedule_reconnect');
        } else {
          handle('reconnection_failed');
        }
      },
      schedule_reconnect() {
        _debug.log(
          'FSM reconnect_wait.schedule_reconnect(): Reconnecting to broker in ' +
            reconnectRetryDelay +
            ' sec...',
        );
        if (fsm_state.reconnectTimer) clearTimeout(fsm_state.reconnectTimer);
        fsm_state.reconnectTimer = setTimeout(() => {
          handle('connect');
        }, reconnectRetryDelay * 1000);
      },
      connect() {
        return 'reconnecting' as const;
      },
      disconnect() {
        return 'disconnecting' as const;
      },
      reconnection_failed() {
        return 'disconnected' as const;
      },
      _onExit() {
        if (fsm_state.reconnectTimer) clearTimeout(fsm_state.reconnectTimer);
      },
    },
    reconnecting: {
      _onEnter() {
        _debug.log('FSM: reconnecting._onEnter()');
        fsm_state.reconnectCounter++;
        externals._connect();
      },
      connection_ok(connection: unknown) {
        fsm_state.connection = connection as HubConnection;
        return 'connected' as const;
      },
      connection_failed(err: unknown) {
        typeof fsm_state?.brokerEventCallbacks?.onConnectionFailed === 'function' &&
          fsm_state.brokerEventCallbacks.onConnectionFailed(err);
        return 'reconnect_wait' as const;
      },
      disconnect() {
        return 'disconnecting' as const;
      },
    },
    disconnecting: {
      _onEnter() {
        _debug.log('FSM: disconnecting._onEnter()');
        externals.unSubscribeAll();

        if (fsm_state.connection) {
          fsm_state.connection
            .stop()
            .catch(() => {})
            .finally(() => {
              handle('disconnect_ok');
            });
        } else {
          handle('disconnect_ok');
        }
      },
      disconnect_ok() {
        typeof fsm_state?.brokerEventCallbacks?.onDisconnected === 'function' &&
          fsm_state.brokerEventCallbacks.onDisconnected();
        return 'disconnected' as const;
      },
    },
  };

  return {
    handle,
    on,
    off,
    getState: () => fsm_state.currentState,
    getConnection: () => fsm_state.connection,
    setEventCallbacks: (callbacks: BrokerEventCallbacks) => {
      fsm_state.brokerEventCallbacks = callbacks;
    },
  };
};
