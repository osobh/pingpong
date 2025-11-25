/**
 * Analytics Engine - Tracks and analyzes agent performance metrics
 */

import type { ProposalRepository, MessageRecord, VoteRecord } from './proposal-repository.js';

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  agentId: string;
  agentName: string;
  roomId: string;

  // Message metrics
  totalMessages: number;
  messagesPerHour: number;
  averageMessageLength: number;
  messageQualityScore: number; // 0-100

  // Response metrics
  averageResponseTimeMs: number;
  medianResponseTimeMs: number;

  // Voting metrics
  totalVotes: number;
  yesVoteCount: number;
  noVoteCount: number;
  abstainVoteCount: number;
  yesVotePercentage: number;
  noVotePercentage: number;
  abstainVotePercentage: number;

  // Proposal metrics
  proposalsCreated: number;
  proposalsApproved: number;
  proposalsRejected: number;

  // Engagement metrics
  engagementScore: number; // 0-100, based on response times and message frequency
  influenceScore: number; // 0-100, based on proposal success rate and vote patterns

  // Time period
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  activeDurationMs: number;
}

/**
 * Room-wide analytics
 */
export interface RoomAnalytics {
  roomId: string;
  totalMessages: number;
  totalAgents: number;
  totalProposals: number;
  averageMessagesPerAgent: number;
  averageResponseTimeMs: number;
  mostActiveAgent: { agentId: string; agentName: string; messageCount: number } | null;
  mostInfluentialAgent: { agentId: string; agentName: string; influenceScore: number } | null;
  topContributors: Array<{ agentId: string; agentName: string; engagementScore: number }>;
}

/**
 * AnalyticsEngine calculates performance metrics for agents
 */
export class AnalyticsEngine {
  constructor(private repository: ProposalRepository) {}

  /**
   * Calculate performance metrics for a specific agent in a room
   */
  calculateAgentMetrics(
    agentId: string,
    roomId: string,
    timeWindowMs?: number,
  ): AgentPerformanceMetrics | null {
    const now = Date.now();
    const startTime = timeWindowMs ? now - timeWindowMs : 0;

    // Get agent messages
    const allMessages = this.repository.getMessagesByAgent(agentId, roomId);
    const messages = timeWindowMs
      ? allMessages.filter((m) => m.timestamp >= startTime)
      : allMessages;

    if (messages.length === 0) {
      return null; // No data for this agent
    }

    // Get agent name from first message
    const agentName = messages[0]?.agentName || 'Unknown';

    // Calculate message metrics
    const totalMessages = messages.length;
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    const averageMessageLength = totalLength / totalMessages;

    // Calculate time-based metrics
    const timestamps = messages.map((m) => m.timestamp).sort((a, b) => a - b);
    const firstMessageAt = timestamps[0] || null;
    const lastMessageAt = timestamps[timestamps.length - 1] || null;
    const activeDurationMs = lastMessageAt && firstMessageAt ? lastMessageAt - firstMessageAt : 0;
    const activeDurationHours = activeDurationMs / (1000 * 60 * 60);
    const messagesPerHour = activeDurationHours > 0 ? totalMessages / activeDurationHours : 0;

    // Calculate response times
    const roomMessages = this.repository.getMessagesByRoom(roomId);
    const responseTimes = this.calculateResponseTimes(agentId, roomMessages);
    const averageResponseTimeMs =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;
    const medianResponseTimeMs = this.calculateMedian(responseTimes);

    // Calculate message quality score (heuristic based)
    const messageQualityScore = this.calculateMessageQuality(messages, averageMessageLength);

    // Get voting data
    const proposals = this.repository.getProposalsByRoom(roomId);
    const votes: VoteRecord[] = [];
    for (const proposal of proposals) {
      const vote = this.repository.getVoteByAgent(proposal.id, agentId);
      if (vote) {
        votes.push(vote);
      }
    }

    const totalVotes = votes.length;
    const yesVoteCount = votes.filter((v) => v.voteType === 'yes').length;
    const noVoteCount = votes.filter((v) => v.voteType === 'no').length;
    const abstainVoteCount = votes.filter((v) => v.voteType === 'abstain').length;

    const yesVotePercentage = totalVotes > 0 ? (yesVoteCount / totalVotes) * 100 : 0;
    const noVotePercentage = totalVotes > 0 ? (noVoteCount / totalVotes) * 100 : 0;
    const abstainVotePercentage = totalVotes > 0 ? (abstainVoteCount / totalVotes) * 100 : 0;

    // Get proposal data
    const agentProposals = proposals.filter((p) => p.proposerId === agentId);
    const proposalsCreated = agentProposals.length;
    const proposalsApproved = agentProposals.filter((p) => p.status === 'approved').length;
    const proposalsRejected = agentProposals.filter((p) => p.status === 'rejected').length;

    // Calculate engagement score (0-100)
    const engagementScore = this.calculateEngagementScore(
      messagesPerHour,
      averageResponseTimeMs,
      totalVotes,
      proposalsCreated,
    );

    // Calculate influence score (0-100)
    const influenceScore = this.calculateInfluenceScore(
      proposalsCreated,
      proposalsApproved,
      yesVotePercentage,
      messageQualityScore,
    );

    return {
      agentId,
      agentName,
      roomId,
      totalMessages,
      messagesPerHour,
      averageMessageLength,
      messageQualityScore,
      averageResponseTimeMs,
      medianResponseTimeMs,
      totalVotes,
      yesVoteCount,
      noVoteCount,
      abstainVoteCount,
      yesVotePercentage,
      noVotePercentage,
      abstainVotePercentage,
      proposalsCreated,
      proposalsApproved,
      proposalsRejected,
      engagementScore,
      influenceScore,
      firstMessageAt,
      lastMessageAt,
      activeDurationMs,
    };
  }

