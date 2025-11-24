/**
 * PingPong WebSocket Server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './room.js';
import { ClientCommandSchema } from '../shared/protocol.js';

/**
 * Start the PingPong server
 *
 * @param port Port to listen on
 * @param topic Room discussion topic
 * @returns Shutdown function
 */
export async function startServer(
  port: number,
  topic: string,
): Promise<() => void> {
  const wss = new WebSocketServer({ port });
  const room = new Room('default', topic);

  console.log(`PingPong Server started on port ${port}`);
  console.log(`Room topic: "${topic}"`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('New connection');

    ws.on('message', (data) => {
      try {
        // Parse JSON
        const message = JSON.parse(data.toString());

        // Validate command schema
        const command = ClientCommandSchema.parse(message);

        // Handle command
        room.handleCommand(ws, command);
      } catch (error) {
        // Send error to client
        const errorMessage = error instanceof Error ? error.message : 'Invalid command format';
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: errorMessage,
            timestamp: Date.now(),
          }),
        );
      }
    });

    ws.on('close', () => {
      console.log('Connection closed');
      room.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Return shutdown function
  return () => {
    console.log('\nShutting down server...');
    room.shutdown();
    wss.close(() => {
      console.log('Server closed');
    });
  };
}

/**
 * Main entry point when run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 8080;
  const TOPIC = process.argv[2] || 'Should we use microservices or monolith?';

  const shutdown = await startServer(PORT, TOPIC);

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
}
