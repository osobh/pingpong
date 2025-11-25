/**
 * RoomManager - Manages multiple discussion rooms
 * Supports multi-room communication with topic-based discussions
 */

import { randomUUID } from 'crypto';
import { Room } from './room.js';
import type { MessageBus } from '../shared/message-bus.js';
import type { ConversationMode } from '../shared/types.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  /**
   * Create a new room with a topic
   * @param roomId Optional room ID (auto-generated if not provided)
   * @param topic Discussion topic for the room
   * @param mode Optional conversation mode (defaults to 'deep')
   * @param bus Optional MessageBus for cross-server communication
   * @param serverId Optional server ID for MessageBus
   * @returns The created Room instance
   */
  createRoom(
    roomId: string | undefined,
    topic: string,
    mode: ConversationMode = 'deep',
    bus?: MessageBus,
    serverId?: string,
  ): Room {
    // Generate ID if not provided
    const id = roomId || `room-${randomUUID().slice(0, 8)}`;

    // Check for duplicate room ID
    if (this.rooms.has(id)) {
      throw new Error(`Room with ID ${id} already exists`);
    }

    // Create the room with auto-delete callback
    const room = new Room(id, topic, mode, bus, serverId, () => {
      // Auto-delete this room when it shuts down
      this.rooms.delete(id);
    });

    // Store the room
    this.rooms.set(id, room);

    return room;
  }

  /**
   * Get a room by ID
   * @param roomId The room ID to look up
   * @returns The Room instance or undefined if not found
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * List all rooms
   * @returns Array of all Room instances
   */
  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get the total number of rooms
   * @returns The number of rooms
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Check if a room exists
   * @param roomId The room ID to check
   * @returns True if the room exists
   */
  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Delete a room by ID
   * @param roomId The room ID to delete
   * @returns True if the room was deleted, false if it didn't exist
   */
  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);

    if (!room) {
      return false;
    }

    // Shutdown the room
    room.shutdown();

    // Remove from map
    this.rooms.delete(roomId);

    return true;
  }

  /**
   * Find rooms by topic keyword (case-insensitive)
   * @param keyword The keyword to search for in topics
   * @returns Array of rooms matching the keyword
   */
  findRoomsByTopic(keyword: string): Room[] {
    const lowerKeyword = keyword.toLowerCase();

    return Array.from(this.rooms.values()).filter((room) =>
      room.topic.toLowerCase().includes(lowerKeyword),
    );
  }

  /**
   * Shutdown all rooms
   */
  shutdown(): void {
    // Shutdown all rooms
    for (const room of this.rooms.values()) {
      room.shutdown();
    }

    // Clear the map
    this.rooms.clear();
  }
}
