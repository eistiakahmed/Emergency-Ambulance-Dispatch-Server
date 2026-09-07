import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Emergency Ambulance Dispatch System database seed...');

  // 1. Clean existing records in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.tripStatusLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.emergencyRequest.deleteMany();
  await prisma.ambulance.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.user.deleteMany();

  console.log('🧹 Cleaned existing database records.');

  // Password hashes
  const saltRounds = 10;
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', saltRounds);
  const driverPasswordHash = await bcrypt.hash('DriverPass123!', saltRounds);
  const patientPasswordHash = await bcrypt.hash('PatientPass123!', saltRounds);

  // 2. Create Users
  // Admin
  const admin = await prisma.user.create({
    data: {
      email: 'admin@emergency.com',
      password: adminPasswordHash,
      name: 'Central Dispatch Admin',
      phone: '+8801711000000',
      role: 'ADMIN',
      isActive: true,
    },
  });

  // Drivers
  const driver1User = await prisma.user.create({
    data: {
      email: 'driver.john@emergency.com',
      password: driverPasswordHash,
      name: 'John Miller (Paramedic Lead)',
      phone: '+8801811000001',
      role: 'DRIVER',
      isActive: true,
    },
  });

  const driver2User = await prisma.user.create({
    data: {
      email: 'driver.sarah@emergency.com',
      password: driverPasswordHash,
      name: 'Sarah Rahman (EMT-B)',
      phone: '+8801811000002',
      role: 'DRIVER',
      isActive: true,
    },
  });

  // Patient
  const patient = await prisma.user.create({
    data: {
      email: 'patient.alice@emergency.com',
      password: patientPasswordHash,
      name: 'Alice Chowdhury',
      phone: '+8801911000001',
      role: 'PATIENT',
      isActive: true,
    },
  });

  console.log('✅ Created Demo Users (Admin, 2 Drivers, 1 Patient)');

  // 3. Create Driver Profiles
  const driver1Profile = await prisma.driverProfile.create({
    data: {
      userId: driver1User.id,
      licenseNumber: 'DL-MED-2024-001',
      status: 'AVAILABLE',
      currentLat: 23.8103,
      currentLng: 90.4125,
      lastLocationUpdate: new Date(),
    },
  });

  const driver2Profile = await prisma.driverProfile.create({
    data: {
      userId: driver2User.id,
      licenseNumber: 'DL-MED-2024-002',
      status: 'AVAILABLE',
      currentLat: 23.7937,
      currentLng: 90.4066,
      lastLocationUpdate: new Date(),
    },
  });

  // 4. Create Ambulances & Assign to Drivers
  const ambulance1 = await prisma.ambulance.create({
    data: {
      plateNumber: 'DHK-EMERG-101',
      model: 'Mercedes-Benz Sprinter 3500 Mobile ICU',
      vehicleType: 'ADVANCED_LIFE_SUPPORT',
      driverProfileId: driver1Profile.id,
      isOperational: true,
      equipment: [
        'Zoll X Series Defibrillator',
        'Hamilton-T1 Transport Ventilator',
        'Suction Unit',
        'Oxygen Manifold System',
        'Stretcher & Spinal Board',
      ],
    },
  });

  const ambulance2 = await prisma.ambulance.create({
    data: {
      plateNumber: 'DHK-EMERG-202',
      model: 'Toyota HiAce High-Roof Life Support',
      vehicleType: 'BASIC_LIFE_SUPPORT',
      driverProfileId: driver2Profile.id,
      isOperational: true,
      equipment: [
        'Automated External Defibrillator (AED)',
        'Portable Oxygen Kit',
        'Emergency Trauma Bag',
        'Collapsible Wheelchair Stretcher',
      ],
    },
  });

  console.log('✅ Created Fleet Ambulances and assigned to Drivers');

  // 5. Create Hospitals
  const hospitalDmc = await prisma.hospital.create({
    data: {
      name: 'Dhaka Medical College Hospital Emergency Complex',
      address: 'Secretariat Road, Ramna, Dhaka 1000',
      latitude: 23.7258,
      longitude: 90.3976,
      contactPhone: '+880255165088',
      emergencyBedsTotal: 50,
      emergencyBedsAvailable: 18,
      hasIcu: true,
      icuBedsAvailable: 4,
    },
  });

  const hospitalSquare = await prisma.hospital.create({
    data: {
      name: 'Square Hospital Emergency & Trauma Care',
      address: '18/F Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath, Dhaka 1205',
      latitude: 23.7533,
      longitude: 90.3817,
      contactPhone: '+88028144400',
      emergencyBedsTotal: 30,
      emergencyBedsAvailable: 9,
      hasIcu: true,
      icuBedsAvailable: 3,
    },
  });

  const hospitalEvercare = await prisma.hospital.create({
    data: {
      name: 'Evercare Hospital Dhaka Critical Care Unit',
      address: 'Plot 81, Block E, Bashundhara R/A, Dhaka 1229',
      latitude: 23.8101,
      longitude: 90.4312,
      contactPhone: '+8809666710678',
      emergencyBedsTotal: 40,
      emergencyBedsAvailable: 15,
      hasIcu: true,
      icuBedsAvailable: 6,
    },
  });

  console.log('✅ Created 3 Tertiary Care Hospitals');

  // 6. Create Historical Completed Emergency & Trip
  const pastRequest = await prisma.emergencyRequest.create({
    data: {
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone ?? '+8801911000001',
      priority: 'HIGH',
      pickupAddress: 'Road 11, Banani, Dhaka',
      pickupLatitude: 23.7944,
      pickupLongitude: 90.4042,
      symptoms: 'Acute chest pain and severe shortness of breath',
      notes: 'Patient conscious, requires immediate cardiac evaluation',
      status: 'COMPLETED',
      destinationHospitalId: hospitalSquare.id,
      createdAt: new Date(Date.now() - 3600 * 1000 * 3), // 3 hours ago
    },
  });

  const pastTrip = await prisma.trip.create({
    data: {
      emergencyRequestId: pastRequest.id,
      ambulanceId: ambulance1.id,
      driverProfileId: driver1Profile.id,
      hospitalId: hospitalSquare.id,
      status: 'COMPLETED',
      baseFare: 50.0,
      distanceKm: 6.8,
      totalFare: 84.0,
      startedAt: new Date(Date.now() - 3600 * 1000 * 3),
      completedAt: new Date(Date.now() - 3600 * 1000 * 2),
    },
  });

  // Breadcrumb logs for past trip
  await prisma.tripStatusLog.createMany({
    data: [
      {
        tripId: pastTrip.id,
        status: 'ASSIGNED',
        latitude: 23.8103,
        longitude: 90.4125,
        note: 'Emergency dispatched to unit DHK-EMERG-101',
        timestamp: new Date(Date.now() - 3600 * 1000 * 3),
      },
      {
        tripId: pastTrip.id,
        status: 'EN_ROUTE_PICKUP',
        latitude: 23.805,
        longitude: 90.409,
        note: 'Ambulance siren engaged, navigating through traffic',
        timestamp: new Date(Date.now() - 3600 * 1000 * 2.8),
      },
      {
        tripId: pastTrip.id,
        status: 'PATIENT_PICKED_UP',
        latitude: 23.7944,
        longitude: 90.4042,
        note: 'Patient safely stabilized inside ICU unit, vitals normal',
        timestamp: new Date(Date.now() - 3600 * 1000 * 2.5),
      },
      {
        tripId: pastTrip.id,
        status: 'ARRIVED_HOSPITAL',
        latitude: 23.7533,
        longitude: 90.3817,
        note: 'Arrived at Square Hospital ER bay',
        timestamp: new Date(Date.now() - 3600 * 1000 * 2.1),
      },
      {
        tripId: pastTrip.id,
        status: 'COMPLETED',
        latitude: 23.7533,
        longitude: 90.3817,
        note: 'Patient handed over to ER triage doctor, trip closed',
        timestamp: new Date(Date.now() - 3600 * 1000 * 2),
      },
    ],
  });

  // Payment for past trip
  await prisma.payment.create({
    data: {
      tripId: pastTrip.id,
      userId: patient.id,
      amount: 84.0,
      currency: 'USD',
      provider: 'STRIPE',
      status: 'SUCCEEDED',
      stripeSessionId: 'cs_test_seed_demo_session_12345',
      stripePaymentIntentId: 'pi_test_seed_demo_intent_12345',
      paidAt: new Date(Date.now() - 3600 * 1000 * 1.9),
    },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      actorRole: 'ADMIN',
      action: 'DISPATCH',
      resourceType: 'TRIP',
      resourceId: pastTrip.id,
      newValues: {
        ambulanceId: ambulance1.id,
        driverId: driver1Profile.id,
        priority: 'HIGH',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  console.log('✅ Created Historical Trip with 5 Milestone Status Logs and Succeeded Payment');
  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
