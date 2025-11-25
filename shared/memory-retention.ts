/**
 * Memory Retention Policies and Configuration
 * Defines rules for automatic memory cleanup and archival
 */

import { MemoryType, MemoryPriority, MemoryStatus } from './room-memory.js';

/**
 * Retention action to take on memories
 */
export enum RetentionAction {
  /** Keep memory as-is */
  KEEP = 'keep',

  /** Archive memory (change status to ARCHIVED) */
  ARCHIVE = 'archive',

  /** Delete memory permanently */
  DELETE = 'delete',
}

/**
 * Time-based retention rule
 */
export interface TimeRetentionRule {
  /** Memory age in days */
  ageDays: number;

  /** Action to take */
  action: RetentionAction;

  /** Optional: Only apply to specific memory types */
  memoryTypes?: MemoryType[];

  /** Optional: Only apply to specific priorities */
  priorities?: MemoryPriority[];

  /** Optional: Only apply to specific statuses */
  statuses?: MemoryStatus[];
}

/**
 * Count-based retention rule (keep last N memories)
 */
export interface CountRetentionRule {
  /** Maximum number of memories to keep */
  maxCount: number;

  /** Action to take on excess memories */
  action: RetentionAction;

  /** Optional: Only apply to specific memory types */
  memoryTypes?: MemoryType[];

  /** Optional: Only apply to specific priorities */
  priorities?: MemoryPriority[];
}

/**
 * Complete retention policy configuration
 */
export interface RetentionPolicy {
  /** Policy name */
  name: string;

  /** Policy description */
  description: string;

  /** Whether policy is enabled */
  enabled: boolean;

  /** Time-based retention rules (applied in order) */
  timeRules: TimeRetentionRule[];

  /** Count-based retention rules (applied after time rules) */
  countRules: CountRetentionRule[];

  /** Optional: Rooms this policy applies to (empty = all rooms) */
  roomIds?: string[];
}

/**
 * Default retention policies
 */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    name: 'default-conservative',
    description: 'Conservative policy: archives old low-priority memories, deletes very old resolved items',
    enabled: true,
    timeRules: [
      // Delete very old resolved memories (>90 days)
      {
        ageDays: 90,
        action: RetentionAction.DELETE,
        statuses: [MemoryStatus.RESOLVED],
      },
      // Archive old low-priority memories (>30 days)
      {
        ageDays: 30,
        action: RetentionAction.ARCHIVE,
        priorities: [MemoryPriority.LOW],
        statuses: [MemoryStatus.ACTIVE],
      },
      // Archive old medium-priority memories (>60 days)
      {
        ageDays: 60,
        action: RetentionAction.ARCHIVE,
        priorities: [MemoryPriority.MEDIUM],
        statuses: [MemoryStatus.ACTIVE],
      },
      // Archive old archived memories (>180 days)
      {
        ageDays: 180,
        action: RetentionAction.DELETE,
        statuses: [MemoryStatus.ARCHIVED],
      },
    ],
    countRules: [],
    roomIds: [],
  },
  {
    name: 'aggressive-cleanup',
    description: 'Aggressive policy: deletes old memories more quickly to save space',
    enabled: false,
    timeRules: [
      // Delete old resolved memories (>30 days)
      {
        ageDays: 30,
        action: RetentionAction.DELETE,
        statuses: [MemoryStatus.RESOLVED],
      },
      // Delete old low-priority memories (>14 days)
      {
        ageDays: 14,
        action: RetentionAction.DELETE,
        priorities: [MemoryPriority.LOW],
        statuses: [MemoryStatus.ACTIVE],
      },
      // Archive old medium-priority memories (>30 days)
      {
        ageDays: 30,
        action: RetentionAction.ARCHIVE,
        priorities: [MemoryPriority.MEDIUM],
        statuses: [MemoryStatus.ACTIVE],
      },
      // Delete old archived memories (>60 days)
      {
        ageDays: 60,
        action: RetentionAction.DELETE,
        statuses: [MemoryStatus.ARCHIVED],
      },
    ],
    countRules: [
      // Keep max 1000 memories per room
      {
        maxCount: 1000,
        action: RetentionAction.DELETE,
      },
    ],
    roomIds: [],
  },
  {
    name: 'minimal-cleanup',
    description: 'Minimal policy: only removes very old archived memories',
    enabled: false,
    timeRules: [
      // Only delete very old archived memories (>365 days)
      {
        ageDays: 365,
        action: RetentionAction.DELETE,
        statuses: [MemoryStatus.ARCHIVED],
      },
    ],
    countRules: [],
    roomIds: [],
  },
];

/**
 * Cleanup execution report
 */
export interface CleanupReport {
  /** Timestamp of cleanup */
  timestamp: number;

  /** Room ID */
  roomId: string;

  /** Policy applied */
  policyName: string;

  /** Number of memories processed */
  memoriesProcessed: number;

  /** Number of memories kept */
  memoriesKept: number;

  /** Number of memories archived */
  memoriesArchived: number;

  /** Number of memories deleted */
  memoriesDeleted: number;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Errors encountered (if any) */
  errors?: string[];
}
