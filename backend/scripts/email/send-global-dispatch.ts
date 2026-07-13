import 'dotenv/config';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserRole } from '@nxt1/core';
import { parse } from 'csv-parse/sync';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { getRuntimeEnvironment } from '../../src/config/runtime-environment.js';
import { sendMonthlyCampaign02Email } from '../../src/services/marketing/email/campaigns/monthly/monthly-campaign-02-email.service.js';
import { sendOutboundMarketingEmail } from '../../src/services/marketing/email/outbound-email.service.js';

/**
 * Global dispatcher sender.
 *
 * Examples:
 * - Dry run monthly campaign 02 to one recipient:
 *   npm run email:global-dispatch -- --mode=monthly_campaign_02 --to=john@nxt1sports.com
 *
 * - Commit send monthly campaign 02 to full CSV with resume:
 *   npm run email:global-dispatch:send -- --mode=monthly_campaign_02 --resume
 *
 * - Commit custom campaign from HTML file:
 *   npm run email:global-dispatch:send -- --mode=custom --campaign-key=launch_2026_07 --subject="NXT1 Update" --html-file=./scripts/email/templates/launch.html --to=john@nxt1sports.com
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, '../../logs');
const DEFAULT_CSV_PATH = resolve(LOGS_DIR, 'nxt1-legacy-users.csv');
const DEFAULT_PER_MINUTE = 60;

type ProviderKey = 'platform_smtp' | 'brevo';
type DispatchMode = 'custom' | 'monthly_campaign_02';

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
  readonly mode: DispatchMode;
  readonly csvPath: string;
  readonly directEmails: readonly string[];
  readonly testEmails: readonly string[];
  readonly limit?: number;
  readonly offset: number;
  readonly perMinute: number;
  readonly progressKey: string;

  readonly campaignKey?: string;
  readonly subject?: string;
  readonly htmlFile?: string;
  readonly replyTo: string;

  readonly defaultFirstName: string;
  readonly defaultRole: UserRole;
  readonly defaultPrimarySport?: string;
  readonly defaultOrganizationName?: string;
}

interface PersistedProgress {
  readonly sentEmails: readonly string[];
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

function parseDispatchMode(value: string | undefined): DispatchMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'custom') return 'custom';
  if (normalized === 'monthly_campaign_02') return 'monthly_campaign_02';

  throw new Error('Unsupported --mode value. Supported: custom, monthly_campaign_02');
}

function parseRole(role: string | undefined): UserRole {
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

function parseCsvList(value: string | undefined): readonly string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseArgs(argv: readonly string[]): ScriptOptions {
  const commit = argv.includes('--commit');
  const resume = argv.includes('--resume');

  const modeArg = argv.find((arg) => arg.startsWith('--mode='));
  const csvArg = argv.find((arg) => arg.startsWith('--csv='));
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  const testEmailsArg = argv.find((arg) => arg.startsWith('--test-emails='));
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const offsetArg = argv.find((arg) => arg.startsWith('--offset='));
  const perMinuteArg = argv.find((arg) => arg.startsWith('--per-minute='));
  const progressKeyArg = argv.find((arg) => arg.startsWith('--progress-key='));

  const campaignKeyArg = argv.find((arg) => arg.startsWith('--campaign-key='));
  const subjectArg = argv.find((arg) => arg.startsWith('--subject='));
  const htmlFileArg = argv.find((arg) => arg.startsWith('--html-file='));
  const replyToArg = argv.find((arg) => arg.startsWith('--reply-to='));

  const defaultFirstNameArg = argv.find((arg) => arg.startsWith('--default-first-name='));
  const defaultRoleArg = argv.find((arg) => arg.startsWith('--default-role='));
  const defaultSportArg = argv.find((arg) => arg.startsWith('--default-sport='));
  const defaultOrgArg = argv.find((arg) => arg.startsWith('--default-organization='));

  const mode = parseDispatchMode(modeArg?.split('=').slice(1).join('='));
  const csvPath = csvArg?.split('=').slice(1).join('=').trim() || DEFAULT_CSV_PATH;
  const directEmails = parseCsvList(toArg?.split('=').slice(1).join('='));
  const testEmails = parseCsvList(testEmailsArg?.split('=').slice(1).join('='));
  const limit = parsePositiveInt(limitArg?.split('=').slice(1).join('='));
  const offset = parsePositiveInt(offsetArg?.split('=').slice(1).join('=')) ?? 0;
  const perMinute =
    parsePositiveInt(perMinuteArg?.split('=').slice(1).join('=')) ?? DEFAULT_PER_MINUTE;

  const campaignKey = campaignKeyArg?.split('=').slice(1).join('=').trim() || undefined;
  const progressKey =
    progressKeyArg?.split('=').slice(1).join('=').trim() ||
    (mode === 'custom' ? campaignKey || 'custom-campaign' : mode);

  return {
    commit,
    resume,
    mode,
    csvPath,
    directEmails,
    testEmails,
    limit,
    offset,
    perMinute,
    progressKey,
    campaignKey,
    subject: subjectArg?.split('=').slice(1).join('=').trim() || undefined,
    htmlFile: htmlFileArg?.split('=').slice(1).join('=').trim() || undefined,
    replyTo: replyToArg?.split('=').slice(1).join('=').trim() || 'support@nxt1sports.com',
    defaultFirstName: defaultFirstNameArg?.split('=').slice(1).join('=').trim() || 'NXT1 Member',
    defaultRole: parseRole(defaultRoleArg?.split('=').slice(1).join('=')),
    defaultPrimarySport: defaultSportArg?.split('=').slice(1).join('=').trim() || undefined,
    defaultOrganizationName: defaultOrgArg?.split('=').slice(1).join('=').trim() || undefined,
  };
}

function resolveProviderKey(): ProviderKey {
  const configured = normalizeEnv(process.env['MARKETING_EMAIL_PROVIDER']).toLowerCase();
  if (
    !configured ||
    configured === 'platform_smtp' ||
    configured === 'platform' ||
    configured === 'smtp'
  ) {
    return 'platform_smtp';
  }
  if (configured === 'brevo') {
    return 'brevo';
  }

  throw new Error(
    `Unsupported MARKETING_EMAIL_PROVIDER: ${configured}. Supported values: platform_smtp, brevo.`
  );
}

function ensureProviderCredentials(provider: ProviderKey): void {
  if (provider === 'brevo') {
    const apiKey = normalizeEnv(process.env['BREVO_API_KEY']);
    if (!apiKey) {
      throw new Error('Missing BREVO_API_KEY for brevo provider.');
    }
    return;
  }

  const user = normalizeEnv(process.env['GMAIL_USER'] ?? process.env['SMTP_USER']);
  const pass = normalizeEnv(process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS']);
  if (!user || !pass) {
    throw new Error(
      'Missing SMTP credentials. Expected GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS.'
    );
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const cleaned = (value ?? '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseCsvRecipients(csvPath: string): readonly CsvRecipient[] {
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = readFileSync(csvPath, 'utf8');
  const rows = parse(raw, {
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
      primarySport: normalizeOptional(row['sport'] ?? row['primarySport']),
      organizationName: normalizeOptional(row['organizationName']),
    });
  }

  return Array.from(dedup.values());
}

function buildRecipients(options: ScriptOptions): readonly SendRecipient[] {
  const allFromCsv = parseCsvRecipients(options.csvPath);

  const csvSelected =
    options.directEmails.length > 0
      ? allFromCsv.filter((entry) => options.directEmails.includes(entry.email))
      : allFromCsv;

  const fromCsv = csvSelected.map((entry) => ({
    uid: entry.uid || undefined,
    email: entry.email,
    firstName: entry.firstName || entry.displayName || options.defaultFirstName,
    role: parseRole(entry.role ?? options.defaultRole),
    primarySport: entry.primarySport ?? options.defaultPrimarySport,
    organizationName: entry.organizationName ?? options.defaultOrganizationName,
  }));

  const csvEmailSet = new Set(fromCsv.map((entry) => entry.email));
  const directOnly = options.directEmails
    .filter((email) => !csvEmailSet.has(email))
    .map((email) => ({
      email,
      firstName: options.defaultFirstName,
      role: options.defaultRole,
      primarySport: options.defaultPrimarySport,
      organizationName: options.defaultOrganizationName,
    }));

  let selected = [...fromCsv, ...directOnly];

  if (options.testEmails.length > 0) {
    const testSet = new Set(options.testEmails);
    selected = selected.filter((entry) => testSet.has(entry.email));
  }

  if (options.offset > 0) {
    selected = selected.slice(options.offset);
  }

  if (typeof options.limit === 'number') {
    selected = selected.slice(0, options.limit);
  }

  return selected;
}

function readProgress(path: string): PersistedProgress {
  if (!existsSync(path)) {
    return { sentEmails: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { sentEmails?: unknown };
    return {
      sentEmails: Array.isArray(parsed.sentEmails)
        ? parsed.sentEmails.filter((value): value is string => typeof value === 'string')
        : [],
    };
  } catch {
    return { sentEmails: [] };
  }
}

function writeProgress(path: string, sentEmails: readonly string[]): void {
  mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(
    path,
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

function writeFailures(
  path: string,
  failures: readonly Array<{ email: string; uid?: string; role: UserRole; error: string }>
): void {
  mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(
    path,
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

function renderTemplate(template: string, recipient: SendRecipient): string {
  return template
    .replaceAll('{{firstName}}', recipient.firstName)
    .replaceAll('{{email}}', recipient.email)
    .replaceAll('{{role}}', recipient.role)
    .replaceAll('{{primarySport}}', recipient.primarySport ?? '')
    .replaceAll('{{organizationName}}', recipient.organizationName ?? '');
}

function requireCustomFields(options: ScriptOptions): {
  readonly campaignKey: string;
  readonly subject: string;
  readonly htmlTemplate: string;
} {
  if (options.mode !== 'custom') {
    throw new Error('Internal error: requireCustomFields called in non-custom mode.');
  }

  if (!options.campaignKey) {
    throw new Error('Missing required --campaign-key for --mode=custom');
  }
  if (!options.subject) {
    throw new Error('Missing required --subject for --mode=custom');
  }
  if (!options.htmlFile) {
    throw new Error('Missing required --html-file for --mode=custom');
  }

  const templatePath = resolve(process.cwd(), options.htmlFile);
  if (!existsSync(templatePath)) {
    throw new Error(`HTML file not found: ${templatePath}`);
  }

  return {
    campaignKey: options.campaignKey,
    subject: options.subject,
    htmlTemplate: readFileSync(templatePath, 'utf8'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const environment = getRuntimeEnvironment();
  const provider = resolveProviderKey();
  const perMinuteDelayMs = Math.ceil(60000 / Math.max(1, options.perMinute));

  const progressPath = resolve(LOGS_DIR, `${options.progressKey}-progress.json`);
  const failuresPath = resolve(LOGS_DIR, `${options.progressKey}-failures.json`);

  const existingProgress = readProgress(progressPath);
  const sentSet = new Set(existingProgress.sentEmails);

  let recipients = buildRecipients(options);
  if (options.resume) {
    recipients = recipients.filter((entry) => !sentSet.has(entry.email));
  }

  const customPayload = options.mode === 'custom' ? requireCustomFields(options) : null;

  console.log('Global marketing dispatcher sender');
  console.log(`Mode: ${options.commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Dispatch mode: ${options.mode}`);
  console.log(`Runtime: ${environment}`);
  console.log(`Provider: ${provider}`);
  console.log(`CSV path: ${options.csvPath}`);
  console.log(`Selected recipients: ${recipients.length}`);
  console.log(`Role split: ${summarizeRoles(recipients)}`);
  console.log(`Per-minute throttle: ${options.perMinute}`);
  console.log(`Resume mode: ${options.resume ? 'ON' : 'OFF'}`);
  console.log(`Progress file: ${progressPath}`);
  console.log(`Failures file: ${failuresPath}`);
  if (options.mode === 'custom' && customPayload) {
    console.log(`Campaign key: ${customPayload.campaignKey}`);
    console.log(`Subject: ${customPayload.subject}`);
  }
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

  ensureProviderCredentials(provider);
  await connectToMongoDB();

  const failures: Array<{ email: string; uid?: string; role: UserRole; error: string }> = [];
  let sentCount = 0;

  try {
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];

      try {
        if (options.mode === 'monthly_campaign_02') {
          const result = await sendMonthlyCampaign02Email({
            userId: recipient.uid,
            email: recipient.email,
            firstName: recipient.firstName,
            role: recipient.role,
            environment,
            primarySport: recipient.primarySport,
            organizationName: recipient.organizationName,
          });

          console.log(
            `Sent ${index + 1}/${recipients.length}: ${result.email} | campaign=${result.campaignKey}`
          );
        } else if (customPayload) {
          await sendOutboundMarketingEmail({
            to: recipient.email,
            subject: renderTemplate(customPayload.subject, recipient),
            html: renderTemplate(customPayload.htmlTemplate, recipient),
            campaignKey: customPayload.campaignKey,
            userId: recipient.uid,
            replyTo: options.replyTo,
          });

          console.log(
            `Sent ${index + 1}/${recipients.length}: ${recipient.email} | campaign=${customPayload.campaignKey}`
          );
        }

        sentCount += 1;
        sentSet.add(recipient.email);

        if (sentCount % 25 === 0) {
          writeProgress(progressPath, Array.from(sentSet));
        }
      } catch (error) {
        failures.push({
          email: recipient.email,
          uid: recipient.uid,
          role: recipient.role,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`Failed ${index + 1}/${recipients.length}: ${recipient.email}`);
      }

      if (index < recipients.length - 1) {
        await sleep(perMinuteDelayMs);
      }
    }
  } finally {
    await disconnectFromMongoDB().catch(() => undefined);
  }

  writeProgress(progressPath, Array.from(sentSet));
  writeFailures(failuresPath, failures);

  console.log('');
  console.log(`Done. Sent: ${sentCount}, Failed: ${failures.length}`);
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
