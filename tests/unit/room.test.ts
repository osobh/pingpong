import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { Room } from '../../server/room.js';
import type { ServerEvent, ClientCommand } from '../../shared/protocol.js';

/**
 * Helper to wait for WebSocket to be open
 */
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

/**
 * Helper to receive next message from WebSocket
 */
function receiveMessage(ws: WebSocket): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());
      resolve(message as ServerEvent);
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Helper to send command to WebSocket
 */
function sendCommand(ws: WebSocket, command: ClientCommand): void {
  ws.send(JSON.stringify(command));
}

describe('Room', () => {
  let room: Room;
  const roomId = 'test-room';
  const topic = 'Test discussion topic';

  beforeEach(() => {
    room = new Room(roomId, topic);
  });

  afterEach(() => {
    room.shutdown();
  });

  describe('Basic properties', () => {
    it('should have correct id and topic', () => {
      expect(room.id).toBe(roomId);
      expect(room.topic).toBe(topic);
    });

    it('should start with zero agents', () => {
      expect(room.agentCount).toBe(0);
    });
  });

  describe('Agent JOIN', () => {
    it('should handle agent join', async () => {
      // Create a mock WebSocket for testing
      const messages: string[] = [];
      const testWs = {
        send: (data: string) => messages.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const joinCommand: ClientCommand = {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      room.handleCommand(testWs, joinCommand);

      expect(room.agentCount).toBe(1);
      expect(messages.length).toBeGreaterThan(0);

      // Should have received WELCOME event
      const welcome = JSON.parse(messages[0]!);
      expect(welcome.type).toBe('WELCOME');
      expect(welcome.roomId).toBe(roomId);
      expect(welcome.topic).toBe(topic);
      expect(welcome.agentCount).toBe(1);
    });

    it('should broadcast AGENT_JOINED to all agents', () => {
      const messages1: string[] = [];
      const messages2: string[] = [];

      const ws1 = {
        send: (data: string) => messages1.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: (data: string) => messages2.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      // First agent joins
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      messages1.length = 0; // Clear WELCOME message

      // Second agent joins
      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      expect(room.agentCount).toBe(2);

      // First agent should have received AGENT_JOINED for Bob
      const agentJoined = JSON.parse(messages1[0]!);
      expect(agentJoined.type).toBe('AGENT_JOINED');
      expect(agentJoined.agentName).toBe('Bob');
      expect(agentJoined.role).toBe('critic');
    });

    it('should not allow duplicate agent IDs', () => {
      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      // First agent joins
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Try to join with same ID
      expect(() => {
        room.handleCommand(ws2, {
          type: 'JOIN',
          agentId: 'agent-1', // Same ID
          agentName: 'Bob',
          role: 'critic',
          timestamp: Date.now(),
        });
      }).toThrow();
    });
  });

  describe('MESSAGE broadcasting', () => {
    it('should broadcast message to all agents except sender', () => {
      const messages1: string[] = [];
      const messages2: string[] = [];
      const messages3: string[] = [];

      const ws1 = {
        send: (data: string) => messages1.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: (data: string) => messages2.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws3 = {
        send: (data: string) => messages3.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      // Join three agents
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      room.handleCommand(ws3, {
        type: 'JOIN',
        agentId: 'agent-3',
        agentName: 'Carol',
        role: 'pragmatist',
        timestamp: Date.now(),
      });

      // Clear join messages
      messages1.length = 0;
      messages2.length = 0;
      messages3.length = 0;

      // Agent 1 sends message
      room.handleCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-1',
        content: 'Hello everyone!',
        timestamp: Date.now(),
      });

      // Agent 1 should not receive their own message
      expect(messages1.length).toBe(0);

      // Agents 2 and 3 should receive the message
      expect(messages2.length).toBe(1);
      expect(messages3.length).toBe(1);

      const msg2 = JSON.parse(messages2[0]!);
      expect(msg2.type).toBe('MESSAGE');
      expect(msg2.agentName).toBe('Alice');
      expect(msg2.content).toBe('Hello everyone!');
    });

    it('should include agent metadata in broadcasted messages', () => {
      const messages: string[] = [];

      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: (data: string) => messages.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      // Join two agents
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      messages.length = 0;

      // Agent 1 sends message
      room.handleCommand(ws1, {
        type: 'MESSAGE',
        agentId: 'agent-1',
        content: 'Test message',
        timestamp: Date.now(),
      });

      const msg = JSON.parse(messages[0]!);
      expect(msg.agentId).toBe('agent-1');
      expect(msg.agentName).toBe('Alice');
      expect(msg.role).toBe('architect');
      expect(msg.content).toBe('Test message');
    });
  });

  describe('Agent LEAVE', () => {
    it('should handle agent leave', () => {
      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      expect(room.agentCount).toBe(1);

      room.handleCommand(ws1, {
        type: 'LEAVE',
        agentId: 'agent-1',
        timestamp: Date.now(),
      });

      expect(room.agentCount).toBe(0);
    });

    it('should broadcast AGENT_LEFT to remaining agents', () => {
      const messages: string[] = [];

      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: (data: string) => messages.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      // Two agents join
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      messages.length = 0;

      // Agent 1 leaves
      room.handleCommand(ws1, {
        type: 'LEAVE',
        agentId: 'agent-1',
        timestamp: Date.now(),
      });

      // Agent 2 should receive AGENT_LEFT notification
      expect(messages.length).toBe(1);
      const msg = JSON.parse(messages[0]!);
      expect(msg.type).toBe('AGENT_LEFT');
      expect(msg.agentName).toBe('Alice');
    });
  });

  describe('handleDisconnect', () => {
    it('should remove agent on disconnect', () => {
      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      expect(room.agentCount).toBe(1);

      room.handleDisconnect(ws1);

      expect(room.agentCount).toBe(0);
    });

    it('should notify other agents when an agent disconnects', () => {
      const messages: string[] = [];

      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      const ws2 = {
        send: (data: string) => messages.push(data),
        readyState: WebSocket.OPEN,
        close: () => {},
      } as unknown as WebSocket;

      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      messages.length = 0;

      room.handleDisconnect(ws1);

      expect(messages.length).toBe(1);
      const msg = JSON.parse(messages[0]!);
      expect(msg.type).toBe('AGENT_LEFT');
      expect(msg.agentName).toBe('Alice');
    });
  });

  describe('shutdown', () => {
    it('should close all agent connections', () => {
      const closed: boolean[] = [];

      const ws1 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => closed.push(true),
      } as unknown as WebSocket;

      const ws2 = {
        send: () => {},
        readyState: WebSocket.OPEN,
        close: () => closed.push(true),
      } as unknown as WebSocket;

      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      room.shutdown();

      expect(closed.length).toBe(2);
      expect(room.agentCount).toBe(0);
    });
  });
});
