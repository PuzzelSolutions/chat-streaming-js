import { describe, it, expect, vi } from 'vitest';
import { initBrokerConnectionFsm } from '../src/BrokerFSM';
import { noDebug } from '../src/StreamUtils';

function createFsm(overrides = {}, callbacks = {}) {
  const externals = {
    _connect: vi.fn(),
    reSubscribeAll: vi.fn(),
    unSubscribeAll: vi.fn(),
    ...overrides,
  };
  const fsm = initBrokerConnectionFsm(externals, callbacks, noDebug);
  return { fsm, externals };
}

describe('BrokerFSM', () => {
  describe('initial state', () => {
    it('starts in disconnected state', () => {
      const { fsm } = createFsm();
      expect(fsm.getState()).toBe('disconnected');
    });

    it('has null connection initially', () => {
      const { fsm } = createFsm();
      expect(fsm.getConnection()).toBeNull();
    });
  });

  describe('connect flow: disconnected -> connecting -> connected', () => {
    it('transitions to connecting on connect action', () => {
      const { fsm } = createFsm();
      fsm.handle('connect');
      expect(fsm.getState()).toBe('connecting');
    });

    it('calls _connect on entering connecting state', () => {
      const { fsm, externals } = createFsm();
      fsm.handle('connect');
      expect(externals._connect).toHaveBeenCalledTimes(1);
    });

    it('transitions to connected on connection_ok', () => {
      const { fsm } = createFsm();
      fsm.handle('connect');
      const mockConnection = { id: 'conn-1' };
      fsm.handle('connection_ok', mockConnection);
      expect(fsm.getState()).toBe('connected');
      expect(fsm.getConnection()).toBe(mockConnection);
    });

    it('calls onConnectionStarted callback on connected', () => {
      const onConnectionStarted = vi.fn();
      const { fsm } = createFsm({}, { onConnectionStarted });
      fsm.handle('connect');
      fsm.handle('connection_ok', { id: 'c1' });
      expect(onConnectionStarted).toHaveBeenCalledWith({ id: 'c1' });
    });
  });

  describe('connect failure: connecting -> disconnected', () => {
    it('transitions to disconnected on connection_failed from connecting', () => {
      const { fsm } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_failed', new Error('fail'));
      expect(fsm.getState()).toBe('disconnected');
    });
  });

  describe('reconnection flow: connected -> reconnect_wait -> reconnecting', () => {
    it('transitions to reconnect_wait on connection_failed from connected', () => {
      const { fsm } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_ok', {});
      fsm.handle('connection_failed');
      expect(fsm.getState()).toBe('reconnect_wait');
    });

    it('calls onConnectionFailed callback', () => {
      const onConnectionFailed = vi.fn();
      const { fsm } = createFsm({}, { onConnectionFailed });
      fsm.handle('connect');
      fsm.handle('connection_ok', {});
      fsm.handle('connection_failed');
      expect(onConnectionFailed).toHaveBeenCalledWith('connection failed');
    });

    it('schedules a reconnect timer in reconnect_wait', () => {
      vi.useFakeTimers();
      const { fsm, externals } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_ok', {});

      externals._connect.mockClear();
      fsm.handle('connection_failed');
      expect(fsm.getState()).toBe('reconnect_wait');

      vi.advanceTimersByTime(10000);
      expect(fsm.getState()).toBe('reconnecting');
      expect(externals._connect).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('transitions to connected after successful reconnect', () => {
      vi.useFakeTimers();
      const { fsm, externals } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_ok', {});
      fsm.handle('connection_failed');

      vi.advanceTimersByTime(10000);
      expect(fsm.getState()).toBe('reconnecting');

      const newConn = { id: 'reconnected' };
      fsm.handle('connection_ok', newConn);
      expect(fsm.getState()).toBe('connected');
      expect(fsm.getConnection()).toBe(newConn);
      expect(externals.reSubscribeAll).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('calls onConnectionFailed on reconnect failure and goes back to reconnect_wait', () => {
      vi.useFakeTimers();
      const onConnectionFailed = vi.fn();
      const { fsm } = createFsm({}, { onConnectionFailed });
      fsm.handle('connect');
      fsm.handle('connection_ok', {});
      fsm.handle('connection_failed');

      vi.advanceTimersByTime(10000);
      expect(fsm.getState()).toBe('reconnecting');

      fsm.handle('connection_failed', new Error('retry fail'));
      expect(fsm.getState()).toBe('reconnect_wait');
      expect(onConnectionFailed).toHaveBeenCalledWith(new Error('retry fail'));
      vi.useRealTimers();
    });
  });

  describe('disconnect flow', () => {
    it('transitions through disconnecting to disconnected (no connection)', () => {
      const { fsm } = createFsm();
      fsm.handle('connect');
      fsm.handle('disconnect');
      expect(fsm.getState()).toBe('disconnected');
    });

    it('transitions through disconnecting to disconnected (with connection)', async () => {
      const stopMock = vi.fn().mockResolvedValue(undefined);
      const { fsm } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_ok', { stop: stopMock });
      expect(fsm.getState()).toBe('connected');

      fsm.handle('disconnect');
      expect(fsm.getState()).toBe('disconnecting');

      await vi.waitFor(() => {
        expect(fsm.getState()).toBe('disconnected');
      });
      expect(stopMock).toHaveBeenCalled();
    });

    it('calls onDisconnected callback', async () => {
      const onDisconnected = vi.fn();
      const { fsm } = createFsm({}, { onDisconnected });
      fsm.handle('connect');
      fsm.handle('connection_ok', { stop: vi.fn().mockResolvedValue(undefined) });
      fsm.handle('disconnect');

      await vi.waitFor(() => {
        expect(fsm.getState()).toBe('disconnected');
      });
      expect(onDisconnected).toHaveBeenCalled();
    });

    it('calls unSubscribeAll on disconnect', () => {
      const { fsm, externals } = createFsm();
      fsm.handle('connect');
      fsm.handle('connection_ok', { stop: vi.fn().mockResolvedValue(undefined) });
      fsm.handle('disconnect');
      expect(externals.unSubscribeAll).toHaveBeenCalled();
    });
  });

  describe('transition events', () => {
    it('emits transition event on state change', () => {
      const { fsm } = createFsm();
      const listener = vi.fn();
      fsm.on('transition', listener);

      fsm.handle('connect');
      expect(listener).toHaveBeenCalledWith({
        fromState: 'disconnected',
        toState: 'connecting',
      });
    });

    it('supports removing event listeners with off()', () => {
      const { fsm } = createFsm();
      const listener = vi.fn();
      const subscription = fsm.on('transition', listener);

      subscription.off();
      fsm.handle('connect');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setEventCallbacks', () => {
    it('allows updating event callbacks', () => {
      const { fsm } = createFsm();
      const newCallback = vi.fn();
      fsm.setEventCallbacks({ onConnectionStarted: newCallback });
      fsm.handle('connect');
      fsm.handle('connection_ok', { id: 'c' });
      expect(newCallback).toHaveBeenCalled();
    });
  });

  describe('invalid actions', () => {
    it('ignores unknown actions silently', () => {
      const { fsm } = createFsm();
      expect(() => fsm.handle('unknown_action')).not.toThrow();
      expect(fsm.getState()).toBe('disconnected');
    });

    it('ignores connection_ok in disconnected state', () => {
      const { fsm } = createFsm();
      fsm.handle('connection_ok', {});
      expect(fsm.getState()).toBe('disconnected');
    });
  });
});
