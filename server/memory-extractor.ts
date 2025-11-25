/**
 * Memory Extractor Service
 *
 * Automatically extracts memories from conversation messages using LLM.
 */

import {
  MemoryType,
  MemoryPriority,
  MemoryExtractionResult,
  MemoryExtractionRequest,
} from '../shared/room-memory.js';
import type { MessageEvent } from '../shared/protocol.js';

/**
 * Configuration for memory extraction
 */
export interface MemoryExtractorConfig {
  ollamaHost: string; // Ollama host URL
  model?: string; // Model to use (default: deepseek-r1:latest)
  minConfidence?: number; // Minimum confidence threshold (default: 0.7)
  maxTokens?: number; // Max tokens for LLM response (default: 2000)
}

/**
 * Memory Extractor Service
 */
export class MemoryExtractor {
  private config: Required<MemoryExtractorConfig>;

  private readonly EXTRACTION_PROMPT = `You are a memory extraction assistant analyzing a conversation between multiple agents discussing a topic.

Your task is to identify and extract important memories from the conversation. There are four types of memories:

1. DECISION: Key decisions made by the group
2. INSIGHT: Important insights, observations, or learnings
3. QUESTION: Unresolved questions that need answers
4. ACTION_ITEM: Tasks or actions that need to be done

For each memory you extract, provide:
- type: One of [decision, insight, question, action_item]
- content: The memory content (1-2 sentences)
- context: Additional context if needed (optional)
- confidence: Your confidence score (0.0 to 1.0)
- priority: One of [low, medium, high, critical]
- tags: Relevant tags (array of strings)

Return your response as a valid JSON array of memory objects. Only extract memories with clear value.

Example output format:
[
  {
    "type": "decision",
    "content": "We decided to use PostgreSQL for the database",
    "context": "Discussion about database selection for the new service",
    "confidence": 0.95,
    "priority": "high",
    "tags": ["database", "architecture", "postgresql"]
  },
  {
    "type": "action_item",
    "content": "Write unit tests for the authentication module",
    "confidence": 0.85,
    "priority": "medium",
    "tags": ["testing", "authentication"]
  }
]

Conversation to analyze:`;

  constructor(config: MemoryExtractorConfig) {
    this.config = {
      ollamaHost: config.ollamaHost,
      model: config.model || 'deepseek-r1:latest',
      minConfidence: config.minConfidence ?? 0.7,
      maxTokens: config.maxTokens || 2000,
    };
  }

