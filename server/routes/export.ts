/**
 * Export API Routes
 */

import { Router, Request, Response } from 'express';
import { RoomManager } from '../room-manager.js';
import type { ExportFormat } from '../conversation-exporter.js';

export function createExportRouter(roomManager: RoomManager): Router {
  const router = Router();

  /**
   * GET /api/export/:roomId
   * Export conversation in specified format (query param: format=json|markdown|html)
   */
  router.get('/:roomId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { roomId } = req.params;
      const format = (req.query['format'] as string) || 'json';

      if (!['json', 'markdown', 'html'].includes(format)) {
        res.status(400).json({ error: 'Invalid format. Must be json, markdown, or html' });
        return;
      }

      const room = roomManager.getRoom(roomId!);
      if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
      }

      const exported = await room.exportConversation(format as ExportFormat);

      // Set appropriate content type and download headers
      const contentTypes = {
        json: 'application/json',
        markdown: 'text/markdown',
        html: 'text/html',
      };

      const extensions = {
        json: 'json',
        markdown: 'md',
        html: 'html',
      };

      res.setHeader('Content-Type', contentTypes[format as ExportFormat]);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="conversation-${roomId}.${extensions[format as ExportFormat]}"`,
      );

      res.send(exported);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export conversation', message: (error as Error).message });
    }
  });

  /**
   * POST /api/export/batch
   * Batch export multiple rooms
   */
  router.post('/batch', async (req: Request, res: Response): Promise<void> => {
    try {
      const { roomIds, format } = req.body;

      if (!Array.isArray(roomIds) || roomIds.length === 0) {
        res.status(400).json({ error: 'roomIds must be a non-empty array' });
        return;
      }

      if (!['json', 'markdown', 'html'].includes(format)) {
        res.status(400).json({ error: 'Invalid format. Must be json, markdown, or html' });
        return;
      }

      const exports: Record<string, string> = {};
      const errors: Record<string, string> = {};

      for (const roomId of roomIds) {
        try {
          const room = roomManager.getRoom(roomId);
          if (room) {
            exports[roomId] = await room.exportConversation(format as ExportFormat);
          } else {
            errors[roomId] = 'Room not found';
          }
        } catch (error) {
          errors[roomId] = (error as Error).message;
        }
      }

      res.json({
        exports,
        errors,
        total: roomIds.length,
        successful: Object.keys(exports).length,
        failed: Object.keys(errors).length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to batch export', message: (error as Error).message });
    }
  });

  return router;
}
