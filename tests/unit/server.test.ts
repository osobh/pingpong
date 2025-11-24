import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/index.js';
import type { WelcomeEvent, AgentJoinedEvent, ServerEvent, ClientCommand } from '../../shared/protocol.js';

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
function receiveMessage(ws: WebSocket, debugLabel?: string): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const label = debugLabel ? ` [${debugLabel}]` : '';
      reject(new Error(`Timeout waiting for message${label}`));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());
      if (debugLabel) {
        console.log(`[${debugLabel}] Received:`, message.type);
      }
      resolve(message as ServerEvent);
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
function sendCommand(ws: WebSocket, command: ClientCommand): void {
  ws.send(JSON.stringify(command));
}

describe('WebSocket Server', () => {
  const BASE_PORT = 9876; // Base test port
  const TEST_TOPIC = 'Test Discussion Topic';
  let currentPort = BASE_PORT;
  let serverShutdown: (() => void) | undefined;

  // Increase timeout for WebSocket tests
  const TEST_TIMEOUT = 15000; // 15 seconds

  beforeEach(async () => {
    // Start fresh server for each test to avoid state interference
    currentPort++;
    serverShutdown = await startServer(currentPort, TEST_TOPIC);
    // Give server a moment to start
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Shutdown server after each test
    if (serverShutdown) {
      serverShutdown();
      serverShutdown = undefined;
    }
    // Give server a moment to fully shut down
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${currentPort}`);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should send WELCOME message when agent joins', async () => {
    const ws = new WebSocket(`ws://localhost:${currentPort}`);
    await waitForOpen(ws);

    const joinCommand: ClientCommand = {
      type: 'JOIN',
      agentId: 'test-agent-1',
      agentName: 'Test Agent',
      role: 'participant',
      timestamp: Date.now(),
    };

    sendCommand(ws, joinCommand);

    const welcome = (await receiveMessage(ws)) as WelcomeEvent;
    expect(welcome.type).toBe('WELCOME');
    expect(welcome.topic).toBe(TEST_TOPIC);
    expect(welcome.agentCount).toBe(1);

    ws.close();
  });

  it('should broadcast AGENT_JOINED to other agents', async () => {
    const ws1 = new WebSocket(`ws://localhost:${currentPort}`);
    const ws2 = new WebSocket(`ws://localhost:${currentPort}`);

    await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

    // First agent joins
    sendCommand(ws1, {
      type: 'JOIN',
      agentId: 'agent-1',
      agentName: 'Alice',
      role: 'architect',
      timestamp: Date.now(),
    });

    // Get WELCOME for first agent
    const welcome1 = await receiveMessage(ws1);
    expect(welcome1.type).toBe('WELCOME');

    // Second agent joins
    sendCommand(ws2, {
      type: 'JOIN',
      agentId: 'agent-2',
      agentName: 'Bob',
      role: 'critic',
      timestamp: Date.now(),
    });

    // First agent should receive AGENT_JOINED for Bob
    const agentJoined = (await receiveMessage(ws1)) as AgentJoinedEvent;
    expect(agentJoined.type).toBe('AGENT_JOINED');
    expect(agentJoined.agentName).toBe('Bob');
    expect(agentJoined.role).toBe('critic');

    ws1.close();
    ws2.close();
  });

  it(
    'should broadcast messages between agents',
    async () => {
      console.log('\n=== TEST: broadcast messages ===');
      const ws1 = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws1);
      console.log('WS1 opened');

      // First agent joins
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-msg-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });
      console.log('WS1 sent JOIN');

      const welcome1 = await receiveMessage(ws1, 'WS1-WELCOME');
      expect(welcome1.type).toBe('WELCOME');

      // Second agent joins
      const ws2 = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws2);
      console.log('WS2 opened');

      // Set up listeners for both sockets BEFORE sending
      const ws1AgentJoinedPromise = receiveMessage(ws1, 'WS1-AGENT_JOINED');
      const ws2WelcomePromise = receiveMessage(ws2, 'WS2-WELCOME');

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-msg-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });
      console.log('WS2 sent JOIN');

      // Now await both
      const [agentJoined, welcome2] = await Promise.all([ws1AgentJoinedPromise, ws2WelcomePromise]);
      expect(agentJoined.type).toBe('AGENT_JOINED');
      expect(welcome2.type).toBe('WELCOME');

      // Agent 1 sends message
      console.log('WS1 sending MESSAGE');
      sendCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-msg-1',
        content: 'Hello Bob!',
        timestamp: Date.now(),
      });

      // Agent 2 should receive the message
      console.log('Waiting for WS2 to receive MESSAGE...');
      const message = await receiveMessage(ws2, 'WS2-MESSAGE');
      expect(message.type).toBe('MESSAGE');
      if (message.type === 'MESSAGE') {
        expect(message.agentName).toBe('Alice');
        expect(message.content).toBe('Hello Bob!');
      }

      ws1.close();
      ws2.close();
      console.log('=== TEST END ===\n');
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle agent disconnect gracefully',
    async () => {
      console.log('\n=== TEST: agent disconnect ===');
      const ws1 = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws1);
      console.log('WS1 opened');

      // First agent joins
      sendCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-disc-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });
      console.log('WS1 sent JOIN');

      const welcome1 = await receiveMessage(ws1, 'WS1-WELCOME');
      expect(welcome1.type).toBe('WELCOME');

      // Second agent joins
      const ws2 = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws2);
      console.log('WS2 opened');

      // Set up listeners for both sockets BEFORE sending
      const ws1AgentJoinedPromise = receiveMessage(ws1, 'WS1-AGENT_JOINED');
      const ws2WelcomePromise = receiveMessage(ws2, 'WS2-WELCOME');

      sendCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-disc-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });
      console.log('WS2 sent JOIN');

      // Now await both
      const [agentJoined, welcome2] = await Promise.all([ws1AgentJoinedPromise, ws2WelcomePromise]);
      expect(agentJoined.type).toBe('AGENT_JOINED');
      expect(welcome2.type).toBe('WELCOME');

      // Agent 1 disconnects
      console.log('WS1 closing...');
      ws1.close();

      // Agent 2 should receive AGENT_LEFT
      console.log('Waiting for WS2 to receive AGENT_LEFT...');
      const agentLeft = await receiveMessage(ws2, 'WS2-AGENT_LEFT');
      expect(agentLeft.type).toBe('AGENT_LEFT');
      if (agentLeft.type === 'AGENT_LEFT') {
        expect(agentLeft.agentName).toBe('Alice');
      }

      ws2.close();
      console.log('=== TEST END ===\n');
    },
    TEST_TIMEOUT,
  );

  it('should send ERROR event for invalid messages', async () => {
    const ws = new WebSocket(`ws://localhost:${currentPort}`);
    await waitForOpen(ws);

    // Send invalid JSON
    ws.send('not valid json');

    const error = await receiveMessage(ws);
    expect(error.type).toBe('ERROR');

    ws.close();
  });

  it('should send ERROR event for invalid command schema', async () => {
    const ws = new WebSocket(`ws://localhost:${currentPort}`);
    await waitForOpen(ws);

    // Send valid JSON but invalid command
    ws.send(
      JSON.stringify({
        type: 'INVALID_TYPE',
        someField: 'value',
      }),
    );

    const error = await receiveMessage(ws);
    expect(error.type).toBe('ERROR');

    ws.close();
  });
});
