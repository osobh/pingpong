/**
 * Memory Cleanup Scheduler Demo
 * Demonstrates automatic memory retention policies and cleanup
 */

import { MemoryRepository } from './server/memory-repository.js';
import { MemoryCleanupScheduler } from './server/memory-cleanup-scheduler.js';
import {
  RetentionPolicy,
  RetentionAction,
  DEFAULT_RETENTION_POLICIES,
} from './shared/memory-retention.js';
import { MemoryType, MemoryPriority, MemoryStatus, MemorySource } from './shared/room-memory.js';

// Create in-memory repository
const memoryRepo = new MemoryRepository(':memory:');

// Helper to create test memories with custom timestamps
// Note: We need to bypass the repository's create() method which always uses Date.now()
function createTestMemory(
  roomId: string,
  type: MemoryType,
  priority: MemoryPriority,
  status: MemoryStatus,
  ageDays: number,
): void {
  const ageMs = ageDays * 24 * 60 * 60 * 1000;
  const createdAt = Date.now() - ageMs;
  const id = `test-${Math.random().toString(36).substr(2, 9)}`;

  // Direct database insert to bypass timestamp override
  const db = (memoryRepo as any).db;
  const stmt = db.prepare(`
    INSERT INTO memories (
      id, roomId, type, source, status, priority, content, context, summary,
      tags, relatedMessageIds, relatedAgentIds, relatedMemoryIds,
      createdBy, createdAt, updatedAt, resolvedAt, resolvedBy, metadata
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  stmt.run(
    id,
    roomId,
    type,
    MemorySource.MANUAL,
    status,
    priority,
    `Test memory: ${type} (${priority}, ${status}, ${ageDays}d old)`,
    null,
    `${ageDays} days old ${type}`,
    JSON.stringify([type, priority, status]),
    null,
    null,
    null,
    'test-agent',
    createdAt,
    createdAt,
    null,
    null,
    null,
  );
}

// Populate test data
console.log('🧪 Memory Cleanup Scheduler Demo\n');
console.log('📝 Creating test memories...\n');

const roomId = 'test-room';

// Create memories of various ages and priorities
const testData = [
  // Old resolved memories (should be deleted by default policy)
  { type: MemoryType.DECISION, priority: MemoryPriority.HIGH, status: MemoryStatus.RESOLVED, ageDays: 100 },
  { type: MemoryType.DECISION, priority: MemoryPriority.MEDIUM, status: MemoryStatus.RESOLVED, ageDays: 95 },

  // Old low-priority active memories (should be archived)
  { type: MemoryType.INSIGHT, priority: MemoryPriority.LOW, status: MemoryStatus.ACTIVE, ageDays: 45 },
  { type: MemoryType.INSIGHT, priority: MemoryPriority.LOW, status: MemoryStatus.ACTIVE, ageDays: 35 },

  // Old medium-priority active memories (should be archived after 60 days)
  { type: MemoryType.QUESTION, priority: MemoryPriority.MEDIUM, status: MemoryStatus.ACTIVE, ageDays: 70 },
  { type: MemoryType.ACTION_ITEM, priority: MemoryPriority.MEDIUM, status: MemoryStatus.ACTIVE, ageDays: 65 },

  // Recent memories (should be kept)
  { type: MemoryType.DECISION, priority: MemoryPriority.HIGH, status: MemoryStatus.ACTIVE, ageDays: 5 },
  { type: MemoryType.INSIGHT, priority: MemoryPriority.MEDIUM, status: MemoryStatus.ACTIVE, ageDays: 10 },
  { type: MemoryType.QUESTION, priority: MemoryPriority.HIGH, status: MemoryStatus.ACTIVE, ageDays: 2 },
  { type: MemoryType.ACTION_ITEM, priority: MemoryPriority.CRITICAL, status: MemoryStatus.ACTIVE, ageDays: 1 },

  // Very old archived memories (should be deleted)
  { type: MemoryType.INSIGHT, priority: MemoryPriority.LOW, status: MemoryStatus.ARCHIVED, ageDays: 200 },
  { type: MemoryType.QUESTION, priority: MemoryPriority.MEDIUM, status: MemoryStatus.ARCHIVED, ageDays: 190 },
];

testData.forEach((data) => {
  createTestMemory(roomId, data.type, data.priority, data.status, data.ageDays);
});

const totalMemories = memoryRepo.query({ roomId, limit: 1000 }).length;
console.log(`✓ Created ${totalMemories} test memories\n`);

// Show initial state
console.log('📊 Initial Memory State:');
const initialByStatus = {
  active: memoryRepo.query({ roomId, status: [MemoryStatus.ACTIVE], limit: 1000 }).length,
  archived: memoryRepo.query({ roomId, status: [MemoryStatus.ARCHIVED], limit: 1000 }).length,
  resolved: memoryRepo.query({ roomId, status: [MemoryStatus.RESOLVED], limit: 1000 }).length,
};
console.log(`  Active: ${initialByStatus.active}`);
console.log(`  Archived: ${initialByStatus.archived}`);
console.log(`  Resolved: ${initialByStatus.resolved}`);
console.log(`  Total: ${totalMemories}\n`);

// Show available policies
console.log('📋 Available Retention Policies:\n');
DEFAULT_RETENTION_POLICIES.forEach((policy, idx) => {
  console.log(`${idx + 1}. ${policy.name}`);
  console.log(`   Description: ${policy.description}`);
  console.log(`   Enabled: ${policy.enabled}`);
  console.log(`   Time Rules: ${policy.timeRules.length}`);
  console.log(`   Count Rules: ${policy.countRules.length}\n`);
});

// Run cleanup in DRY-RUN mode first
console.log('──────────────────────────────────────────────────────────────────────');
console.log('🧪 DRY RUN: Testing cleanup without modifying data\n');

const dryRunScheduler = new MemoryCleanupScheduler(memoryRepo, {
  intervalMs: 24 * 60 * 60 * 1000,
  policies: DEFAULT_RETENTION_POLICIES,
  autoStart: false,
  dryRun: true,
});

const dryRunReports = await dryRunScheduler.runCleanup(roomId);

console.log('\n📊 Dry Run Results:\n');
dryRunReports.forEach((report) => {
  if (report.memoriesProcessed === 0) return;

  console.log(`Policy: ${report.policyName}`);
  console.log(`  Processed: ${report.memoriesProcessed}`);
  console.log(`  Would Keep: ${report.memoriesKept}`);
  console.log(`  Would Archive: ${report.memoriesArchived}`);
  console.log(`  Would Delete: ${report.memoriesDeleted}`);
  console.log(`  Execution Time: ${report.executionTimeMs}ms`);
  if (report.errors && report.errors.length > 0) {
    console.log(`  Errors: ${report.errors.join(', ')}`);
  }
  console.log();
});

// Verify data unchanged
const afterDryRun = memoryRepo.query({ roomId, limit: 1000 }).length;
console.log(`✓ Verified: Total memories unchanged (${afterDryRun}/${totalMemories})\n`);

// Run actual cleanup
console.log('──────────────────────────────────────────────────────────────────────');
console.log('🔥 ACTUAL CLEANUP: Applying retention policies\n');

const scheduler = new MemoryCleanupScheduler(memoryRepo, {
  intervalMs: 24 * 60 * 60 * 1000,
  policies: DEFAULT_RETENTION_POLICIES,
  autoStart: false,
  dryRun: false,
});

const reports = await scheduler.runCleanup(roomId);

console.log('\n📊 Cleanup Results:\n');
reports.forEach((report) => {
  if (report.memoriesProcessed === 0) return;

  console.log(`Policy: ${report.policyName}`);
  console.log(`  Processed: ${report.memoriesProcessed}`);
  console.log(`  Kept: ${report.memoriesKept}`);
  console.log(`  Archived: ${report.memoriesArchived}`);
  console.log(`  Deleted: ${report.memoriesDeleted}`);
  console.log(`  Execution Time: ${report.executionTimeMs}ms`);
  if (report.errors && report.errors.length > 0) {
    console.log(`  Errors: ${report.errors.join(', ')}`);
  }
  console.log();
});

// Show final state
const finalByStatus = {
  active: memoryRepo.query({ roomId, status: [MemoryStatus.ACTIVE], limit: 1000 }).length,
  archived: memoryRepo.query({ roomId, status: [MemoryStatus.ARCHIVED], limit: 1000 }).length,
  resolved: memoryRepo.query({ roomId, status: [MemoryStatus.RESOLVED], limit: 1000 }).length,
};
const finalTotal = finalByStatus.active + finalByStatus.archived + finalByStatus.resolved;

console.log('──────────────────────────────────────────────────────────────────────');
console.log('📊 Final Memory State:\n');
console.log(`  Active: ${finalByStatus.active} (was ${initialByStatus.active})`);
console.log(`  Archived: ${finalByStatus.archived} (was ${initialByStatus.archived})`);
console.log(`  Resolved: ${finalByStatus.resolved} (was ${initialByStatus.resolved})`);
console.log(`  Total: ${finalTotal} (was ${totalMemories})\n`);

const changes = {
  archived: finalByStatus.archived - initialByStatus.archived,
  deleted: totalMemories - finalTotal,
};

console.log('📈 Summary of Changes:');
console.log(`  Memories Archived: ${changes.archived}`);
console.log(`  Memories Deleted: ${changes.deleted}`);
console.log(`  Memories Remaining: ${finalTotal}\n`);

// Demonstrate custom policy
console.log('──────────────────────────────────────────────────────────────────────');
console.log('🎯 Custom Policy Demo: Aggressive cleanup for this specific room\n');

const customPolicy: RetentionPolicy = {
  name: 'custom-aggressive',
  description: 'Very aggressive: delete everything older than 7 days',
  enabled: true,
  timeRules: [
    {
      ageDays: 7,
      action: RetentionAction.DELETE,
    },
  ],
  countRules: [],
  roomIds: [roomId],
};

const customScheduler = new MemoryCleanupScheduler(memoryRepo, {
  intervalMs: 24 * 60 * 60 * 1000,
  policies: [customPolicy],
  autoStart: false,
  dryRun: true, // Dry run to show what would happen
});

const customReports = await customScheduler.runCleanup(roomId);

console.log('📊 Custom Policy Results (Dry Run):\n');
customReports.forEach((report) => {
  console.log(`Policy: ${report.policyName}`);
  console.log(`  Processed: ${report.memoriesProcessed}`);
  console.log(`  Would Keep: ${report.memoriesKept}`);
  console.log(`  Would Delete: ${report.memoriesDeleted}`);
  console.log();
});

console.log('──────────────────────────────────────────────────────────────────────');
console.log('✅ Demo Complete!\n');

// Show scheduler configuration
console.log('⚙️  Scheduler Configuration:');
const config = scheduler.getConfig();
console.log(`  Interval: ${config.intervalMs / 1000 / 60} minutes`);
console.log(`  Auto-start: ${config.autoStart}`);
console.log(`  Dry-run: ${config.dryRun}`);
console.log(`  Policies: ${config.policies.length} (${config.policies.filter((p) => p.enabled).length} enabled)`);
console.log();

console.log('💡 Usage Examples:');
console.log('  1. Start automatic cleanup: scheduler.start()');
console.log('  2. Stop automatic cleanup: scheduler.stop()');
console.log('  3. Manual cleanup: await scheduler.runCleanup(roomId)');
console.log('  4. Update policies: scheduler.updatePolicies(newPolicies)');
console.log('  5. Get reports: scheduler.getReports(10)');
console.log('  6. Check status: scheduler.isSchedulerRunning()');
console.log();
