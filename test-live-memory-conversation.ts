/**
 * Live Multi-Agent Conversation Test with Memory Extraction
 *
 * This script tests memory extraction in a real multi-agent conversation by:
 * 1. Starting a PingPong server
 * 2. Spawning 3 agents programmatically
 * 3. Having them conduct a conversation
 * 4. Monitoring memory extraction in real-time
 * 5. Validating extracted memories
 */

import { startServer } from './server/index.js';
import { AgentClient } from './agent/client.js';
import type { ServerEvent, MemoryRecordedEvent } from './shared/protocol.js';

// Test configuration
const TEST_PORT = 8090;
const SERVER_URL = `ws://localhost:${TEST_PORT}`;
const TEST_ROOM_ID = 'test-memory-room';
const TEST_TOPIC = 'Should we use GraphQL or REST for our new API?';

// Track memory extraction events
const extractedMemories: MemoryRecordedEvent[] = [];
let extractionStartTime = 0;

/**
 * Simulated agent that sends predefined messages
 */
class SimulatedAgent {
  private client: AgentClient;
  private messages: string[];
  private messageIndex = 0;

  constructor(
    private agentId: string,
    private agentName: string,
    private role: 'architect' | 'critic' | 'pragmatist',
    messages: string[]
  ) {
    this.client = new AgentClient({
      serverUrl: SERVER_URL,
      agentId,
      agentName,
      role,
    });
    this.messages = messages;
  }

  /**
   * Connect and join the room
   */
  async connect(): Promise<void> {
    const success = await this.client.connect();
    if (!success) {
      throw new Error(`Failed to connect agent ${this.agentName}`);
    }
    console.log(`✓ ${this.agentName} connected`);
  }

  /**
   * Set up event handlers
   */
  setupHandlers(onMemoryRecorded: (event: MemoryRecordedEvent) => void): void {
    this.client.on('event', (event: ServerEvent) => {
      if (event.type === 'MEMORY_RECORDED') {
        onMemoryRecorded(event as MemoryRecordedEvent);
      } else if (event.type === 'MESSAGE') {
        if (event.agentId !== this.agentId) {
          console.log(`  [${event.agentName}]: ${event.content}`);
        }
      }
    });
  }

  /**
   * Send the next message in the sequence
   */
  async sendNextMessage(): Promise<boolean> {
    if (this.messageIndex >= this.messages.length) {
      return false;
    }

    const message = this.messages[this.messageIndex++];
    console.log(`  [${this.agentName}]: ${message}`);
    await this.client.sendMessage(message);
    return true;
  }

