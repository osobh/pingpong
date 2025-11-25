import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMessageBus, type BusMessage } from '../../shared/message-bus.js';

/**
 * Test suite for MessageBus implementations
 * Tests the pub/sub abstraction for cross-project communication
 */
describe('InMemoryMessageBus', () => {
  let bus: InMemoryMessageBus;

  beforeEach(() => {
    bus = new InMemoryMessageBus();
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      await bus.connect();
      expect(bus.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await bus.connect();
      await bus.disconnect();
      expect(bus.isConnected()).toBe(false);
    });

    it('should handle multiple connect calls', async () => {
      await bus.connect();
      await bus.connect();
      expect(bus.isConnected()).toBe(true);
    });

    it('should handle disconnect before connect', async () => {
      await bus.disconnect();
      expect(bus.isConnected()).toBe(false);
    });
  });

  describe('Publishing and Subscribing', () => {
    beforeEach(async () => {
      await bus.connect();
    });

    it('should deliver published message to subscriber', async () => {
      const messages: BusMessage[] = [];

      bus.subscribe((msg) => {
        messages.push(msg);
      });

      const testMessage: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Test message',
          timestamp: Date.now(),
        },
      };

      await bus.publish(testMessage);

      // Wait for async delivery
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(testMessage);
    });

    it('should deliver message to multiple subscribers', async () => {
      const messages1: BusMessage[] = [];
      const messages2: BusMessage[] = [];
      const messages3: BusMessage[] = [];

      bus.subscribe((msg) => messages1.push(msg));
      bus.subscribe((msg) => messages2.push(msg));
      bus.subscribe((msg) => messages3.push(msg));

      const testMessage: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Test message',
          timestamp: Date.now(),
        },
      };

      await bus.publish(testMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      expect(messages3).toHaveLength(1);

      expect(messages1[0]).toEqual(testMessage);
      expect(messages2[0]).toEqual(testMessage);
      expect(messages3[0]).toEqual(testMessage);
    });

    it('should not deliver messages after unsubscribe', async () => {
      const messages: BusMessage[] = [];

      const unsubscribe = bus.subscribe((msg) => {
        messages.push(msg);
      });

      const message1: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Message 1',
          timestamp: Date.now(),
        },
      };

      await bus.publish(message1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages).toHaveLength(1);

      // Unsubscribe
      unsubscribe();

      const message2: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-2',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Message 2',
          timestamp: Date.now(),
        },
      };

      await bus.publish(message2);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still only have 1 message
      expect(messages).toHaveLength(1);
    });

    it('should handle publishing multiple messages', async () => {
      const messages: BusMessage[] = [];

      bus.subscribe((msg) => {
        messages.push(msg);
      });

      for (let i = 0; i < 5; i++) {
        await bus.publish({
          serverId: 'server-1',
          messageId: `msg-${i}`,
          timestamp: Date.now(),
          payload: {
            type: 'MESSAGE',
            agentId: 'agent-1',
            agentName: 'Alice',
            role: 'architect',
            content: `Message ${i}`,
            timestamp: Date.now(),
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(messages).toHaveLength(5);
    });

    it('should not deliver messages when disconnected', async () => {
      const messages: BusMessage[] = [];

      bus.subscribe((msg) => {
        messages.push(msg);
      });

      await bus.disconnect();

      const testMessage: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Test message',
          timestamp: Date.now(),
        },
      };

      await bus.publish(testMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await bus.connect();
    });

    it('should handle subscriber throwing error', async () => {
      const messages: BusMessage[] = [];

      // Subscriber that throws
      bus.subscribe(() => {
        throw new Error('Subscriber error');
      });

      // Subscriber that works
      bus.subscribe((msg) => {
        messages.push(msg);
      });

      const testMessage: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Test message',
          timestamp: Date.now(),
        },
      };

      await bus.publish(testMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second subscriber should still receive message
      expect(messages).toHaveLength(1);
    });
  });

  describe('Message Format', () => {
    beforeEach(async () => {
      await bus.connect();
    });

    it('should preserve message payload', async () => {
      const messages: BusMessage[] = [];

      bus.subscribe((msg) => {
        messages.push(msg);
      });

      const complexPayload = {
        type: 'MESSAGE' as const,
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect' as const,
        content: 'Test with special chars: émojis 🎉, quotes "test"',
        timestamp: Date.now(),
        metadata: {
          custom: 'field',
          nested: {
            value: 123,
          },
        },
      };

      await bus.publish({
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: complexPayload,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages[0].payload).toEqual(complexPayload);
    });
  });

  describe('Multiple Buses', () => {
    it('should isolate messages between separate bus instances', async () => {
      const bus1 = new InMemoryMessageBus();
      const bus2 = new InMemoryMessageBus();

      await bus1.connect();
      await bus2.connect();

      const messages1: BusMessage[] = [];
      const messages2: BusMessage[] = [];

      bus1.subscribe((msg) => messages1.push(msg));
      bus2.subscribe((msg) => messages2.push(msg));

      const testMessage: BusMessage = {
        serverId: 'server-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        payload: {
          type: 'MESSAGE',
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'Test message',
          timestamp: Date.now(),
        },
      };

      // Publish to bus1
      await bus1.publish(testMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Only bus1 subscribers should receive
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(0);

      await bus1.disconnect();
      await bus2.disconnect();
    });
  });
});

/**
 * Note: RedisMessageBus unit tests were omitted due to mocking complexity.
 * RedisMessageBus is thoroughly tested with real Redis in integration tests:
 * tests/integration/redis-multi-server.test.ts (5 tests)
 */
