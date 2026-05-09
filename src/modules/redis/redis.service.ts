import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Lightweight Redis client service for general-purpose caching / pub-sub.
 * The locking logic lives in RedisLockService.
 *
 * Exposed for use by other modules that need a shared Redis connection.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const options: RedisOptions = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 3000)),
    };

    const password = this.configService.get<string>('REDIS_PASSWORD');
    if (password) options.password = password;

    this._client = new Redis(options);

    this._client.on('connect', () => this.logger.log('Redis (general) connected'));
    this._client.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err.message}`),
    );

    this._client.connect().catch((err: Error) =>
      this.logger.error(`Redis connect failed: ${err.message}`),
    );
  }

  onModuleDestroy() {
    this._client.disconnect();
  }

  get client(): Redis {
    return this._client;
  }
}
