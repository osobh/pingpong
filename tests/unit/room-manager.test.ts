import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../../server/room-manager.js';
import type { MessageBus } from '../../shared/message-bus.js';

/**
 * Test suite for RoomManager
 * Tests multi-room support for PingPong
 */
describe('RoomManager', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe('Room Creation', () => {
    it('should create a room with a topic', () => {
      const room = roomManager.createRoom('room-1', 'Should we use microservices?');

      expect(room).toBeDefined();
      expect(room.id).toBe('room-1');
      expect(room.topic).toBe('Should we use microservices?');
    });

    it('should create a room with auto-generated ID if not provided', () => {
      const room = roomManager.createRoom(undefined, 'Test topic');

      expect(room).toBeDefined();
      expect(room.id).toMatch(/^room-/); // Should start with 'room-'
      expect(room.topic).toBe('Test topic');
    });

    it('should throw error for duplicate room ID', () => {
      roomManager.createRoom('room-1', 'Topic 1');

      expect(() => {
        roomManager.createRoom('room-1', 'Topic 2');
      }).toThrow('Room with ID room-1 already exists');
    });

    it('should create room with optional message bus', () => {
      const mockBus: MessageBus = {
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        publish: async () => {},
        subscribe: () => () => {},
      };

      const room = roomManager.createRoom('room-1', 'Topic', mockBus);

      expect(room).toBeDefined();
      expect(room.id).toBe('room-1');
    });
  });

  describe('Room Retrieval', () => {
    beforeEach(() => {
      roomManager.createRoom('room-1', 'Topic 1');
      roomManager.createRoom('room-2', 'Topic 2');
      roomManager.createRoom('room-3', 'Topic 3');
    });

    it('should get room by ID', () => {
      const room = roomManager.getRoom('room-1');

      expect(room).toBeDefined();
      expect(room?.id).toBe('room-1');
      expect(room?.topic).toBe('Topic 1');
    });

    it('should return undefined for non-existent room', () => {
      const room = roomManager.getRoom('non-existent');

      expect(room).toBeUndefined();
    });

    it('should list all rooms', () => {
      const rooms = roomManager.listRooms();

      expect(rooms).toHaveLength(3);
      expect(rooms.map((r) => r.id)).toEqual(['room-1', 'room-2', 'room-3']);
    });

    it('should return empty array when no rooms exist', () => {
      const emptyManager = new RoomManager();
      const rooms = emptyManager.listRooms();

      expect(rooms).toEqual([]);
    });

    it('should get room count', () => {
      expect(roomManager.getRoomCount()).toBe(3);

      roomManager.createRoom('room-4', 'Topic 4');
      expect(roomManager.getRoomCount()).toBe(4);
    });
  });

  describe('Room Deletion', () => {
    it('should delete room by ID', () => {
      roomManager.createRoom('room-1', 'Topic 1');

      const deleted = roomManager.deleteRoom('room-1');

      expect(deleted).toBe(true);
      expect(roomManager.getRoom('room-1')).toBeUndefined();
      expect(roomManager.getRoomCount()).toBe(0);
    });

    it('should return false when deleting non-existent room', () => {
      const deleted = roomManager.deleteRoom('non-existent');

      expect(deleted).toBe(false);
    });

    it('should auto-delete room when it becomes empty', () => {
      const room = roomManager.createRoom('room-1', 'Topic 1');

      // Simulate room becoming empty
      room.shutdown();

      // Room should be automatically deleted
      expect(roomManager.getRoom('room-1')).toBeUndefined();
    });

    it('should not delete room if it still has agents', () => {
      // This test will be implemented when we integrate with agent tracking
      // For now, just verify the room exists
      roomManager.createRoom('room-1', 'Topic 1');

      expect(roomManager.getRoom('room-1')).toBeDefined();
    });
  });

  describe('Room Existence', () => {
    it('should check if room exists', () => {
      roomManager.createRoom('room-1', 'Topic 1');

      expect(roomManager.hasRoom('room-1')).toBe(true);
      expect(roomManager.hasRoom('non-existent')).toBe(false);
    });
  });

  describe('Room Filtering', () => {
    beforeEach(() => {
      roomManager.createRoom('arch-1', 'Architecture discussion');
      roomManager.createRoom('design-1', 'Design patterns');
      roomManager.createRoom('arch-2', 'Architecture review');
    });

    it('should find rooms by topic keyword', () => {
      const archRooms = roomManager.findRoomsByTopic('architecture');

      expect(archRooms).toHaveLength(2);
      expect(archRooms.map((r) => r.id)).toContain('arch-1');
      expect(archRooms.map((r) => r.id)).toContain('arch-2');
    });

    it('should return empty array when no rooms match topic', () => {
      const rooms = roomManager.findRoomsByTopic('nonexistent');

      expect(rooms).toEqual([]);
    });

    it('should perform case-insensitive topic search', () => {
      const rooms = roomManager.findRoomsByTopic('ARCHITECTURE');

      expect(rooms).toHaveLength(2);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown all rooms', () => {
      roomManager.createRoom('room-1', 'Topic 1');
      roomManager.createRoom('room-2', 'Topic 2');

      roomManager.shutdown();

      expect(roomManager.getRoomCount()).toBe(0);
      expect(roomManager.listRooms()).toEqual([]);
    });

    it('should handle shutdown when no rooms exist', () => {
      expect(() => {
        roomManager.shutdown();
      }).not.toThrow();
    });
  });
});
