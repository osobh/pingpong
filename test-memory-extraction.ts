/**
 * Test script for automatic memory extraction with Ollama
 *
 * This script verifies that the MemoryExtractor can successfully:
 * 1. Connect to Ollama at the configured host
 * 2. Extract memories from a conversation
 * 3. Return properly formatted memory entries
 */

import { MemoryExtractor } from './server/memory-extractor.js';
import type { MessageEvent } from './shared/protocol.js';

async function testMemoryExtraction() {
  console.log('🧪 Testing Memory Extraction with Ollama\n');

  // Configuration
  const ollamaHost = process.env['OLLAMA_HOST'] || 'http://192.168.1.4:11434';
  const model = process.env['OLLAMA_MODEL'] || 'deepseek-r1:latest';
  console.log(`📡 Ollama Host: ${ollamaHost}`);
  console.log(`🤖 Model: ${model}\n`);

  // Initialize extractor
  const extractor = new MemoryExtractor({
    ollamaHost,
    model,
    minConfidence: 0.7,
  });

  // Create test conversation about a technical decision
  const testMessages: MessageEvent[] = [
    {
      type: 'MESSAGE',
      agentId: 'alice',
      agentName: 'Alice',
      role: 'architect',
      content: 'We need to decide on a database for our new microservice. What are our options?',
      timestamp: Date.now() - 50000,
    },
    {
      type: 'MESSAGE',
      agentId: 'bob',
      agentName: 'Bob',
      role: 'critic',
      content: 'The main options are PostgreSQL, MySQL, and MongoDB. PostgreSQL has the best support for complex queries.',
      timestamp: Date.now() - 40000,
    },
    {
      type: 'MESSAGE',
      agentId: 'charlie',
      agentName: 'Charlie',
      role: 'pragmatist',
      content: 'I agree with PostgreSQL. We already use it in production, so it reduces operational complexity.',
      timestamp: Date.now() - 30000,
    },
    {
      type: 'MESSAGE',
      agentId: 'alice',
      agentName: 'Alice',
      role: 'architect',
      content: 'Great point. PostgreSQL also has excellent JSON support for flexible schemas.',
      timestamp: Date.now() - 20000,
    },
    {
      type: 'MESSAGE',
      agentId: 'bob',
      agentName: 'Bob',
      role: 'critic',
      content: 'We should make sure to use connection pooling. That was an issue in our last service.',
      timestamp: Date.now() - 15000,
    },
    {
      type: 'MESSAGE',
      agentId: 'charlie',
      agentName: 'Charlie',
      role: 'pragmatist',
      content: 'Absolutely. We need to configure pgBouncer for connection pooling.',
      timestamp: Date.now() - 10000,
    },
    {
      type: 'MESSAGE',
      agentId: 'alice',
      agentName: 'Alice',
      role: 'architect',
      content: 'Okay, so we are decided: PostgreSQL with pgBouncer for connection pooling.',
      timestamp: Date.now() - 5000,
    },
    {
      type: 'MESSAGE',
      agentId: 'bob',
      agentName: 'Bob',
      role: 'critic',
      content: 'One question: should we use read replicas for scaling read operations?',
      timestamp: Date.now() - 3000,
    },
    {
      type: 'MESSAGE',
      agentId: 'charlie',
      agentName: 'Charlie',
      role: 'pragmatist',
      content: 'Good question. We should evaluate that after we see the actual load patterns.',
      timestamp: Date.now() - 2000,
    },
    {
      type: 'MESSAGE',
      agentId: 'alice',
      agentName: 'Alice',
      role: 'architect',
      content: 'Makes sense. Charlie, can you create a task to monitor database performance for the first month?',
      timestamp: Date.now() - 1000,
    },
  ];

  console.log(`📝 Test Conversation (${testMessages.length} messages):`);
  console.log('─'.repeat(60));
  for (const msg of testMessages) {
    console.log(`${msg.agentName}: ${msg.content}`);
  }
  console.log('─'.repeat(60));
  console.log();

  try {
    console.log('🔄 Extracting memories from conversation...\n');

    const startTime = Date.now();
    const result = await extractor.extractFromMessages('test-room', testMessages);
    const duration = Date.now() - startTime;

    console.log(`✅ Extraction completed in ${duration}ms\n`);
    console.log(`📊 Results:`);
    console.log(`   Messages analyzed: ${result.messagesAnalyzed}`);
    console.log(`   Memories extracted: ${result.memories.length}`);
    console.log();

    if (result.memories.length > 0) {
      console.log('🧠 Extracted Memories:');
      console.log('─'.repeat(60));

      for (const memory of result.memories) {
        console.log();
        console.log(`📌 Type: ${memory.type.toUpperCase()}`);
        console.log(`   Priority: ${memory.priority}`);
        console.log(`   Confidence: ${memory.confidence.toFixed(2)}`);
        console.log(`   Content: ${memory.content}`);
        if (memory.context) {
          console.log(`   Context: ${memory.context}`);
        }
        console.log(`   Tags: ${memory.tags.join(', ')}`);
      }

      console.log();
      console.log('─'.repeat(60));

      // Validate expected memory types
      const types = result.memories.map(m => m.type);
      const hasDecision = types.includes('decision');
      const hasQuestion = types.includes('question');
      const hasActionItem = types.includes('action_item');

      console.log();
      console.log('✅ Validation:');
      console.log(`   ${hasDecision ? '✓' : '✗'} Contains DECISION memory`);
      console.log(`   ${hasQuestion ? '✓' : '✗'} Contains QUESTION memory`);
      console.log(`   ${hasActionItem ? '✓' : '✗'} Contains ACTION_ITEM memory`);

      if (hasDecision && hasQuestion && hasActionItem) {
        console.log();
        console.log('🎉 SUCCESS! All expected memory types extracted correctly.');
      } else {
        console.log();
        console.log('⚠️  WARNING: Some expected memory types were not extracted.');
      }
    } else {
      console.log('⚠️  No memories extracted (all below confidence threshold or extraction failed)');
    }

  } catch (error) {
    console.error('❌ Error during memory extraction:');
    console.error(error);
    console.log();
    console.log('💡 Troubleshooting:');
    console.log('   1. Check that Ollama is running: curl http://192.168.1.4:11434/api/tags');
    console.log('   2. Verify llama3.2 model is installed: ollama list');
    console.log('   3. Test Ollama directly: ollama run llama3.2');
    process.exit(1);
  }
}

// Run the test
testMemoryExtraction().catch(console.error);
