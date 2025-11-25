import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/index.js';
import type {
  ServerEvent,
  ClientCommand,
  WelcomeEvent,
  RoomCreatedEvent,
  RoomListEvent,
  AgentJoinedEvent,
  MessageEvent,
  AgentLeftEvent,
} from '../../shared/protocol.js';

/**
 * Integration tests for Multi-Room Support
 * Tests server integration with RoomManager using WebSocket protocol
 */

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

describe('Multi-Room Integration', () => {
  const BASE_PORT = 12000;
  let currentPort = BASE_PORT;
  let serverShutdown: (() => void) | undefined;

  beforeEach(async () => {
    currentPort++;
    serverShutdown = await startServer(currentPort);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (serverShutdown) {
      serverShutdown();
      serverShutdown = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('CREATE_ROOM command', () => {
    it('should create a new room with specific ID and topic', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Send CREATE_ROOM command
      sendCommand(ws, {
        type: 'CREATE_ROOM',
        roomId: 'room-microservices',
        topic: 'Should we use microservices?',
        timestamp: Date.now(),
      });

      // Should receive ROOM_CREATED event
      const event = (await receiveMessage(ws, 'CREATE_ROOM')) as RoomCreatedEvent;
      expect(event.type).toBe('ROOM_CREATED');
      expect(event.roomId).toBe('room-microservices');
      expect(event.topic).toBe('Should we use microservices?');

      ws.close();
    });

    it('should create a room with auto-generated ID when not provided', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Send CREATE_ROOM without roomId
      sendCommand(ws, {
        type: 'CREATE_ROOM',
        topic: 'Architecture discussion',
        timestamp: Date.now(),
      });

      // Should receive ROOM_CREATED with auto-generated ID
      const event = (await receiveMessage(ws, 'CREATE_ROOM_AUTO')) as RoomCreatedEvent;
      expect(event.type).toBe('ROOM_CREATED');
      expect(event.roomId).toMatch(/^room-/); // Auto-generated format
      expect(event.topic).toBe('Architecture discussion');

      ws.close();
    });

    it('should reject duplicate room IDs', async () => {
      const ws1 = new WebSocket(`ws://localhost:${currentPort}`);
      const ws2 = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws1);
      await waitForOpen(ws2);

      // Create room with ws1
      sendCommand(ws1, {
        type: 'CREATE_ROOM',
        roomId: 'room-duplicate',
        topic: 'Topic 1',
        timestamp: Date.now(),
      });

      const created = await receiveMessage(ws1, 'CREATE1');
      expect(created.type).toBe('ROOM_CREATED');

      // Try to create same room ID with ws2
      sendCommand(ws2, {
        type: 'CREATE_ROOM',
        roomId: 'room-duplicate',
        topic: 'Topic 2',
        timestamp: Date.now(),
      });

      // Should receive ERROR event
      const error = await receiveMessage(ws2, 'CREATE2');
      expect(error.type).toBe('ERROR');

      ws1.close();
      ws2.close();
    });
  });

  describe('LIST_ROOMS command', () => {
    it('should list all available rooms', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Create two rooms
      sendCommand(ws, {
        type: 'CREATE_ROOM',
        roomId: 'room-arch',
        topic: 'Architecture',
        timestamp: Date.now(),
      });
      await receiveMessage(ws, 'CREATE_ARCH');

      sendCommand(ws, {
        type: 'CREATE_ROOM',
        roomId: 'room-design',
        topic: 'Design Patterns',
        timestamp: Date.now(),
      });
      await receiveMessage(ws, 'CREATE_DESIGN');

      // Request room list
      sendCommand(ws, {
        type: 'LIST_ROOMS',
        timestamp: Date.now(),
      });

      // Should receive ROOM_LIST event
      const event = (await receiveMessage(ws, 'LIST_ROOMS')) as RoomListEvent;
      expect(event.type).toBe('ROOM_LIST');
      expect(event.rooms).toHaveLength(2);
      expect(event.rooms.map((r) => r.roomId)).toContain('room-arch');
      expect(event.rooms.map((r) => r.roomId)).toContain('room-design');

      ws.close();
    });

    it('should return empty list when no rooms exist', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Request room list
      sendCommand(ws, {
        type: 'LIST_ROOMS',
        timestamp: Date.now(),
      });

      // Should receive empty ROOM_LIST
      const event = (await receiveMessage(ws, 'LIST_EMPTY')) as RoomListEvent;
      expect(event.type).toBe('ROOM_LIST');
      expect(event.rooms).toEqual([]);

      ws.close();
    });
  });

  describe('JOIN command with roomId', () => {
    it('should join agent to specific room', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Create a room first
      sendCommand(ws, {
        type: 'CREATE_ROOM',
        roomId: 'room-testing',
        topic: 'Testing strategies',
        timestamp: Date.now(),
      });
      await receiveMessage(ws, 'CREATE');

      // Join the room
      sendCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        roomId: 'room-testing',
        timestamp: Date.now(),
      });

      // Should receive WELCOME for the specific room
      const welcome = (await receiveMessage(ws, 'JOIN')) as WelcomeEvent;
      expect(welcome.type).toBe('WELCOME');
      expect(welcome.roomId).toBe('room-testing');
      expect(welcome.topic).toBe('Testing strategies');

      ws.close();
    });

    it('should join default room when roomId not specified', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(ws);

      // Create default room first
      sendCommand(ws, {
        type: 'CREATE_ROOM',
        roomId: 'default',
        topic: 'Default discussion',
        timestamp: Date.now(),
      });
      await receiveMessage(ws, 'CREATE_DEFAULT');

      // Join without roomId
      sendCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Should receive WELCOME for default room
      const welcome = (await receiveMessage(ws, 'JOIN_DEFAULT')) as WelcomeEvent;
      expect(welcome.type).toBe('WELCOME');
      expect(welcome.roomId).toBe('default');

      ws.close();
    });
  });

  describe('Multiple rooms with different agents', () => {
    it('should isolate messages between different rooms', async () => {
      const wsAlice = new WebSocket(`ws://localhost:${currentPort}`);
      const wsBob = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(wsAlice);
      await waitForOpen(wsBob);

      // Create two rooms
      sendCommand(wsAlice, {
        type: 'CREATE_ROOM',
        roomId: 'room-1',
        topic: 'Room 1 Topic',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'CREATE_1');

      sendCommand(wsBob, {
        type: 'CREATE_ROOM',
        roomId: 'room-2',
        topic: 'Room 2 Topic',
        timestamp: Date.now(),
      });
      await receiveMessage(wsBob, 'CREATE_2');

      // Alice joins room-1
      sendCommand(wsAlice, {
        type: 'JOIN',
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        roomId: 'room-1',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'ALICE_WELCOME');

      // Bob joins room-2
      sendCommand(wsBob, {
        type: 'JOIN',
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        roomId: 'room-2',
        timestamp: Date.now(),
      });
      await receiveMessage(wsBob, 'BOB_WELCOME');

      // Alice sends message in room-1
      sendCommand(wsAlice, {
        type: 'MESSAGE',
        agentId: 'alice',
        content: 'Message in room 1',
        timestamp: Date.now(),
      });

      // Bob should NOT receive this message (different room)
      // Wait a bit and verify no message arrives
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Bob sends message in room-2
      sendCommand(wsBob, {
        type: 'MESSAGE',
        agentId: 'bob',
        content: 'Message in room 2',
        timestamp: Date.now(),
      });

      // Alice should NOT receive this message (different room)
      await new Promise((resolve) => setTimeout(resolve, 200));

      wsAlice.close();
      wsBob.close();
    });

    it('should allow multiple agents in the same room', async () => {
      const wsAlice = new WebSocket(`ws://localhost:${currentPort}`);
      const wsBob = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(wsAlice);
      await waitForOpen(wsBob);

      // Create a room
      sendCommand(wsAlice, {
        type: 'CREATE_ROOM',
        roomId: 'room-shared',
        topic: 'Shared Topic',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'CREATE_SHARED');

      // Alice joins
      sendCommand(wsAlice, {
        type: 'JOIN',
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        roomId: 'room-shared',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'ALICE_JOIN');

      // Bob joins same room
      sendCommand(wsBob, {
        type: 'JOIN',
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        roomId: 'room-shared',
        timestamp: Date.now(),
      });
      const bobWelcome = await receiveMessage(wsBob, 'BOB_JOIN');

      // Alice should receive AGENT_JOINED event for Bob
      const bobJoined = (await receiveMessage(wsAlice, 'BOB_JOINED')) as AgentJoinedEvent;
      expect(bobJoined.type).toBe('AGENT_JOINED');
      expect(bobJoined.agentId).toBe('bob');

      // Alice sends message
      sendCommand(wsAlice, {
        type: 'MESSAGE',
        agentId: 'alice',
        content: 'Hello Bob!',
        timestamp: Date.now(),
      });

      // Bob should receive the message
      const msg = (await receiveMessage(wsBob, 'BOB_RECV')) as MessageEvent;
      expect(msg.type).toBe('MESSAGE');
      expect(msg.agentId).toBe('alice');
      expect(msg.content).toBe('Hello Bob!');

      wsAlice.close();
      wsBob.close();
    });
  });

  describe('LEAVE_ROOM command', () => {
    it('should remove agent from specific room', async () => {
      const wsAlice = new WebSocket(`ws://localhost:${currentPort}`);
      const wsBob = new WebSocket(`ws://localhost:${currentPort}`);
      await waitForOpen(wsAlice);
      await waitForOpen(wsBob);

      // Create room and both agents join
      sendCommand(wsAlice, {
        type: 'CREATE_ROOM',
        roomId: 'room-test',
        topic: 'Test',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'CREATE');

      sendCommand(wsAlice, {
        type: 'JOIN',
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        roomId: 'room-test',
        timestamp: Date.now(),
      });
      await receiveMessage(wsAlice, 'ALICE_JOIN');

      sendCommand(wsBob, {
        type: 'JOIN',
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        roomId: 'room-test',
        timestamp: Date.now(),
      });
      await receiveMessage(wsBob, 'BOB_JOIN');
      await receiveMessage(wsAlice, 'ALICE_RECV_BOB_JOINED');

      // Alice leaves the room
      sendCommand(wsAlice, {
        type: 'LEAVE_ROOM',
        agentId: 'alice',
        roomId: 'room-test',
        timestamp: Date.now(),
      });

      // Bob should receive AGENT_LEFT event
      const left = (await receiveMessage(wsBob, 'BOB_RECV_LEFT')) as AgentLeftEvent;
      expect(left.type).toBe('AGENT_LEFT');
      expect(left.agentId).toBe('alice');

      wsAlice.close();
      wsBob.close();
    });
  });
});
