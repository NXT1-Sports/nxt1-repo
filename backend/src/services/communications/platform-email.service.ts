/**
 * @fileoverview Platform Email Service
 * @module @nxt1/backend/services/platform-email
 *
 * Sends transactional emails from the NXT1 platform address
 * (nxt1@nxt1sports.com) via Gmail SMTP using an App Password.
 *
 * Reusable by any backend service: weekly recaps, welcome emails,
 * billing alerts, and future platform communications.
 *
 * Configuration (env / Secret Manager):
 *   GMAIL_USER         — e.g. nxt1@nxt1sports.com
 *   GMAIL_APP_PASSWORD — 16-char Gmail App Password
 *
 * Dev guard: if credentials are absent the function logs a warning
 * and returns without throwing, so missing env vars never crash the server.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../../utils/logger.js';

// ─── Transport singleton ──────────────────────────────────────────────────

let _transport: Transporter | null = null;

function getTransport(): Transporter | null {
  const user = process.env['GMAIL_USER'];
  const pass = process.env['GMAIL_APP_PASSWORD'];

  if (!user || !pass) {
    return null;
  }

  if (!_transport) {
    _transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  return _transport;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Send a platform transactional email.
 *
 * @param to       Recipient email address
 * @param subject  Email subject line
 * @param html     Full HTML body
 * @param replyTo  Optional reply-to address (defaults to FROM address)
 */
export async function sendPlatformEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<void> {
  const transport = getTransport();

  if (!transport) {
    logger.warn('[PlatformEmail] GMAIL_USER or GMAIL_APP_PASSWORD not configured — skipping send', {
      to,
      subject,
    });
    return;
  }

  const from = `Agent X <${process.env['GMAIL_USER']}>`;

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      html,
      replyTo: replyTo ?? process.env['GMAIL_USER'],
    });

    logger.info('[PlatformEmail] Email sent', { to, subject });
  } catch (err) {
    logger.error('[PlatformEmail] Failed to send email', {
      to,
      subject,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
