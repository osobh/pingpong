/**
 * Room Memory System
 *
 * Persistent memory storage for rooms, capturing decisions, insights,
 * questions, and action items from conversations.
 */

/**
 * Memory Entry Types
 */
export enum MemoryType {
  DECISION = 'decision',
  INSIGHT = 'insight',
  QUESTION = 'question',
  ACTION_ITEM = 'action_item',
}

/**
 * Memory Source
 */
export enum MemorySource {
  MANUAL = 'manual', // Manually recorded by moderator
  AUTOMATIC = 'automatic', // Automatically extracted by LLM
  SYSTEM = 'system', // System-generated
}

/**
 * Memory Status
 */
export enum MemoryStatus {
  ACTIVE = 'active', // Active memory
  ARCHIVED = 'archived', // Archived (no longer relevant)
  RESOLVED = 'resolved', // Resolved (for questions/action items)
}

/**
 * Memory Priority
 */
export enum MemoryPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Memory Entry
 */
export interface MemoryEntry {
  id: string; // Unique memory ID
  roomId: string; // Room this memory belongs to
  type: MemoryType; // Type of memory
  source: MemorySource; // How it was created
  status: MemoryStatus; // Current status
  priority: MemoryPriority; // Priority level

  // Content
  content: string; // Main memory content
  context?: string; // Additional context
  summary?: string; // Short summary (for quick reference)

  // Metadata
  tags: string[]; // Tags for categorization
  relatedMessageIds?: string[]; // Related conversation messages
  relatedAgentIds?: string[]; // Agents involved
  relatedMemoryIds?: string[]; // Related memories

  // Attribution
  createdBy: string; // Agent/user who created it
  createdAt: number; // Creation timestamp
  updatedAt: number; // Last update timestamp
  resolvedAt?: number; // Resolution timestamp (if resolved)
  resolvedBy?: string; // Who resolved it

  // Additional fields for specific types
  metadata?: Record<string, unknown>; // Type-specific metadata
}

/**
 * Memory Query Parameters
 */
export interface MemoryQuery {
  roomId: string; // Required: room to query
  type?: MemoryType | MemoryType[]; // Filter by type(s)
  status?: MemoryStatus | MemoryStatus[]; // Filter by status(es)
  priority?: MemoryPriority | MemoryPriority[]; // Filter by priority
  source?: MemorySource | MemorySource[]; // Filter by source(s)
  tags?: string[]; // Filter by tags (OR)
  agentId?: string; // Filter by involved agent
  search?: string; // Full-text search in content/context
  createdAfter?: number; // Created after timestamp
  createdBefore?: number; // Created before timestamp
  limit?: number; // Max results
  offset?: number; // Pagination offset
  sortBy?: 'createdAt' | 'updatedAt' | 'priority'; // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort direction
}

/**
 * Memory Injection Strategy
 */
export enum InjectionStrategy {
  NONE = 'none', // No injection
  SUMMARY = 'summary', // Inject summary of all memories
  RECENT = 'recent', // Inject recent memories (last N)
  RELEVANT = 'relevant', // Inject relevant memories based on topic
  CRITICAL = 'critical', // Inject only critical memories
  FULL = 'full', // Inject all memories (careful with token limits)
}

/**
 * Memory Injection Config
 */
export interface MemoryInjectionConfig {
  strategy: InjectionStrategy;
  maxEntries?: number; // Max memories to inject
  maxTokens?: number; // Token budget for injection
  includeTypes?: MemoryType[]; // Only include these types
  excludeTypes?: MemoryType[]; // Exclude these types
  minPriority?: MemoryPriority; // Minimum priority to include
  includeArchived?: boolean; // Include archived memories
}

/**
 * Memory Statistics
 */
export interface MemoryStats {
  roomId: string;
  total: number;
  byType: Record<MemoryType, number>;
  byStatus: Record<MemoryStatus, number>;
  byPriority: Record<MemoryPriority, number>;
  bySource: Record<MemorySource, number>;
}

/**
 * Memory Extraction Request
 */
export interface MemoryExtractionRequest {
  roomId: string;
  messageIds?: string[]; // Specific messages to analyze
  timeRange?: {
    start: number;
    end: number;
  }; // Time range to analyze
  extractTypes?: MemoryType[]; // Types to extract
  minConfidence?: number; // Minimum confidence score (0-1)
}

/**
 * Memory Extraction Result
 */
export interface MemoryExtractionResult {
  roomId: string;
  memories: Array<{
    type: MemoryType;
    content: string;
    context?: string;
    confidence: number; // Confidence score (0-1)
    tags: string[];
    relatedMessageIds?: string[];
    relatedAgentIds?: string[];
    priority: MemoryPriority;
  }>;
  extractedAt: number;
  messagesAnalyzed: number;
}

/**
 * Memory Repository Interface
 */
export interface IMemoryRepository {
  // CRUD operations
  create(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): MemoryEntry;
  get(id: string): MemoryEntry | null;
  update(id: string, updates: Partial<MemoryEntry>): MemoryEntry | null;
  delete(id: string): boolean;

  // Query operations
  query(params: MemoryQuery): MemoryEntry[];
  count(params: Omit<MemoryQuery, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>): number;

  // Bulk operations
  bulkCreate(entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>>): MemoryEntry[];
  bulkUpdate(updates: Array<{ id: string; updates: Partial<MemoryEntry> }>): MemoryEntry[];
  bulkDelete(ids: string[]): number;

  // Status operations
  archive(id: string): MemoryEntry | null;
  resolve(id: string, resolvedBy: string): MemoryEntry | null;
  activate(id: string): MemoryEntry | null;

  // Statistics
  getStats(roomId: string): MemoryStats;

  // Cleanup
  deleteByRoom(roomId: string): number;
  deleteOlderThan(timestamp: number, roomId?: string): number;
}
