/**
 * Embedding Service
 * Generates vector embeddings for text using Ollama or other providers
 */

/**
 * Configuration for the embedding service
 */
export interface EmbeddingConfig {
  /** Provider type */
  provider: 'ollama' | 'openai' | 'local';

  /** Base URL for the embedding API */
  baseUrl: string;

  /** Model to use for embeddings */
  model: string;

  /** Embedding dimension size */
  dimension: number;

  /** API key (for OpenAI) */
  apiKey?: string;
}

/**
 * Default configuration using Ollama
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
  dimension: 768,
};

/**
 * Embedding result
 */
export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
  model: string;
}

/**
 * Embedding Service
 * Handles generation of vector embeddings for semantic search
 */
export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      ...DEFAULT_EMBEDDING_CONFIG,
      ...config,
    };
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    switch (this.config.provider) {
      case 'ollama':
        return this.generateOllamaEmbedding(text);
      case 'openai':
        return this.generateOpenAIEmbedding(text);
      case 'local':
        return this.generateLocalEmbedding(text);
      default:
        throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    // For now, process sequentially
    // TODO: Implement true batch processing for better performance
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      const result = await this.generateEmbedding(text);
      results.push(result);
    }
    return results;
  }

  /**
   * Generate embedding using Ollama
   */
  private async generateOllamaEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding request failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      return {
        embedding: data.embedding,
        dimension: data.embedding.length,
        model: this.config.model,
      };
    } catch (error) {
      throw new Error(`Failed to generate Ollama embedding: ${error}`);
    }
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateOpenAIEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI embedding request failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
      const embeddingData = data.data[0];
      if (!embeddingData) {
        throw new Error('OpenAI API returned no embedding data');
      }
      return {
        embedding: embeddingData.embedding,
        dimension: embeddingData.embedding.length,
        model: this.config.model,
      };
    } catch (error) {
      throw new Error(`Failed to generate OpenAI embedding: ${error}`);
    }
  }

  /**
   * Generate embedding using local model (placeholder)
   */
  private async generateLocalEmbedding(_text: string): Promise<EmbeddingResult> {
    // This is a placeholder for local embedding generation
    // In a real implementation, you would use a library like transformers.js
    throw new Error('Local embedding generation not yet implemented');
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Test connection to embedding service
   */
  async testConnection(): Promise<boolean> {
    try {
      const testResult = await this.generateEmbedding('test');
      return testResult.embedding.length > 0;
    } catch (error) {
      console.error('[EmbeddingService] Connection test failed:', error);
      return false;
    }
  }
}
