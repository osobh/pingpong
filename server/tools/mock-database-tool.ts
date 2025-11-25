/**
 * Mock Database Tool
 *
 * Simulates database query execution for testing and demonstration.
 */

import { IToolHandler } from './tool-executor.js';
import { DatabaseToolConfig } from '../../shared/room-tools.js';

/**
 * Mock Database Schema
 */
const MOCK_SCHEMA = {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
    { id: 2, name: 'Bob', email: 'bob@example.com', role: 'developer' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'designer' },
  ],
  orders: [
    { id: 101, userId: 1, amount: 250.0, status: 'completed' },
    { id: 102, userId: 2, amount: 150.5, status: 'pending' },
    { id: 103, userId: 1, amount: 75.25, status: 'completed' },
    { id: 104, userId: 3, amount: 300.0, status: 'shipped' },
  ],
  trades: [
    { id: 1001, symbol: 'BTC', side: 'buy', quantity: 0.5, price: 45000, timestamp: '2025-01-20T10:00:00Z' },
    { id: 1002, symbol: 'ETH', side: 'sell', quantity: 2.0, price: 3500, timestamp: '2025-01-20T10:15:00Z' },
    { id: 1003, symbol: 'BTC', side: 'buy', quantity: 0.25, price: 45100, timestamp: '2025-01-20T10:30:00Z' },
  ],
  positions: [
    { symbol: 'BTC', quantity: 0.75, avgPrice: 45033.33 },
    { symbol: 'ETH', quantity: -2.0, avgPrice: 3500 },
  ],
  balances: [
    { currency: 'USD', amount: 10000 },
    { currency: 'BTC', amount: 0.75 },
    { currency: 'ETH', amount: 0 },
  ],
};

/**
 * Mock Database Tool Handler
 */
export class MockDatabaseToolHandler implements IToolHandler {
  /**
   * Execute mock database query
   */
  async execute(
    config: unknown,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    const dbConfig = config as DatabaseToolConfig;
    const query = String(parameters['query'] || '').trim().toUpperCase();

    // Simulate query execution delay
    await this.delay(50 + Math.random() * 150); // 50-200ms

    // Handle different query types
    if (query.startsWith('SHOW TABLES')) {
      return this.showTables();
    }

    if (query.startsWith('DESCRIBE')) {
      const tableName = this.extractTableName(query, 'DESCRIBE');
      return this.describeTable(tableName);
    }

    if (query.startsWith('SELECT')) {
      return this.handleSelect(query, dbConfig);
    }

    // Read-only check for write operations
    if (dbConfig.readOnly) {
      if (
        query.startsWith('INSERT') ||
        query.startsWith('UPDATE') ||
        query.startsWith('DELETE') ||
        query.startsWith('CREATE') ||
        query.startsWith('DROP')
      ) {
        throw new Error('Write operations not allowed in read-only mode');
      }
    }

    throw new Error(`Unsupported query: ${query}`);
  }

  /**
   * Show all tables
   */
  private showTables(): { tables: string[] } {
    return {
      tables: Object.keys(MOCK_SCHEMA),
    };
  }

  /**
   * Describe table structure
   */
  private describeTable(tableName: string): { columns: { name: string; type: string }[] } {
    const table = MOCK_SCHEMA[tableName as keyof typeof MOCK_SCHEMA];
    if (!table || !Array.isArray(table) || table.length === 0) {
      throw new Error(`Table "${tableName}" not found`);
    }

    const sample = table[0];
    if (!sample) {
      throw new Error(`Table "${tableName}" is empty`);
    }

    const columns = Object.keys(sample).map((key) => ({
      name: key,
      type: typeof sample[key as keyof typeof sample],
    }));

    return { columns };
  }

  /**
   * Handle SELECT query
   */
  private handleSelect(
    query: string,
    config: DatabaseToolConfig
  ): { rows: unknown[]; count: number } {
    // Extract table name
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    if (!fromMatch || !fromMatch[1]) {
      throw new Error('Invalid SELECT query: missing FROM clause');
    }

    const tableName = fromMatch[1].toLowerCase();
    const tableData = MOCK_SCHEMA[tableName as keyof typeof MOCK_SCHEMA];

    if (!tableData || !Array.isArray(tableData)) {
      throw new Error(`Table "${tableName}" not found`);
    }

    let data: unknown[] = [...tableData];

    // Apply WHERE clause (simple equality checks only)
    const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
    if (whereMatch && whereMatch[1]) {
      const whereClause = whereMatch[1].trim();
      data = this.applyWhereClause(data, whereClause);
    }

    // Apply ORDER BY (simple implementation)
    const orderMatch = query.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch && orderMatch[1]) {
      const orderField = orderMatch[1].toLowerCase();
      const orderDirection = orderMatch[2]?.toUpperCase() || 'ASC';
      data = this.applyOrderBy(data, orderField, orderDirection);
    }

    // Apply LIMIT
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    let limit = config.maxResults || 100;
    if (limitMatch && limitMatch[1]) {
      limit = Math.min(parseInt(limitMatch[1], 10), limit);
    }

    const rows = data.slice(0, limit);

    return {
      rows,
      count: rows.length,
    };
  }

  /**
   * Apply WHERE clause (simple implementation)
   */
  private applyWhereClause(data: unknown[], whereClause: string): unknown[] {
    // Support simple equality: field = 'value' or field = value
    const match = whereClause.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/i);
    if (!match) {
      return data; // Can't parse, return all
    }

    const [, field, value] = match;
    if (!field || value === undefined) {
      return data;
    }

    return data.filter((row: any) => {
      const rowValue = String(row[field] ?? '');
      return rowValue === value;
    });
  }

  /**
   * Apply ORDER BY
   */
  private applyOrderBy(data: unknown[], field: string, direction: string): unknown[] {
    return [...data].sort((a: any, b: any) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal < bVal) return direction === 'ASC' ? -1 : 1;
      if (aVal > bVal) return direction === 'ASC' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Extract table name from query
   */
  private extractTableName(query: string, command: string): string {
    const regex = new RegExp(`${command}\\s+(\\w+)`, 'i');
    const match = query.match(regex);
    if (!match || !match[1]) {
      throw new Error(`Could not extract table name from query: ${query}`);
    }
    return match[1].toLowerCase();
  }

  /**
   * Simulate delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
