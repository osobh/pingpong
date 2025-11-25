/**
 * Integration tests for RedisMessageBus with real Redis
 *
 * IMPORTANT: These tests require a running Redis instance on localhost:6379
 *
 * To run these tests:
 * 1. Start Redis: docker run -d -p 6379:6379 redis
 * 2. Run tests: npm test -- tests/integration/redis-multi-server.test.ts
 *
 * Tests will be skipped if Redis is not available
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/index.js';
import { RedisMessageBus } from '../../shared/message-bus.js';
import type { WelcomeEvent, MessageEvent } from '../../shared/protocol.js';

/**
 * Helper to check if Redis is available
 */
async function isRedisAvailable(): Promise<boolean> {
  try {
    const testBus = new RedisMessageBus('redis://localhost:6379', 'test-ping');
    await testBus.connect();
    await testBus.disconnect();
    return true;
  } catch (error) {
    return false;
  }
}

// Check Redis availability before running tests
const redisAvailable = await isRedisAvailable();

if (!redisAvailable) {
  console.log('\n⚠️  Redis integration tests SKIPPED - Redis not available on localhost:6379');
  console.log('To run these tests: docker run -d -p 6379:6379 redis\n');
}

/**
 * Helper to wait for WebSocket to be open
 */
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for WebSocket to open'));
    }, 5000);
    ws.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Helper to receive next message from WebSocket
 */
function receiveMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());
      resolve(message);
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Helper to send command
 */
function sendCommand(ws: WebSocket, command: any): void {
  ws.send(JSON.stringify(command));
}

describe.skipIf(!redisAvailable)('Redis Multi-Server Communication', () => {
  const PORT_1 = 13001;
  const PORT_2 = 13002;
  const REDIS_URL = 'redis://localhost:6379';
  const TOPIC = 'Redis cross-server test topic';
  const TEST_TIMEOUT = 30000; // 30 seconds

  let server1Shutdown: (() => Promise<void>) | undefined;
  let server2Shutdown: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    console.log('✅ Redis available - running integration tests');

    // Start two servers with Redis message bus
    server1Shutdown = await startServer(PORT_1, TOPIC, {
      redisUrl: REDIS_URL,
      serverId: 'redis-server-1',
    });

    server2Shutdown = await startServer(PORT_2, TOPIC, {
      redisUrl: REDIS_URL,
      serverId: 'redis-server-2',
    });

    // Give servers time to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, 30000); // 30 second timeout for beforeAll

  afterAll(async () => {

    if (server1Shutdown) {
      await server1Shutdown();
    }
    if (server2Shutdown) {
      await server2Shutdown();
    }

    // Give servers time to shut down
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it(
    'should allow agents to connect to different servers via Redis',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Agent 1 joins server 1
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'redis-agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      const welcome1 = (await receiveMessage(ws1)) as WelcomeEvent;
      expect(welcome1.type).toBe('WELCOME');
      expect(welcome1.roomId).toBe('default');

      // Agent 2 joins server 2
      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'redis-agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      const welcome2 = (await receiveMessage(ws2)) as WelcomeEvent;
      expect(welcome2.type).toBe('WELCOME');
      expect(welcome2.roomId).toBe('default');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should deliver messages from server 1 to agents on server 2 via Redis',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'redis-msg-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'redis-msg-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME

      // Agent 1 sends message
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'redis-msg-1',
        content: 'Hello from server 1 via Redis!',
        timestamp: Date.now(),
      });

      // Agent 2 should receive the message via Redis
      const message = (await receiveMessage(ws2)) as MessageEvent;
      expect(message.type).toBe('MESSAGE');
      expect(message.agentName).toBe('Alice');
      expect(message.content).toBe('Hello from server 1 via Redis!');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should deliver messages from server 2 to agents on server 1 via Redis',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'redis-reverse-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'redis-reverse-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME

      // Agent 2 sends message
      sendCommand(ws2, {
        type: 'MESSAGE',
        agentId: 'redis-reverse-2',
        content: 'Hello from server 2 via Redis!',
        timestamp: Date.now(),
      });

      // Agent 1 should receive the message via Redis
      const message = (await receiveMessage(ws1)) as MessageEvent;
      expect(message.type).toBe('MESSAGE');
      expect(message.agentName).toBe('Bob');
      expect(message.content).toBe('Hello from server 2 via Redis!');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should support bidirectional conversation between servers via Redis',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'redis-bidir-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'redis-bidir-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME

      // Alice sends first message
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'redis-bidir-1',
        content: 'First message from Alice via Redis',
        timestamp: Date.now(),
      });

      const msg1 = (await receiveMessage(ws2)) as MessageEvent;
      expect(msg1.content).toBe('First message from Alice via Redis');

      // Bob responds
      sendCommand(ws2, {
        type: 'MESSAGE',
        agentId: 'redis-bidir-2',
        content: 'Reply from Bob via Redis',
        timestamp: Date.now(),
      });

      const msg2 = (await receiveMessage(ws1)) as MessageEvent;
      expect(msg2.content).toBe('Reply from Bob via Redis');

      // Alice responds again
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'redis-bidir-1',
        content: 'Second message from Alice via Redis',
        timestamp: Date.now(),
      });

      const msg3 = (await receiveMessage(ws2)) as MessageEvent;
      expect(msg3.content).toBe('Second message from Alice via Redis');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should not echo messages back to sender on same server (Redis)',
    async () => {
      const ws1a = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws1b = new WebSocket(`ws://localhost:${PORT_1}`);

      await Promise.all([waitForOpen(ws1a), waitForOpen(ws1b)]);

      // Two agents join same server
      sendCommand(ws1a, {
        type: 'JOIN',
        agentId: 'redis-echo-1a',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1a); // WELCOME

      sendCommand(ws1b, {
        type: 'JOIN',
        agentId: 'redis-echo-1b',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1b); // WELCOME
      await receiveMessage(ws1a); // AGENT_JOINED

      // Alice sends message
      sendCommand(ws1a, {
        type: 'MESSAGE',
        agentId: 'redis-echo-1a',
        content: 'Test Redis echo filtering',
        timestamp: Date.now(),
      });

      // Bob should receive it
      const message = (await receiveMessage(ws1b)) as MessageEvent;
      expect(message.content).toBe('Test Redis echo filtering');

      // Alice should NOT receive her own message back
      // Wait a bit to ensure no echo
      await new Promise((resolve) => setTimeout(resolve, 100));

      ws1a.close();
      ws1b.close();
    },
    TEST_TIMEOUT,
  );
});
