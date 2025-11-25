/**
 * Shared types for PingPong
 */

/**
 * Agent role types
 */
export type AgentRole =
  | 'architect'
  | 'critic'
  | 'pragmatist'
  | 'moderator'
  | 'participant';

/**
 * Room status
 */
export type RoomStatus =
  | 'created'
  | 'active'
  | 'paused'
  | 'concluded';

/**
 * Conversation mode
 */
export type ConversationMode = 'quick' | 'deep';

/**
 * Mode-specific configuration
 */
export interface ModeConfig {
  mode: ConversationMode;
  threshold: number; // Vote approval threshold
  timeoutSeconds: number; // Proposal timeout
  promptModifier: string; // Additional LLM prompt instructions
}

/**
 * Predefined mode configurations
 */
export const MODE_CONFIGS: Record<ConversationMode, ModeConfig> = {
  quick: {
    mode: 'quick',
    threshold: 0.4,
    timeoutSeconds: 30,
    promptModifier: 'BREVITY MODE: Respond in 1-2 sentences max. Make fast decisions. Focus on speed over depth.',
  },
  deep: {
    mode: 'deep',
    threshold: 0.6,
    timeoutSeconds: 300,
    promptModifier: 'THOROUGH MODE: Provide detailed analysis. Explore implications. Consider multiple perspectives.',
  },
};
