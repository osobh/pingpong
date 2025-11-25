/**
 * Recommendations API Routes
 */

import { Router, Request, Response } from 'express';
import { RoomManager } from '../room-manager.js';
import { RecommendationEngine } from '../recommendation-engine.js';

export function createRecommendationsRouter(roomManager: RoomManager): Router {
  const router = Router();
  const engine = new RecommendationEngine();

  /**
   * GET /api/recommendations/:roomId
   * Get agent recommendations for a room
   */
  router.get('/:roomId', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const room = roomManager.getRoom(roomId!);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const needs = engine.analyzeRoomNeeds(room);
      const recommendations = engine.recommendAgents(room);

      res.json({
        roomId,
        conversationNeeds: needs,
        recommendations,
        recommendationCount: recommendations.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get recommendations', message: (error as Error).message });
    }
  });

  return router;
}
