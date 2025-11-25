/**
 * Tool Executor
 *
 * Executes tool invocations with validation, permission checks, and caching.
 */

import {
  ToolInvocationRequest,
  ToolInvocationResult,
  IToolExecutor,
  RoomTool,
  ToolParameter,
} from '../../shared/room-tools.js';
import { ToolRegistry } from './tool-registry.js';

/**
 * Tool Handler Interface
 * Each tool type implements this to perform actual execution
 */
export interface IToolHandler {
  execute(config: unknown, parameters: Record<string, unknown>): Promise<unknown>;
}

/**
 * Cache Entry
 */
interface CacheEntry {
  result: unknown;
  timestamp: number;
  ttl: number;
}

/**
 * Tool Executor Implementation
 */
export class ToolExecutor implements IToolExecutor {
  private handlers: Map<string, IToolHandler> = new Map();
  private cache: Map<string, CacheEntry> = new Map();

  constructor(private registry: ToolRegistry) {
    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), 60 * 1000); // Every minute
  }

  /**
   * Register a tool handler
   */
  registerHandler(toolName: string, handler: IToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  /**
   * Execute tool invocation
   */
  async execute(request: ToolInvocationRequest): Promise<ToolInvocationResult> {
    const startTime = Date.now();

    try {
      // Validate request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return {
          toolName: request.toolName,
          success: false,
          ...(validation.error ? { error: validation.error } : {}),
          executionTime: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      const tool = this.registry.getTool(request.toolName);
      if (!tool) {
        return {
          toolName: request.toolName,
          success: false,
          error: `Tool "${request.toolName}" not found`,
          executionTime: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // Check cache if enabled
      if (tool.config.cache) {
        const cached = this.getFromCache(request);
        if (cached !== undefined) {
          this.registry.recordUsage(
            request.toolName,
            request.agentId,
            true,
            Date.now() - startTime
          );

          return {
            toolName: request.toolName,
            success: true,
            result: cached,
            executionTime: Date.now() - startTime,
            timestamp: Date.now(),
            cached: true,
          };
        }
      }

      // Record rate limit usage
      this.registry.recordRateLimitUsage(request.toolName, request.agentId);

      // Get handler
      const handler = this.handlers.get(request.toolName);
      if (!handler) {
        this.registry.releaseConcurrentSlot(request.toolName, request.agentId);
        return {
          toolName: request.toolName,
          success: false,
          error: `No handler registered for tool "${request.toolName}"`,
          executionTime: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // Execute with timeout
      const timeout = (tool.config.timeout || 30) * 1000; // Convert to milliseconds
      const result = await this.executeWithTimeout(
        () => handler.execute(tool.config, request.parameters),
        timeout
      );

      // Cache result if enabled
      if (tool.config.cache) {
        this.saveToCache(request, result, tool.config.cacheTTL || 300);
      }

      // Release concurrent slot
      this.registry.releaseConcurrentSlot(request.toolName, request.agentId);

      // Record usage
      this.registry.recordUsage(
        request.toolName,
        request.agentId,
        true,
        Date.now() - startTime
      );

      return {
        toolName: request.toolName,
        success: true,
        result,
        executionTime: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      // Release concurrent slot on error
      this.registry.releaseConcurrentSlot(request.toolName, request.agentId);

      // Record failure
      this.registry.recordUsage(
        request.toolName,
        request.agentId,
        false,
        Date.now() - startTime
      );

      return {
        toolName: request.toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Validate invocation request
   */
  validateRequest(request: ToolInvocationRequest): { valid: boolean; error?: string } {
    // Check tool exists
    const tool = this.registry.getTool(request.toolName);
    if (!tool) {
      return { valid: false, error: `Tool "${request.toolName}" not found` };
    }

    // Check tool is enabled
    if (tool.enabled === false) {
      return { valid: false, error: `Tool "${request.toolName}" is disabled` };
    }

    // Check permissions (permission check happens in registry)
    // This is just a validation that the tool exists

    // Validate parameters
    const paramValidation = this.validateParameters(tool, request.parameters);
    if (!paramValidation.valid) {
      return {
        valid: false,
        error: `Parameter validation failed: ${paramValidation.errors.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate tool parameters
   */
  validateParameters(
    tool: RoomTool,
    parameters: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.parameters || tool.parameters.length === 0) {
      return { valid: true, errors: [] };
    }

    // Check required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in parameters)) {
        errors.push(`Required parameter "${param.name}" is missing`);
        continue;
      }

      // Skip validation if parameter not provided and not required
      if (!(param.name in parameters)) {
        continue;
      }

      const value = parameters[param.name];

      // Type validation
      const typeValid = this.validateParameterType(param, value);
      if (!typeValid) {
        errors.push(
          `Parameter "${param.name}" has invalid type (expected ${param.type}, got ${typeof value})`
        );
        continue;
      }

      // Custom validation rules
      if (param.validation) {
        const validationErrors = this.validateParameterRules(param, value);
        errors.push(...validationErrors);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(param: ToolParameter, value: unknown): boolean {
    switch (param.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Validate parameter rules
   */
  private validateParameterRules(param: ToolParameter, value: unknown): string[] {
    const errors: string[] = [];
    const validation = param.validation;

    if (!validation) {
      return errors;
    }

    // Pattern validation (for strings)
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        errors.push(`Parameter "${param.name}" does not match pattern ${validation.pattern}`);
      }
    }

    // Min/max validation (for numbers)
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        errors.push(`Parameter "${param.name}" must be at least ${validation.min}`);
      }
      if (validation.max !== undefined && value > validation.max) {
        errors.push(`Parameter "${param.name}" must be at most ${validation.max}`);
      }
    }

    // Enum validation
    if (validation.enum && validation.enum.length > 0) {
      if (!validation.enum.includes(value)) {
        errors.push(
          `Parameter "${param.name}" must be one of: ${validation.enum.map((v) => String(v)).join(', ')}`
        );
      }
    }

    return errors;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Get result from cache
   */
  private getFromCache(request: ToolInvocationRequest): unknown | undefined {
    const cacheKey = this.getCacheKey(request);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.cache.delete(cacheKey);
      return undefined;
    }

    return entry.result;
  }

  /**
   * Save result to cache
   */
  private saveToCache(request: ToolInvocationRequest, result: unknown, ttl: number): void {
    const cacheKey = this.getCacheKey(request);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: ToolInvocationRequest): string {
    const params = JSON.stringify(request.parameters, Object.keys(request.parameters).sort());
    return `${request.toolName}:${params}`;
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl * 1000) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
