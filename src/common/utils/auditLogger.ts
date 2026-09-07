import type { AuditAction } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/prisma.js';

interface LogAuditParams {
  req?: Request;
  actorId?: string;
  actorRole: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  oldValues?: any;
  newValues?: any;
  tx?: any;
}

export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    const client = params.tx || prisma;
    const ipAddress =
      params.req?.ip ||
      (params.req?.headers['x-forwarded-for'] as string) ||
      params.req?.socket?.remoteAddress ||
      null;

    const userAgent = params.req?.headers['user-agent'] || null;

    await client.auditLog.create({
      data: {
        actorId: params.actorId || params.req?.user?.id || null,
        actorRole: params.actorRole || params.req?.user?.role || 'SYSTEM',
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        oldValues: params.oldValues ? (params.oldValues as any) : undefined,
        newValues: params.newValues ? (params.newValues as any) : undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('⚠️ Failed to write audit log event:', error);
  }
}
