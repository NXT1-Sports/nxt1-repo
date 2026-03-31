/**
 * @fileoverview Process Email Queue - Firestore trigger
 * @module @nxt1/functions/email/processEmailQueue
 *
 * Triggered when new email is added to queue collection.
 * Enforces user notification preferences before dispatching.
 *
 * emailType classification:
 * - 'transactional' — Always sent (password reset, security alerts, billing receipts)
 * - 'digest'        — Blocked when preferences.notifications.email === false
 * - 'marketing'     — Blocked when preferences.notifications.marketing === false
 * - (unset)         — Treated as 'transactional' for backwards compatibility
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { SMTP_USER, SMTP_PASS, createTransporter } from './transporter';
import { EMAIL_TEMPLATES } from './templates';

const db = admin.firestore();

/** Recognised email classifications */
type EmailType = 'transactional' | 'digest' | 'marketing';

/**
 * Check the user's notification preferences and decide whether this email
 * should be sent.  Returns a reason string if the email should be skipped,
 * or `null` if it's cleared to send.
 */
async function shouldSkipEmail(
  userId: string | undefined,
  emailType: EmailType
): Promise<string | null> {
  // No userId → can't check prefs → send it (backwards compat)
  if (!userId) return null;

  // Transactional emails always go through
  if (emailType === 'transactional') return null;

  const userDoc = await db.collection('Users').doc(userId).get();
  if (!userDoc.exists) return null; // User deleted between queue entry and processing

  const prefs = userDoc.data()?.['preferences']?.['notifications'] as
    | Record<string, boolean>
    | undefined;

  if (!prefs) return null; // No prefs stored yet → honour defaults (send)

  if (emailType === 'marketing' && prefs['marketing'] === false) {
    return 'User opted out of marketing emails';
  }

  if ((emailType === 'digest' || emailType === 'marketing') && prefs['email'] === false) {
    return 'User opted out of email notifications';
  }

  return null;
}

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

    const {
      to,
      templateId,
      data,
      status,
      userId,
      emailType: rawEmailType,
    } = emailData as {
      to: string;
      templateId: string;
      data: Record<string, unknown>;
      status: string;
      userId?: string;
      emailType?: string;
    };

    // Skip if not pending
    if (status !== 'pending') {
      logger.info('Skipping non-pending email', { emailId, status });
      return;
    }

    // Classify email type (default to transactional for backwards compat)
    const emailType: EmailType =
      rawEmailType === 'marketing' || rawEmailType === 'digest' ? rawEmailType : 'transactional';

    // ─── Preference gate ─────────────────────────────────────────
    const skipReason = await shouldSkipEmail(userId, emailType);
    if (skipReason) {
      logger.info('Skipping email due to user preferences', {
        emailId,
        userId,
        emailType,
        reason: skipReason,
      });
      await snapshot.ref.update({
        status: 'skipped',
        skipReason,
        skippedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
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
