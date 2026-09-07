import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';

describe('Emergency Ambulance Dispatch System — Core API Integration Tests', () => {
  const testEmail = `test.user.${Date.now()}@emergency.com`;
  let accessToken = '';

  beforeAll(async () => {
    // Ensure DB connected
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup created test user
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await prisma.$disconnect();
  });

  it('GET /api/v1/health should return standard success response with status UP', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.message).toContain('operational');
  });

  it('GET /api/v1/non-existent-route should return 404 in standardized error format', async () => {
    const res = await request(app).get('/api/v1/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Cannot find requested endpoint');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('POST /api/v1/auth/register should fail validation when email is missing or malformed', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'invalid-email-format',
      password: '123', // too short
      name: 'T',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Validation failed');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/auth/register should successfully register a new Patient', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: testEmail,
      password: 'ValidPassword123!',
      name: 'Automated Test Patient',
      phone: '+8801700999999',
      role: 'PATIENT',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();

    accessToken = res.body.data.tokens.accessToken;
  });

  it('POST /api/v1/auth/login should authenticate with valid credentials and return JWTs', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: testEmail,
      password: 'ValidPassword123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.tokens.accessToken).toBeDefined();
  });

  it('GET /api/v1/users/me should reject request without Bearer token', async () => {
    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Authentication required');
  });

  it('GET /api/v1/users/me should return authenticated user profile when Bearer token is supplied', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body.data.name).toBe('Automated Test Patient');
  });

  it('POST /api/v1/emergencies should create emergency request for authenticated patient', async () => {
    const res = await request(app)
      .post('/api/v1/emergencies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        patientName: 'Automated Test Patient',
        patientPhone: '+8801700999999',
        priority: 'CRITICAL',
        pickupAddress: 'Road 5, Block B, Bashundhara R/A, Dhaka',
        pickupLatitude: 23.815,
        pickupLongitude: 90.425,
        symptoms: 'Sudden cardiac arrest symptoms',
        notes: 'Ground floor entrance',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priority).toBe('CRITICAL');
    expect(res.body.data.status).toBe('PENDING');

    // Cleanup created emergency request
    await prisma.emergencyRequest.delete({
      where: { id: res.body.data.id },
    });
  });
});
