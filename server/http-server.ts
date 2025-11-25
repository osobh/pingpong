/**
 * HTTP Server - Express REST API alongside WebSocket server
 * Provides API endpoints for room management, analytics, export, and agent discovery
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { RoomManager } from './room-manager.js';
import { createRoomsRouter } from './routes/rooms.js';
import { createAgentsRouter } from './routes/agents.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createExportRouter } from './routes/export.js';
import { createRecommendationsRouter } from './routes/recommendations.js';

export interface HTTPServerConfig {
  port: number;
  roomManager: RoomManager;
  enableCors?: boolean;
}

/**
 * Create and configure Express HTTP server
 */
export function createHTTPServer(config: HTTPServerConfig): Express {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
  }));

  // Enable CORS for web dashboard
  if (config.enableCors) {
    app.use(cors({
      origin: true, // Allow all origins in development
      credentials: true,
    }));
  }

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Compression middleware
  app.use(compression());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // API routes
  app.use('/api/rooms', createRoomsRouter(config.roomManager));
  app.use('/api/agents', createAgentsRouter(config.roomManager));
  app.use('/api/analytics', createAnalyticsRouter(config.roomManager));
  app.use('/api/export', createExportRouter(config.roomManager));
  app.use('/api/recommendations', createRecommendationsRouter(config.roomManager));

  // Serve static files for web dashboard (if exists)
  app.use(express.static('web/dist'));

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  return app;
}

/**
 * Start HTTP server
 */
export function startHTTPServer(config: HTTPServerConfig): void {
  const app = createHTTPServer(config);

  app.listen(config.port, () => {
    console.log(`HTTP API server running on http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    console.log(`API base URL: http://localhost:${config.port}/api`);
  });
}
