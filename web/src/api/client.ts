/**
 * API Client for PingPong Backend
 */

const API_BASE_URL = 'http://localhost:3000/api';

export interface Room {
  id: string;
  topic: string;
  mode: string;
  agentCount: number;
  messageCount: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  metadata?: any;
  roomId?: string;
  roomTopic?: string;
}

export interface RoomAnalytics {
  totalMessages: number;
  totalAgents: number;
  averageResponseTimeMs: number;
  mostActiveAgent?: string;
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  totalMessages: number;
  totalVotes: number;
  engagementScore: number;
  influenceScore: number;
}

export interface Recommendation {
  recommendedCapabilities: string[];
  recommendedRole: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RecommendationsResponse {
  roomId: string;
  conversationNeeds: {
    missingCapabilities: string[];
    conversationQuality: number;
    bottlenecks: string[];
    participationBalance: number;
  };
  recommendations: Recommendation[];
  recommendationCount: number;
}

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  return response.json();
}

export const api = {
  // Rooms
  getRooms: () => fetchAPI<{ rooms: Room[]; total: number }>('/rooms'),
  getRoom: (roomId: string) => fetchAPI<Room>(`/rooms/${roomId}`),

  // Agents
  getAgents: () => fetchAPI<{ agents: Agent[]; total: number }>('/agents'),
  getAgent: (agentId: string) => fetchAPI<Agent>(`/agents/${agentId}`),

  // Analytics
  getRoomAnalytics: (roomId: string) => fetchAPI<RoomAnalytics>(`/analytics/rooms/${roomId}`),
  getAgentMetrics: (agentId: string, timeWindow?: number) =>
    fetchAPI<AgentMetrics>(`/analytics/agents/${agentId}${timeWindow ? `?timeWindow=${timeWindow}` : ''}`),
  getRoomAgentMetrics: (roomId: string) =>
    fetchAPI<{ roomId: string; metrics: AgentMetrics[]; total: number }>(`/analytics/rooms/${roomId}/agents`),
  getLeaderboard: (roomId: string, metric: 'engagement' | 'influence' = 'engagement', limit: number = 10) =>
    fetchAPI<{ roomId: string; metric: string; leaderboard: any[] }>(`/analytics/rooms/${roomId}/leaderboard?metric=${metric}&limit=${limit}`),

  // Recommendations
  getRecommendations: (roomId: string) => fetchAPI<RecommendationsResponse>(`/recommendations/${roomId}`),

  // Export
  exportConversation: (roomId: string, format: 'json' | 'markdown' | 'html' = 'json') => {
    window.open(`${API_BASE_URL}/export/${roomId}?format=${format}`, '_blank');
  },
};
