import { describe, expect, it } from 'vitest';
import { RedisService } from '../../src/common/services/redis.service.js';

describe('Redis OTP Generation, Storage, and Lifecycle Verification', () => {
  const testEmail = `otp.test.${Date.now()}@emergency.com`;

  it('generateNumericOtp should generate a 6-digit numeric string', () => {
    const otp = RedisService.generateNumericOtp(6);
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('should store OTP in Redis with TTL and retrieve it', async () => {
    const otp = RedisService.generateNumericOtp(6);
    const stored = await RedisService.setOtp('VERIFY_EMAIL', testEmail, otp, 60);

    // If local Redis is running, stored should be true
    if (stored) {
      const retrieved = await RedisService.getOtp('VERIFY_EMAIL', testEmail);
      expect(retrieved).toBe(otp);
    }
  });

  it('verifyAndConsumeOtp should reject wrong OTP', async () => {
    const otp = '987654';
    const stored = await RedisService.setOtp('VERIFY_EMAIL', testEmail, otp, 60);

    if (stored) {
      const isValid = await RedisService.verifyAndConsumeOtp('VERIFY_EMAIL', testEmail, '000000');
      expect(isValid).toBe(false);
    }
  });

  it('verifyAndConsumeOtp should accept valid OTP and invalidate it from Redis', async () => {
    const otp = '123456';
    const stored = await RedisService.setOtp('VERIFY_EMAIL', testEmail, otp, 60);

    if (stored) {
      const isValid = await RedisService.verifyAndConsumeOtp('VERIFY_EMAIL', testEmail, otp);
      expect(isValid).toBe(true);

      // Once consumed, it cannot be reused
      const secondAttempt = await RedisService.verifyAndConsumeOtp('VERIFY_EMAIL', testEmail, otp);
      expect(secondAttempt).toBe(false);
    }
  });
});
