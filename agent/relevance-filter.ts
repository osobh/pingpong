/**
 * RelevanceFilter - Determines if an agent should respond to a message
 * Considers mentions, role relevance, and participation frequency
 */

import { ConversationMessage } from './conversation-memory.js';
import { MentionParser } from './mention-parser.js';
import { AgentRole } from '../shared/types.js';

/**
 * Configuration for RelevanceFilter
 */
export interface RelevanceFilterConfig {
  agentName: string;
  role: AgentRole;
  responseCooldownMs?: number; // Cooldown between responses (default: 30s)
}

/**
 * Role-specific keywords that indicate relevance
 */
const ROLE_KEYWORDS: Record<AgentRole, string[]> = {
  architect: [
    'architecture',
    'system',
    'design',
    'structure',
    'scalability',
    'component',
    'module',
    'pattern',
    'framework',
  ],
  critic: ['risk', 'problem', 'issue', 'concern', 'edge case', 'failure', 'vulnerable', 'security'],
  pragmatist: [
    'implement',
    'practical',
    'build',
    'deploy',
    'timeline',
    'resource',
    'cost',
    'feasible',
  ],
  moderator: ['consensus', 'decision', 'vote', 'summary', 'next step', 'agree', 'disagree'],
  participant: [], // Generic participant has no specific keywords
};

/**
 * RelevanceFilter determines if an agent should respond to a message
 */
export class RelevanceFilter {
  private config: Required<RelevanceFilterConfig>;

  constructor(config: RelevanceFilterConfig) {
    this.config = {
      ...config,
      responseCooldownMs: config.responseCooldownMs ?? 30000, // 30 second default
    };
  }

  /**
   * Determine if the agent should respond to a message
   * @param message The message to evaluate
   * @param recentHistory Recent conversation history (to check participation)
   * @returns True if the agent should respond
   */
  shouldRespond(message: ConversationMessage, recentHistory: ConversationMessage[]): boolean {
    // Never respond to own messages
    if (message.agentName === this.config.agentName) {
      return false;
    }

    // Always respond when directly mentioned
    if (MentionParser.isMentioned(message.content, this.config.agentName)) {
      return true;
    }

    // Check if we responded too recently (cooldown)
    if (this.isInCooldown(recentHistory)) {
      return false;
    }

    // Check role-based relevance
    const isRelevant = this.isRoleRelevant(message);

    // Moderators should be more selective
    if (this.config.role === 'moderator') {
      // Only respond if highly relevant or if there are specific moderator keywords
      return isRelevant && this.hasModeratorKeywords(message);
    }

    return isRelevant;
  }

  /**
   * Check if agent is in cooldown period (responded too recently)
   */
  private isInCooldown(recentHistory: ConversationMessage[]): boolean {
    const now = Date.now();

    // Find most recent message from this agent
    const lastResponse = recentHistory
      .filter((msg) => msg.agentName === this.config.agentName)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!lastResponse) {
      return false; // No recent responses
    }

    const timeSinceLastResponse = now - lastResponse.timestamp;
    return timeSinceLastResponse < this.config.responseCooldownMs;
  }

  /**
   * Check if message is relevant to agent's role
   */
  private isRoleRelevant(message: ConversationMessage): boolean {
    const keywords = ROLE_KEYWORDS[this.config.role];

    if (!keywords || keywords.length === 0) {
      // No specific keywords, consider moderately relevant
      return Math.random() > 0.5; // 50% chance for generic roles
    }

    const contentLower = message.content.toLowerCase();

    // Check if any role-specific keywords are in the message
    return keywords.some((keyword) => contentLower.includes(keyword.toLowerCase()));
  }

  /**
   * Check if message contains moderator-specific keywords
   */
  private hasModeratorKeywords(message: ConversationMessage): boolean {
    const moderatorKeywords = ROLE_KEYWORDS['moderator'];
    const contentLower = message.content.toLowerCase();

    return moderatorKeywords.some((keyword) => contentLower.includes(keyword.toLowerCase()));
  }
}
