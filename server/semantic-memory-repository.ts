/**
 * Semantic Memory Repository
 * Extends MemoryRepository with embedding-based semantic search
 */

import { MemoryRepository } from './memory-repository.js';
import { EmbeddingService, EmbeddingConfig } from './embedding-service.js';
import { MemoryEntry } from '../shared/room-memory.js';

/**
 * Result from semantic search
 */
export interface SemanticSearchResult {
  memory: MemoryEntry;
  similarity: number;
  rank: number;
}

/**
 * Semantic search parameters
 */
export interface SemanticSearchParams {
  /** Query text to search for */
  query: string;

  /** Room ID to search in */
  roomId?: string;

  /** Maximum number of results */
  limit?: number;

  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;

  /** Filter by memory types */
  types?: string[];

  /** Filter by status */
  statuses?: string[];

  /** Filter by priority */
  priorities?: string[];
}

/**
 * Semantic Memory Repository
 * Adds vector embedding and semantic search capabilities to memory storage
 */
export class SemanticMemoryRepository extends MemoryRepository {
  private embeddingService: EmbeddingService;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(dbPath: string = './data/pingpong.db', embeddingConfig?: Partial<EmbeddingConfig>) {
    super(dbPath);
    this.embeddingService = new EmbeddingService(embeddingConfig);
    this.initEmbeddingSchema();
  }

