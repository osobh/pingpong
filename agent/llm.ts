/**
 * AgentLLM - Wrapper for Ollama LLM with role-specific prompting
 */

import { Ollama, type Message } from 'ollama';
import { AgentRole, ConversationMode, MODE_CONFIGS } from '../shared/types.js';

/**
 * Configuration for AgentLLM
 */
export interface AgentLLMConfig {
  host: string;
  model: string;
  role: AgentRole;
  // Optional LLM parameters
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
}

/**
 * Role-specific system prompts
 */
const ROLE_PROMPTS: Record<string, string> = {
  architect: `You are an Architect agent in a technical discussion. Your role is to:
- Design high-level system architecture
- Think about scalability, maintainability, and extensibility
- Propose structural solutions
- Consider long-term implications
- Vote on architectural decisions based on their long-term impact

You can participate in voting when proposals are made. Keep responses focused and concise (2-3 sentences). Focus on architectural concerns.`,

  critic: `You are a Critic agent in a technical discussion. Your role is to:
- Question assumptions and find potential problems
- Identify risks and edge cases
- Challenge proposed solutions constructively
- Ensure robustness and reliability
- Vote thoughtfully on proposals, considering risks

You can participate in voting when proposals are made. Keep responses focused and concise (2-3 sentences). Focus on potential issues and risks.`,

  pragmatist: `You are a Pragmatist agent in a technical discussion. Your role is to:
- Focus on practical implementation
- Balance ideals with constraints (time, resources, complexity)
- Propose actionable next steps
- Find middle ground between competing ideas
- Vote based on practical feasibility

You can participate in voting when proposals are made. Keep responses focused and concise (2-3 sentences). Focus on practical solutions.`,

  moderator: `You are a Moderator agent in a technical discussion. Your role is to:
- Guide the conversation through structured topics and sub-topics
- Detect when discussion stalls or becomes circular
- Intervene to refocus or inject new perspectives
- Summarize key points and identify decision points
- CREATE PROPOSALS when the group reaches natural decision points
- Facilitate voting and consensus-building
- Maintain meta-awareness of conversation flow and quality

When you detect emerging consensus or key decisions, create a formal proposal. Keep responses focused (2-4 sentences). You are an active participant who structures and guides the discussion.`,
};

/**
 * AgentLLM class wraps Ollama for agent-specific LLM interactions
 */
export class AgentLLM {
  private ollama: Ollama;
  private config: AgentLLMConfig;
  private conversationHistory: Message[] = [];
  private systemPrompt: string;

