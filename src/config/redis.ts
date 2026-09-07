import { Redis } from 'ioredis';
import { env } from './env.js';

let redisClient: Redis | null = null;

if (env.REDIS_ENABLED) {
  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        if (times > 3) {
          console.warn('⚠️ Redis unreachable, running without active cache');
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redisClient.on('error', (err: Error) => {
      console.warn('⚠️ Redis error:', err.message);
    });
  } catch (error) {
    console.warn('⚠️ Redis initialization skipped:', error);
    redisClient = null;
  }
} else {
  console.log('ℹ️ Redis caching is currently disabled via REDIS_ENABLED=false');
}

export { redisClient };
