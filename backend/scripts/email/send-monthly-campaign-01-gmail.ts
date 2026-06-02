import 'dotenv/config';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserRole } from '@nxt1/core';
import { parse } from 'csv-parse/sync';
import { getRuntimeEnvironment } from '../../src/config/runtime-environment.js';
import { sendMonthlyCampaign01Email } from '../../src/services/marketing/email/campaigns/monthly/monthly-campaign-01-email.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CSV_PATH = resolve(__dirname, '../../logs/nxt1-legacy-users.csv');
const LOGS_DIR = resolve(__dirname, '../../logs');
const PROGRESS_PATH = resolve(LOGS_DIR, 'monthly-campaign-01-send-progress.json');
const FAILURES_PATH = resolve(LOGS_DIR, 'monthly-campaign-01-send-failures.json');
const DEFAULT_PER_MINUTE = 24;

interface CsvRecipient {
  readonly uid: string;
  readonly email: string;
  readonly firstName?: string;
  readonly displayName?: string;
  readonly role?: string;
  readonly primarySport?: string;
  readonly organizationName?: string;
}

interface SendRecipient {
  readonly uid?: string;
  readonly email: string;
  readonly firstName: string;
  readonly role: UserRole;
  readonly primarySport?: string;
  readonly organizationName?: string;
}

interface ScriptOptions {
  readonly commit: boolean;
  readonly resume: boolean;
  readonly limit?: number;
  readonly offset: number;
  readonly perMinute: number;
  readonly csvPath: string;
  readonly testEmails: readonly string[];
}

function normalizeEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function parseArgs(argv: readonly string[]): ScriptOptions {
  const commit = argv.includes('--commit');
  const resume = argv.includes('--resume');

  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const offsetArg = argv.find((arg) => arg.startsWith('--offset='));
  const perMinuteArg = argv.find((arg) => arg.startsWith('--per-minute='));
  const csvPathArg = argv.find((arg) => arg.startsWith('--csv='));
  const testEmailsArg = argv.find((arg) => arg.startsWith('--test-emails='));

  const limit = parsePositiveInt(limitArg?.split('=').slice(1).join('='));
  const offset = parsePositiveInt(offsetArg?.split('=').slice(1).join('=')) ?? 0;
  const perMinute =
    parsePositiveInt(perMinuteArg?.split('=').slice(1).join('=')) ?? DEFAULT_PER_MINUTE;

  const csvPath = csvPathArg?.split('=').slice(1).join('=').trim() || DEFAULT_CSV_PATH;
  const testEmails =
    testEmailsArg
      ?.split('=')
      .slice(1)
      .join('=')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return {
    commit,
    resume,
    limit,
    offset,
    perMinute,
    csvPath,
    testEmails,
  };
}

