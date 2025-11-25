/**
 * ConversationMemory - Manages conversation history and context for agents
 * Provides storage, retrieval, and context-building for agent conversations
 */

/**
 * Message stored in conversation memory
 */
export interface ConversationMessage {
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  timestamp: number;
}

/**
 * Configuration options for ConversationMemory
 */
export interface MemoryConfig {
  maxMessages?: number; // Maximum number of messages to store
}

/**
 * ConversationMemory class manages conversation history
 */
export class ConversationMemory {
  private messages: ConversationMessage[] = [];
  private maxMessages: number;

  constructor(config: MemoryConfig = {}) {
    this.maxMessages = config.maxMessages ?? 100; // Default to 100 messages
  }

  /**
   * Add a message to memory
   */
  addMessage(message: ConversationMessage): void {
    this.messages.push(message);

    // Enforce memory limit (keep most recent messages)
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  /**
   * Get recent messages (most recent first in the returned array)
   * @param limit Maximum number of messages to return (defaults to all)
   * @returns Array of messages in chronological order
   */
  getRecentMessages(limit?: number): ConversationMessage[] {
    if (limit === undefined) {
      return [...this.messages];
    }

    // Get the last 'limit' messages
    const start = Math.max(0, this.messages.length - limit);
    return this.messages.slice(start);
  }

  /**
   * Get messages by a specific agent
   */
  getMessagesByAgent(agentId: string): ConversationMessage[] {
    return this.messages.filter((msg) => msg.agentId === agentId);
  }

  /**
   * Get messages by role
   */
  getMessagesByRole(role: string): ConversationMessage[] {
    return this.messages.filter((msg) => msg.role === role);
  }

  /**
   * Get messages since a specific timestamp
   */
  getMessagesSince(timestamp: number): ConversationMessage[] {
    return this.messages.filter((msg) => msg.timestamp > timestamp);
  }

  /**
   * Build a context summary from recent messages
   * @param limit Maximum number of messages to include
   * @returns Formatted conversation transcript
   */
  getContextSummary(limit?: number): string {
    const messages = this.getRecentMessages(limit);

    if (messages.length === 0) {
      return '';
    }

    // Format as conversation transcript
    return messages.map((msg) => `${msg.agentName}: ${msg.content}`).join('\n');
  }

  /**
   * Get total message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages from memory
   */
  clear(): void {
    this.messages = [];
  }
}
