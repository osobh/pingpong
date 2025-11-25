/**
 * Agents API Routes - Agent Discovery
 */

import { Router, Request, Response } from 'express';
import { RoomManager } from '../room-manager.js';

export function createAgentsRouter(roomManager: RoomManager): Router {
  const router = Router();

  /**
   * GET /api/agents
   * Get all active agents across all rooms
   */
  router.get('/', (_req: Request, res: Response): void => {
    try {
      const rooms = roomManager.listRooms();
      const allAgents: any[] = [];
      const seen = new Set<string>();

      for (const room of rooms) {
        const agents = room.getAgents();
        for (const agent of agents) {
          const key = `${agent.id}-${room.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            allAgents.push({
              ...agent,
              roomId: room.id,
              roomTopic: room.topic,
            });
          }
        }
      }

      res.json({
        agents: allAgents,
        total: allAgents.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agents', message: (error as Error).message });
    }
  });

  /**
   * GET /api/agents/:agentId
   * Get detailed information about a specific agent
   */
  router.get('/:agentId', (req: Request, res: Response): void => {
    try {
      const { agentId } = req.params;
      const rooms = roomManager.listRooms();

      for (const room of rooms) {
        const agents = room.getAgents();
        const agent = agents.find((a: { id: string }) => a.id === agentId);

        if (agent) {
          res.json({
            ...agent,
            roomId: room.id,
            roomTopic: room.topic,
          });
          return;
        }
      }

      res.status(404).json({ error: 'Agent not found' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agent', message: (error as Error).message });
    }
  });

  return router;
}
