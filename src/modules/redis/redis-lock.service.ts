import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * RedisLockService — distributed locking via Redis SET NX PX.
 *
 * Design notes:
 * - Locks are acquired sorted by key to prevent deadlocks across concurrent requests.
 * - Each lock stores a unique token (timestamp + random) to prevent accidental
 *   release by another process (atomic Lua compare-and-delete).
 * - This is a single-node Redlock. For Redis Cluster, use the `redlock` npm package.
 *
 * Two-layer protection strategy:
 * 1. Redis lock — fast path, prevents most concurrent requests from reaching DB
 * 2. PostgreSQL pessimistic lock (SELECT FOR UPDATE) — hard guarantee even if Redis fails
 */
@Injectable()
export class RedisLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const options: RedisOptions = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      // Retry strategy: give up after 3 retries during startup
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 3000)),
    };

    const password = this.configService.get<string>('REDIS_PASSWORD');
    if (password) options.password = password;

    this.redis = new Redis(options);

    this.redis.on('connect', () => this.logger.log('Redis connected'));
    this.redis.on('ready', () => this.logger.log('Redis ready'));
    this.redis.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err.message}`, err.stack),
    );
    this.redis.on('close', () => this.logger.warn('Redis connection closed'));

    this.redis.connect().catch((err: Error) => {
      this.logger.error(`Failed to connect to Redis: ${err.message}`);
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Acquire a single distributed lock.
   * @returns A release function if the lock was acquired, or null if not.
   */
  async acquire(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let result: string | null;
    try {
      result = await this.redis.set(key, lockToken, 'PX', ttlMs, 'NX');
    } catch (err) {
      this.logger.error(`Redis SET failed for key "${key}"`, (err as Error).stack);
      return null; // Fail open — let the DB pessimistic lock be the safety net
    }

    if (result !== 'OK') return null;

    const release = async () => {
      try {
        // Atomic compare-and-delete: only delete if we still own the lock
        const script = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
          else
            return 0
          end
        `;
        await this.redis.eval(script, 1, key, lockToken);
      } catch (err) {
        this.logger.error(`Failed to release lock "${key}"`, (err as Error).stack);
      }
    };

    return release;
  }

  /**
   * Acquire multiple locks atomically (all-or-nothing with backoff retry).
   * Keys are already sorted by the caller to prevent deadlocks.
   *
   * @throws ServiceUnavailableException if any lock cannot be acquired within maxRetries
   */
  async acquireMultiple(
    sortedKeys: string[],
    ttlMs: number,
    maxRetries = 10,
    retryDelayMs = 100,
  ): Promise<() => Promise<void>> {
    const releaseFns: Array<() => Promise<void>> = [];

    for (const key of sortedKeys) {
      let acquired = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const release = await this.acquire(key, ttlMs);
        if (release) {
          releaseFns.push(release);
          acquired = true;
          break;
        }
        // Exponential backoff with full jitter to reduce thundering herd
        const delay =
          Math.min(retryDelayMs * Math.pow(1.5, attempt), 3000) +
          Math.random() * retryDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (!acquired) {
        // Release all previously acquired locks before giving up
        await Promise.allSettled(releaseFns.map((fn) => fn()));
        throw new ServiceUnavailableException(
          `System is busy. Could not acquire lock for key "${key}" after ${maxRetries} retries. Please retry shortly.`,
        );
      }
    }

    return async () => {
      await Promise.allSettled(releaseFns.map((fn) => fn()));
    };
  }
}
