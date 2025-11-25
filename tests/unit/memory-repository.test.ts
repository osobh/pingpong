/**
 * Unit Tests for MemoryRepository
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRepository } from '../../server/memory-repository.js';
import {
  MemoryType,
  MemorySource,
  MemoryStatus,
  MemoryPriority,
} from '../../shared/room-memory.js';

describe('MemoryRepository', () => {
  let repository: MemoryRepository;
  const testDbPath = ':memory:'; // SQLite in-memory database
  const testRoomId = 'test-room-1';

  beforeEach(() => {
    repository = new MemoryRepository(testDbPath);
  });

  afterEach(() => {
    repository.close();
  });

  describe('CRUD Operations', () => {
    it('should create a memory entry', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.HIGH,
        content: 'We decided to use microservices',
        tags: ['architecture', 'decision'],
        createdBy: 'agent-1',
      });

      expect(memory.id).toBeDefined();
      expect(memory.type).toBe(MemoryType.DECISION);
      expect(memory.content).toBe('We decided to use microservices');
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
    });

    it('should retrieve memory by ID', () => {
      const created = repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.AUTOMATIC,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Performance is critical for this system',
        tags: ['performance'],
        createdBy: 'system',
      });

      const retrieved = repository.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.content).toBe(created.content);
    });

    it('should return null for non-existent memory', () => {
      const retrieved = repository.get('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should update memory entry', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.QUESTION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.LOW,
        content: 'How should we handle errors?',
        tags: ['question'],
        createdBy: 'agent-2',
      });

      const updated = repository.update(memory.id, {
        content: 'How should we handle network errors specifically?',
        priority: MemoryPriority.HIGH,
        tags: ['question', 'networking', 'error-handling'],
      });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe('How should we handle network errors specifically?');
      expect(updated!.priority).toBe(MemoryPriority.HIGH);
      expect(updated!.tags).toContain('networking');
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(memory.updatedAt);
    });

    it('should return null when updating non-existent memory', () => {
      const updated = repository.update('non-existent-id', {
        content: 'Updated content',
      });
      expect(updated).toBeNull();
    });

    it('should delete memory entry', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.ACTION_ITEM,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Write unit tests',
        tags: ['testing'],
        createdBy: 'agent-1',
      });

      const deleted = repository.delete(memory.id);
      expect(deleted).toBe(true);

      const retrieved = repository.get(memory.id);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent memory', () => {
      const deleted = repository.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Query Operations', () => {
    beforeEach(() => {
      // Create test data
      repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.HIGH,
        content: 'Decision 1',
        tags: ['arch'],
        createdBy: 'agent-1',
      });

      repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.AUTOMATIC,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Insight 1',
        tags: ['perf'],
        createdBy: 'system',
      });

      repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ARCHIVED,
        priority: MemoryPriority.LOW,
        content: 'Old decision',
        tags: ['deprecated'],
        createdBy: 'agent-1',
      });
    });

    it('should query memories by type', () => {
      const decisions = repository.query({
        roomId: testRoomId,
        type: MemoryType.DECISION,
      });

      expect(decisions.length).toBe(2);
      expect(decisions.every(m => m.type === MemoryType.DECISION)).toBe(true);
    });

    it('should query memories by status', () => {
      const active = repository.query({
        roomId: testRoomId,
        status: MemoryStatus.ACTIVE,
      });

      expect(active.length).toBe(2);
      expect(active.every(m => m.status === MemoryStatus.ACTIVE)).toBe(true);
    });

    it('should query memories by priority', () => {
      const highPriority = repository.query({
        roomId: testRoomId,
        priority: MemoryPriority.HIGH,
      });

      expect(highPriority.length).toBe(1);
      expect(highPriority[0].priority).toBe(MemoryPriority.HIGH);
    });

    it('should search memories by content', () => {
      const results = repository.query({
        roomId: testRoomId,
        search: 'decision',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(m => m.content.toLowerCase().includes('decision'))).toBe(true);
    });

    it('should query with pagination', () => {
      const page1 = repository.query({
        roomId: testRoomId,
        limit: 2,
        offset: 0,
      });

      const page2 = repository.query({
        roomId: testRoomId,
        limit: 2,
        offset: 2,
      });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
    });

    it('should query by multiple types', () => {
      const results = repository.query({
        roomId: testRoomId,
        type: [MemoryType.DECISION, MemoryType.INSIGHT],
      });

      expect(results.length).toBe(3);
      expect(results.every(m =>
        m.type === MemoryType.DECISION || m.type === MemoryType.INSIGHT
      )).toBe(true);
    });

    it('should query by source', () => {
      const manual = repository.query({
        roomId: testRoomId,
        source: MemorySource.MANUAL,
      });

      expect(manual.length).toBe(2);
      expect(manual.every(m => m.source === MemorySource.MANUAL)).toBe(true);
    });
  });

  describe('Status Operations', () => {
    it('should archive memory', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Old insight',
        tags: [],
        createdBy: 'agent-1',
      });

      const archived = repository.archive(memory.id);
      expect(archived).toBeDefined();
      expect(archived!.status).toBe(MemoryStatus.ARCHIVED);
    });

    it('should resolve memory', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.QUESTION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.HIGH,
        content: 'Question?',
        tags: [],
        createdBy: 'agent-1',
      });

      const resolved = repository.resolve(memory.id, 'agent-2');
      expect(resolved).toBeDefined();
      expect(resolved!.status).toBe(MemoryStatus.RESOLVED);
      expect(resolved!.resolvedBy).toBe('agent-2');
      expect(resolved!.resolvedAt).toBeDefined();
    });

    it('should activate memory', () => {
      const memory = repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ARCHIVED,
        priority: MemoryPriority.MEDIUM,
        content: 'Decision',
        tags: [],
        createdBy: 'agent-1',
      });

      const activated = repository.activate(memory.id);
      expect(activated).toBeDefined();
      expect(activated!.status).toBe(MemoryStatus.ACTIVE);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk create memories', () => {
      const entries = [
        {
          roomId: testRoomId,
          type: MemoryType.DECISION,
          source: MemorySource.MANUAL,
          status: MemoryStatus.ACTIVE,
          priority: MemoryPriority.HIGH,
          content: 'Bulk decision 1',
          tags: [],
          createdBy: 'agent-1',
        },
        {
          roomId: testRoomId,
          type: MemoryType.INSIGHT,
          source: MemorySource.AUTOMATIC,
          status: MemoryStatus.ACTIVE,
          priority: MemoryPriority.MEDIUM,
          content: 'Bulk insight 1',
          tags: [],
          createdBy: 'system',
        },
      ];

      const created = repository.bulkCreate(entries);
      expect(created.length).toBe(2);
      expect(created[0].id).toBeDefined();
      expect(created[1].id).toBeDefined();
    });

    it('should bulk delete memories', () => {
      const memory1 = repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'To delete 1',
        tags: [],
        createdBy: 'agent-1',
      });

      const memory2 = repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'To delete 2',
        tags: [],
        createdBy: 'agent-1',
      });

      const deletedCount = repository.bulkDelete([memory1.id, memory2.id]);
      expect(deletedCount).toBe(2);

      expect(repository.get(memory1.id)).toBeNull();
      expect(repository.get(memory2.id)).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should return memory statistics', () => {
      // Create diverse memories
      repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.HIGH,
        content: 'Decision',
        tags: [],
        createdBy: 'agent-1',
      });

      repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.AUTOMATIC,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Insight',
        tags: [],
        createdBy: 'system',
      });

      const stats = repository.getStats(testRoomId);
      expect(stats.total).toBe(2);
      expect(stats.byType[MemoryType.DECISION]).toBe(1);
      expect(stats.byType[MemoryType.INSIGHT]).toBe(1);
      expect(stats.bySource[MemorySource.MANUAL]).toBe(1);
      expect(stats.bySource[MemorySource.AUTOMATIC]).toBe(1);
    });
  });

  describe('Cleanup Operations', () => {
    it('should delete all memories for a room', () => {
      repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Memory 1',
        tags: [],
        createdBy: 'agent-1',
      });

      repository.create({
        roomId: testRoomId,
        type: MemoryType.INSIGHT,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Memory 2',
        tags: [],
        createdBy: 'agent-1',
      });

      const deletedCount = repository.deleteByRoom(testRoomId);
      expect(deletedCount).toBe(2);

      const remaining = repository.query({ roomId: testRoomId });
      expect(remaining.length).toBe(0);
    });

    it('should delete old memories', () => {
      const now = Date.now();

      // This will be older (created first)
      const oldMemory = repository.create({
        roomId: testRoomId,
        type: MemoryType.DECISION,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: MemoryPriority.MEDIUM,
        content: 'Old memory',
        tags: [],
        createdBy: 'agent-1',
      });

      // Delete memories older than now + 1 second
      const deletedCount = repository.deleteOlderThan(now + 1000, testRoomId);
      expect(deletedCount).toBe(1);

      expect(repository.get(oldMemory.id)).toBeNull();
    });
  });
});
