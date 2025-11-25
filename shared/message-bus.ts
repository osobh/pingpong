/**
 * Message Bus abstraction for cross-project agent communication
 * Supports both in-memory (local dev) and Redis (production) implementations
 */

/**
 * Message format for bus communication
 */
export interface BusMessage {
  serverId: string; // Unique ID of the server that published this message
  messageId: string; // Unique message ID for deduplication
  timestamp: number; // Millisecond timestamp
  payload: any; // The actual message payload (protocol message)
}

/**
 * Subscription callback
 */
export type MessageCallback = (message: BusMessage) => void | Promise<void>;

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * MessageBus interface for pub/sub communication
 */
export interface MessageBus {
  /**
   * Connect to the message bus
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the message bus
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Publish a message to the bus
   */
  publish(message: BusMessage): Promise<void>;

  /**
   * Subscribe to messages from the bus
   * Returns unsubscribe function
   */
  subscribe(callback: MessageCallback): Unsubscribe;
}

/**
 * In-memory message bus implementation
 * For local development and testing
 * Note: Only works within single process - separate instances don't share messages
 */
export class InMemoryMessageBus implements MessageBus {
  private connected = false;
  private subscribers: Set<MessageCallback> = new Set();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.subscribers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(message: BusMessage): Promise<void> {
    if (!this.connected) {
      return; // Silently ignore if not connected
    }

    // Deliver to all subscribers asynchronously
    // Use setImmediate/setTimeout to avoid blocking
    for (const callback of this.subscribers) {
      setImmediate(async () => {
        try {
          await callback(message);
        } catch (error) {
          // Log error but don't stop other subscribers
          console.error('Message bus subscriber error:', error);
        }
      });
    }
  }

  subscribe(callback: MessageCallback): Unsubscribe {
    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }
}

/**
 * Redis message bus implementation
 * For production use across multiple servers
 */
export class RedisMessageBus implements MessageBus {
  private redis: any; // Redis publisher client (using any to avoid import issues)
  private subscriber: any; // Redis subscriber client
  private connected = false;
  private subscribers: Set<MessageCallback> = new Set();

  constructor(
    public redisUrl: string,
    public channel: string = 'pingpong',
  ) {
    // Import Redis dynamically to avoid issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');

    // Create two separate clients (pub/sub pattern requirement)
    this.redis = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return; // Already connected
    }

    try {
      // Subscribe to channel
      await this.subscriber.subscribe(this.channel);

      // Setup message handler
      this.subscriber.on('message', (channel: string, message: string) => {
        if (channel === this.channel) {
          this.handleRedisMessage(message);
        }
      });

      this.connected = true;
    } catch (error) {
      console.error('Redis connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return; // Already disconnected
    }

    try {
      // Unsubscribe from channel
      await this.subscriber.unsubscribe(this.channel);

      // Disconnect both clients
      await this.subscriber.quit();
      await this.redis.quit();

      this.connected = false;
      this.subscribers.clear();
    } catch (error) {
      console.error('Redis disconnection error:', error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(message: BusMessage): Promise<void> {
    if (!this.connected) {
      return; // Silently ignore if not connected
    }

    try {
      // Serialize message to JSON
      const serialized = JSON.stringify(message);

      // Publish to Redis channel
      await this.redis.publish(this.channel, serialized);
    } catch (error) {
      console.error('Redis publish error:', error);
    }
  }

  subscribe(callback: MessageCallback): Unsubscribe {
    this.subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Handle incoming Redis message
   */
  private handleRedisMessage(message: string): void {
    try {
      // Deserialize message from JSON
      const busMessage: BusMessage = JSON.parse(message);

      // Deliver to all subscribers
      for (const callback of this.subscribers) {
        try {
          callback(busMessage);
        } catch (error) {
          // Log error but don't stop other subscribers
          console.error('Message bus subscriber error:', error);
        }
      }
    } catch (error) {
      // Ignore malformed messages
      console.error('Failed to parse Redis message:', error);
    }
  }
}