function hasEmailCredentials(): boolean {
  const user = normalizeEnv(process.env['GMAIL_USER'] ?? process.env['SMTP_USER']);
  const pass = normalizeEnv(process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS']);
  return user.length > 0 && pass.length > 0;
}

function ensureGmailProvider(): void {
  const provider = normalizeEnv(process.env['MARKETING_EMAIL_PROVIDER']);
  if (!provider) return;

  const normalized = provider.toLowerCase();
  if (normalized === 'platform_smtp' || normalized === 'platform' || normalized === 'smtp') {
    return;
  }

  throw new Error(
    `MARKETING_EMAIL_PROVIDER is set to ${provider}. Set it to platform_smtp (or unset it) to send through Gmail SMTP.`
  );
}

function normalizeRole(role: string | undefined): UserRole {
  const cleaned = (role ?? '').trim().toLowerCase();

  if (cleaned === 'director') return 'director';
  if (
    cleaned === 'coach' ||
    cleaned === 'panel' ||
    cleaned === 'scout' ||
    cleaned === 'media' ||
    cleaned === 'service' ||
    cleaned === 'college-coach' ||
    cleaned === 'recruiter'
  ) {
    return 'coach';
  }

  return 'athlete';
}

function normalizeOptional(value: string | undefined): string | undefined {
  const cleaned = (value ?? '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseCsvRecipients(csvPath: string): readonly CsvRecipient[] {
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvRaw = readFileSync(csvPath, 'utf8');
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  const dedup = new Map<string, CsvRecipient>();

  for (const row of rows as Record<string, string>[]) {
    const email = (row['email'] ?? '').trim().toLowerCase();
    if (!email || !email.includes('@') || email.includes(' ')) {
      continue;
    }

    if (dedup.has(email)) {
      continue;
    }

    dedup.set(email, {
      uid: (row['uid'] ?? '').trim(),
      email,
      firstName: normalizeOptional(row['firstName']),
      displayName: normalizeOptional(row['displayName']),
      role: normalizeOptional(row['role']),
      primarySport: normalizeOptional(row['primarySport']),
      organizationName: normalizeOptional(row['organizationName']),
    });
  }

  return Array.from(dedup.values());
}

function toSendRecipient(recipient: CsvRecipient): SendRecipient {
  return {
    uid: recipient.uid || undefined,
    email: recipient.email,
    firstName: recipient.firstName || recipient.displayName || 'NXT1 Member',
    role: normalizeRole(recipient.role),
    primarySport: recipient.primarySport,
    organizationName: recipient.organizationName,
  };
}

function loadProgress(): { readonly sentEmails: readonly string[] } {
  if (!existsSync(PROGRESS_PATH)) {
    return { sentEmails: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as {
      sentEmails?: unknown;
    };

    return {
      sentEmails: Array.isArray(parsed.sentEmails)
        ? parsed.sentEmails.filter((value): value is string => typeof value === 'string')
        : [],
    };
  } catch {
    return { sentEmails: [] };
  }
}

function persistProgress(sentEmails: readonly string[]): void {
  mkdirSync(LOGS_DIR, { recursive: true });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function summarizeRoles(recipients: readonly SendRecipient[]): string {
  let athlete = 0;
  let coach = 0;
  let director = 0;

  for (const recipient of recipients) {
    if (recipient.role === 'director') director += 1;
    else if (recipient.role === 'coach') coach += 1;
    else athlete += 1;
  }

  return `athlete=${athlete}, coach=${coach}, director=${director}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeEnvironment = getRuntimeEnvironment();
  const delayMs = Math.ceil(60000 / Math.max(1, options.perMinute));

  const progress = loadProgress();
  const sentSet = new Set(progress.sentEmails);

  const allCsvRecipients = parseCsvRecipients(options.csvPath);
  let selected = allCsvRecipients;

  if (options.testEmails.length > 0) {
    const testSet = new Set(options.testEmails);
    selected = selected.filter((recipient) => testSet.has(recipient.email));
  }

  if (options.offset > 0) {
    selected = selected.slice(options.offset);
  }

  if (typeof options.limit === 'number') {
    selected = selected.slice(0, options.limit);
  }

  if (options.resume) {
    selected = selected.filter((recipient) => !sentSet.has(recipient.email));
  }

  const recipients = selected.map(toSendRecipient);

  console.log('Monthly campaign 01 Gmail sender');
  console.log(`Mode: ${options.commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Runtime: ${runtimeEnvironment}`);
  console.log(`CSV path: ${options.csvPath}`);
  console.log(`Total CSV recipients: ${allCsvRecipients.length}`);
  console.log(`Selected recipients: ${recipients.length}`);
  console.log(`Role split: ${summarizeRoles(recipients)}`);
  console.log(`Per-minute throttle: ${options.perMinute}`);
  console.log(`Resume mode: ${options.resume ? 'ON' : 'OFF'}`);
  console.log(`Progress file: ${PROGRESS_PATH}`);
  console.log(`Failures file: ${FAILURES_PATH}`);
  console.log('');

  if (recipients.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  if (!options.commit) {
    for (let index = 0; index < Math.min(10, recipients.length); index += 1) {
      const recipient = recipients[index];
      console.log(`[DRY] ${recipient.email} | role=${recipient.role}`);
    }
    console.log(`Dry run complete. Would send: ${recipients.length}`);
    return;
  }

  if (!hasEmailCredentials()) {
    throw new Error(
      'Missing SMTP credentials. Expected GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS.'
    );
  }

  ensureGmailProvider();

  const failures: Array<{ email: string; uid?: string; role: UserRole; error: string }> = [];
  let sentCount = 0;

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];

    try {
      const result = await sendMonthlyCampaign01Email({
        userId: recipient.uid,
        email: recipient.email,
        firstName: recipient.firstName,
        role: recipient.role,
        environment: runtimeEnvironment,
        primarySport: recipient.primarySport,
        organizationName: recipient.organizationName,
      });

      sentCount += 1;
      sentSet.add(recipient.email);

      if (sentCount % 25 === 0) {
        persistProgress(Array.from(sentSet));
      }

      console.log(
        `Sent ${index + 1}/${recipients.length}: ${result.email} | campaign=${result.campaignKey}`
      );
    } catch (err) {
      failures.push({
        email: recipient.email,
        uid: recipient.uid,
        role: recipient.role,
        error: err instanceof Error ? err.message : String(err),
      });
      console.log(`Failed ${index + 1}/${recipients.length}: ${recipient.email}`);
    }

    if (index < recipients.length - 1) {
      await sleep(delayMs);
    }
  }

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

  console.log('');
  console.log(`Done. Sent: ${sentCount}, Failed: ${failures.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
