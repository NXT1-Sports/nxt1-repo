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
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { db as defaultDb } from '../../utils/firebase.js';
import {
  buildTrackedEmailHtmlWithRecipientHash,
  hashRecipientEmail,
} from './connected-mail.service.js';

const PLATFORM_FROM_EMAIL = process.env['PLATFORM_FROM_EMAIL']?.trim() || 'nxt1@nxt1sports.com';
const PLATFORM_FROM_NAME = process.env['PLATFORM_FROM_NAME']?.trim() || 'NXT1';

// ─── Transport singleton ──────────────────────────────────────────────────

let _transport: Transporter | null = null;
let _transportAuthKey: string | null = null;

function normalizeEnvCredential(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Allow quoted env secrets in .env files while preserving inner content.
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function getTransport(): Transporter | null {
  const user = normalizeEnvCredential(process.env['GMAIL_USER'] ?? process.env['SMTP_USER']);
  // Gmail app passwords are often copied with spaces in 4-char groups.
  const pass = normalizeEnvCredential(
    process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS']
  )?.replace(/\s+/g, '');

  if (!user || !pass) {
    return null;
  }

  const authKey = `${user}:${pass}`;
  if (!_transport || _transportAuthKey !== authKey) {
    _transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    _transportAuthKey = authKey;
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
    logger.warn(
      '[PlatformEmail] Missing SMTP credentials (expected GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS) — skipping send',
      {
        to,
        subject,
      }
    );
    return;
  }

  const from = `${PLATFORM_FROM_NAME} <${PLATFORM_FROM_EMAIL}>`;

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      html,
      replyTo: replyTo ?? PLATFORM_FROM_EMAIL,
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

/** Resolve the best reply-to email for a user from Firestore user profile. */
export async function resolveUserReplyToEmail(
  userId: string,
  db: Firestore = defaultDb
): Promise<string | null> {
  const userDoc = await db.collection('Users').doc(userId).get();
  const email = userDoc.data()?.['email'];
  if (typeof email !== 'string') return null;
  const normalized = email.trim();
  if (!normalized || !normalized.includes('@')) return null;
  return normalized;
}

/**
 * Send an email from the NXT1 platform address on behalf of a specific user.
 *
 * - From: NXT1 <nxt1@nxt1sports.com>
 * - Reply-To: user's email (so recipients reply directly to the user)
 * - Tracking attribution: subjectId is the userId
 */
export async function sendPlatformEmailOnBehalfOf(
  userId: string,
  userReplyToEmail: string,
  to: string,
  subject: string,
  html: string,
  options?: {
    recipientName?: string;
    recipientKind?: string;
    recipientOrgName?: string;
  }
): Promise<{ trackingId: string }> {
  const transport = getTransport();
  if (!transport) {
    throw new Error('Platform email service is not configured.');
  }

  const trackingId = randomUUID();
  const trackedHtml = buildTrackedEmailHtmlWithRecipientHash(html, {
    userId,
    trackingId,
    recipientEmailHash: hashRecipientEmail(to),
    recipientName: options?.recipientName || to, // Fallback to email address
    recipientKind: options?.recipientKind,
    recipientOrgName: options?.recipientOrgName,
  });

  const from = `${PLATFORM_FROM_NAME} <${PLATFORM_FROM_EMAIL}>`;

  await transport.sendMail({
    from,
    to,
    subject,
    html: trackedHtml,
    replyTo: userReplyToEmail,
  });

  logger.info('[PlatformEmail] On-behalf email sent', {
    userId,
    to,
    subject,
    trackingId,
  });

  return { trackingId };
}
