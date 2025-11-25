/**
 * Manual test for cross-server agent communication
 *
 * This script demonstrates two servers communicating via shared MessageBus
 */

import { startServer } from './server/index.js';
import { InMemoryMessageBus } from './shared/message-bus.js';

// Create a shared message bus
const sharedBus = new InMemoryMessageBus();
await sharedBus.connect();

console.log('=== Starting Multi-Server Test ===\n');
console.log('Shared MessageBus initialized\n');

// Start Server 1 on port 8081
console.log('Starting Server 1 on port 8081...');
const server1 = await startServer(8081, 'Cross-server test topic', {
  bus: sharedBus,
  serverId: 'server-1',
});
console.log('');

// Start Server 2 on port 8082
console.log('Starting Server 2 on port 8082...');
const server2 = await startServer(8082, 'Cross-server test topic', {
  bus: sharedBus,
  serverId: 'server-2',
});
console.log('');

console.log('=== Both servers running ===');
console.log('Server 1: ws://localhost:8081 (serverId: server-1)');
console.log('Server 2: ws://localhost:8082 (serverId: server-2)');
console.log('');
console.log('Instructions:');
console.log('1. Open two terminals');
console.log('2. In terminal 1: node dist/agent/index.js --id alice --name Alice --role architect --server ws://localhost:8081');
console.log('3. In terminal 2: node dist/agent/index.js --id bob --name Bob --role critic --server ws://localhost:8082');
console.log('');
console.log('Watch as messages from Alice (server 1) appear for Bob (server 2) and vice versa!');
console.log('');
console.log('Press Ctrl+C to stop all servers');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  await server1();
  await server2();
  await sharedBus.disconnect();
  console.log('Shutdown complete');
  process.exit(0);
});
