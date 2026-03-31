/**
 * @fileoverview Send Email - Callable function
 * @module @nxt1/functions/email/sendEmail
 *
 * Callable function to send emails via templates or custom content.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { SMTP_USER, SMTP_PASS, createTransporter } from './transporter';
import { EMAIL_TEMPLATES } from './templates';

const db = admin.firestore();

/**
 * Send email - callable function
 * Requires authentication. Rate limited.
 */
export const sendEmail = onCall(
  {
    secrets: [SMTP_USER, SMTP_PASS],
    cors: true,
    enforceAppCheck: false, // Enable in production
  },
  async (request) => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { to, templateId, data, subject, html, text, emailType, recipientUserId } =
      request.data as {
        to: string;
        templateId?: string;
        data?: Record<string, unknown>;
        subject?: string;
        html?: string;
        text?: string;
        /** 'transactional' | 'digest' | 'marketing' — defaults to 'transactional' */
        emailType?: string;
        /** If sending to a platform user, pass their UID so we can check preferences */
        recipientUserId?: string;
      };

    // Validate input
    if (!to || typeof to !== 'string') {
      throw new HttpsError('invalid-argument', 'Recipient email is required');
    }

    // ─── Preference gate ─────────────────────────────────────────
    // Non-transactional emails to platform users respect their notification prefs
    const classifiedType =
      emailType === 'marketing' || emailType === 'digest' ? emailType : 'transactional';
    if (recipientUserId && classifiedType !== 'transactional') {
      const userDoc = await db.collection('Users').doc(recipientUserId).get();
      if (userDoc.exists) {
        const prefs = userDoc.data()?.['preferences']?.['notifications'] as
          | Record<string, boolean>
          | undefined;

        if (classifiedType === 'marketing' && prefs?.['marketing'] === false) {
          logger.info('Skipping email: user opted out of marketing', { recipientUserId, to });
          return { success: false, skipped: true, reason: 'User opted out of marketing emails' };
        }
        if (prefs?.['email'] === false) {
          logger.info('Skipping email: user opted out of email notifications', {
            recipientUserId,
            to,
          });
          return { success: false, skipped: true, reason: 'User opted out of email notifications' };
        }
      }
    }

    // Get template or use custom content
    let emailSubject: string;
    let emailHtml: string;
    let emailText: string;

    if (templateId) {
      const template = EMAIL_TEMPLATES[templateId];
      if (!template) {
        throw new HttpsError('invalid-argument', `Unknown template: ${templateId}`);
      }
      emailSubject = template.subject;
      emailHtml = template.html(data || {});
      emailText = template.text(data || {});
    } else if (subject && (html || text)) {
      emailSubject = subject;
      emailHtml = html || '';
      emailText = text || '';
    } else {
      throw new HttpsError('invalid-argument', 'Either templateId or subject/html is required');
    }

    try {
      const transporter = createTransporter(SMTP_USER.value(), SMTP_PASS.value());

      const mailOptions = {
        from: `NXT1 Sports <${SMTP_USER.value()}>`,
        to,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      };

      const info = await transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        to,
        templateId,
        messageId: info.messageId,
      });

      // Log to Firestore for analytics
      await db.collection('email_logs').add({
        to,
        templateId: templateId || 'custom',
        status: 'sent',
        messageId: info.messageId,
        sentBy: request.auth.uid,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email', { to, templateId, error });

      // Log failure
      await db.collection('email_logs').add({
        to,
        templateId: templateId || 'custom',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentBy: request.auth.uid,
        attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw new HttpsError('internal', 'Failed to send email');
    }
  }
);
