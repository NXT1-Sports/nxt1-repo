/**
 * @fileoverview Process Email Queue - Firestore trigger
 * @module @nxt1/functions/email/processEmailQueue
 *
 * Triggered when new email is added to queue collection.
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { SMTP_USER, SMTP_PASS, createTransporter } from './transporter';
import { EMAIL_TEMPLATES } from './templates';

/**
 * Process email queue - triggered when new email added to queue
 */
export const processEmailQueue = onDocumentCreated(
  {
    document: 'email_queue/{emailId}',
    secrets: [SMTP_USER, SMTP_PASS],
    memory: '256MiB',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const emailData = snapshot.data();
    const emailId = event.params.emailId;

    const { to, templateId, data, status } = emailData as {
      to: string;
      templateId: string;
      data: Record<string, unknown>;
      status: string;
    };

    // Skip if not pending
    if (status !== 'pending') {
      logger.info('Skipping non-pending email', { emailId, status });
      return;
    }

    // Mark as processing
    await snapshot.ref.update({ status: 'processing' });

    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      logger.error('Unknown email template', { emailId, templateId });
      await snapshot.ref.update({ status: 'failed', error: 'Unknown template' });
      return;
    }

    try {
      const transporter = createTransporter(SMTP_USER.value(), SMTP_PASS.value());

      await transporter.sendMail({
        from: `NXT1 Sports <${SMTP_USER.value()}>`,
        to,
        subject: template.subject,
        html: template.html(data || {}),
        text: template.text(data || {}),
      });

      await snapshot.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('Queue email sent', { emailId, to, templateId });
    } catch (error) {
      logger.error('Queue email failed', { emailId, error });
      await snapshot.ref.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
