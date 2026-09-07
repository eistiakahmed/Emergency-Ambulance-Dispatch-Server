import ejs from 'ejs';
import { emailTransporter } from '../../config/email.js';
import { env } from '../../config/env.js';

const DISPATCH_ALERT_TEMPLATE = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #d9534f; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">🚑 Emergency Unit En Route</h1>
  </div>
  <div style="padding: 24px;">
    <p>Dear <strong><%= patientName %></strong>,</p>
    <p>An emergency ambulance has been assigned to your request and is currently en route to your location.</p>
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #d9534f; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong>Ambulance Plate:</strong> <%= ambulancePlate %></p>
      <p style="margin: 5px 0;"><strong>Lead Paramedic:</strong> <%= driverName %></p>
      <p style="margin: 5px 0;"><strong>Emergency Contact:</strong> <a href="tel:<%= driverPhone %>" style="color: #d9534f; font-weight: bold;"><%= driverPhone %></a></p>
    </div>
    <p style="font-size: 14px; color: #666;">Please ensure clear road access and keep your phone available for driver updates.</p>
  </div>
  <div style="background-color: #f1f1f1; padding: 12px; text-align: center; font-size: 12px; color: #777;">
    Emergency Ambulance Dispatch System © <%= new Date().getFullYear() %>
  </div>
</div>
`;

const PAYMENT_RECEIPT_TEMPLATE = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">💳 Payment Receipt</h1>
  </div>
  <div style="padding: 24px;">
    <p>Dear <strong><%= patientName %></strong>,</p>
    <p>Your emergency ambulance dispatch payment has been successfully processed.</p>
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong>Trip Reference:</strong> <%= tripId %></p>
      <p style="margin: 5px 0;"><strong>Amount Paid:</strong> $<%= amount %> USD</p>
      <p style="margin: 5px 0;"><strong>Payment Status:</strong> Settled & Verified</p>
    </div>
    <p style="font-size: 14px; color: #666;">Thank you for trusting the Emergency Ambulance Dispatch Service.</p>
  </div>
  <div style="background-color: #f1f1f1; padding: 12px; text-align: center; font-size: 12px; color: #777;">
    Emergency Ambulance Dispatch System © <%= new Date().getFullYear() %>
  </div>
</div>
`;

export class EmailService {
  static async sendDispatchAlert(
    to: string,
    patientName: string,
    ambulancePlate: string,
    driverName: string,
    driverPhone: string
  ) {
    try {
      const html = ejs.render(DISPATCH_ALERT_TEMPLATE, {
        patientName,
        ambulancePlate,
        driverName,
        driverPhone,
      });

      await emailTransporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: '🚑 Emergency Ambulance Dispatched to Your Location',
        html,
      });
    } catch (error) {
      console.warn('⚠️ Email alert delivery failed:', error);
    }
  }

  static async sendPaymentReceipt(to: string, patientName: string, amount: string, tripId: string) {
    try {
      const html = ejs.render(PAYMENT_RECEIPT_TEMPLATE, {
        patientName,
        amount,
        tripId,
      });

      await emailTransporter.sendMail({
        from: env.EMAIL_FROM,
        to,
        subject: '💳 Emergency Service Payment Confirmation & Receipt',
        html,
      });
    } catch (error) {
      console.warn('⚠️ Payment receipt email delivery failed:', error);
    }
  }
}