  constructor(config: AgentLLMConfig) {
    this.config = config;
    this.ollama = new Ollama({ host: config.host });
    const prompt = ROLE_PROMPTS[config.role];
    this.systemPrompt = prompt !== undefined ? prompt : (ROLE_PROMPTS['architect'] ?? '');
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(): Promise<void> {
    try {
      const models = await this.ollama.list();
      const hasModel = models.models.some((m) => m.name === this.config.model);
      if (!hasModel) {
        throw new Error(
          `Model ${this.config.model} not found. Available models: ${models.models.map((m) => m.name).join(', ')}`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to Ollama at ${this.config.host}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Generate response for a user prompt with optional mode modifier
   */
  async generateResponse(prompt: string, mode?: ConversationMode): Promise<string> {
    const userMessage: Message = {
      role: 'user',
      content: prompt,
    };

    this.conversationHistory.push(userMessage);

    // Build system prompt with mode modifier if provided
    let effectiveSystemPrompt = this.systemPrompt;
    if (mode) {
      const modeConfig = MODE_CONFIGS[mode];
      effectiveSystemPrompt = `${this.systemPrompt}\n\n${modeConfig.promptModifier}`;
    }

    const messages: Message[] = [
      { role: 'system', content: effectiveSystemPrompt },
      ...this.conversationHistory,
    ];

    try {
      // Build options object with optional parameters
      const options: any = {};
      if (this.config.temperature !== undefined) options.temperature = this.config.temperature;
      if (this.config.topP !== undefined) options.top_p = this.config.topP;
      if (this.config.topK !== undefined) options.top_k = this.config.topK;
      if (this.config.repeatPenalty !== undefined) options.repeat_penalty = this.config.repeatPenalty;

      const response = await this.ollama.chat({
        model: this.config.model,
        messages,
        stream: false,
        options: Object.keys(options).length > 0 ? options : undefined,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.message.content,
      };

      this.conversationHistory.push(assistantMessage);

      return response.message.content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Respond to a discussion topic
   */
  async respondToTopic(topic: string, mode?: ConversationMode): Promise<string> {
    const prompt = `Discussion Topic: ${topic}\n\nPlease share your perspective as a ${this.config.role}.`;
    return this.generateResponse(prompt, mode);
  }

  /**
   * Respond to another agent's message
   */
  async respondToMessage(message: string, mode?: ConversationMode): Promise<string> {
    const prompt = `Another agent said: "${message}"\n\nPlease respond with your perspective as a ${this.config.role}.`;
    return this.generateResponse(prompt, mode);
  }

  /**
   * Respond to a message with flow context (for moderators)
   */
  async respondToMessageWithFlowContext(
    message: string,
    flowContext: {
      isStalled: boolean;
      isCircular: boolean;
      activeTopics: string[];
      messageCount: number;
      pendingProposals?: number;
      approvedProposals?: number;
      rejectedProposals?: number;
    },
    mode?: ConversationMode,
  ): Promise<string> {
    let contextInfo = '';

    if (flowContext.isStalled) {
      contextInfo += '\n\n[FLOW CONTEXT: Conversation has stalled. Consider intervening to re-energize the discussion.]';
    }

    if (flowContext.isCircular) {
      contextInfo += '\n\n[FLOW CONTEXT: Discussion is becoming circular. Consider redirecting to a new sub-topic, summarizing to find consensus, or suggesting a vote.]';
    }

    if (flowContext.activeTopics.length > 0) {
      contextInfo += `\n\n[ACTIVE TOPICS: ${flowContext.activeTopics.join(', ')}]`;
    }

    // Add consensus/proposal context
    if (flowContext.pendingProposals !== undefined && flowContext.pendingProposals > 0) {
      contextInfo += `\n\n[CONSENSUS: ${flowContext.pendingProposals} pending proposal(s) awaiting votes.]`;
    }

    if (flowContext.approvedProposals !== undefined && flowContext.approvedProposals > 0) {
      contextInfo += `\n\n[CONSENSUS: ${flowContext.approvedProposals} proposal(s) have been approved.]`;
    }

    const prompt = `Another agent said: "${message}"${contextInfo}\n\nPlease respond with your perspective as a ${this.config.role}.`;
    return this.generateResponse(prompt, mode);
  }

  /**
   * Analyze conversation to detect if a proposal should be created (for moderators)
   * @param recentMessages Recent conversation messages
   * @returns Object with shouldPropose flag and proposal details if applicable
   */
  async analyzeForProposal(recentMessages: Array<{ agentName: string; content: string }>): Promise<{
    shouldPropose: boolean;
    title?: string;
    description?: string;
  }> {
    const conversationSummary = recentMessages
      .map((m) => `${m.agentName}: ${m.content}`)
      .join('\n');

    const prompt = `As a moderator, analyze this recent conversation:

${conversationSummary}

Should a formal proposal be created to reach consensus on a decision? Only suggest a proposal if:
1. A clear decision point has emerged
2. Multiple agents have discussed the topic
3. The group needs to commit to a direction

Respond in JSON format only:
{
  "shouldPropose": true/false,
  "title": "Brief title if proposing",
  "description": "Clear description if proposing"
}`;

    try {
      const response = await this.generateResponse(prompt);

      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          shouldPropose: parsed.shouldPropose === true,
          title: parsed.title,
          description: parsed.description,
        };
      }
    } catch (error) {
      // If JSON parsing fails, default to not proposing
    }

    return { shouldPropose: false };
  }

  /**
   * Generate a conversation summary for moderators
   * @param recentMessages Recent conversation messages
   * @returns AI-generated summary of conversation state and key points
   */
  async summarizeConversation(
    recentMessages: Array<{ agentName: string; role: string; content: string }>,
  ): Promise<{
    keyPoints: string[];
    conversationState: string;
    suggestedActions: string[];
  }> {
    const conversationText = recentMessages
      .map((m) => `${m.agentName} (${m.role}): ${m.content}`)
      .join('\n');

    const prompt = `As a moderator, analyze this recent conversation and provide:
1. Key discussion points (3-5 bullet points)
2. Current state of the conversation (active, stalled, circular, or consensus-building)
3. Suggested moderator actions (2-3 specific actions)

Conversation:
${conversationText}

Respond in JSON format only:
{
  "keyPoints": ["point 1", "point 2", ...],
  "conversationState": "active/stalled/circular/consensus-building",
  "suggestedActions": ["action 1", "action 2", ...]
}`;

    try {
      const response = await this.generateResponse(prompt);

      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          conversationState: parsed.conversationState || 'unknown',
          suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
        };
      }
    } catch (error) {
      // If parsing fails, return empty summary
    }

    return {
      keyPoints: [],
      conversationState: 'unknown',
      suggestedActions: [],
    };
  }

  /**
   * Decide how to vote on a proposal
   * @param proposalTitle The proposal title
   * @param proposalDescription The proposal description
   * @param conversationContext Recent conversation context
   * @param mode Optional conversation mode
   * @returns Object with vote decision and rationale
   */
  async decideVote(
    proposalTitle: string,
    proposalDescription: string,
    conversationContext: string,
    mode?: ConversationMode,
  ): Promise<{
    vote: 'yes' | 'no' | 'abstain';
    rationale: string;
  }> {
    const prompt = `As a ${this.config.role}, you need to vote on this proposal:

Title: ${proposalTitle}
Description: ${proposalDescription}

Conversation Context:
${conversationContext}

Consider your role's perspective and vote accordingly:
- "yes" if you support the proposal
- "no" if you oppose it
- "abstain" if you're neutral or need more information

Respond in JSON format only:
{
  "vote": "yes/no/abstain",
  "rationale": "Brief explanation (1-2 sentences)"
}`;

    try {
      const response = await this.generateResponse(prompt, mode);

      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const vote = parsed.vote?.toLowerCase();

        if (vote === 'yes' || vote === 'no' || vote === 'abstain') {
          return {
            vote: vote as 'yes' | 'no' | 'abstain',
            rationale: parsed.rationale || 'No rationale provided',
          };
        }
      }
    } catch (error) {
      // If parsing fails, default to abstain
    }

    return {
      vote: 'abstain',
      rationale: 'Unable to determine vote',
    };
  }
}
