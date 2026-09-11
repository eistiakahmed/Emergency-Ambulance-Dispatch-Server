import type Stripe from 'stripe';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { BkashService } from '../../common/services/bkash.service.js';
import { EmailService } from '../../common/services/email.service.js';
import { logAuditEvent } from '../../common/utils/auditLogger.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { stripe } from '../../config/stripe.js';

export class PaymentService {
  // ==============================================================================
  // Stripe Payment Integration
  // ==============================================================================

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

  // ==============================================================================
  // bKash Payment Gateway Integration
  // ==============================================================================

  static async initiateBkashPayment(
    tripId: string,
    user: { id: string; email: string; phone?: string | null },
    options?: { payerReference?: string; callbackURL?: string; agreementID?: string }
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
      throw new BadRequestError(
        'bKash payment can only be initiated for completed emergency trips'
      );
    }

    if (trip.payment && trip.payment.status === 'SUCCEEDED') {
      throw new BadRequestError('Payment for this emergency trip has already been settled');
    }

    const rawAmount = Number(trip.totalFare);
    // Standard conversion: if totalFare is small (USD), convert to BDT (1 USD = 120 BDT), otherwise keep raw BDT
    const bdtAmount =
      rawAmount > 500 ? Math.round(rawAmount) : Math.max(10, Math.round(rawAmount * 120));
    const invoiceNumber = `INV-${trip.id.replace(/-/g, '').slice(0, 12)}`;
    const payerRef =
      options?.payerReference || trip.emergencyRequest.patientPhone || user.phone || '01700000000';

    const bkashRes = await BkashService.createPayment({
      amount: bdtAmount,
      merchantInvoiceNumber: invoiceNumber,
      payerReference: payerRef,
      callbackURL: options?.callbackURL || env.BKASH_CALLBACK_URL,
      agreementID: options?.agreementID,
    });

    const payment = await prisma.payment.upsert({
      where: { tripId: trip.id },
      create: {
        tripId: trip.id,
        userId: user.id,
        amount: bdtAmount,
        currency: 'BDT',
        provider: 'BKASH',
        status: 'PENDING',
        bkashPaymentId: bkashRes.paymentID,
        transactionReference: bkashRes.paymentID,
      },
      update: {
        amount: bdtAmount,
        currency: 'BDT',
        provider: 'BKASH',
        status: 'PENDING',
        bkashPaymentId: bkashRes.paymentID,
        transactionReference: bkashRes.paymentID,
      },
    });

    await logAuditEvent({
      actorId: user.id,
      actorRole: 'PATIENT',
      action: 'CREATE',
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      newValues: {
        provider: 'BKASH',
        paymentID: bkashRes.paymentID,
        amount: bdtAmount,
        currency: 'BDT',
      },
    });

    return {
      paymentId: payment.id,
      paymentID: bkashRes.paymentID,
      bkashURL: bkashRes.bkashURL,
      callbackURL: bkashRes.callbackURL,
      amount: bdtAmount,
      currency: 'BDT',
      status: 'PENDING',
    };
  }

  static async executeBkashPayment(paymentID: string) {
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ bkashPaymentId: paymentID }, { transactionReference: paymentID }],
      },
      include: {
        trip: {
          include: {
            emergencyRequest: true,
          },
        },
        user: true,
      },
    });

    if (!payment) {
      throw new NotFoundError(`No payment record found with bKash paymentID: ${paymentID}`);
    }

    if (payment.status === 'SUCCEEDED') {
      return {
        payment,
        message: 'Payment has already been executed and verified',
      };
    }

    const execRes = await BkashService.executePayment(paymentID);

    if (execRes.transactionStatus !== 'Completed') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestError(
        `bKash transaction was not completed. Status: ${execRes.transactionStatus} (${execRes.statusMessage})`
      );
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        bkashTrxId: execRes.trxID,
        transactionReference: execRes.trxID,
        paidAt: new Date(),
      },
      include: {
        trip: true,
        user: { select: { name: true, email: true } },
      },
    });

    await logAuditEvent({
      actorId: payment.userId,
      actorRole: 'PATIENT',
      action: 'PAYMENT',
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      newValues: {
        status: 'SUCCEEDED',
        bkashPaymentId: paymentID,
        trxID: execRes.trxID,
        amount: execRes.amount,
      },
    });

    // Send receipt email
    if (payment.user.email) {
      const patientName = payment.trip.emergencyRequest.patientName || payment.user.name;
      EmailService.sendPaymentReceipt(
        payment.user.email,
        patientName,
        String(execRes.amount || payment.amount),
        payment.tripId
      ).catch((e) => console.warn('Email receipt error:', e));
    }

    return {
      payment: updatedPayment,
      bkashResponse: execRes,
    };
  }

  static async handleBkashCallback(query: {
    paymentID: string;
    status: string;
    signature?: string;
  }) {
    const { paymentID, status } = query;

    if (status === 'success') {
      const result = await PaymentService.executeBkashPayment(paymentID);
      return {
        success: true,
        message: 'bKash payment completed and verified successfully',
        data: result,
      };
    }

    await prisma.payment.updateMany({
      where: {
        OR: [{ bkashPaymentId: paymentID }, { transactionReference: paymentID }],
        status: 'PENDING',
      },
      data: {
        status: 'FAILED',
      },
    });

    return {
      success: false,
      message: `bKash payment was ${status}`,
      paymentID,
      status,
    };
  }

  static async queryBkashPaymentStatus(paymentID: string) {
    const statusResult = await BkashService.queryPaymentStatus(paymentID);

    // If bKash status is Completed and our local record is PENDING, auto-sync
    if (statusResult.transactionStatus === 'Completed' && statusResult.trxID) {
      await prisma.payment.updateMany({
        where: {
          OR: [{ bkashPaymentId: paymentID }, { transactionReference: paymentID }],
          status: 'PENDING',
        },
        data: {
          status: 'SUCCEEDED',
          bkashTrxId: statusResult.trxID,
          transactionReference: statusResult.trxID,
          paidAt: new Date(),
        },
      });
    }

    return statusResult;
  }

  static async captureBkashPayment(paymentID: string) {
    const captureResult = await BkashService.capturePayment(paymentID);
    return captureResult;
  }

  // ==============================================================================
  // Payment Query Methods
  // ==============================================================================

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
