/**
 * Analytics API Routes
 */

import { Router, Request, Response } from 'express';
import { RoomManager } from '../room-manager.js';

export function createAnalyticsRouter(roomManager: RoomManager): Router {
  const router = Router();

  /**
   * GET /api/analytics/rooms/:roomId
   * Get room-wide analytics
   */
  router.get('/rooms/:roomId', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const room = roomManager.getRoom(roomId!);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const analytics = room.getRoomAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get room analytics', message: (error as Error).message });
    }
  });

  /**
   * GET /api/analytics/agents/:agentId
   * Get agent performance metrics
   * Query params: timeWindow (optional, in milliseconds)
   */
  router.get('/agents/:agentId', (req: Request, res: Response): void => {
    try {
      const { agentId } = req.params;
      const timeWindow = req.query['timeWindow'] ? parseInt(req.query['timeWindow'] as string) : undefined;

      const rooms = roomManager.listRooms();

      for (const room of rooms) {
        const metrics = room.getAgentPerformanceMetrics(agentId!, timeWindow);
        if (metrics) {
          res.json(metrics);
          return;
        }
      }

      res.status(404).json({ error: 'Agent not found or no metrics available' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agent metrics', message: (error as Error).message });
    }
  });

  /**
   * GET /api/analytics/rooms/:roomId/agents
   * Get performance metrics for all agents in a room
   * Query params: timeWindow (optional, in milliseconds)
   */
  router.get('/rooms/:roomId/agents', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const timeWindow = req.query['timeWindow'] ? parseInt(req.query['timeWindow'] as string) : undefined;

      const room = roomManager.getRoom(roomId!);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const metrics = room.getAllAgentMetrics(timeWindow);
      res.json({
        roomId,
        metrics,
        total: metrics.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agent metrics', message: (error as Error).message });
    }
  });

  /**
   * GET /api/analytics/rooms/:roomId/leaderboard
   * Get top performing agents in a room
   * Query params: metric (engagement|influence), limit (default: 10)
   */
  router.get('/rooms/:roomId/leaderboard', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const metric = (req.query['metric'] as string) || 'engagement';
      const limit = parseInt((req.query['limit'] as string) || '10');

      const room = roomManager.getRoom(roomId!);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const allMetrics = room.getAllAgentMetrics();

      // Sort by specified metric
      const sorted = allMetrics.sort((a, b) => {
        if (metric === 'engagement') {
          return b.engagementScore - a.engagementScore;
        } else if (metric === 'influence') {
          return b.influenceScore - a.influenceScore;
        }
        return 0;
      });

      const leaderboard = sorted.slice(0, limit).map((m, index) => ({
        rank: index + 1,
        agentId: m.agentId,
        agentName: m.agentName,
        score: metric === 'engagement' ? m.engagementScore : m.influenceScore,
        totalMessages: m.totalMessages,
        totalVotes: m.totalVotes,
      }));

      res.json({
        roomId,
        metric,
        leaderboard,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get leaderboard', message: (error as Error).message });
    }
  });

  return router;
}
