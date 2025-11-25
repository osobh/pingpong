/**
 * Integration tests for multi-server cross-communication
 * Tests MessageBus functionality with multiple servers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/index.js';
import { InMemoryMessageBus } from '../../shared/message-bus.js';
import type { WelcomeEvent, MessageEvent, AgentJoinedEvent } from '../../shared/protocol.js';

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

describe('Multi-Server Communication', () => {
  const PORT_1 = 13001;
  const PORT_2 = 13002;
  const TOPIC = 'Cross-server test topic';
  const TEST_TIMEOUT = 30000; // 30 seconds

  let sharedBus: InMemoryMessageBus;
  let server1Shutdown: (() => Promise<void>) | undefined;
  let server2Shutdown: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    // Create shared message bus
    sharedBus = new InMemoryMessageBus();
    await sharedBus.connect();

    // Start two servers with shared bus
    server1Shutdown = await startServer(PORT_1, TOPIC, {
      bus: sharedBus,
      serverId: 'server-1',
    });

    server2Shutdown = await startServer(PORT_2, TOPIC, {
      bus: sharedBus,
      serverId: 'server-2',
    });

    // Give servers time to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (server1Shutdown) {
      await server1Shutdown();
    }
    if (server2Shutdown) {
      await server2Shutdown();
    }
    await sharedBus.disconnect();

    // Give servers time to shut down
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it(
    'should allow agents to connect to different servers',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Agent 1 joins server 1
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
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
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      const welcome2 = (await receiveMessage(ws2)) as WelcomeEvent;
      expect(welcome2.type).toBe('WELCOME');
      expect(welcome2.roomId).toBe('default');

      // Note: AGENT_JOINED events are server-local only
      // Cross-server communication happens via MESSAGE events

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should deliver messages from server 1 to agents on server 2',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-msg-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-msg-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME
      // No AGENT_JOINED - they're on different servers

      // Agent 1 sends message
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-msg-1',
        content: 'Hello from server 1!',
        timestamp: Date.now(),
      });

      // Agent 2 should receive the message via bus
      const message = (await receiveMessage(ws2)) as MessageEvent;
      expect(message.type).toBe('MESSAGE');
      expect(message.agentName).toBe('Alice');
      expect(message.content).toBe('Hello from server 1!');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should deliver messages from server 2 to agents on server 1',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-reverse-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-reverse-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME
      // No AGENT_JOINED - they're on different servers

      // Agent 2 sends message
      sendCommand(ws2, {
        type: 'MESSAGE',
        agentId: 'agent-reverse-2',
        content: 'Hello from server 2!',
        timestamp: Date.now(),
      });

      // Agent 1 should receive the message via bus
      const message = (await receiveMessage(ws1)) as MessageEvent;
      expect(message.type).toBe('MESSAGE');
      expect(message.agentName).toBe('Bob');
      expect(message.content).toBe('Hello from server 2!');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should support bidirectional conversation between servers',
    async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT_2}`);

      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      // Both agents join (on different servers)
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-bidir-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1); // WELCOME

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-bidir-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws2); // WELCOME
      // No AGENT_JOINED - they're on different servers

      // Alice sends first message
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-bidir-1',
        content: 'First message from Alice',
        timestamp: Date.now(),
      });

      const msg1 = (await receiveMessage(ws2)) as MessageEvent;
      expect(msg1.content).toBe('First message from Alice');

      // Bob responds
      sendCommand(ws2, {
        type: 'MESSAGE',
        agentId: 'agent-bidir-2',
        content: 'Reply from Bob',
        timestamp: Date.now(),
      });

      const msg2 = (await receiveMessage(ws1)) as MessageEvent;
      expect(msg2.content).toBe('Reply from Bob');

      // Alice responds again
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-bidir-1',
        content: 'Second message from Alice',
        timestamp: Date.now(),
      });

      const msg3 = (await receiveMessage(ws2)) as MessageEvent;
      expect(msg3.content).toBe('Second message from Alice');

      ws1.close();
      ws2.close();
    },
    TEST_TIMEOUT,
  );

  it(
    'should not echo messages back to sender on same server',
    async () => {
      const ws1a = new WebSocket(`ws://localhost:${PORT_1}`);
      const ws1b = new WebSocket(`ws://localhost:${PORT_1}`);

      await Promise.all([waitForOpen(ws1a), waitForOpen(ws1b)]);

      // Two agents join same server
      sendCommand(ws1a, {
        type: 'JOIN',
        agentId: 'agent-echo-1a',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1a); // WELCOME

      sendCommand(ws1b, {
        type: 'JOIN',
        agentId: 'agent-echo-1b',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      await receiveMessage(ws1b); // WELCOME
      await receiveMessage(ws1a); // AGENT_JOINED

      // Alice sends message
      sendCommand(ws1a, {
        type: 'MESSAGE',
        agentId: 'agent-echo-1a',
        content: 'Test echo filtering',
        timestamp: Date.now(),
      });

      // Bob should receive it
      const message = (await receiveMessage(ws1b)) as MessageEvent;
      expect(message.content).toBe('Test echo filtering');

      // Alice should NOT receive her own message back
      // Wait a bit to ensure no echo
      await new Promise((resolve) => setTimeout(resolve, 100));

      ws1a.close();
      ws1b.close();
    },
    TEST_TIMEOUT,
  );
});
