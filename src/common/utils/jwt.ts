import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthUserPayload } from '../../@types/express.d.js';
import { env } from '../../config/env.js';

export function signAccessToken(payload: AuthUserPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: AuthUserPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
    jwtid: randomUUID(),
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AuthUserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUserPayload;
}

export function verifyRefreshToken(token: string): AuthUserPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthUserPayload;
}
