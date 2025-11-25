/**
 * Performance Metrics and Monitoring
 * Provides counters, gauges, histograms, and timers for observability
 */

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

/**
 * Metric metadata
 */
export interface MetricMetadata {
  name: string;
  type: MetricType;
  description?: string;
  unit?: string;
  labels?: Record<string, string>;
}

/**
 * Counter metric (monotonically increasing)
 */
export class Counter {
  private value = 0;
  private metadata: MetricMetadata;

  constructor(name: string, description?: string, labels?: Record<string, string>) {
    this.metadata = {
      name,
      type: MetricType.COUNTER,
      ...(description ? { description } : {}),
      ...(labels ? { labels } : {}),
    };
  }

  /**
   * Increment counter by value (default: 1)
   */
  inc(value: number = 1): void {
    this.value += value;
  }

  /**
   * Get current value
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Get metadata
   */
  getMetadata(): MetricMetadata {
    return { ...this.metadata };
  }

  /**
   * Reset counter to zero
   */
  reset(): void {
    this.value = 0;
  }
}

/**
 * Gauge metric (can go up or down)
 */
export class Gauge {
  private value = 0;
  private metadata: MetricMetadata;

  constructor(name: string, description?: string, unit?: string, labels?: Record<string, string>) {
    this.metadata = {
      name,
      type: MetricType.GAUGE,
      ...(description ? { description } : {}),
      ...(unit ? { unit } : {}),
      ...(labels ? { labels } : {}),
    };
  }

  /**
   * Set gauge to value
   */
  set(value: number): void {
    this.value = value;
  }

  /**
   * Increment gauge by value (default: 1)
   */
  inc(value: number = 1): void {
    this.value += value;
  }

  /**
   * Decrement gauge by value (default: 1)
   */
  dec(value: number = 1): void {
    this.value -= value;
  }

  /**
   * Get current value
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Get metadata
   */
  getMetadata(): MetricMetadata {
    return { ...this.metadata };
  }

  /**
   * Reset gauge to zero
   */
  reset(): void {
    this.value = 0;
  }
}

/**
 * Histogram metric (distribution of values)
 */
export class Histogram {
  private values: number[] = [];
  private metadata: MetricMetadata;
  private maxSamples: number;

  constructor(
    name: string,
    description?: string,
    unit?: string,
    labels?: Record<string, string>,
    maxSamples: number = 1000,
  ) {
    this.metadata = {
      name,
      type: MetricType.HISTOGRAM,
      ...(description ? { description } : {}),
      ...(unit ? { unit } : {}),
      ...(labels ? { labels } : {}),
    };
    this.maxSamples = maxSamples;
  }

  /**
   * Observe a value
   */
  observe(value: number): void {
    this.values.push(value);

    // Keep only last maxSamples values
    if (this.values.length > this.maxSamples) {
      this.values.shift();
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    count: number;
    sum: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (this.values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const count = sorted.length;

    return {
      count,
      sum,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      mean: sum / count,
      median: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /**
   * Get metadata
   */
  getMetadata(): MetricMetadata {
    return { ...this.metadata };
  }

  /**
   * Reset histogram
   */
  reset(): void {
    this.values = [];
  }
}

/**
 * Timer for measuring operation duration
 */
export class Timer {
  private histogram: Histogram;

  constructor(name: string, description?: string, labels?: Record<string, string>) {
    this.histogram = new Histogram(name, description, 'ms', labels);
  }

  /**
   * Start timing an operation
   * Returns a function to call when operation completes
   */
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.histogram.observe(duration);
    };
  }

  /**
   * Time an async operation
   */
  async time<T>(fn: () => Promise<T>): Promise<T> {
    const end = this.startTimer();
    try {
      return await fn();
    } finally {
      end();
    }
  }

  /**
   * Time a sync operation
   */
  timeSync<T>(fn: () => T): T {
    const end = this.startTimer();
    try {
      return fn();
    } finally {
      end();
    }
  }

  /**
   * Get timing statistics
   */
  getStats() {
    return this.histogram.getStats();
  }

  /**
   * Get metadata
   */
  getMetadata(): MetricMetadata {
    return this.histogram.getMetadata();
  }

  /**
   * Reset timer
   */
  reset(): void {
    this.histogram.reset();
  }
}

/**
 * Metrics Registry
 * Central registry for all metrics
 */
export class MetricsRegistry {
  private metrics: Map<string, Counter | Gauge | Histogram | Timer> = new Map();

  /**
   * Register or get a counter
   */
  counter(name: string, description?: string, labels?: Record<string, string>): Counter {
    const key = this.makeKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Counter(name, description, labels));
    }
    return this.metrics.get(key) as Counter;
  }

  /**
   * Register or get a gauge
   */
  gauge(name: string, description?: string, unit?: string, labels?: Record<string, string>): Gauge {
    const key = this.makeKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Gauge(name, description, unit, labels));
    }
    return this.metrics.get(key) as Gauge;
  }

  /**
   * Register or get a histogram
   */
  histogram(name: string, description?: string, unit?: string, labels?: Record<string, string>): Histogram {
    const key = this.makeKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Histogram(name, description, unit, labels));
    }
    return this.metrics.get(key) as Histogram;
  }

  /**
   * Register or get a timer
   */
  timer(name: string, description?: string, labels?: Record<string, string>): Timer {
    const key = this.makeKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new Timer(name, description, labels));
    }
    return this.metrics.get(key) as Timer;
  }

  /**
   * Get all metrics
   */
  getAll(): Map<string, Counter | Gauge | Histogram | Timer> {
    return new Map(this.metrics);
  }

  /**
   * Get metrics summary as JSON
   */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, metric] of this.metrics.entries()) {
      const metadata = metric.getMetadata();

      if (metric instanceof Counter) {
        result[key] = {
          type: metadata.type,
          value: metric.getValue(),
          metadata,
        };
      } else if (metric instanceof Gauge) {
        result[key] = {
          type: metadata.type,
          value: metric.getValue(),
          metadata,
        };
      } else if (metric instanceof Histogram) {
        result[key] = {
          type: metadata.type,
          stats: metric.getStats(),
          metadata,
        };
      } else if (metric instanceof Timer) {
        result[key] = {
          type: MetricType.TIMER,
          stats: metric.getStats(),
          metadata,
        };
      }
    }

    return result;
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Make a unique key for a metric
   */
  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }
}

/**
 * Global metrics registry
 */
export const metrics = new MetricsRegistry();

/**
 * Common metrics for PingPong system
 */
export const commonMetrics = {
  // Connection metrics
  activeConnections: metrics.gauge('active_connections', 'Number of active WebSocket connections', 'connections'),
  totalConnections: metrics.counter('total_connections', 'Total WebSocket connections'),

  // Message metrics
  messagesReceived: metrics.counter('messages_received', 'Total messages received'),
  messagesSent: metrics.counter('messages_sent', 'Total messages sent'),

  // Memory metrics
  memoriesCreated: metrics.counter('memories_created', 'Total memories created'),
  memoriesQueried: metrics.counter('memories_queried', 'Total memory queries'),
  memoryExtractionTime: metrics.timer('memory_extraction_time', 'Memory extraction duration'),

  // Proposal metrics
  proposalsCreated: metrics.counter('proposals_created', 'Total proposals created'),
  votescast: metrics.counter('votes_cast', 'Total votes cast'),

  // Error metrics
  errors: metrics.counter('errors', 'Total errors'),

  // Performance metrics
  requestDuration: metrics.timer('request_duration', 'Request duration'),
};
