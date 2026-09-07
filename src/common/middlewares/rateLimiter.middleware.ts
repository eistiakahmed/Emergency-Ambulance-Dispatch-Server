import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../../config/env.js';
import { redisClient } from '../../config/redis.js';
import { ApiResponse } from '../responses/ApiResponse.js';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(
      res,
      'Too many requests from this IP, please try again after 15 minutes',
      429
    );
  },
  store:
    env.REDIS_ENABLED && redisClient && redisClient.status === 'ready'
      ? new RedisStore({
          // @ts-expect-error - ioredis call signature compatibility
          sendCommand: (...args: string[]) => redisClient.call(...args),
        })
      : undefined,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(res, 'Too many authentication attempts, please try again later', 429);
  },
});
