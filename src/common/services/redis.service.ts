import { redisClient } from '../../config/redis.js';

export class RedisService {
  static async get<T>(key: string): Promise<T | null> {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
      console.warn(`Redis get failed for key ${key}:`, error);
      return null;
    }
  }

  static async set(key: string, value: any, ttlSeconds = 300): Promise<boolean> {
    if (!redisClient) return false;
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (error) {
      console.warn(`Redis set failed for key ${key}:`, error);
      return false;
    }
  }

  static async del(key: string): Promise<boolean> {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.warn(`Redis del failed for key ${key}:`, error);
      return false;
    }
  }

  static async setDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
    if (!redisClient) return;
    try {
      const payload = { lat, lng, timestamp: Date.now() };
      // Cache driver coordinate with 15 minutes TTL
      await redisClient.set(`driver:geo:${driverId}`, JSON.stringify(payload), 'EX', 900);
    } catch (error) {
      console.warn(`Failed to cache driver location for ${driverId}:`, error);
    }
  }

  static async getDriverLocation(driverId: string): Promise<{ lat: number; lng: number } | null> {
    return RedisService.get<{ lat: number; lng: number }>(`driver:geo:${driverId}`);
  }
}