  /**
   * Extract memories from a list of messages
   */
  async extractFromMessages(
    roomId: string,
    messages: MessageEvent[],
    options?: {
      extractTypes?: MemoryType[];
      minConfidence?: number;
    }
  ): Promise<MemoryExtractionResult> {
    if (messages.length === 0) {
      return {
        roomId,
        memories: [],
        extractedAt: Date.now(),
        messagesAnalyzed: 0,
      };
    }

    // Format messages for LLM
    const conversationText = this.formatMessages(messages);

    // Build prompt
    const prompt = `${this.EXTRACTION_PROMPT}\n\n${conversationText}`;

    try {
      // Call Ollama LLM
      const response = await fetch(`${this.config.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
          options: {
            num_predict: this.config.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = (await response.json()) as { response: string };
      const extractedMemories = this.parseExtractionResponse(data.response);

      // Apply filters
      const minConfidence = options?.minConfidence ?? this.config.minConfidence;
      const extractTypes = options?.extractTypes;

      let filtered = extractedMemories.filter((m) => m.confidence >= minConfidence);

      if (extractTypes && extractTypes.length > 0) {
        filtered = filtered.filter((m) => extractTypes.includes(m.type));
      }

      // Map message IDs and agent IDs
      const messageIds = messages.map((m) => m.messageId).filter((id): id is string => id !== undefined);
      const agentIds = Array.from(new Set(messages.map((m) => m.agentId)));

      const memories = filtered.map((m) => {
        const entry: any = {
          type: m.type,
          content: m.content,
          confidence: m.confidence,
          tags: m.tags,
          priority: m.priority,
        };
        if (m.context) entry.context = m.context;
        if (messageIds.length > 0) entry.relatedMessageIds = messageIds;
        if (agentIds.length > 0) entry.relatedAgentIds = agentIds;
        return entry;
      });

      return {
        roomId,
        memories,
        extractedAt: Date.now(),
        messagesAnalyzed: messages.length,
      };
    } catch (error) {
      console.error('Memory extraction failed:', error);
      return {
        roomId,
        memories: [],
        extractedAt: Date.now(),
        messagesAnalyzed: messages.length,
      };
    }
  }

  /**
   * Extract memories based on a time range
   */
  async extractFromRequest(
    request: MemoryExtractionRequest,
    messages: MessageEvent[]
  ): Promise<MemoryExtractionResult> {
    // Filter messages by time range if specified
    let filtered = messages;

    if (request.timeRange) {
      filtered = messages.filter(
        (m) => m.timestamp >= request.timeRange!.start && m.timestamp <= request.timeRange!.end
      );
    }

    // Filter by specific message IDs if specified
    if (request.messageIds && request.messageIds.length > 0) {
      filtered = filtered.filter((m) => m.messageId && request.messageIds!.includes(m.messageId));
    }

    const options: any = {};
    if (request.extractTypes) options.extractTypes = request.extractTypes;
    if (request.minConfidence !== undefined) options.minConfidence = request.minConfidence;

    return this.extractFromMessages(request.roomId, filtered, options);
  }

  /**
   * Format messages for LLM consumption
   */
  private formatMessages(messages: MessageEvent[]): string {
    return messages
      .map((msg) => {
        const timestamp = new Date(msg.timestamp).toISOString();
        return `[${timestamp}] ${msg.agentName} (${msg.role}): ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Clean and normalize JSON string from LLM output
   */
  private cleanJsonString(input: string): string {
    let cleaned = input;

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // Remove common LLM preambles/postambles
    cleaned = cleaned.replace(/^[^[{]*/,  '').replace(/[^}\]]*$/,  '');

    // Fix single quotes to double quotes (but preserve quotes inside strings)
    // This is a simple heuristic - replace single quotes around keys/values
    cleaned = cleaned.replace(/'([^']*?)':/g, '"$1":');
    cleaned = cleaned.replace(/:\s*'([^']*?)'/g, ': "$1"');

    // Remove trailing commas before closing brackets/braces
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    // Remove comments (// and /* */)
    cleaned = cleaned.replace(/\/\/.*$/gm, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    return cleaned.trim();
  }

  /**
   * Parse LLM extraction response with robust error handling
   */
  private parseExtractionResponse(response: string): Array<{
    type: MemoryType;
    content: string;
    context?: string;
    confidence: number;
    tags: string[];
    priority: MemoryPriority;
  }> {
    try {
      // Try to find JSON array in response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in extraction response');
        return [];
      }

      let jsonString = jsonMatch[0];
      let parsed: any;

      // Try parsing with cleaning
      try {
        jsonString = this.cleanJsonString(jsonString);
        parsed = JSON.parse(jsonString);
      } catch (firstError) {
        // If cleaning didn't help, try more aggressive fixes
        console.warn('First parse attempt failed, trying aggressive cleaning...');

        // More aggressive: replace all single quotes with double quotes
        jsonString = jsonString.replace(/'/g, '"');

        try {
          parsed = JSON.parse(jsonString);
        } catch (secondError) {
          // Last resort: try to extract individual objects
          console.warn('Second parse attempt failed, trying object extraction...');
          const objectMatches = jsonString.match(/\{[^{}]*\}/g);
          if (objectMatches && objectMatches.length > 0) {
            parsed = [];
            for (const objStr of objectMatches) {
              try {
                const obj = JSON.parse(this.cleanJsonString(objStr));
                parsed.push(obj);
              } catch {
                // Skip invalid objects
                continue;
              }
            }
          } else {
            throw secondError; // Give up
          }
        }
      }

      if (!Array.isArray(parsed)) {
        console.warn('Extraction response is not an array');
        return [];
      }

      // Validate and normalize each memory
      return parsed
        .filter((item) => this.isValidMemory(item))
        .map((item) => ({
          type: this.normalizeType(item.type),
          content: item.content,
          context: item.context,
          confidence: Math.max(0, Math.min(1, item.confidence)),
          tags: Array.isArray(item.tags) ? item.tags : [],
          priority: this.normalizePriority(item.priority),
        }));
    } catch (error) {
      console.error('Failed to parse extraction response:', error);
      console.error('Response snippet:', response.substring(0, 500));
      return [];
    }
  }

  /**
   * Validate memory object structure
   */
  private isValidMemory(item: any): boolean {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.type === 'string' &&
      typeof item.content === 'string' &&
      typeof item.confidence === 'number' &&
      item.content.trim().length > 0
    );
  }

  /**
   * Normalize memory type
   */
  private normalizeType(type: string): MemoryType {
    const normalized = type.toLowerCase().trim();
    switch (normalized) {
      case 'decision':
        return MemoryType.DECISION;
      case 'insight':
        return MemoryType.INSIGHT;
      case 'question':
        return MemoryType.QUESTION;
      case 'action_item':
      case 'action-item':
      case 'action item':
        return MemoryType.ACTION_ITEM;
      default:
        return MemoryType.INSIGHT; // Default to insight
    }
  }

  /**
   * Normalize priority
   */
  private normalizePriority(priority: string): MemoryPriority {
    const normalized = priority.toLowerCase().trim();
    switch (normalized) {
      case 'critical':
        return MemoryPriority.CRITICAL;
      case 'high':
        return MemoryPriority.HIGH;
      case 'medium':
        return MemoryPriority.MEDIUM;
      case 'low':
        return MemoryPriority.LOW;
      default:
        return MemoryPriority.MEDIUM; // Default to medium
    }
  }
}
