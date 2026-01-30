/**
 * @fileoverview Email Transporter Factory
 * @module @nxt1/functions/email/transporter
 *
 * Creates nodemailer transporter with Firebase Secrets.
 */

import * as nodemailer from 'nodemailer';
import { defineSecret } from 'firebase-functions/params';

/**
 * Email secrets - set via Firebase CLI:
 * firebase functions:secrets:set SMTP_USER
 * firebase functions:secrets:set SMTP_PASS
 */
export const SMTP_USER = defineSecret('SMTP_USER');
export const SMTP_PASS = defineSecret('SMTP_PASS');

/**
 * Create nodemailer transporter with secrets
 * NOTE: Transporter is created per-invocation to use runtime secrets
 */
export function createTransporter(smtpUser: string, smtpPass: string): nodemailer.Transporter {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}
