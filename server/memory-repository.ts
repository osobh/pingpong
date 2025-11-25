/**
 * Memory Repository
 *
 * Handles persistent storage and retrieval of room memories using SQLite.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  MemoryEntry,
  MemoryType,
  MemorySource,
  MemoryStatus,
  MemoryPriority,
  MemoryQuery,
  MemoryStats,
  IMemoryRepository,
} from '../shared/room-memory.js';

/**
 * Memory Repository Implementation
 */
export class MemoryRepository implements IMemoryRepository {
  private db: Database.Database;

  constructor(dbPath: string = './data/pingpong.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  /**
   * Initialize database schema
   */
  private initDatabase(): void {
    // Create memories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT,
        summary TEXT,
        tags TEXT NOT NULL,
        relatedMessageIds TEXT,
        relatedAgentIds TEXT,
        relatedMemoryIds TEXT,
        createdBy TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        resolvedAt INTEGER,
        resolvedBy TEXT,
        metadata TEXT
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_roomId ON memories(roomId);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
      CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);
      CREATE INDEX IF NOT EXISTS idx_memories_createdAt ON memories(createdAt);
      CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
    `);
  }

  /**
   * Create a new memory entry
   */
  create(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): MemoryEntry {
    const now = Date.now();
    const memory: MemoryEntry = {
      id: randomUUID(),
      ...entry,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, roomId, type, source, status, priority, content, context, summary,
        tags, relatedMessageIds, relatedAgentIds, relatedMemoryIds,
        createdBy, createdAt, updatedAt, resolvedAt, resolvedBy, metadata
      ) VALUES (
        @id, @roomId, @type, @source, @status, @priority, @content, @context, @summary,
        @tags, @relatedMessageIds, @relatedAgentIds, @relatedMemoryIds,
        @createdBy, @createdAt, @updatedAt, @resolvedAt, @resolvedBy, @metadata
      )
    `);

