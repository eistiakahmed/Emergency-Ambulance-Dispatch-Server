import type Stripe from 'stripe';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { EmailService } from '../../common/services/email.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { stripe } from '../../config/stripe.js';

export class PaymentService {
  static async initiatePayment(
    tripId: string,
    user: { id: string; email: string },
    options?: { successUrl?: string; cancelUrl?: string }
  ) {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: {
        emergencyRequest: { include: { patient: true } },
        payment: true,
      },
    });

    if (!trip) {
      throw new NotFoundError('Trip record not found');
    }

    if (trip.status !== 'COMPLETED') {
      throw new BadRequestError('Payment can only be initiated for completed emergency trips');
    }

    if (trip.payment && trip.payment.status === 'SUCCEEDED') {
      throw new BadRequestError('Payment for this emergency trip has already been settled');
    }

    const amountNum = Math.max(1, Number(trip.totalFare));
    const amountCents = Math.round(amountNum * 100);

    const successUrl =
      options?.successUrl ||
      `${env.CLIENT_URL}/payments/success?tripId=${trip.id}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = options?.cancelUrl || `${env.CLIENT_URL}/payments/cancel?tripId=${trip.id}`;

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Emergency Ambulance Transit Service',
                description: `Emergency transit trip ${trip.id} - ${trip.emergencyRequest.pickupAddress}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          tripId: trip.id,
          userId: user.id,
          patientName: trip.emergencyRequest.patientName,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (stripeErr: any) {
      console.error('Stripe session creation error:', stripeErr);
      throw new BadRequestError(`Failed to create Stripe payment session: ${stripeErr.message}`);
    }

    // Upsert local payment record
    const payment = await prisma.payment.upsert({
      where: { tripId: trip.id },
      create: {
        tripId: trip.id,
        userId: user.id,
        amount: amountNum,
        currency: 'USD',
        provider: 'STRIPE',
        status: 'PENDING',
        stripeSessionId: session.id,
      },
      update: {
        amount: amountNum,
        stripeSessionId: session.id,
        status: 'PENDING',
      },
    });

    return {
      paymentId: payment.id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: amountNum,
      currency: 'USD',
    };
  }

  static async handleWebhook(rawBody: Buffer, signature: string) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET is not configured; skipping webhook verification');
      return { received: false };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw new BadRequestError(`Webhook signature verification failed: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tripId = session.metadata?.tripId;
      const patientName = session.metadata?.patientName || 'Valued Patient';

      if (tripId) {
        const payment = await prisma.payment.findUnique({
          where: { tripId },
          include: { user: true },
        });

        if (payment && payment.status !== 'SUCCEEDED') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCEEDED',
              stripePaymentIntentId: session.payment_intent as string,
              paidAt: new Date(),
            },
          });

          await logAuditEvent({
            actorId: payment.userId,
            actorRole: 'SYSTEM',
            action: 'PAYMENT',
            resourceType: 'PAYMENT',
            resourceId: payment.id,
            newValues: {
              status: 'SUCCEEDED',
              stripeSessionId: session.id,
              amount: payment.amount,
            },
          });

          // Send payment confirmation email
          if (payment.user.email) {
            EmailService.sendPaymentReceipt(
              payment.user.email,
              patientName,
              String(payment.amount),
              tripId
            ).catch((e) => console.warn('Email receipt error:', e));
          }
        }
      }
    }

    return { received: true };
  }

  static async getPaymentById(id: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        trip: {
          include: {
            ambulance: true,
            emergencyRequest: true,
          },
        },
        user: { select: { name: true, email: true } },
      },
    });

    if (!payment) throw new NotFoundError('Payment record not found');
    return payment;
  }

  static async getPaymentByTripId(tripId: string) {
    const payment = await prisma.payment.findUnique({
      where: { tripId },
      include: {
        trip: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!payment) throw new NotFoundError('No payment record found for this trip');
    return payment;
  }
}
