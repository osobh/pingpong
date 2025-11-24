/**
 * Shared types for PingPong
 */

/**
 * Agent role types
 */
export type AgentRole =
  | 'architect'
  | 'critic'
  | 'pragmatist'
  | 'moderator'
  | 'participant';

/**
 * Room status
 */
export type RoomStatus =
  | 'created'
  | 'active'
  | 'paused'
  | 'concluded';
