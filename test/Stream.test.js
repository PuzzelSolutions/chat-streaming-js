import { describe, it, expect, vi } from 'vitest';
import { Stream } from '../src/Stream';

function mockConnection() {
  return {
    stream: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    invoke: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSub(topic, overrides = {}) {
  return {
    options: {
      topicProperty: 'topic',
      getMethod: 'Get',
      getReverseMethod: 'GetReverse',
      streamMethod: 'Subscribe',
    },
    topic,
    extraProps: {},
    ...overrides,
  };
}

describe('Stream', () => {
  describe('get', () => {
    it('calls connection.stream with correct method and args', () => {
      const conn = mockConnection();
      const sub = makeSub('my-topic');
      Stream.get(conn, sub, 5);

      expect(conn.stream).toHaveBeenCalledWith('Get', {
        type: undefined,
        topic: 'my-topic',
        skip: 4,
      });
    });

    it('parses type::topic format', () => {
      const conn = mockConnection();
      const sub = makeSub('myType::my-topic');
      Stream.get(conn, sub, 1);

      expect(conn.stream).toHaveBeenCalledWith('Get', {
        type: 'myType',
        topic: 'my-topic',
        skip: undefined,
      });
    });

    it('uses custom getMethod from options', () => {
      const conn = mockConnection();
      const sub = makeSub('t', { options: { ...makeSub('t').options, getMethod: 'CustomGet' } });
      Stream.get(conn, sub, 1);
      expect(conn.stream).toHaveBeenCalledWith('CustomGet', expect.any(Object));
    });

    it('spreads extraProps into the call', () => {
      const conn = mockConnection();
      const sub = makeSub('t', { extraProps: { filter: 'all' } });
      Stream.get(conn, sub, 1);
      expect(conn.stream).toHaveBeenCalledWith('Get', expect.objectContaining({ filter: 'all' }));
    });
  });

  describe('getReverse', () => {
    it('calls connection.stream with GetReverse method', () => {
      const conn = mockConnection();
      const sub = makeSub('topic');
      Stream.getReverse(conn, sub, 10, 0);
      expect(conn.stream).toHaveBeenCalledWith('GetReverse', expect.objectContaining({
        topic: 'topic',
        take: 10,
      }));
    });
  });

  describe('stream', () => {
    it('calls connection.stream with Subscribe method', () => {
      const conn = mockConnection();
      const sub = makeSub('my-topic');
      Stream.stream(conn, sub, 5);
      expect(conn.stream).toHaveBeenCalledWith('Subscribe', expect.objectContaining({
        topic: 'my-topic',
        skip: 4,
      }));
    });

    it('uses custom streamMethod', () => {
      const conn = mockConnection();
      const sub = makeSub('t', { options: { ...makeSub('t').options, streamMethod: 'CustomSub' } });
      Stream.stream(conn, sub, 1);
      expect(conn.stream).toHaveBeenCalledWith('CustomSub', expect.any(Object));
    });
  });

  describe('publish', () => {
    it('calls connection.invoke with Publish method', () => {
      const conn = mockConnection();
      Stream.publish(conn, 'my-topic', { msg: 'hello' }, { publishMethod: 'Publish' });
      expect(conn.invoke).toHaveBeenCalledWith('Publish', {
        topic: 'my-topic',
        data: { msg: 'hello' },
      });
    });

    it('uses custom publishMethod from options', () => {
      const conn = mockConnection();
      Stream.publish(conn, 'topic', {}, { publishMethod: 'CustomPublish' });
      expect(conn.invoke).toHaveBeenCalledWith('CustomPublish', expect.any(Object));
    });

    it('spreads extraProps into the invoke call', () => {
      const conn = mockConnection();
      Stream.publish(conn, 'topic', {}, { publishMethod: 'Publish' }, { correlationId: '123' });
      expect(conn.invoke).toHaveBeenCalledWith('Publish', expect.objectContaining({
        correlationId: '123',
      }));
    });
  });
});
