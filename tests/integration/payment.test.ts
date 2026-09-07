import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { signAccessToken } from '../../src/common/utils/jwt.js';
import { hashPassword } from '../../src/common/utils/password.js';
import { prisma } from '../../src/config/prisma.js';

describe('Payments & Stripe Webhook Integration Tests', () => {
  const timestamp = Date.now();
  const testEmail = `patient.pay.${timestamp}@emergency.com`;
  let patientToken = '';
  let patientId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const hashedPassword = await hashPassword('PaymentTestPass123!');

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        name: 'Payment Tester',
        role: 'PATIENT',
      },
    });
    patientId = user.id;
    patientToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await prisma.$disconnect();
  });

  it('POST /api/v1/payments/initiate should require authentication', async () => {
    const res = await request(app).post('/api/v1/payments/initiate').send({
      tripId: 'non-existent-uuid',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/payments/initiate should return 404 for non-existent trip', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        tripId: 'e0000000-0000-4000-8000-000000000000',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not found');
  });

  it('POST /api/v1/payments/webhook should reject requests missing Stripe signature header', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_test' }));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Missing stripe-signature header');
  });

  it('GET /api/v1/payments/trip/:tripId should require authentication', async () => {
    const res = await request(app).get(
      '/api/v1/payments/trip/e0000000-0000-4000-8000-000000000000'
    );

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
