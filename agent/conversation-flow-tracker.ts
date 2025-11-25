/**
 * ConversationFlowTracker - Monitors conversation patterns and flow
 * Detects stalls, circular discussions, and tracks conversation health
 */

import { ConversationMessage } from './conversation-memory.js';

/**
 * Configuration for ConversationFlowTracker
 */
export interface FlowTrackerConfig {
  stallThresholdMs?: number; // Time in ms to consider conversation stalled (default: 30s)
  circularWindowSize?: number; // Number of recent messages to check for circularity (default: 6)
  topicWindowSize?: number; // Number of recent messages to extract topics from (default: 10)
}

/**
 * Flow statistics interface
 */
export interface FlowStats {
  messageCount: number;
  messagesPerMinute: number;
  isStalled: boolean;
  isCircular: boolean;
  activeTopics: string[];
}

/**
 * ConversationFlowTracker analyzes conversation patterns
 */
export class ConversationFlowTracker {
  private messages: ConversationMessage[] = [];
  private stallThresholdMs: number;
  private circularWindowSize: number;
  private topicWindowSize: number;

  constructor(config: FlowTrackerConfig = {}) {
    this.stallThresholdMs = config.stallThresholdMs ?? 30000; // 30 seconds default
    this.circularWindowSize = config.circularWindowSize ?? 6;
    this.topicWindowSize = config.topicWindowSize ?? 10;
  }

  /**
   * Add a message to track
   */
  addMessage(message: ConversationMessage): void {
    this.messages.push(message);
  }

  /**
   * Check if conversation has stalled
   */
  isStalled(): boolean {
    if (this.messages.length === 0) {
      return false;
    }

    const lastMessage = this.messages[this.messages.length - 1]!;
    const timeSinceLastMessage = Date.now() - lastMessage.timestamp;

    return timeSinceLastMessage > this.stallThresholdMs;
  }

  /**
   * Check if conversation is circular (repeating topics)
   */
  isCircular(): boolean {
    if (this.messages.length < 4) {
      return false; // Need at least 4 messages to detect circularity
    }

    // Get recent messages for analysis
    const recentMessages = this.messages.slice(-this.circularWindowSize);

    // Extract keywords from each message
    const messageKeywords = recentMessages.map((msg) => this.extractKeywords(msg.content));

    // Check for repeated patterns
    // If more than 50% of recent messages share common keywords, consider it circular
    const sharedKeywords = this.findSharedKeywords(messageKeywords);
    const repetitionThreshold = 0.5;

    if (sharedKeywords.length === 0) {
      return false;
    }

    // Count how many messages contain the shared keywords
    let messagesWithSharedKeywords = 0;
    for (const keywords of messageKeywords) {
      const hasSharedKeyword = sharedKeywords.some((shared) => keywords.includes(shared));
      if (hasSharedKeyword) {
        messagesWithSharedKeywords++;
      }
    }

    const repetitionRate = messagesWithSharedKeywords / recentMessages.length;
    return repetitionRate > repetitionThreshold;
  }

  /**
   * Get current topics being discussed
   */
  getCurrentTopics(): string[] {
    if (this.messages.length === 0) {
      return [];
    }

    // Get recent messages for topic extraction
    const recentMessages = this.messages.slice(-this.topicWindowSize);

    // Extract keywords from all recent messages
    const allKeywords = recentMessages.flatMap((msg) => this.extractKeywords(msg.content));

    // Count keyword frequencies
    const keywordFrequency = new Map<string, number>();
    for (const keyword of allKeywords) {
      keywordFrequency.set(keyword, (keywordFrequency.get(keyword) ?? 0) + 1);
    }

    // Return keywords that appear more than once (indicating they're topics)
    return Array.from(keywordFrequency.entries())
      .filter(([, count]) => count > 1)
      .sort(([, a], [, b]) => b - a)
      .map(([keyword]) => keyword);
  }

  /**
   * Get comprehensive flow statistics
   */
  getFlowStats(): FlowStats {
    return {
      messageCount: this.messages.length,
      messagesPerMinute: this.calculateMessagesPerMinute(),
      isStalled: this.isStalled(),
      isCircular: this.isCircular(),
      activeTopics: this.getCurrentTopics(),
    };
  }

  /**
   * Clear all tracked messages
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Calculate messages per minute
   */
  private calculateMessagesPerMinute(): number {
    if (this.messages.length < 2) {
      return 0; // Need at least 2 messages to calculate rate
    }

    const firstMessage = this.messages[0]!;
    const lastMessage = this.messages[this.messages.length - 1]!;
    const timeSpanMs = lastMessage.timestamp - firstMessage.timestamp;

    if (timeSpanMs === 0) {
      return 0;
    }

    const timeSpanMinutes = timeSpanMs / 60000;
    return this.messages.length / timeSpanMinutes;
  }

  /**
   * Extract keywords from a message
   */
  private extractKeywords(content: string): string[] {
    // Convert to lowercase and remove punctuation
    const cleaned = content.toLowerCase().replace(/[^\w\s]/g, ' ');

    // Split into words
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

    // Filter out common stop words
    const stopWords = new Set([
      'a',
      'an',
      'and',
      'are',
      'as',
      'at',
      'be',
      'but',
      'by',
      'for',
      'if',
      'in',
      'into',
      'is',
      'it',
      'no',
      'not',
      'of',
      'on',
      'or',
      'such',
      'that',
      'the',
      'their',
      'then',
      'there',
      'these',
      'they',
      'this',
      'to',
      'was',
      'will',
      'with',
      'we',
      'should',
      'would',
      'could',
      'has',
      'have',
      'had',
      'do',
      'does',
      'did',
      'can',
      'i',
      'you',
      'he',
      'she',
      'our',
      'my',
      'your',
    ]);

    return words.filter((word) => !stopWords.has(word) && word.length > 3);
  }

  /**
   * Find keywords shared across multiple message keyword sets
   */
  private findSharedKeywords(messageKeywords: string[][]): string[] {
    if (messageKeywords.length < 2) {
      return [];
    }

    // Count how many messages each keyword appears in
    const keywordAppearances = new Map<string, number>();

    for (const keywords of messageKeywords) {
      const uniqueKeywords = new Set(keywords);
      for (const keyword of uniqueKeywords) {
        keywordAppearances.set(keyword, (keywordAppearances.get(keyword) ?? 0) + 1);
      }
    }

    // Return keywords that appear in at least 2 messages
    return Array.from(keywordAppearances.entries())
      .filter(([, count]) => count >= 2)
      .map(([keyword]) => keyword);
  }
}
