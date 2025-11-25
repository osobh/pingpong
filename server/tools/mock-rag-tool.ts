/**
 * Mock RAG Tool
 *
 * Simulates Retrieval-Augmented Generation (vector database search) for testing.
 */

import { IToolHandler } from './tool-executor.js';
import { RAGToolConfig } from '../../shared/room-tools.js';

/**
 * Mock Document in Vector Database
 */
interface MockDocument {
  id: string;
  content: string;
  metadata: {
    title: string;
    category: string;
    created: string;
  };
  embedding: number[]; // Simplified embedding
}

/**
 * Mock Vector Database Documents
 */
const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: 'doc-001',
    content:
      'PostgreSQL is a powerful, open-source relational database system. It supports ACID transactions and is known for reliability and data integrity.',
    metadata: {
      title: 'PostgreSQL Overview',
      category: 'database',
      created: '2025-01-15',
    },
    embedding: [0.8, 0.6, 0.3, 0.1, 0.2],
  },
  {
    id: 'doc-002',
    content:
      'TimescaleDB is an extension built on PostgreSQL for time-series data. It provides automatic partitioning and optimized queries for time-series workloads.',
    metadata: {
      title: 'TimescaleDB Features',
      category: 'database',
      created: '2025-01-16',
    },
    embedding: [0.7, 0.7, 0.4, 0.2, 0.1],
  },
  {
    id: 'doc-003',
    content:
      'Microservices architecture splits applications into loosely coupled services. Each service can be developed, deployed, and scaled independently.',
    metadata: {
      title: 'Microservices Architecture',
      category: 'architecture',
      created: '2025-01-17',
    },
    embedding: [0.2, 0.3, 0.9, 0.7, 0.4],
  },
  {
    id: 'doc-004',
    content:
      'Monolithic architecture combines all application components into a single codebase. It is simpler to develop initially but can become harder to scale.',
    metadata: {
      title: 'Monolithic Architecture',
      category: 'architecture',
      created: '2025-01-17',
    },
    embedding: [0.3, 0.2, 0.8, 0.6, 0.5],
  },
  {
    id: 'doc-005',
    content:
      'Connection pooling manages database connections efficiently by reusing existing connections instead of creating new ones for each request.',
    metadata: {
      title: 'Connection Pooling',
      category: 'performance',
      created: '2025-01-18',
    },
    embedding: [0.6, 0.5, 0.2, 0.3, 0.7],
  },
  {
    id: 'doc-006',
    content:
      'PgBouncer is a lightweight connection pooler for PostgreSQL. It supports transaction pooling, session pooling, and statement pooling modes.',
    metadata: {
      title: 'PgBouncer Guide',
      category: 'database',
      created: '2025-01-18',
    },
    embedding: [0.7, 0.6, 0.3, 0.2, 0.6],
  },
  {
    id: 'doc-007',
    content:
      'Disaster recovery strategies include backup and restore, replication, and failover mechanisms to ensure business continuity.',
    metadata: {
      title: 'Disaster Recovery',
      category: 'reliability',
      created: '2025-01-19',
    },
    embedding: [0.4, 0.4, 0.5, 0.6, 0.8],
  },
  {
    id: 'doc-008',
    content:
      'Schema migrations should be versioned, tested, and applied with zero-downtime strategies like blue-green deployments or rolling updates.',
    metadata: {
      title: 'Schema Migrations',
      category: 'database',
      created: '2025-01-19',
    },
    embedding: [0.6, 0.7, 0.3, 0.4, 0.3],
  },
];

/**
 * RAG Search Result
 */
interface RAGResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/**
 * Mock RAG Tool Handler
 */
export class MockRAGToolHandler implements IToolHandler {
  /**
   * Execute mock RAG query
   */
  async execute(
    config: unknown,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    const ragConfig = config as RAGToolConfig;
    const query = String(parameters['query'] || '').trim().toLowerCase();

    if (!query) {
      throw new Error('Query is required');
    }

    // Simulate embedding generation and search delay
    await this.delay(150 + Math.random() * 150); // 150-300ms

    // Generate mock query embedding
    const queryEmbedding = this.generateMockEmbedding(query);

    // Calculate similarity scores
    const results: RAGResult[] = MOCK_DOCUMENTS.map((doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    // Filter by score threshold
    const threshold = ragConfig.scoreThreshold || 0.0;
    const filteredResults = results.filter((result) => result.score >= threshold);

    // Sort by score descending
    filteredResults.sort((a, b) => b.score - a.score);

    // Apply top-k limit
    const topK = ragConfig.topK || 5;
    const topResults = filteredResults.slice(0, topK);

    return {
      query,
      provider: ragConfig.provider,
      results: topResults,
      count: topResults.length,
    };
  }

  /**
   * Generate mock embedding based on query keywords
   */
  private generateMockEmbedding(query: string): number[] {
    // Simplified: map keywords to dimensions
    const embedding = [0, 0, 0, 0, 0];

    if (query.includes('database') || query.includes('postgres')) {
      embedding[0] = 0.8;
      embedding[1] = 0.6;
    }

    if (query.includes('architecture') || query.includes('design')) {
      embedding[2] = 0.9;
      embedding[3] = 0.7;
    }

    if (query.includes('performance') || query.includes('scalability')) {
      embedding[1] = 0.7;
      embedding[4] = 0.8;
    }

    if (query.includes('microservice')) {
      embedding[2] = 0.9;
      embedding[3] = 0.8;
    }

    if (query.includes('monolith')) {
      embedding[2] = 0.8;
      embedding[3] = 0.7;
    }

    if (query.includes('connection') || query.includes('pooling')) {
      embedding[0] = 0.7;
      embedding[4] = 0.7;
    }

    if (query.includes('disaster') || query.includes('recovery')) {
      embedding[3] = 0.6;
      embedding[4] = 0.8;
    }

    if (query.includes('migration') || query.includes('schema')) {
      embedding[0] = 0.7;
      embedding[1] = 0.6;
    }

    return embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Simulate delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
