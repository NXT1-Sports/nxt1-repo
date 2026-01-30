/**
 * @fileoverview Send Welcome Email - Helper function
 * @module @nxt1/functions/email/sendWelcomeEmail
 *
 * Helper for auth triggers to send welcome emails.
 */

import { logger } from 'firebase-functions/v2';
import { createTransporter } from './transporter';
import { EMAIL_TEMPLATES } from './templates';

/**
 * Send welcome email - helper for auth triggers
 */
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  smtpUser: string,
  smtpPass: string
): Promise<void> {
  const template = EMAIL_TEMPLATES['welcome'];
  const transporter = createTransporter(smtpUser, smtpPass);

  await transporter.sendMail({
    from: `NXT1 Sports <${smtpUser}>`,
    to,
    subject: template.subject,
    html: template.html({ firstName }),
    text: template.text({ firstName }),
  });

  logger.info('Welcome email sent', { to });
}
