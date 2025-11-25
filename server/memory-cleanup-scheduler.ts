/**
 * Memory Cleanup Scheduler
 * Automatic periodic cleanup of memories based on retention policies
 */

import { MemoryRepository } from './memory-repository.js';
import {
  RetentionPolicy,
  RetentionAction,
  CleanupReport,
  TimeRetentionRule,
  CountRetentionRule,
  DEFAULT_RETENTION_POLICIES,
} from '../shared/memory-retention.js';
import { MemoryStatus } from '../shared/room-memory.js';

/**
 * Cleanup scheduler configuration
 */
export interface CleanupSchedulerConfig {
  /** How often to run cleanup (milliseconds) */
  intervalMs: number;

  /** Retention policies to apply */
  policies: RetentionPolicy[];

  /** Whether to run cleanup automatically */
  autoStart: boolean;

  /** Dry run mode (don't actually modify memories) */
  dryRun?: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CLEANUP_CONFIG: CleanupSchedulerConfig = {
  intervalMs: 24 * 60 * 60 * 1000, // Run daily
  policies: DEFAULT_RETENTION_POLICIES,
  autoStart: false, // Require explicit start
  dryRun: false,
};

/**
 * Memory Cleanup Scheduler
 * Automatically cleans up memories based on retention policies
 */
export class MemoryCleanupScheduler {
  private memoryRepo: MemoryRepository;
  private config: CleanupSchedulerConfig;
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastCleanupAt: number | null = null;
  private totalReports: CleanupReport[] = [];
  private isRunning = false;

  constructor(memoryRepo: MemoryRepository, config: Partial<CleanupSchedulerConfig> = {}) {
    this.memoryRepo = memoryRepo;
    this.config = {
      ...DEFAULT_CLEANUP_CONFIG,
      ...config,
    };
  }

  /**
   * Start automatic cleanup scheduler
   */
  start(): void {
    if (this.intervalHandle) {
      console.warn('[MemoryCleanupScheduler] Already running');
      return;
    }

    console.log(`[MemoryCleanupScheduler] Starting scheduler (interval: ${this.config.intervalMs / 1000 / 60}min)`);

    // Run immediately if autoStart is true
    if (this.config.autoStart) {
      this.runCleanup();
    }

    // Schedule periodic cleanup
    this.intervalHandle = setInterval(() => {
      this.runCleanup();
    }, this.config.intervalMs);
  }

  /**
   * Stop automatic cleanup scheduler
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[MemoryCleanupScheduler] Stopped scheduler');
    }
  }

  /**
   * Run cleanup manually (one-time)
   */
  async runCleanup(roomId?: string): Promise<CleanupReport[]> {
    if (this.isRunning) {
      console.warn('[MemoryCleanupScheduler] Cleanup already in progress');
      return [];
    }

    this.isRunning = true;
    const reports: CleanupReport[] = [];

    try {
      console.log(`[MemoryCleanupScheduler] Starting cleanup${roomId ? ` for room ${roomId}` : ' for all rooms'}...`);

      // Get enabled policies
      const enabledPolicies = this.config.policies.filter(p => p.enabled);

      for (const policy of enabledPolicies) {
        // Determine which rooms to clean
        const roomsToClean = roomId
          ? [roomId]
          : (policy.roomIds && policy.roomIds.length > 0
              ? policy.roomIds
              : this.getAllRoomIds());

        for (const rid of roomsToClean) {
          const report = await this.cleanupRoom(rid, policy);
          reports.push(report);
        }
      }

      this.lastCleanupAt = Date.now();
      this.totalReports.push(...reports);

      // Log summary
      const totalProcessed = reports.reduce((sum, r) => sum + r.memoriesProcessed, 0);
      const totalArchived = reports.reduce((sum, r) => sum + r.memoriesArchived, 0);
      const totalDeleted = reports.reduce((sum, r) => sum + r.memoriesDeleted, 0);

      console.log(`[MemoryCleanupScheduler] Cleanup complete:`, {
        rooms: new Set(reports.map(r => r.roomId)).size,
        processed: totalProcessed,
        archived: totalArchived,
        deleted: totalDeleted,
        dryRun: this.config.dryRun || false,
      });

    } catch (error) {
      console.error('[MemoryCleanupScheduler] Cleanup failed:', error);
    } finally {
      this.isRunning = false;
    }

    return reports;
  }

  /**
   * Clean up memories in a specific room according to a policy
   */
  private async cleanupRoom(roomId: string, policy: RetentionPolicy): Promise<CleanupReport> {
    const startTime = Date.now();
    const report: CleanupReport = {
      timestamp: startTime,
      roomId,
      policyName: policy.name,
      memoriesProcessed: 0,
      memoriesKept: 0,
      memoriesArchived: 0,
      memoriesDeleted: 0,
      executionTimeMs: 0,
      errors: [],
    };

    try {
      // Get all active and archived memories for this room
      const memories = this.memoryRepo.query({
        roomId,
        status: [MemoryStatus.ACTIVE, MemoryStatus.ARCHIVED, MemoryStatus.RESOLVED],
        limit: 10000, // Process in batches if needed
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });

      report.memoriesProcessed = memories.length;

      // Apply time-based rules
      for (const rule of policy.timeRules) {
        this.applyTimeRule(memories, rule, report);
      }

      // Apply count-based rules
      for (const rule of policy.countRules) {
        this.applyCountRule(memories, rule, report);
      }

      report.memoriesKept = report.memoriesProcessed - report.memoriesArchived - report.memoriesDeleted;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      report.errors = report.errors || [];
      report.errors.push(errorMsg);
    }

    report.executionTimeMs = Date.now() - startTime;
    return report;
  }