  /**
   * Query memories
   */
  async queryMemories(): Promise<void> {
    // Send QUERY_MEMORY command directly via WebSocket
    const command = {
      type: 'QUERY_MEMORY',
      agentId: this.agentId,
      limit: 10,
      offset: 0,
      timestamp: Date.now(),
    };

    this.client['ws']?.send(JSON.stringify(command));
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}

/**
 * Run the live conversation test
 */
async function runLiveConversationTest(): Promise<void> {
  console.log('🧪 Live Multi-Agent Memory Extraction Test\n');
  console.log(`📡 Starting server on port ${TEST_PORT}`);
  console.log(`🎯 Topic: "${TEST_TOPIC}"\n`);

  // Start server
  const { shutdown, roomManager } = await startServer(TEST_PORT, TEST_TOPIC);

  // Small delay to ensure server is ready
  await new Promise(resolve => setTimeout(resolve, 500));

  // Create simulated agents with predefined conversation
  const alice = new SimulatedAgent(
    'alice-test',
    'Alice',
    'architect',
    [
      'We need to decide between GraphQL and REST for our new API. What are the key considerations?',
      'Good points. GraphQL gives us flexibility, but REST is simpler and well-understood by the team.',
      'I agree with REST. Let\'s document this decision and move forward.',
    ]
  );

  const bob = new SimulatedAgent(
    'bob-test',
    'Bob',
    'critic',
    [
      'GraphQL provides better client flexibility with its query language. We can avoid over-fetching.',
      'However, GraphQL has a steeper learning curve and caching is more complex than REST.',
      'One question: should we implement rate limiting differently for GraphQL?',
    ]
  );

  const charlie = new SimulatedAgent(
    'charlie-test',
    'Charlie',
    'pragmatist',
    [
      'REST has excellent tooling and our team already knows it well. That reduces risk.',
      'I think REST is the pragmatic choice. We can always add GraphQL later if needed.',
      'Bob, good question. Can you create a task to research GraphQL rate limiting strategies?',
      'Also, REST versioning is straightforward with /v1, /v2 endpoints.',
    ]
  );

  try {
    // Connect all agents
    console.log('🔌 Connecting agents...');
    await alice.connect();
    await bob.connect();
    await charlie.connect();
    console.log();

    // Set up memory recording handler
    const onMemoryRecorded = (event: MemoryRecordedEvent) => {
      if (extractedMemories.length === 0) {
        extractionStartTime = Date.now();
        console.log('\n⏱️  Memory extraction started...\n');
      }

      extractedMemories.push(event);
      console.log(`\n🧠 Memory Recorded (#${extractedMemories.length}):`);
      console.log(`   Type: ${event.memoryType.toUpperCase()}`);
      console.log(`   Priority: ${event.priority}`);
      console.log(`   Content: ${event.content}`);
      if (event.summary) {
        console.log(`   Summary: ${event.summary}`);
      }
      console.log(`   Tags: ${event.tags.join(', ')}`);
      console.log();
    };

    alice.setupHandlers(onMemoryRecorded);
    bob.setupHandlers(onMemoryRecorded);
    charlie.setupHandlers(onMemoryRecorded);

    // Run conversation with delays between messages
    console.log('💬 Starting conversation...\n');
    console.log('─'.repeat(70));

    const agents = [alice, bob, charlie, alice, bob, charlie, alice, bob, charlie, charlie];
    let messageCount = 0;

    for (const agent of agents) {
      const hasMore = await agent.sendNextMessage();
      if (!hasMore) continue;

      messageCount++;

      // Small delay between messages (simulate natural conversation)
      await new Promise(resolve => setTimeout(resolve, 800));

      // After 10 messages, wait for extraction to complete
      if (messageCount === 10) {
        console.log('\n─'.repeat(70));
        console.log(`\n✅ Sent 10 messages. Waiting for automatic extraction...\n`);

        // Wait up to 30 seconds for extraction
        const maxWait = 30000;
        const startWait = Date.now();
        while (extractedMemories.length === 0 && Date.now() - startWait < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (extractedMemories.length === 0) {
          console.log('⚠️  Warning: No memories extracted after 30 seconds');
        } else {
          const extractionTime = Date.now() - extractionStartTime;
          console.log(`✅ Extraction completed in ${extractionTime}ms\n`);
        }
      }
    }

    console.log('─'.repeat(70));
    console.log('\n💤 Conversation complete. Waiting 2 seconds for final events...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Display results
    console.log('═'.repeat(70));
    console.log('📊 EXTRACTION RESULTS');
    console.log('═'.repeat(70));
    console.log();
    console.log(`Messages sent: ${messageCount}`);
    console.log(`Memories extracted: ${extractedMemories.length}`);

    if (extractionStartTime > 0) {
      const totalTime = Date.now() - extractionStartTime;
      console.log(`Extraction time: ${totalTime}ms`);
    }
    console.log();

    // Analyze memory types
    if (extractedMemories.length > 0) {
      const typeCount = {
        decision: 0,
        insight: 0,
        question: 0,
        action_item: 0,
      };

      for (const event of extractedMemories) {
        typeCount[event.memoryType]++;
      }

      console.log('Memory Type Breakdown:');
      console.log(`  Decisions: ${typeCount.decision}`);
      console.log(`  Insights: ${typeCount.insight}`);
      console.log(`  Questions: ${typeCount.question}`);
      console.log(`  Action Items: ${typeCount.action_item}`);
      console.log();

      // Validate expected types
      const hasDecision = typeCount.decision > 0;
      const hasQuestion = typeCount.question > 0;
      const hasActionItem = typeCount.action_item > 0;

      console.log('✅ Validation:');
      console.log(`   ${hasDecision ? '✓' : '✗'} Contains DECISION memory`);
      console.log(`   ${hasQuestion ? '✓' : '✗'} Contains QUESTION memory`);
      console.log(`   ${hasActionItem ? '✓' : '✗'} Contains ACTION_ITEM memory`);
      console.log();

      if (hasDecision && hasQuestion && hasActionItem) {
        console.log('🎉 SUCCESS! All expected memory types extracted correctly.\n');
      } else {
        console.log('⚠️  WARNING: Some expected memory types were not extracted.\n');
      }

      // Display all memories
      console.log('═'.repeat(70));
      console.log('📝 ALL EXTRACTED MEMORIES');
      console.log('═'.repeat(70));
      console.log();

      for (let i = 0; i < extractedMemories.length; i++) {
        const event = extractedMemories[i];
        console.log(`Memory #${i + 1}:`);
        console.log(`  Type: ${event.memoryType.toUpperCase()}`);
        console.log(`  Priority: ${event.priority}`);
        console.log(`  Content: ${event.content}`);
        if (event.summary) {
          console.log(`  Summary: ${event.summary}`);
        }
        console.log(`  Tags: ${event.tags.join(', ')}`);
        console.log();
      }
    } else {
      console.log('⚠️  No memories were extracted from the conversation.');
      console.log('\n💡 Troubleshooting:');
      console.log('   1. Check that Ollama is running');
      console.log('   2. Verify model is available: ollama list');
      console.log('   3. Check OLLAMA_HOST and OLLAMA_MODEL environment variables');
    }

  } catch (error) {
    console.error('\n❌ Error during test:', error);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await alice.disconnect();
    await bob.disconnect();
    await charlie.disconnect();
    await shutdown();
    console.log('✅ Test complete!\n');
  }
}

// Run the test
runLiveConversationTest().catch(console.error);
