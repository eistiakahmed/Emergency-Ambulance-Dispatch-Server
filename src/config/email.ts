import nodemailer from 'nodemailer';
import { env } from './env.js';

const isGmail = env.SMTP_USER?.includes('@gmail.com') || env.SMTP_HOST === 'smtp.gmail.com';
const cleanPass = (env.SMTP_PASS || '').replace(/\s+/g, '');

export const emailTransporter = nodemailer.createTransport(
  isGmail
    ? {
        service: 'gmail',
        auth: {
          user: env.SMTP_USER,
          pass: cleanPass,
        },
      }
    : {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? {
                user: env.SMTP_USER,
                pass: cleanPass,
              }
            : undefined,
      }
);

export async function verifyEmailTransporter(): Promise<boolean> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.log('ℹ️ SMTP credentials not fully configured; skipping email connection check');
    return false;
  }
  try {
    await emailTransporter.verify();
    console.log(`✅ Email transporter verified successfully (Sender: ${env.SMTP_USER})`);
    return true;
  } catch (err: any) {
    console.warn(`⚠️ Email transporter verification warning: ${err?.message || err}`);
    return false;
  }
}
