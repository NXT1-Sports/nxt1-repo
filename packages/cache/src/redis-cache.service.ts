/**
 * @fileoverview Redis Cache Implementation
 * @module @nxt1/cache
 *
 * Primary cache implementation using Redis.
 */

import { createClient, RedisClientType } from 'redis';
import type { CacheService, CacheOptions } from './cache.interface.js';

export class RedisCacheService implements CacheService {
  private client: RedisClientType | null = null;
  private connected = false;
  private readonly defaultTTL = 3600; // 1 hour

  constructor(private readonly redisUrl?: string) {}

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.client = createClient({
        url: this.redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379',
        socket: {
          // Fail fast - don't retry endlessly
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.warn('[Redis] Max reconnection attempts reached, giving up');
              return false; // Stop retrying
            }
            return Math.min(retries * 100, 500); // Max 500ms between retries
          },
        },
      });

      this.client.on('error', (err) => {
        // Only log first error, suppress subsequent retry errors
        if (this.connected !== false) {
          console.error('[Redis] Connection error:', err.message);
          this.connected = false;
        }
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        this.connected = true;
      });

      // Give it 2 seconds to connect, then fail
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 2000)
        ),
      ]);
    } catch (error) {
      console.error('[Redis] Failed to connect:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.connected) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      const ttl = options?.ttl || this.defaultTTL;
      await this.client.set(key, JSON.stringify(value), {
        EX: ttl,
      });
    } catch (error) {
      console.error(`[Redis] Set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[Redis] Delete error for key ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      await this.client.flushDb();
    } catch (error) {
      console.error('[Redis] Clear error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.connected) return false;

    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      console.error(`[Redis] Exists error for key ${key}:`, error);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.client || !this.connected) return keys.map(() => null);

    try {
      const values = await this.client.mGet(keys);
      return values.map((v: string | null) => (v ? (JSON.parse(v) as T) : null));
    } catch (error) {
      console.error('[Redis] MGet error:', error);
      return keys.map(() => null);
    }
  }

  async mset(entries: Record<string, unknown>, options?: CacheOptions): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      const pipeline = this.client.multi();
      const ttl = options?.ttl || this.defaultTTL;

      for (const [key, value] of Object.entries(entries)) {
        pipeline.set(key, JSON.stringify(value), { EX: ttl });
      }

      await pipeline.exec();
    } catch (error) {
      console.error('[Redis] MSet error:', error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
