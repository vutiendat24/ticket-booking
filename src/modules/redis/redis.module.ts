import { Global, Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';
import { RedisService } from './redis.service';

/**
 * Global Redis module — marked @Global so it doesn't need to be imported
 * in every feature module that needs Redis.
 */
@Global()
@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {}
