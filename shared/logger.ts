/**
 * Structured Logger
 * Provides JSON-formatted logging with contextual metadata
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log level priority (higher = more important)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;

  /** Component name for this logger instance */
  component?: string;

  /** Whether to output as JSON (default: true) */
  json: boolean;

  /** Whether to include timestamps (default: true) */
  timestamps: boolean;

  /** Whether to colorize console output (default: false for JSON mode) */
  colors: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  json: true,
  timestamps: true,
  colors: false,
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

/**
 * Structured Logger
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(component: string, context?: Record<string, any>): Logger {
    const childLogger = new Logger({
      ...this.config,
      component: this.config.component ? `${this.config.component}:${component}` : component,
    });

    // Store context for child logger
    if (context) {
      (childLogger as any)._context = context;
    }

    return childLogger;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    const errorContext = error instanceof Error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    } : (error ? { error } : {});

    this.log(LogLevel.ERROR, message, { ...context, ...errorContext });
  }

  /**
   * Log a message
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    // Check if this log level should be output
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    // Merge contexts
    const mergedContext = {
      ...(this as any)._context,
      ...context,
    };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.config.component ? { component: this.config.component } : {}),
      ...(Object.keys(mergedContext).length > 0 ? { context: mergedContext } : {}),
    };

    // Extract error if present in context
    if (mergedContext.error) {
      entry.error = mergedContext.error;
      delete mergedContext.error;
    }

    this.output(entry);
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (this.config.json) {
      // JSON output
      console.log(JSON.stringify(entry));
    } else {
      // Human-readable output
      const timestamp = this.config.timestamps ? `[${entry.timestamp}] ` : '';
      const component = entry.component ? `[${entry.component}] ` : '';
      const level = this.formatLevel(entry.level);
      const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const error = entry.error ? `\n  Error: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ''}` : '';

      console.log(`${timestamp}${level} ${component}${entry.message}${context}${error}`);
    }
  }

  /**
   * Format log level with colors
   */
  private formatLevel(level: LogLevel): string {
    if (!this.config.colors) {
      return level.toUpperCase();
    }

    const colorMap: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: COLORS.gray,
      [LogLevel.INFO]: COLORS.blue,
      [LogLevel.WARN]: COLORS.yellow,
      [LogLevel.ERROR]: COLORS.red,
    };

    const color = colorMap[level];
    return `${color}${level.toUpperCase()}${COLORS.reset}`;
  }

  /**
   * Update logger configuration
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({
    ...config,
    component,
  });
}
