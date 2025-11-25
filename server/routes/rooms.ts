/**
 * Rooms API Routes
 */

import { Router, Request, Response } from 'express';
import { RoomManager } from '../room-manager.js';

export function createRoomsRouter(roomManager: RoomManager): Router {
  const router = Router();

  /**
   * GET /api/rooms
   * List all rooms
   */
  router.get('/', (_req: Request, res: Response): void => {
    try {
      const rooms = roomManager.listRooms();
      res.json({
        rooms: rooms.map((room) => ({
          id: room.id,
          topic: room.topic,
          mode: room.mode,
          agentCount: room.agentCount,
          messageCount: room.getMessageCount(),
        })),
        total: rooms.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list rooms', message: (error as Error).message });
    }
  });

  /**
   * GET /api/rooms/:roomId
   * Get detailed room information
   */
  router.get('/:roomId', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const room = roomManager.getRoom(roomId!);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      res.json({
        id: room.id,
        topic: room.topic,
        mode: room.mode,
        agentCount: room.agentCount,
        messageCount: room.getMessageCount(),
        agents: room.getAgents().map((agent: { id: string; name: string; role: string }) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
        })),
        conversationSummary: room.getConversationSummary(20),
        qualityMetrics: room.getQualityMetrics(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get room', message: (error as Error).message });
    }
  });

  /**
   * GET /api/rooms/:roomId/agents
   * Get agents in a specific room
   */
  router.get('/:roomId/agents', (req: Request, res: Response): void => {
    try {
      const { roomId } = req.params;
      const room = roomManager.getRoom(roomId!);

      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const agents = room.getAgents();
      res.json({
        roomId,
        agents: agents.map((agent: { id: string; name: string; role: string; metadata?: any }) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          metadata: agent.metadata,
        })),
        total: agents.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agents', message: (error as Error).message });
    }
  });

  /**
   * GET /api/rooms/search
   * Search rooms by topic
   */
  router.get('/search', (req: Request, res: Response): void => {
    try {
      const { topic } = req.query;

      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic query parameter is required' });
        return;
      }

      const rooms = roomManager.findRoomsByTopic(topic);
      res.json({
        query: topic,
        rooms: rooms.map((room) => ({
          id: room.id,
          topic: room.topic,
          mode: room.mode,
          agentCount: room.agentCount,
        })),
        total: rooms.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to search rooms', message: (error as Error).message });
    }
  });

  return router;
}
