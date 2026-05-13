/**
 * Send legacy migration campaign directly through Gmail SMTP.
 *
 * Default mode is dry-run. Use --commit to actually send.
 *
 * Usage examples:
 *   node backend/scripts/email/send-legacy-users-gmail.mjs
 *   node backend/scripts/email/send-legacy-users-gmail.mjs --commit --limit=50
 *   node backend/scripts/email/send-legacy-users-gmail.mjs --commit --resume
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENV_PATH = resolve(__dirname, '../../.env');
const CSV_PATH = resolve(__dirname, '../../logs/nxt1-legacy-users.csv');
const TEMPLATE_PATH = resolve(
  __dirname,
  '../../src/services/marketing/email/templates/legacy-subscription-migration.html'
);
const LOGS_DIR = resolve(__dirname, '../../logs');
const PROGRESS_PATH = resolve(LOGS_DIR, 'legacy-gmail-send-progress.json');
const FAILURES_PATH = resolve(LOGS_DIR, 'legacy-gmail-send-failures.json');

const DEFAULT_SUBJECT = 'Your NXT1 billing upgrade is complete - your account credit is ready';
const DEFAULT_PER_MINUTE = 24;

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const shouldResume = args.includes('--resume');
const limitArg = args.find((a) => a.startsWith('--limit='));
const offsetArg = args.find((a) => a.startsWith('--offset='));
const perMinuteArg = args.find((a) => a.startsWith('--per-minute='));
const testEmailsArg = args.find((a) => a.startsWith('--test-emails='));
const subjectArg = args.find((a) => a.startsWith('--subject='));

const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0;
const perMinute = perMinuteArg ? Number(perMinuteArg.split('=')[1]) : DEFAULT_PER_MINUTE;
const delayMs = Math.ceil(60000 / Math.max(1, perMinute));
const subject = subjectArg ? subjectArg.split('=').slice(1).join('=').trim() : DEFAULT_SUBJECT;

function loadEnv() {
  const envRaw = readFileSync(ENV_PATH, 'utf8');
  for (const line of envRaw.split('\n')) {
    const match = line.match(/^([A-Z_0-9]+)='?(.+?)'?$/);
    if (!match) continue;
    process.env[match[1]] = match[2].replace(/\\n/g, '\n');
  }
}

function normalizeEnv(value) {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function toBool(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getBaseUrl() {
  const env = normalizeEnv(process.env['NODE_ENV']) || 'production';
  if (env === 'staging') {
    return normalizeEnv(process.env['STAGING_APP_URL']) || 'https://nxt-1-staging-v2.web.app';
  }
  return 'https://nxt1sports.com';
}

function parseCsvRecipients() {
  const csvRaw = readFileSync(CSV_PATH, 'utf8');
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  const dedup = new Map();

  for (const row of rows) {
    const email = String(row['email'] || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) continue;

    if (!dedup.has(email)) {
      dedup.set(email, {
        uid: String(row['uid'] || '').trim(),
        email,
        firstName: String(row['firstName'] || '').trim(),
        displayName: String(row['displayName'] || '').trim(),
        role: String(row['role'] || '').trim(),
      });
    }
  }

  return Array.from(dedup.values());
}

function renderTemplate(templateHtml, recipient) {
  const baseUrl = getBaseUrl();
  const firstName = recipient.firstName || recipient.displayName || 'NXT1 Member';
  const walletUrl = `${baseUrl}/usage`;
  const helpCenterUrl = `${baseUrl}/help-center`;

  return templateHtml
    .replaceAll('{{firstName}}', escapeHtml(firstName))
    .replaceAll('{{walletUrl}}', walletUrl)
    .replaceAll('{{helpCenterUrl}}', helpCenterUrl);
}

function loadProgress() {
  if (!existsSync(PROGRESS_PATH)) {
    return { sentEmails: [], updatedAt: null };
  }

  try {
    const parsed = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
    return {
      sentEmails: Array.isArray(parsed.sentEmails) ? parsed.sentEmails : [],
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { sentEmails: [], updatedAt: null };
  }
}

function persistProgress(sentEmails) {
  writeFileSync(
    PROGRESS_PATH,
    JSON.stringify(
      {
        sentEmails,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

async function main() {
  loadEnv();
  mkdirSync(LOGS_DIR, { recursive: true });

  const user = normalizeEnv(process.env['GMAIL_USER'] || process.env['SMTP_USER']);
  const pass = normalizeEnv(
    (process.env['GMAIL_APP_PASSWORD'] || process.env['SMTP_PASS'] || '').replace(/\s+/g, '')
  );

  if (!user || !pass) {
    throw new Error('Missing SMTP credentials. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
  }

  const testEmails = testEmailsArg
    ? testEmailsArg
        .split('=')[1]
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const allRecipients = parseCsvRecipients();
  const progress = loadProgress();
  const sentSet = new Set(progress.sentEmails);

  let recipients = allRecipients;

  if (testEmails.length > 0) {
    const testSet = new Set(testEmails);
    recipients = recipients.filter((r) => testSet.has(r.email));
  }

  if (offset > 0) {
    recipients = recipients.slice(offset);
  }

  if (Number.isFinite(limit) && limit > 0) {
    recipients = recipients.slice(0, limit);
  }

  if (shouldResume) {
    recipients = recipients.filter((r) => !sentSet.has(r.email));
  }

  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  console.log('Legacy Gmail campaign sender');
  console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Total CSV recipients: ${allRecipients.length}`);
  console.log(`Selected recipients: ${recipients.length}`);
  console.log(`Per-minute throttle: ${perMinute}`);
  console.log(`Resume mode: ${shouldResume ? 'ON' : 'OFF'}`);
  console.log(`Progress file: ${PROGRESS_PATH}`);
  console.log(`Failures file: ${FAILURES_PATH}`);
  console.log('');

  if (recipients.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  const failures = [];
  let sentCount = 0;

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];
    const html = renderTemplate(template, recipient);

    if (!shouldCommit) {
      if (index < 5) {
        console.log(`[DRY] ${recipient.email} | ${subject}`);
      }
      continue;
    }

    try {
      await transport.sendMail({
        from: `${normalizeEnv(process.env['PLATFORM_FROM_NAME']) || 'NXT1'} <${
          normalizeEnv(process.env['PLATFORM_FROM_EMAIL']) || user
        }>`,
        to: recipient.email,
        subject,
        html,
        replyTo: normalizeEnv(process.env['SUPPORT_EMAIL']) || user,
      });

      sentCount += 1;
      sentSet.add(recipient.email);

      if (sentCount % 25 === 0) {
        persistProgress(Array.from(sentSet));
      }

      console.log(`Sent ${index + 1}/${recipients.length}: ${recipient.email}`);
    } catch (err) {
      failures.push({
        email: recipient.email,
        uid: recipient.uid,
        error: err instanceof Error ? err.message : String(err),
      });
      console.log(`Failed ${index + 1}/${recipients.length}: ${recipient.email}`);
    }

    if (index < recipients.length - 1) {
      await sleep(delayMs);
    }
  }

  if (shouldCommit) {
    persistProgress(Array.from(sentSet));
    writeFileSync(
      FAILURES_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          failures,
        },
        null,
        2
      ),
      'utf8'
    );
  }

  console.log('');
  if (shouldCommit) {
    console.log(`Done. Sent: ${sentCount}, Failed: ${failures.length}`);
  } else {
    console.log(`Dry-run done. Would send: ${recipients.length}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
