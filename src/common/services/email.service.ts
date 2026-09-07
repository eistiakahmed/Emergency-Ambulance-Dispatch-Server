import { emailTransporter } from '../../config/email.js';
import { env } from '../../config/env.js';

export class EmailService {
  static async sendDispatchAlert(
    to: string,
    patientName: string,
    ambulancePlate: string,
    driverName: string,
    driverPhone: string
  ) {
    try {
      await emailTransporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: '🚑 Emergency Ambulance Dispatched to Your Location',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d9534f;">🚑 Emergency Unit En Route</h2>
            <p>Dear <strong>${patientName}</strong>,</p>
            <p>An emergency ambulance has been assigned to your request and is currently en route.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #d9534f; margin: 20px 0;">
              <p><strong>Ambulance Plate:</strong> ${ambulancePlate}</p>
              <p><strong>Lead Paramedic:</strong> ${driverName}</p>
              <p><strong>Emergency Contact:</strong> <a href="tel:${driverPhone}">${driverPhone}</a></p>
            </div>
            <p>Please ensure clear access for the emergency vehicle.</p>
          </div>
        `,
      });
    } catch (error) {
      console.warn('⚠️ Email alert delivery failed:', error);
    }
  }

  static async sendPaymentReceipt(to: string, patientName: string, amount: string, tripId: string) {
    try {
      await emailTransporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: '💳 Emergency Service Payment Confirmation & Receipt',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Payment Received Successfully</h2>
            <p>Dear <strong>${patientName}</strong>,</p>
            <p>Your payment for emergency ambulance service has been processed successfully.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
              <p><strong>Trip ID:</strong> ${tripId}</p>
              <p><strong>Amount Paid:</strong> $${amount} USD</p>
              <p><strong>Status:</strong> Completed & Paid</p>
            </div>
            <p>Thank you for using the Emergency Ambulance Dispatch System.</p>
          </div>
        `,
      });
    } catch (error) {
      console.warn('⚠️ Payment receipt email delivery failed:', error);
    }
  }
}