  /**
   * Calculate analytics for entire room
   */
  calculateRoomAnalytics(roomId: string): RoomAnalytics {
    const messages = this.repository.getMessagesByRoom(roomId);
    const proposals = this.repository.getProposalsByRoom(roomId);
    const agents = this.repository.getAgentMetadataByRoom(roomId);

    const totalMessages = messages.length;
    const totalAgents = agents.length;
    const totalProposals = proposals.length;
    const averageMessagesPerAgent = totalAgents > 0 ? totalMessages / totalAgents : 0;

    // Calculate average response time across all agents
    const allResponseTimes: number[] = [];
    for (const agent of agents) {
      const responseTimes = this.calculateResponseTimes(agent.agentId, messages);
      allResponseTimes.push(...responseTimes);
    }
    const averageResponseTimeMs =
      allResponseTimes.length > 0
        ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
        : 0;

    // Find most active agent
    const agentMessageCounts = new Map<string, { agentName: string; count: number }>();
    for (const message of messages) {
      const current = agentMessageCounts.get(message.agentId);
      if (current) {
        current.count++;
      } else {
        agentMessageCounts.set(message.agentId, { agentName: message.agentName, count: 1 });
      }
    }

    let mostActiveAgent: { agentId: string; agentName: string; messageCount: number } | null = null;
    for (const [agentId, data] of agentMessageCounts) {
      if (!mostActiveAgent || data.count > mostActiveAgent.messageCount) {
        mostActiveAgent = { agentId, agentName: data.agentName, messageCount: data.count };
      }
    }

    // Calculate influence scores for all agents and find most influential
    const agentInfluence: Array<{
      agentId: string;
      agentName: string;
      influenceScore: number;
      engagementScore: number;
    }> = [];

    for (const agent of agents) {
      const metrics = this.calculateAgentMetrics(agent.agentId, roomId);
      if (metrics) {
        agentInfluence.push({
          agentId: agent.agentId,
          agentName: agent.agentName,
          influenceScore: metrics.influenceScore,
          engagementScore: metrics.engagementScore,
        });
      }
    }

    const mostInfluentialAgent =
      agentInfluence.length > 0
        ? agentInfluence.reduce((max, curr) =>
            curr.influenceScore > max.influenceScore ? curr : max,
          )
        : null;

    // Get top 5 contributors by engagement score
    const topContributors = agentInfluence
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 5)
      .map((a) => ({ agentId: a.agentId, agentName: a.agentName, engagementScore: a.engagementScore }));