  /**
   * Apply a time-based retention rule
   */
  private applyTimeRule(
    memories: any[],
    rule: TimeRetentionRule,
    report: CleanupReport,
  ): void {
    const cutoffTime = Date.now() - (rule.ageDays * 24 * 60 * 60 * 1000);

    for (const memory of memories) {
      // Skip if already processed
      if ((memory as any)._processed) continue;

      // Check if rule applies to this memory
      if (!this.ruleApplies(memory, rule)) continue;

      // Check age
      if (memory.createdAt > cutoffTime) continue;

      // Apply action
      this.applyAction(memory, rule.action, report);
      (memory as any)._processed = true;
    }
  }

  /**
   * Apply a count-based retention rule
   */
  private applyCountRule(
    memories: any[],
    rule: CountRetentionRule,
    report: CleanupReport,
  ): void {
    // Filter memories that match this rule's criteria
    const filtered = memories.filter(m => {
      if ((m as any)._processed) return false;
      return this.ruleAppliesCount(m, rule);
    });

    // Sort by creation date (oldest first)
    filtered.sort((a, b) => a.createdAt - b.createdAt);

    // Keep the most recent maxCount, apply action to the rest
    const toProcess = filtered.slice(0, Math.max(0, filtered.length - rule.maxCount));

    for (const memory of toProcess) {
      this.applyAction(memory, rule.action, report);
      (memory as any)._processed = true;
    }
  }

  /**
   * Check if a time rule applies to a memory
   */
  private ruleApplies(memory: any, rule: TimeRetentionRule): boolean {
    // Check memory type filter
    if (rule.memoryTypes && !rule.memoryTypes.includes(memory.type)) {
      return false;
    }

    // Check priority filter
    if (rule.priorities && !rule.priorities.includes(memory.priority)) {
      return false;
    }

    // Check status filter
    if (rule.statuses && !rule.statuses.includes(memory.status)) {
      return false;
    }

    return true;
  }

  /**
   * Check if a count rule applies to a memory
   */
  private ruleAppliesCount(memory: any, rule: CountRetentionRule): boolean {
    // Check memory type filter
    if (rule.memoryTypes && !rule.memoryTypes.includes(memory.type)) {
      return false;
    }

    // Check priority filter
    if (rule.priorities && !rule.priorities.includes(memory.priority)) {
      return false;
    }

    return true;
  }

  /**
   * Apply an action to a memory
   */
  private applyAction(memory: any, action: RetentionAction, report: CleanupReport): void {
    if (this.config.dryRun) {
      // Dry run mode: just count what would happen
      if (action === RetentionAction.ARCHIVE) {
        report.memoriesArchived++;
      } else if (action === RetentionAction.DELETE) {
        report.memoriesDeleted++;
      }
      return;
    }

    try {
      switch (action) {
        case RetentionAction.ARCHIVE:
          if (memory.status !== MemoryStatus.ARCHIVED) {
            this.memoryRepo.archive(memory.id);
            report.memoriesArchived++;
          }
          break;

        case RetentionAction.DELETE:
          this.memoryRepo.delete(memory.id);
          report.memoriesDeleted++;
          break;

        case RetentionAction.KEEP:
          // Do nothing
          break;
      }
    } catch (error) {
      const errorMsg = `Failed to ${action} memory ${memory.id}: ${error}`;
      report.errors = report.errors || [];
      report.errors.push(errorMsg);
    }
  }

  /**
   * Get all unique room IDs from the memory repository
   */
  private getAllRoomIds(): string[] {
    // This is a simplified implementation that requires database enhancement
    // For now, we return empty array - policies should specify roomIds explicitly
    // TODO: Add a getAllRoomIds() method to MemoryRepository
    console.warn('[MemoryCleanupScheduler] getAllRoomIds not fully implemented - policies should specify roomIds');
    return [];
  }

  /**
   * Update retention policies
   */
  updatePolicies(policies: RetentionPolicy[]): void {
    this.config.policies = policies;
    console.log(`[MemoryCleanupScheduler] Updated policies (${policies.length} total, ${policies.filter(p => p.enabled).length} enabled)`);
  }

  /**
   * Get cleanup reports
   */
  getReports(limit: number = 10): CleanupReport[] {
    return this.totalReports.slice(-limit);
  }

  /**
   * Get last cleanup timestamp
   */
  getLastCleanupTime(): number | null {
    return this.lastCleanupAt;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.intervalHandle !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): CleanupSchedulerConfig {
    return { ...this.config };
  }
}
