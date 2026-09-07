import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { signAccessToken } from '../../src/common/utils/jwt.js';
import { hashPassword } from '../../src/common/utils/password.js';
import { prisma } from '../../src/config/prisma.js';

describe('Trip Dispatch & FSM Lifecycle Integration Tests', () => {
  const timestamp = Date.now();
  const adminEmail = `admin.trip.${timestamp}@emergency.com`;
  const driverEmail = `driver.trip.${timestamp}@emergency.com`;
  const patientEmail = `patient.trip.${timestamp}@emergency.com`;

  let adminToken = '';
  let driverToken = '';
  let patientToken = '';

  let createdPatientId = '';
  let createdDriverUserId = '';
  let createdDriverProfileId = '';
  let createdAmbulanceId = '';
  let createdEmergencyId = '';
  let createdTripId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const hashedPassword = await hashPassword('TestPassword123!');

    // 1. Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin Tester',
        role: 'ADMIN',
      },
    });
    adminToken = signAccessToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    // 2. Create Driver User & Profile
    const driverUser = await prisma.user.create({
      data: {
        email: driverEmail,
        password: hashedPassword,
        name: 'Driver Tester',
        role: 'DRIVER',
        phone: '+8801700111222',
        driverProfile: {
          create: {
            licenseNumber: `LIC-TRIP-${timestamp}`,
            status: 'AVAILABLE',
            currentLat: 23.8103,
            currentLng: 90.4125,
          },
        },
      },
      include: { driverProfile: true },
    });
    createdDriverUserId = driverUser.id;
    createdDriverProfileId = driverUser.driverProfile!.id;
    driverToken = signAccessToken({
      id: driverUser.id,
      email: driverUser.email,
      role: driverUser.role,
    });

    // 3. Create Patient User
    const patientUser = await prisma.user.create({
      data: {
        email: patientEmail,
        password: hashedPassword,
        name: 'Patient Tester',
        role: 'PATIENT',
        phone: '+8801700333444',
      },
    });
    createdPatientId = patientUser.id;
    patientToken = signAccessToken({
      id: patientUser.id,
      email: patientUser.email,
      role: patientUser.role,
    });

    // 4. Create Ambulance linked to Driver
    const ambulance = await prisma.ambulance.create({
      data: {
        plateNumber: `AMB-${timestamp.toString().slice(-6)}`,
        model: 'Mercedes-Benz Sprinter ICU',
        vehicleType: 'ADVANCED_LIFE_SUPPORT',
        driverProfileId: createdDriverProfileId,
        isOperational: true,
      },
    });
    createdAmbulanceId = ambulance.id;

    // 5. Create Emergency Request
    const emergency = await prisma.emergencyRequest.create({
      data: {
        patientId: createdPatientId,
        patientName: 'Patient Tester',
        patientPhone: '+8801700333444',
        pickupAddress: 'Road 11, Banani, Dhaka',
        pickupLatitude: 23.7937,
        pickupLongitude: 90.4066,
        symptoms: 'Severe respiratory distress',
        priority: 'CRITICAL',
        status: 'PENDING',
      },
    });
    createdEmergencyId = emergency.id;
  });

  afterAll(async () => {
    // Cleanup records in order
    if (createdTripId) {
      await prisma.tripStatusLog.deleteMany({ where: { tripId: createdTripId } });
      await prisma.payment.deleteMany({ where: { tripId: createdTripId } });
      await prisma.trip.deleteMany({ where: { id: createdTripId } });
    }
    if (createdEmergencyId) {
      await prisma.emergencyRequest.deleteMany({ where: { id: createdEmergencyId } });
    }
    if (createdAmbulanceId) {
      await prisma.ambulance.deleteMany({ where: { id: createdAmbulanceId } });
    }
    if (createdDriverProfileId) {
      await prisma.driverProfile.deleteMany({ where: { id: createdDriverProfileId } });
    }
    await prisma.user.deleteMany({
      where: {
        email: { in: [adminEmail, driverEmail, patientEmail] },
      },
    });
    await prisma.$disconnect();
  });

  it('POST /api/v1/trips/dispatch should assign ambulance and change emergency status to DISPATCHED', async () => {
    const res = await request(app)
      .post('/api/v1/trips/dispatch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        emergencyRequestId: createdEmergencyId,
        ambulanceId: createdAmbulanceId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ASSIGNED');
    expect(res.body.data.emergencyRequestId).toBe(createdEmergencyId);
    expect(res.body.data.ambulanceId).toBe(createdAmbulanceId);

    createdTripId = res.body.data.id;

    // Verify driver status became BUSY
    const driver = await prisma.driverProfile.findUnique({
      where: { id: createdDriverProfileId },
    });
    expect(driver?.status).toBe('BUSY');
  });

  it('PATCH /api/v1/trips/:id/status should reject invalid state skip (e.g. ASSIGNED to COMPLETED)', async () => {
    const res = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'COMPLETED',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid status transition');
  });

  it('PATCH /api/v1/trips/:id/status should successfully advance through FSM state machine', async () => {
    // 1. ASSIGNED -> EN_ROUTE_PICKUP
    const step1 = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'EN_ROUTE_PICKUP',
        latitude: 23.801,
        longitude: 90.41,
        note: 'Ambulance is moving towards pickup',
      });
    expect(step1.status).toBe(200);
    expect(step1.body.data.status).toBe('EN_ROUTE_PICKUP');

    // 2. EN_ROUTE_PICKUP -> PATIENT_PICKED_UP
    const step2 = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'PATIENT_PICKED_UP',
        note: 'Patient safely boarded',
      });
    expect(step2.status).toBe(200);
    expect(step2.body.data.status).toBe('PATIENT_PICKED_UP');

    // 3. PATIENT_PICKED_UP -> EN_ROUTE_HOSPITAL
    const step3 = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'EN_ROUTE_HOSPITAL',
      });
    expect(step3.status).toBe(200);
    expect(step3.body.data.status).toBe('EN_ROUTE_HOSPITAL');

    // 4. EN_ROUTE_HOSPITAL -> ARRIVED_HOSPITAL
    const step4 = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'ARRIVED_HOSPITAL',
      });
    expect(step4.status).toBe(200);
    expect(step4.body.data.status).toBe('ARRIVED_HOSPITAL');

    // 5. ARRIVED_HOSPITAL -> COMPLETED (Fare calculated & driver freed)
    const step5 = await request(app)
      .patch(`/api/v1/trips/${createdTripId}/status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        status: 'COMPLETED',
        distanceKm: 12.5,
        note: 'Handed over to ER doctors',
      });

    expect(step5.status).toBe(200);
    expect(step5.body.data.status).toBe('COMPLETED');
    expect(Number(step5.body.data.totalFare)).toBeGreaterThan(50);

    // Verify driver status reverted to AVAILABLE
    const freedDriver = await prisma.driverProfile.findUnique({
      where: { id: createdDriverProfileId },
    });
    expect(freedDriver?.status).toBe('AVAILABLE');

    // Verify pending payment record created
    const payment = await prisma.payment.findUnique({
      where: { tripId: createdTripId },
    });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe('PENDING');
  }, 30000);

  it('GET /api/v1/trips/:id should return complete trip details with audit breadcrumbs', async () => {
    const res = await request(app)
      .get(`/api/v1/trips/${createdTripId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdTripId);
    expect(res.body.data.statusLogs.length).toBeGreaterThan(0);
    expect(res.body.data.payment).not.toBeNull();
  });
});
