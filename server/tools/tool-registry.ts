/**
 * Tool Registry
 *
 * Manages room tools registration, discovery, permissions, and usage tracking.
 */

import {
  RoomTool,
  IToolRegistry,
  ToolPermissionTier,
  ToolUsageStats,
} from '../../shared/room-tools.js';

/**
 * Rate limit tracking per agent per tool
 */
interface RateLimitTracker {
  hourlyRequests: Map<string, { count: number; resetAt: number }>;
  dailyRequests: Map<string, { count: number; resetAt: number }>;
  concurrentRequests: Map<string, number>;
}

/**
 * Usage tracking per tool
 */
interface UsageTracker {
  invocations: number;
  successes: number;
  failures: number;
  totalExecutionTime: number;
  lastUsed: number;
  userCounts: Map<string, number>;
}

/**
 * Tool Registry Implementation
 */
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, RoomTool> = new Map();
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map();
  private usageTrackers: Map<string, UsageTracker> = new Map();

  constructor(private roomId: string) {}

  /**
   * Register a new tool
   */
  registerTool(tool: RoomTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered in room ${this.roomId}`);
    }

    // Initialize tracking
    this.rateLimitTrackers.set(tool.name, {
      hourlyRequests: new Map(),
      dailyRequests: new Map(),
      concurrentRequests: new Map(),
    });

    this.usageTrackers.set(tool.name, {
      invocations: 0,
      successes: 0,
      failures: 0,
      totalExecutionTime: 0,
      lastUsed: 0,
      userCounts: new Map(),
    });

    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool "${toolName}" not found in room ${this.roomId}`);
    }

    this.tools.delete(toolName);
    this.rateLimitTrackers.delete(toolName);
    this.usageTrackers.delete(toolName);
  }

  /**
   * Get a specific tool
   */
  getTool(toolName: string): RoomTool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): RoomTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get only enabled tools
   */
  getEnabledTools(): RoomTool[] {
    return this.getAllTools().filter((tool) => tool.enabled !== false);
  }

  /**
   * Get tools available to a specific agent
   */
  getToolsForAgent(agentId: string, agentRole: string): RoomTool[] {
    return this.getEnabledTools().filter((tool) =>
      this.hasPermission(tool.name, agentId, agentRole)
    );
  }

  /**
   * Check if agent has permission to use a tool
   */
  hasPermission(toolName: string, agentId: string, agentRole: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return false;
    }

    const permissions = tool.permissions;

    // Check denied list first
    if (permissions.deniedAgentIds?.includes(agentId)) {
      return false;
    }

    // Check allowed agents list
    if (permissions.allowedAgentIds && permissions.allowedAgentIds.length > 0) {
      return permissions.allowedAgentIds.includes(agentId);
    }

    // Check role-based permissions
    if (permissions.allowedRoles && permissions.allowedRoles.length > 0) {
      if (!permissions.allowedRoles.includes(agentRole)) {
        return false;
      }
    }

    // Check tier-based permissions
    if (permissions.tier) {
      return this.checkTierPermission(permissions.tier, agentRole);
    }

    // Default: allow
    return true;
  }

  /**
   * Check tier-based permission
   */
  private checkTierPermission(tier: ToolPermissionTier, agentRole: string): boolean {
    switch (tier) {
      case ToolPermissionTier.ALL:
        return true;

      case ToolPermissionTier.PARTICIPANT:
        return true; // All agents are at least participants

      case ToolPermissionTier.EXPERT:
        return ['architect', 'expert'].includes(agentRole);

      case ToolPermissionTier.MODERATOR:
        return agentRole === 'moderator';

      case ToolPermissionTier.ADMIN:
        return agentRole === 'admin';

      default:
        return false;
    }
  }

  /**
   * Check rate limit for agent
   */
  async checkRateLimit(toolName: string, agentId: string): Promise<boolean> {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.rateLimit) {
      return true; // No rate limit
    }

    const tracker = this.rateLimitTrackers.get(toolName);
    if (!tracker) {
      return true;
    }

    const now = Date.now();
    const agentKey = agentId;

    // Check hourly rate limit
    if (tool.rateLimit.requestsPerHour !== undefined) {
      const hourlyData = tracker.hourlyRequests.get(agentKey);
      if (hourlyData) {
        if (now < hourlyData.resetAt) {
          if (hourlyData.count >= tool.rateLimit.requestsPerHour) {
            return false; // Rate limit exceeded
          }
        } else {
          // Reset counter
          tracker.hourlyRequests.set(agentKey, {
            count: 0,
            resetAt: now + 60 * 60 * 1000,
          });
        }
      } else {
        // Initialize counter
        tracker.hourlyRequests.set(agentKey, {
          count: 0,
          resetAt: now + 60 * 60 * 1000,
        });
      }
    }

    // Check daily rate limit
    if (tool.rateLimit.requestsPerDay !== undefined) {
      const dailyData = tracker.dailyRequests.get(agentKey);
      if (dailyData) {
        if (now < dailyData.resetAt) {
          if (dailyData.count >= tool.rateLimit.requestsPerDay) {
            return false; // Rate limit exceeded
          }
        } else {
          // Reset counter
          tracker.dailyRequests.set(agentKey, {
            count: 0,
            resetAt: now + 24 * 60 * 60 * 1000,
          });
        }
      } else {
        // Initialize counter
        tracker.dailyRequests.set(agentKey, {
          count: 0,
          resetAt: now + 24 * 60 * 60 * 1000,
        });
      }
    }

    // Check concurrent requests
    if (tool.rateLimit.concurrentRequests !== undefined) {
      const concurrent = tracker.concurrentRequests.get(agentKey) || 0;
      if (concurrent >= tool.rateLimit.concurrentRequests) {
        return false; // Too many concurrent requests
      }
    }

    return true; // Within limits
  }

  /**
   * Record rate limit usage (increment counters)
   */
  recordRateLimitUsage(toolName: string, agentId: string): void {
    const tracker = this.rateLimitTrackers.get(toolName);
    if (!tracker) {
      return;
    }

    const agentKey = agentId;

    // Increment hourly counter
    const hourlyData = tracker.hourlyRequests.get(agentKey);
    if (hourlyData) {
      hourlyData.count++;
    }

    // Increment daily counter
    const dailyData = tracker.dailyRequests.get(agentKey);
    if (dailyData) {
      dailyData.count++;
    }

    // Increment concurrent counter
    const concurrent = tracker.concurrentRequests.get(agentKey) || 0;
    tracker.concurrentRequests.set(agentKey, concurrent + 1);
  }

  /**
   * Release concurrent request slot
   */
  releaseConcurrentSlot(toolName: string, agentId: string): void {
    const tracker = this.rateLimitTrackers.get(toolName);
    if (!tracker) {
      return;
    }

    const agentKey = agentId;
    const concurrent = tracker.concurrentRequests.get(agentKey) || 0;
    if (concurrent > 0) {
      tracker.concurrentRequests.set(agentKey, concurrent - 1);
    }
  }

  /**
   * Record tool usage
   */
  recordUsage(
    toolName: string,
    agentId: string,
    success: boolean,
    executionTime: number
  ): void {
    const tracker = this.usageTrackers.get(toolName);
    if (!tracker) {
      return;
    }

    tracker.invocations++;
    if (success) {
      tracker.successes++;
    } else {
      tracker.failures++;
    }
    tracker.totalExecutionTime += executionTime;
    tracker.lastUsed = Date.now();

    // Update user counts
    const userCount = tracker.userCounts.get(agentId) || 0;
    tracker.userCounts.set(agentId, userCount + 1);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(toolName?: string): ToolUsageStats[] {
    if (toolName) {
      const tracker = this.usageTrackers.get(toolName);
      if (!tracker) {
        return [];
      }
      return [this.buildStats(toolName, tracker)];
    }

    // Return stats for all tools
    const stats: ToolUsageStats[] = [];
    for (const [name, tracker] of this.usageTrackers.entries()) {
      stats.push(this.buildStats(name, tracker));
    }
    return stats;
  }

  /**
   * Build usage statistics object
   */
  private buildStats(toolName: string, tracker: UsageTracker): ToolUsageStats {
    // Sort users by count
    const topUsers = Array.from(tracker.userCounts.entries())
      .map(([agentId, count]) => ({ agentId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 users

    return {
      toolName,
      invocations: tracker.invocations,
      successes: tracker.successes,
      failures: tracker.failures,
      avgExecutionTime:
        tracker.invocations > 0 ? tracker.totalExecutionTime / tracker.invocations : 0,
      lastUsed: tracker.lastUsed,
      topUsers,
    };
  }

  /**
   * Clear all tools and tracking data
   */
  clear(): void {
    this.tools.clear();
    this.rateLimitTrackers.clear();
    this.usageTrackers.clear();
  }
}
