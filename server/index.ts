/**
 * PingPong WebSocket Server with Multi-Room Support
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { RoomManager } from './room-manager.js';
import { ClientCommandSchema } from '../shared/protocol.js';
import { InMemoryMessageBus, RedisMessageBus, type MessageBus } from '../shared/message-bus.js';
import type { ClientCommand } from '../shared/protocol.js';
import type { ConversationMode } from '../shared/types.js';
import { createHTTPServer } from './http-server.js';

/**
 * WebSocket connection context
 */
interface ConnectionContext {
  roomId?: string; // Current room the connection is in
}

/**
 * Start the PingPong server with multi-room support
 *
 * @param port Port to listen on
 * @param topic Default room topic (optional, for backward compatibility)
 * @param busConfig Optional MessageBus configuration (for cross-server communication)
 * @param mode Optional conversation mode for default room (defaults to 'deep')
 * @returns Object containing shutdown function and roomManager
 */
export async function startServer(
  port: number,
  topic?: string,
  busConfig?: { redisUrl?: string; serverId?: string; bus?: MessageBus },
  mode: ConversationMode = 'deep',
): Promise<{ shutdown: () => void; roomManager: RoomManager }> {
  // Initialize MessageBus if enabled
  let bus: MessageBus | undefined;
  let serverId: string | undefined;
  let shouldDisconnectBus = false;

  // Check for MessageBus configuration
  if (busConfig?.bus) {
    // Use provided bus instance (for testing)
    bus = busConfig.bus;
    serverId = busConfig.serverId || randomUUID();
    console.log(`Message Bus enabled (serverId: ${serverId}, shared instance)`);
  } else if (busConfig?.redisUrl || process.env['MESSAGE_BUS']) {
    serverId = busConfig?.serverId || randomUUID();

    // Get Redis URL from config or environment
    const redisUrl = busConfig?.redisUrl || process.env['MESSAGE_BUS'];

    // Use RedisMessageBus if URL starts with redis://, otherwise InMemoryMessageBus
    if (redisUrl && redisUrl.startsWith('redis://')) {
      bus = new RedisMessageBus(redisUrl);
      await bus.connect();
      shouldDisconnectBus = true;
      console.log(`Redis Message Bus enabled (serverId: ${serverId}, url: ${redisUrl})`);
    } else {
      bus = new InMemoryMessageBus();
      await bus.connect();
      shouldDisconnectBus = true;
      console.log(`InMemory Message Bus enabled (serverId: ${serverId})`);
    }
  }

  const wss = new WebSocketServer({ port });
  const roomManager = new RoomManager();
  const connectionContexts = new WeakMap<WebSocket, ConnectionContext>();

  // Create default room if topic provided (backward compatibility)
  if (topic) {
    roomManager.createRoom('default', topic, mode, bus, serverId);
  }

  console.log(`PingPong Server started on port ${port}`);
  console.log(`Room topic: "${topic}"`);
  console.log(`Room mode: ${mode}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('New connection');

    // Initialize connection context
    connectionContexts.set(ws, {});

    ws.on('message', (data) => {
      try {
        // Parse JSON
        const message = JSON.parse(data.toString());

        // Validate command schema
        const command: ClientCommand = ClientCommandSchema.parse(message);

        // Route command
        handleCommand(ws, command);
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
      handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  /**
   * Handle incoming command from client
   */
  function handleCommand(ws: WebSocket, command: ClientCommand): void {
    switch (command.type) {
      case 'CREATE_ROOM':
        handleCreateRoom(ws, command);
        break;

      case 'LIST_ROOMS':
        handleListRooms(ws, command);
        break;

      case 'JOIN':
        handleJoin(ws, command);
        break;

      case 'LEAVE_ROOM':
        handleLeaveRoom(ws, command);
        break;

      case 'MESSAGE':
      case 'LEAVE':
        // These require room context
        handleRoomCommand(ws, command);
        break;
    }
  }

  /**
   * Handle CREATE_ROOM command
   */
  function handleCreateRoom(ws: WebSocket, command: any): void {
    try {
      const mode: ConversationMode = command.mode || 'deep';
      const room = roomManager.createRoom(command.roomId, command.topic, mode, bus, serverId);

      // Send ROOM_CREATED event
      ws.send(
        JSON.stringify({
          type: 'ROOM_CREATED',
          roomId: room.id,
          topic: room.topic,
          mode: room.mode,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      // Send error (e.g., duplicate room ID)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create room';
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          message: errorMessage,
          timestamp: Date.now(),
        }),
      );
    }
  }

  /**
   * Handle LIST_ROOMS command
   */
  function handleListRooms(ws: WebSocket, _command: any): void {
    const rooms = roomManager.listRooms();

    // Send ROOM_LIST event
    ws.send(
      JSON.stringify({
        type: 'ROOM_LIST',
        rooms: rooms.map((room) => ({
          roomId: room.id,
          topic: room.topic,
          agentCount: room.agentCount,
        })),
        timestamp: Date.now(),
      }),
    );
  }

  /**
   * Handle JOIN command
   */
  function handleJoin(ws: WebSocket, command: any): void {
    // Get room ID (default to 'default')
    const roomId = command.roomId || 'default';

    // Get or create room
    let room = roomManager.getRoom(roomId);
    if (!room) {
      // Room doesn't exist - send error
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          message: `Room ${roomId} does not exist`,
          timestamp: Date.now(),
        }),
      );
      return;
    }

    // Update connection context
    const context = connectionContexts.get(ws);
    if (context) {
      context.roomId = roomId;
    }

    // Forward to room
    room.handleCommand(ws, command);
  }

  /**
   * Handle LEAVE_ROOM command
   */
  function handleLeaveRoom(ws: WebSocket, command: any): void {
    const room = roomManager.getRoom(command.roomId);
    if (!room) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          message: `Room ${command.roomId} does not exist`,
          timestamp: Date.now(),
        }),
      );
      return;
    }

    // Convert LEAVE_ROOM to LEAVE for the room
    const leaveCommand = {
      type: 'LEAVE' as const,
      agentId: command.agentId,
      timestamp: command.timestamp,
    };

    room.handleCommand(ws, leaveCommand);

    // Update connection context
    const context = connectionContexts.get(ws);
    if (context && context.roomId === command.roomId) {
      delete context.roomId;
    }
  }

  /**
   * Handle room-specific command (MESSAGE, LEAVE)
   */
  function handleRoomCommand(ws: WebSocket, command: ClientCommand): void {
    const context = connectionContexts.get(ws);
    const roomId = context?.roomId;

    if (!roomId) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          message: 'Not in any room. JOIN a room first.',
          timestamp: Date.now(),
        }),
      );
      return;
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          message: `Room ${roomId} no longer exists`,
          timestamp: Date.now(),
        }),
      );
      return;
    }

    // Forward to room
    room.handleCommand(ws, command);
  }

  /**
   * Handle WebSocket disconnect
   */
  function handleDisconnect(ws: WebSocket): void {
    const context = connectionContexts.get(ws);
    const roomId = context?.roomId;

    if (roomId) {
      const room = roomManager.getRoom(roomId);
      if (room) {
        room.handleDisconnect(ws);
      }
    }

    connectionContexts.delete(ws);
  }

  // Return shutdown function and roomManager
  const shutdown = async () => {
    console.log('\nShutting down server...');
    roomManager.shutdown();

    // Disconnect from message bus (only if we created it)
    if (bus && shouldDisconnectBus) {
      await bus.disconnect();
    }

    wss.close(() => {
      console.log('Server closed');
    });
  };

  return { shutdown, roomManager };
}

/**
 * Main entry point when run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const WS_PORT = process.env['WS_PORT'] ? parseInt(process.env['WS_PORT']) : 8080;
  const HTTP_PORT = process.env['HTTP_PORT'] ? parseInt(process.env['HTTP_PORT']) : 3000;
  const TOPIC = process.argv[2] || 'Should we use microservices or monolith?';

  // Start WebSocket server
  const { shutdown: shutdownWS, roomManager } = await startServer(WS_PORT, TOPIC);

  // Start HTTP API server with shared RoomManager
  const app = createHTTPServer({
    roomManager,
    enableCors: true,
    port: HTTP_PORT,
  });

  const httpServer = app.listen(HTTP_PORT, () => {
    console.log(`\nHTTP API server started on port ${HTTP_PORT}`);
    console.log(`WebSocket server is running on port ${WS_PORT}`);
    console.log(`\nAPI Endpoints:`);
    console.log(`  - GET  http://localhost:${HTTP_PORT}/api/rooms`);
    console.log(`  - GET  http://localhost:${HTTP_PORT}/api/agents`);
    console.log(`  - GET  http://localhost:${HTTP_PORT}/api/analytics/rooms/:roomId`);
    console.log(`  - GET  http://localhost:${HTTP_PORT}/api/export/:roomId?format=json|markdown|html`);
    console.log(`  - GET  http://localhost:${HTTP_PORT}/api/recommendations/:roomId\n`);
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', async () => {
    console.log('\nShutting down servers...');
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
    await shutdownWS();
    process.exit(0);
  });
}
