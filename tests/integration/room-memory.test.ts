/**
 * Integration Tests for Room Memory System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Room } from '../../server/room.js';
import { WebSocket } from 'ws';

describe('Room Memory Integration', () => {
  let room: Room;
  const roomId = 'memory-test-room';
  const topic = 'Memory System Testing';

  beforeEach(() => {
    room = new Room(roomId, topic, 'deep', undefined, undefined, undefined, ':memory:');
  });

  afterEach(() => {
    room.shutdown();
  });

  // Helper to create mock WebSocket
  const createMockWs = (): { ws: WebSocket; messages: string[] } => {
    const messages: string[] = [];
    const ws = {
      send: (data: string) => messages.push(data),
      readyState: WebSocket.OPEN,
      close: () => {},
    } as unknown as WebSocket;
    return { ws, messages };
  };

  describe('Memory Recording', () => {
    it('should record memory and broadcast to all agents', () => {
      const { ws: ws1, messages: messages1 } = createMockWs();
      const { ws: ws2, messages: messages2 } = createMockWs();

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

      messages1.length = 0;
      messages2.length = 0;

      // Record memory
      room.handleCommand(ws1, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        content: 'We decided to use PostgreSQL for the database',
        context: 'Database selection discussion',
        priority: 'high',
        tags: ['database', 'architecture'],
        timestamp: Date.now(),
      });

      // Both agents should receive MEMORY_RECORDED event
      expect(messages1.length).toBeGreaterThan(0);
      expect(messages2.length).toBeGreaterThan(0);

      const event1 = JSON.parse(messages1[0]);
      expect(event1.type).toBe('MEMORY_RECORDED');
      expect(event1.memoryType).toBe('decision');
      expect(event1.content).toBe('We decided to use PostgreSQL for the database');
    });
  });

  describe('Memory Querying', () => {
    it('should query memories and return results', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record some memories first
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        content: 'Decision 1',
        tags: ['test'],
        timestamp: Date.now(),
      });

      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'insight',
        content: 'Insight 1',
        tags: ['test'],
        timestamp: Date.now(),
      });

      messages.length = 0;

      // Query memories
      room.handleCommand(ws, {
        type: 'QUERY_MEMORY',
        agentId: 'agent-1',
        limit: 10,
        timestamp: Date.now(),
      });

      expect(messages.length).toBe(1);
      const result = JSON.parse(messages[0]);
      expect(result.type).toBe('MEMORY_QUERY_RESULT');
      expect(result.memories).toBeDefined();
      expect(result.memories.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter memories by type', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record different types
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        content: 'Decision 1',
        tags: [],
        timestamp: Date.now(),
      });

      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'insight',
        content: 'Insight 1',
        tags: [],
        timestamp: Date.now(),
      });

      messages.length = 0;

      // Query only decisions
      room.handleCommand(ws, {
        type: 'QUERY_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        timestamp: Date.now(),
      });

      const result = JSON.parse(messages[0]);
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].memoryType).toBe('decision');
    });
  });

  describe('Memory Updates', () => {
    it('should update memory and broadcast changes', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record memory
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'action_item',
        content: 'Write tests',
        priority: 'medium',
        tags: ['testing'],
        timestamp: Date.now(),
      });

      const recordEvent = JSON.parse(messages[messages.length - 1]);
      const memoryId = recordEvent.memoryId;

      messages.length = 0;

      // Update memory
      room.handleCommand(ws, {
        type: 'UPDATE_MEMORY',
        agentId: 'agent-1',
        memoryId: memoryId,
        priority: 'high',
        tags: ['testing', 'urgent'],
        timestamp: Date.now(),
      });

      expect(messages.length).toBe(1);
      const updateEvent = JSON.parse(messages[0]);
      expect(updateEvent.type).toBe('MEMORY_UPDATED');
      expect(updateEvent.memoryId).toBe(memoryId);
      expect(updateEvent.changes.priority).toBe('high');
    });
  });

  describe('Memory Deletion', () => {
    it('should delete memory and broadcast event', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record memory
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        content: 'To be deleted',
        tags: [],
        timestamp: Date.now(),
      });

      const recordEvent = JSON.parse(messages[messages.length - 1]);
      const memoryId = recordEvent.memoryId;

      messages.length = 0;

      // Delete memory
      room.handleCommand(ws, {
        type: 'DELETE_MEMORY',
        agentId: 'agent-1',
        memoryId: memoryId,
        timestamp: Date.now(),
      });

      expect(messages.length).toBe(1);
      const deleteEvent = JSON.parse(messages[0]);
      expect(deleteEvent.type).toBe('MEMORY_DELETED');
      expect(deleteEvent.memoryId).toBe(memoryId);
    });
  });

  describe('Memory Lifecycle', () => {
    it('should archive memory', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record memory
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'insight',
        content: 'Old insight',
        tags: [],
        timestamp: Date.now(),
      });

      const recordEvent = JSON.parse(messages[messages.length - 1]);
      const memoryId = recordEvent.memoryId;

      messages.length = 0;

      // Archive memory
      room.handleCommand(ws, {
        type: 'ARCHIVE_MEMORY',
        agentId: 'agent-1',
        memoryId: memoryId,
        timestamp: Date.now(),
      });

      expect(messages.length).toBe(1);
      const archiveEvent = JSON.parse(messages[0]);
      expect(archiveEvent.type).toBe('MEMORY_UPDATED');
      expect(archiveEvent.changes.status).toBe('archived');
    });

    it('should resolve memory', () => {
      const { ws, messages } = createMockWs();

      room.handleCommand(ws, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      // Record memory
      room.handleCommand(ws, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'question',
        content: 'How do we handle auth?',
        priority: 'high',
        tags: ['security'],
        timestamp: Date.now(),
      });

      const recordEvent = JSON.parse(messages[messages.length - 1]);
      const memoryId = recordEvent.memoryId;

      messages.length = 0;

      // Resolve memory
      room.handleCommand(ws, {
        type: 'RESOLVE_MEMORY',
        agentId: 'agent-1',
        memoryId: memoryId,
        timestamp: Date.now(),
      });

      expect(messages.length).toBe(1);
      const resolveEvent = JSON.parse(messages[0]);
      expect(resolveEvent.type).toBe('MEMORY_UPDATED');
      expect(resolveEvent.changes.status).toBe('resolved');
    });
  });

  describe('Memory Injection', () => {
    it('should include memories in WELCOME event', () => {
      const { ws: ws1, messages: messages1 } = createMockWs();
      const { ws: ws2, messages: messages2 } = createMockWs();

      // First agent joins and records a memory
      room.handleCommand(ws1, {
        type: 'JOIN',
        agentId: 'agent-1',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      });

      room.handleCommand(ws1, {
        type: 'RECORD_MEMORY',
        agentId: 'agent-1',
        memoryType: 'decision',
        content: 'Important decision',
        priority: 'high',
        tags: ['important'],
        timestamp: Date.now(),
      });

      // Second agent joins
      room.handleCommand(ws2, {
        type: 'JOIN',
        agentId: 'agent-2',
        agentName: 'Bob',
        role: 'critic',
        timestamp: Date.now(),
      });

      // Check WELCOME event for second agent
      const welcomeEvent = JSON.parse(messages2[0]);
      expect(welcomeEvent.type).toBe('WELCOME');
      expect(welcomeEvent.memories).toBeDefined();
      expect(welcomeEvent.memories.length).toBeGreaterThan(0);
      expect(welcomeEvent.memories[0].content).toBe('Important decision');
    });
  });
});
