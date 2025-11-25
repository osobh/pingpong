/**
 * Recommendation Engine - Suggests agents to add based on conversation analysis
 */

import type { Room } from './room.js';
import { AgentCapability } from '../shared/agent-metadata.js';

export interface AgentRecommendation {
  recommendedCapabilities: AgentCapability[];
  recommendedRole: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ConversationNeeds {
  missingCapabilities: AgentCapability[];
  conversationQuality: number;
  bottlenecks: string[];
  participationBalance: number;
}

/**
 * RecommendationEngine analyzes rooms and suggests beneficial agents
 */
export class RecommendationEngine {
  /**
   * Analyze a room's conversation to identify needs
   */
  analyzeRoomNeeds(room: Room): ConversationNeeds {
    const agents = room.getAgents();
    const analytics = room.getRoomAnalytics();
    const qualityMetrics = room.getQualityMetrics();

    // Identify present capabilities
    const presentCapabilities = new Set<AgentCapability>();
    for (const agent of agents) {
      if (agent.metadata?.capabilities) {
        agent.metadata.capabilities.forEach((cap: AgentCapability) => presentCapabilities.add(cap));
      }
    }

    // Identify missing capabilities
    const allCapabilities = Object.values(AgentCapability);
    const missingCapabilities = allCapabilities.filter((cap) => !presentCapabilities.has(cap));

    // Calculate conversation quality score (0-100)
    const conversationQuality = this.calculateConversationQuality(analytics, qualityMetrics);

    // Identify bottlenecks
    const bottlenecks: string[] = [];
    if (qualityMetrics.participationBalance < 0.5) {
      bottlenecks.push('unbalanced_participation');
    }
    if (analytics.averageResponseTimeMs > 60000) {
      bottlenecks.push('slow_responses');
    }
    if (qualityMetrics.messagesPerMinute < 0.5) {
      bottlenecks.push('low_activity');
    }

    return {
      missingCapabilities,
      conversationQuality,
      bottlenecks,
      participationBalance: qualityMetrics.participationBalance,
    };
  }

  /**
   * Generate agent recommendations for a room
   */
  recommendAgents(room: Room): AgentRecommendation[] {
    const needs = this.analyzeRoomNeeds(room);
    const recommendations: AgentRecommendation[] = [];

    // Recommend moderator if conversation quality is low
    if (needs.conversationQuality < 40 && needs.missingCapabilities.includes(AgentCapability.MODERATE)) {
      recommendations.push({
        recommendedCapabilities: [AgentCapability.MODERATE, AgentCapability.SUMMARIZE],
        recommendedRole: 'moderator',
        reason: 'Low conversation quality detected. A moderator can guide the discussion.',
        priority: 'high',
      });
    }

    // Recommend critic if no critical analysis present
    if (needs.missingCapabilities.includes(AgentCapability.CODE_REVIEW) &&
        needs.missingCapabilities.includes(AgentCapability.ANALYZE)) {
      recommendations.push({
        recommendedCapabilities: [AgentCapability.ANALYZE, AgentCapability.CODE_REVIEW],
        recommendedRole: 'critic',
        reason: 'No critical analysis capability present. A critic can identify potential issues.',
        priority: 'medium',
      });
    }

    // Recommend architect if no proposal or decision-making capability
    if (needs.missingCapabilities.includes(AgentCapability.PROPOSE) &&
        needs.missingCapabilities.includes(AgentCapability.DECISION_MAKING)) {
      recommendations.push({
        recommendedCapabilities: [AgentCapability.PROPOSE, AgentCapability.DECISION_MAKING],
        recommendedRole: 'architect',
        reason: 'No proposal or decision-making capability. An architect can drive structural decisions.',
        priority: 'medium',
      });
    }

    // Recommend pragmatist if activity is low
    if (needs.bottlenecks.includes('low_activity')) {
      recommendations.push({
        recommendedCapabilities: [AgentCapability.PROPOSE, AgentCapability.DECISION_MAKING],
        recommendedRole: 'pragmatist',
        reason: 'Low conversation activity. A pragmatist can energize the discussion with actionable ideas.',
        priority: 'low',
      });
    }

    // If participation is unbalanced, recommend adding more agents
    if (needs.bottlenecks.includes('unbalanced_participation') && room.agentCount < 5) {
      recommendations.push({
        recommendedCapabilities: [AgentCapability.VOTE],
        recommendedRole: 'participant',
        reason: 'Unbalanced participation. Adding more agents can improve discussion diversity.',
        priority: 'low',
      });
    }

    return recommendations;
  }

  /**
   * Calculate overall conversation quality score (0-100)
   */
  private calculateConversationQuality(analytics: any, qualityMetrics: any): number {
    let score = 50; // Start at neutral

    // Factor: Message count (healthy if > 10)
    if (analytics.totalMessages > 10) {
      score += 15;
    } else if (analytics.totalMessages > 5) {
      score += 10;
    }

    // Factor: Participation balance (healthy if > 0.6)
    score += qualityMetrics.participationBalance * 20;

    // Factor: Response time (healthy if < 30s)
    const responseTimeMinutes = analytics.averageResponseTimeMs / (1000 * 60);
    if (responseTimeMinutes < 0.5) {
      score += 15;
    } else if (responseTimeMinutes < 2) {
      score += 10;
    } else if (responseTimeMinutes > 5) {
      score -= 10;
    }

    // Factor: Message rate (healthy if > 1 per minute)
    if (qualityMetrics.messagesPerMinute > 1) {
      score += 10;
    } else if (qualityMetrics.messagesPerMinute < 0.5) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}