    return {
      roomId,
      totalMessages,
      totalAgents,
      totalProposals,
      averageMessagesPerAgent,
      averageResponseTimeMs,
      mostActiveAgent,
      mostInfluentialAgent: mostInfluentialAgent
        ? {
            agentId: mostInfluentialAgent.agentId,
            agentName: mostInfluentialAgent.agentName,
            influenceScore: mostInfluentialAgent.influenceScore,
          }
        : null,
      topContributors,
    };
  }

  /**
   * Calculate response times for an agent
   * Response time = time between another agent's message and this agent's next message
   */
  private calculateResponseTimes(agentId: string, roomMessages: MessageRecord[]): number[] {
    const sortedMessages = roomMessages.sort((a, b) => a.timestamp - b.timestamp);
    const responseTimes: number[] = [];

    for (let i = 0; i < sortedMessages.length - 1; i++) {
      const currentMsg = sortedMessages[i];
      const nextMsg = sortedMessages[i + 1];

      // If current message is from another agent and next is from this agent
      if (currentMsg && nextMsg && currentMsg.agentId !== agentId && nextMsg.agentId === agentId) {
        const responseTime = nextMsg.timestamp - currentMsg.timestamp;
        // Only count responses within 10 minutes (avoid counting unrelated messages)
        if (responseTime < 600000) {
          responseTimes.push(responseTime);
        }
      }
    }

    return responseTimes;
  }

  /**
   * Calculate median of array
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    } else {
      return sorted[mid] ?? 0;
    }
  }

  /**
   * Calculate message quality score (0-100) based on heuristics
   */
  private calculateMessageQuality(messages: MessageRecord[], averageLength: number): number {
    let score = 50; // Start at 50

    // Length score (prefer moderate length messages)
    if (averageLength >= 50 && averageLength <= 500) {
      score += 20;
    } else if (averageLength >= 30 && averageLength <= 1000) {
      score += 10;
    } else if (averageLength < 20) {
      score -= 10; // Too short
    }

    // Consistency score (prefer consistent message length)
    const lengths = messages.map((m) => m.content.length);
    const variance =
      lengths.reduce((sum, len) => sum + Math.pow(len - averageLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = averageLength > 0 ? stdDev / averageLength : 0;

    if (coefficientOfVariation < 0.5) {
      score += 15; // Consistent message length
    } else if (coefficientOfVariation > 1.5) {
      score -= 10; // Very inconsistent
    }

    // Punctuation and structure (simple heuristic)
    const messagesWithPunctuation = messages.filter(
      (m) => m.content.includes('.') || m.content.includes('?') || m.content.includes('!'),
    ).length;
    const punctuationRatio = messagesWithPunctuation / messages.length;
    score += punctuationRatio * 15;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate engagement score (0-100)
   */
  private calculateEngagementScore(
    messagesPerHour: number,
    averageResponseTimeMs: number,
    totalVotes: number,
    proposalsCreated: number,
  ): number {
    let score = 0;

    // Message frequency (0-40 points)
    if (messagesPerHour >= 5) {
      score += 40;
    } else if (messagesPerHour >= 2) {
      score += 30;
    } else if (messagesPerHour >= 1) {
      score += 20;
    } else if (messagesPerHour >= 0.5) {
      score += 10;
    }

    // Response time (0-30 points, faster = better)
    const responseTimeMinutes = averageResponseTimeMs / (1000 * 60);
    if (responseTimeMinutes < 1) {
      score += 30;
    } else if (responseTimeMinutes < 3) {
      score += 20;
    } else if (responseTimeMinutes < 5) {
      score += 10;
    }

    // Voting participation (0-15 points)
    if (totalVotes >= 5) {
      score += 15;
    } else if (totalVotes >= 3) {
      score += 10;
    } else if (totalVotes >= 1) {
      score += 5;
    }

    // Proposal creation (0-15 points)
    if (proposalsCreated >= 3) {
      score += 15;
    } else if (proposalsCreated >= 2) {
      score += 10;
    } else if (proposalsCreated >= 1) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate influence score (0-100)
   */
  private calculateInfluenceScore(
    proposalsCreated: number,
    proposalsApproved: number,
    yesVotePercentage: number,
    messageQualityScore: number,
  ): number {
    let score = 0;

    // Proposal success rate (0-40 points)
    if (proposalsCreated > 0) {
      const successRate = proposalsApproved / proposalsCreated;
      score += successRate * 40;
    }

    // Positive voting pattern (0-20 points)
    // More "yes" votes suggest constructive engagement
    if (yesVotePercentage >= 60) {
      score += 20;
    } else if (yesVotePercentage >= 40) {
      score += 10;
    }

    // Message quality (0-40 points)
    score += (messageQualityScore / 100) * 40;

    return Math.max(0, Math.min(100, score));
  }
}