  /**
   * Initialize embedding schema
   */
  private initEmbeddingSchema(): void {
    const db = (this as any).db;

    // Check if embedding column exists
    const tableInfo = db.prepare("PRAGMA table_info(memories)").all();
    const hasEmbedding = tableInfo.some((col: any) => col.name === 'embedding');

    if (!hasEmbedding) {
      // Add embedding column to existing table
      db.exec(`
        ALTER TABLE memories ADD COLUMN embedding TEXT;
      `);

      // Create index for faster lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories(embedding);
      `);

      console.log('[SemanticMemoryRepository] Added embedding column to memories table');
    }
  }

  /**
   * Create memory with automatic embedding generation
   */
  async createWithEmbedding(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    // Create memory first
    const memory = this.create(entry);

    // Generate and store embedding
    try {
      await this.generateAndStoreEmbedding(memory.id, this.getEmbeddingText(memory));
    } catch (error) {
      console.error(`[SemanticMemoryRepository] Failed to generate embedding for memory ${memory.id}:`, error);
    }

    return memory;
  }

  /**
   * Bulk create memories with embeddings
   */
  async bulkCreateWithEmbeddings(
    entries: Array<Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<MemoryEntry[]> {
    // Create memories first
    const memories = this.bulkCreate(entries);

    // Generate embeddings in batch
    const texts = memories.map((m) => this.getEmbeddingText(m));
    try {
      const embeddings = await this.embeddingService.generateBatchEmbeddings(texts);

      const db = (this as any).db;
      const updateStmt = db.prepare('UPDATE memories SET embedding = ? WHERE id = ?');

      const transaction = db.transaction(() => {
        for (let i = 0; i < memories.length; i++) {
          const embedding = embeddings[i];
          const memory = memories[i];
          if (embedding && memory) {
            const embeddingJson = JSON.stringify(embedding.embedding);
            updateStmt.run(embeddingJson, memory.id);
            this.embeddingCache.set(memory.id, embedding.embedding);
          }
        }
      });

      transaction();
    } catch (error) {
      console.error('[SemanticMemoryRepository] Failed to generate batch embeddings:', error);
    }

    return memories;
  }

  /**
   * Generate and store embedding for a memory
   */
  async generateAndStoreEmbedding(memoryId: string, text: string): Promise<void> {
    const result = await this.embeddingService.generateEmbedding(text);
    const embeddingJson = JSON.stringify(result.embedding);

    const db = (this as any).db;
    const stmt = db.prepare('UPDATE memories SET embedding = ? WHERE id = ?');
    stmt.run(embeddingJson, memoryId);

    // Cache the embedding
    this.embeddingCache.set(memoryId, result.embedding);
  }

  /**
   * Get embedding for a memory
   */
  getEmbedding(memoryId: string): number[] | null {
    // Check cache first
    if (this.embeddingCache.has(memoryId)) {
      return this.embeddingCache.get(memoryId)!;
    }

    const db = (this as any).db;
    const stmt = db.prepare('SELECT embedding FROM memories WHERE id = ?');
    const row = stmt.get(memoryId) as { embedding: string | null };

    if (row && row.embedding) {
      const embedding = JSON.parse(row.embedding);
      this.embeddingCache.set(memoryId, embedding);
      return embedding;
    }

    return null;
  }

  /**
   * Perform semantic search
   */
  async semanticSearch(params: SemanticSearchParams): Promise<SemanticSearchResult[]> {
    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(params.query);

    // Build filter conditions
    const conditions: string[] = ['embedding IS NOT NULL'];
    const values: any[] = [];

    if (params.roomId) {
      conditions.push('roomId = ?');
      values.push(params.roomId);
    }

    if (params.types && params.types.length > 0) {
      conditions.push(`type IN (${params.types.map(() => '?').join(',')})`);
      values.push(...params.types);
    }

    if (params.statuses && params.statuses.length > 0) {
      conditions.push(`status IN (${params.statuses.map(() => '?').join(',')})`);
      values.push(...params.statuses);
    }

    if (params.priorities && params.priorities.length > 0) {
      conditions.push(`priority IN (${params.priorities.map(() => '?').join(',')})`);
      values.push(...params.priorities);
    }

    // Get all candidate memories
    const db = (this as any).db;
    let sql = 'SELECT * FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...values);
    const deserialize = (this as any).deserializeMemory.bind(this);

    // Calculate similarities
    const results: SemanticSearchResult[] = [];
    for (const row of rows) {
      if (!row.embedding) continue;

      const embedding = JSON.parse(row.embedding);
      const similarity = EmbeddingService.cosineSimilarity(queryEmbedding.embedding, embedding);

      // Apply minimum similarity threshold
      if (params.minSimilarity && similarity < params.minSimilarity) {
        continue;
      }

      const memory = deserialize(row);
      results.push({
        memory,
        similarity,
        rank: 0, // Will be set after sorting
      });
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Set ranks and apply limit
    const limit = params.limit || 10;
    const topResults = results.slice(0, limit);
    topResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return topResults;
  }

  /**
   * Reindex all memories (regenerate embeddings)
   */
  async reindexAll(roomId?: string): Promise<{ processed: number; succeeded: number; failed: number }> {
    const filters: any = {};
    if (roomId) {
      filters.roomId = roomId;
    }

    const memories = this.query({ ...filters, limit: 10000 });

    let succeeded = 0;
    let failed = 0;

    for (const memory of memories) {
      try {
        const text = this.getEmbeddingText(memory);
        await this.generateAndStoreEmbedding(memory.id, text);
        succeeded++;
      } catch (error) {
        console.error(`[SemanticMemoryRepository] Failed to reindex memory ${memory.id}:`, error);
        failed++;
      }
    }

    return {
      processed: memories.length,
      succeeded,
      failed,
    };
  }

  /**
   * Get text for embedding generation
   * Combines content, summary, and context for better semantic representation
   */
  private getEmbeddingText(memory: MemoryEntry): string {
    const parts: string[] = [];

    if (memory.summary) {
      parts.push(memory.summary);
    }

    parts.push(memory.content);

    if (memory.context) {
      parts.push(memory.context);
    }

    if (memory.tags && memory.tags.length > 0) {
      parts.push(`Tags: ${memory.tags.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Get embedding service
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /**
   * Test embedding service connection
   */
  async testEmbeddingService(): Promise<boolean> {
    return this.embeddingService.testConnection();
  }

  /**
   * Clear embedding cache
   */
  clearEmbeddingCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get embedding cache size
   */
  getEmbeddingCacheSize(): number {
    return this.embeddingCache.size;
  }
}
