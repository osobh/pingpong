/**
 * MentionParser - Utility for parsing @mentions in messages
 * Supports @AgentName syntax for directed messages
 */

export class MentionParser {
  /**
   * Regular expression to match @mentions
   * Matches @ followed by word characters (letters, numbers, underscore, hyphen)
   * Must not be preceded by a word character (to avoid email addresses)
   */
  private static readonly MENTION_REGEX = /(?<!\w)@([\w-]+)/g;

  /**
   * Extract all @mentions from a message
   * @param message The message to parse
   * @returns Array of mentioned agent names (without @), deduplicated
   */
  static extractMentions(message: string): string[] {
    const mentions = new Set<string>();
    const matches = message.matchAll(this.MENTION_REGEX);

    for (const match of matches) {
      const mentionedName = match[1];
      if (mentionedName) {
        mentions.add(mentionedName);
      }
    }

    return Array.from(mentions);
  }

  /**
   * Check if a specific agent is mentioned in a message
   * @param message The message to check
   * @param agentName The agent name to look for (case-sensitive)
   * @returns True if the agent is mentioned
   */
  static isMentioned(message: string, agentName: string): boolean {
    const mentions = this.extractMentions(message);
    return mentions.includes(agentName);
  }

  /**
   * Check if a message contains any @mentions
   * @param message The message to check
   * @returns True if the message has at least one @mention
   */
  static hasMentions(message: string): boolean {
    return this.MENTION_REGEX.test(message);
  }
}