    stmt.run(this.serializeMemory(memory));
    return memory;
  }

  /**
   * Get memory by ID
   */
  get(id: string): MemoryEntry | null {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id);
    return row ? this.deserializeMemory(row as any) : null;
  }

  /**
   * Update memory entry
   */
  update(id: string, updates: Partial<MemoryEntry>): MemoryEntry | null {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      createdAt: existing.createdAt, // Cannot change creation time
      updatedAt: Date.now(),
    };

    const fields: string[] = [];
    const values: Record<string, any> = { id };

    // Build dynamic UPDATE query
    for (const [key, value] of Object.entries(updated)) {
      if (key !== 'id') {
        fields.push(`${key} = @${key}`);
        values[key] = value;
      }
    }

    const stmt = this.db.prepare(`
      UPDATE memories
      SET ${fields.join(', ')}
      WHERE id = @id
    `);

    stmt.run(this.serializeMemory(updated as any));
    return updated;
  }

  /**
   * Delete memory entry
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Query memories with filters
   */
  query(params: MemoryQuery): MemoryEntry[] {
    const { conditions, values } = this.buildQueryConditions(params);

    let sql = 'SELECT * FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add sorting
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';
    sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    // Add pagination
    if (params.limit) {
      sql += ' LIMIT ?';
      values.push(params.limit);
    }
    if (params.offset) {
      sql += ' OFFSET ?';
      values.push(params.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...values);
    return rows.map((row) => this.deserializeMemory(row as any));
  }

  /**
   * Count memories matching query
   */
  count(params: Omit<MemoryQuery, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>): number {
    const { conditions, values } = this.buildQueryConditions(params);

    let sql = 'SELECT COUNT(*) as count FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...values) as { count: number };
    return result.count;
  }

  /**
   * Bulk create memories
   */
  bulkCreate(entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>>): MemoryEntry[] {
    const insert = this.db.prepare(`
      INSERT INTO memories (
        id, roomId, type, source, status, priority, content, context, summary,
        tags, relatedMessageIds, relatedAgentIds, relatedMemoryIds,
        createdBy, createdAt, updatedAt, resolvedAt, resolvedBy, metadata
      ) VALUES (
        @id, @roomId, @type, @source, @status, @priority, @content, @context, @summary,
        @tags, @relatedMessageIds, @relatedAgentIds, @relatedMemoryIds,
        @createdBy, @createdAt, @updatedAt, @resolvedAt, @resolvedBy, @metadata
      )
    `);

    const transaction = this.db.transaction((entries: MemoryEntry[]) => {
      for (const entry of entries) {
        insert.run(this.serializeMemory(entry));
      }
    });

    const now = Date.now();
    const memories: MemoryEntry[] = entries.map((entry) => ({
      id: randomUUID(),
      ...entry,
      createdAt: now,
      updatedAt: now,
    }));

    transaction(memories);
    return memories;
  }

  /**
   * Bulk update memories
   */
  bulkUpdate(updates: Array<{ id: string; updates: Partial<MemoryEntry> }>): MemoryEntry[] {
    const results: MemoryEntry[] = [];

    const transaction = this.db.transaction(() => {
      for (const { id, updates: upd } of updates) {
        const updated = this.update(id, upd);
        if (updated) {
          results.push(updated);
        }
      }
    });

    transaction();
    return results;
  }

  /**
   * Bulk delete memories
   */
  bulkDelete(ids: string[]): number {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`);
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * Archive a memory
   */
  archive(id: string): MemoryEntry | null {
    return this.update(id, { status: MemoryStatus.ARCHIVED });
  }

  /**
   * Resolve a memory
   */
  resolve(id: string, resolvedBy: string): MemoryEntry | null {
    return this.update(id, {
      status: MemoryStatus.RESOLVED,
      resolvedBy,
      resolvedAt: Date.now(),
    });
  }

  /**
   * Activate a memory
   */
  activate(id: string): MemoryEntry | null {
    return this.update(id, { status: MemoryStatus.ACTIVE });
  }

  /**
   * Get memory statistics for a room
   */
  getStats(roomId: string): MemoryStats {
    const total = this.count({ roomId });

    const byType: Record<MemoryType, number> = {
      [MemoryType.DECISION]: 0,
      [MemoryType.INSIGHT]: 0,
      [MemoryType.QUESTION]: 0,
      [MemoryType.ACTION_ITEM]: 0,
    };

    const byStatus: Record<MemoryStatus, number> = {
      [MemoryStatus.ACTIVE]: 0,
      [MemoryStatus.ARCHIVED]: 0,
      [MemoryStatus.RESOLVED]: 0,
    };

    const byPriority: Record<MemoryPriority, number> = {
      [MemoryPriority.LOW]: 0,
      [MemoryPriority.MEDIUM]: 0,
      [MemoryPriority.HIGH]: 0,
      [MemoryPriority.CRITICAL]: 0,
    };

    const bySource: Record<MemorySource, number> = {
      [MemorySource.MANUAL]: 0,
      [MemorySource.AUTOMATIC]: 0,
      [MemorySource.SYSTEM]: 0,
    };

    // Count by type
    for (const type of Object.values(MemoryType)) {
      byType[type] = this.count({ roomId, type });
    }

    // Count by status
    for (const status of Object.values(MemoryStatus)) {
      byStatus[status] = this.count({ roomId, status });
    }

    // Count by priority
    for (const priority of Object.values(MemoryPriority)) {
      byPriority[priority] = this.count({ roomId, priority });
    }

    // Count by source
    for (const source of Object.values(MemorySource)) {
      bySource[source] = this.count({ roomId, source: source as any });
    }

    return {
      roomId,
      total,
      byType,
      byStatus,
      byPriority,
      bySource,
    };
  }

  /**
   * Delete all memories for a room
   */
  deleteByRoom(roomId: string): number {
    const stmt = this.db.prepare('DELETE FROM memories WHERE roomId = ?');
    const result = stmt.run(roomId);
    return result.changes;
  }

  /**
   * Delete memories older than timestamp
   */
  deleteOlderThan(timestamp: number, roomId?: string): number {
    let sql = 'DELETE FROM memories WHERE createdAt < ?';
    const params: any[] = [timestamp];

    if (roomId) {
      sql += ' AND roomId = ?';
      params.push(roomId);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  /**
   * Build query conditions from parameters
   */
  private buildQueryConditions(params: MemoryQuery): {
    conditions: string[];
    values: any[];
  } {
    const conditions: string[] = [];
    const values: any[] = [];

    // Room ID (required)
    conditions.push('roomId = ?');
    values.push(params.roomId);

    // Type filter
    if (params.type) {
      const types = Array.isArray(params.type) ? params.type : [params.type];
      conditions.push(`type IN (${types.map(() => '?').join(',')})`);
      values.push(...types);
    }

    // Status filter
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      conditions.push(`status IN (${statuses.map(() => '?').join(',')})`);
      values.push(...statuses);
    }

    // Priority filter
    if (params.priority) {
      const priorities = Array.isArray(params.priority) ? params.priority : [params.priority];
      conditions.push(`priority IN (${priorities.map(() => '?').join(',')})`);
      values.push(...priorities);
    }

    // Source filter
    if (params.source) {
      const sources = Array.isArray(params.source) ? params.source : [params.source];
      conditions.push(`source IN (${sources.map(() => '?').join(',')})`);
      values.push(...sources);
    }

    // Tags filter (OR)
    if (params.tags && params.tags.length > 0) {
      const tagConditions = params.tags.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      values.push(...params.tags.map((tag) => `%"${tag}"%`));
    }

    // Agent ID filter
    if (params.agentId) {
      conditions.push('relatedAgentIds LIKE ?');
      values.push(`%"${params.agentId}"%`);
    }

    // Search filter
    if (params.search) {
      conditions.push('(content LIKE ? OR context LIKE ? OR summary LIKE ?)');
      const searchTerm = `%${params.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    // Time range filters
    if (params.createdAfter) {
      conditions.push('createdAt >= ?');
      values.push(params.createdAfter);
    }
    if (params.createdBefore) {
      conditions.push('createdAt <= ?');
      values.push(params.createdBefore);
    }

    return { conditions, values };
  }

  /**
   * Serialize memory for database storage
   */
  private serializeMemory(memory: MemoryEntry): Record<string, any> {
    return {
      ...memory,
      context: memory.context ?? null,
      summary: memory.summary ?? null,
      tags: JSON.stringify(memory.tags),
      relatedMessageIds: memory.relatedMessageIds
        ? JSON.stringify(memory.relatedMessageIds)
        : null,
      relatedAgentIds: memory.relatedAgentIds ? JSON.stringify(memory.relatedAgentIds) : null,
      relatedMemoryIds: memory.relatedMemoryIds ? JSON.stringify(memory.relatedMemoryIds) : null,
      metadata: memory.metadata ? JSON.stringify(memory.metadata) : null,
      resolvedAt: memory.resolvedAt ?? null,
      resolvedBy: memory.resolvedBy ?? null,
    };
  }

  /**
   * Deserialize memory from database
   */
  private deserializeMemory(row: Record<string, any>): MemoryEntry {
    return {
      ...row,
      tags: JSON.parse(row['tags']),
      relatedMessageIds: row['relatedMessageIds'] ? JSON.parse(row['relatedMessageIds']) : undefined,
      relatedAgentIds: row['relatedAgentIds'] ? JSON.parse(row['relatedAgentIds']) : undefined,
      relatedMemoryIds: row['relatedMemoryIds'] ? JSON.parse(row['relatedMemoryIds']) : undefined,
      metadata: row['metadata'] ? JSON.parse(row['metadata']) : undefined,
    } as MemoryEntry;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
