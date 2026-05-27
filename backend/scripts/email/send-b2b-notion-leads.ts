import 'dotenv/config';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendB2BPartnerBrandAwarenessEmail } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';

interface NotionLeadRecord {
  readonly notionPageId?: string | null;
  readonly organization: string;
  readonly primaryContact?: string | null;
  readonly email: string;
  readonly stage?: string | null;
  readonly type?: string | null;
  readonly nextFollowUp?: string | null;
}

interface SendSuccess extends NotionLeadRecord {
  readonly provider: string;
  readonly subject: string;
  readonly campaignKey: string;
  readonly providerMessageId: string | null;
}

interface SendFailure extends NotionLeadRecord {
  readonly error: string;
}

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const inputArg = args.find((arg) => arg.startsWith('--input='));
const reportArg = args.find((arg) => arg.startsWith('--report='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const testEmailArg = args.find((arg) => arg.startsWith('--test-email='));

const scriptDir = dirname(fileURLToPath(import.meta.url));

function getRequiredArg(arg: string | undefined, flagName: string): string {
  const value = arg?.split('=').slice(1).join('=').trim();
  if (!value) {
    throw new Error(`Missing required ${flagName} argument.`);
  }

  return value;
}

function getDateStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function getDefaultReportPath(now: Date): string {
  return resolve(
    scriptDir,
    `../../reports/marketing/notion-leads-send-results-${getDateStamp(now)}.json`
  );
}

function normalizeLeadRecord(value: unknown, index: number): NotionLeadRecord {
  if (!value || typeof value !== 'object') {
    throw new Error(`Lead at index ${index} is not an object.`);
  }

  const candidate = value as Record<string, unknown>;
  const organization = String(candidate.organization ?? '').trim();
  const email = String(candidate.email ?? '')
    .trim()
    .toLowerCase();
  const primaryContact = String(candidate.primaryContact ?? '').trim();
  const notionPageId = String(candidate.notionPageId ?? '').trim();
  const stage = String(candidate.stage ?? '').trim();
  const type = String(candidate.type ?? '').trim();
  const nextFollowUp = String(candidate.nextFollowUp ?? '').trim();

  if (!organization) {
    throw new Error(`Lead at index ${index} is missing organization.`);
  }

  if (!email) {
    throw new Error(`Lead at index ${index} is missing email.`);
  }

  return {
    notionPageId: notionPageId || null,
    organization,
    primaryContact: primaryContact || null,
    email,
    stage: stage || null,
    type: type || null,
    nextFollowUp: nextFollowUp || null,
  };
}

function loadLeads(inputPath: string): NotionLeadRecord[] {
  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;

  if (Array.isArray(raw)) {
    return raw.map(normalizeLeadRecord);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Input JSON must be an array of leads or an object containing one.');
  }

  const candidate = raw as Record<string, unknown>;
  const nestedList = candidate.leads ?? candidate.records ?? candidate.successes;

  if (!Array.isArray(nestedList)) {
    throw new Error(
      'Input JSON must be an array or an object with `leads`, `records`, or `successes`.'
    );
  }

  return nestedList.map(normalizeLeadRecord);
}

async function main(): Promise<void> {
  const now = new Date();
  const inputPath = resolve(process.cwd(), getRequiredArg(inputArg, '--input'));
  const reportPath = reportArg
    ? resolve(process.cwd(), getRequiredArg(reportArg, '--report'))
    : getDefaultReportPath(now);
  const onlyEmails = onlyArg
    ? new Set(
        getRequiredArg(onlyArg, '--only')
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      )
    : null;
  const testEmail = testEmailArg
    ? getRequiredArg(testEmailArg, '--test-email').trim().toLowerCase()
    : null;

  let leads = loadLeads(inputPath);

  if (onlyEmails) {
    leads = leads.filter((lead) => onlyEmails.has(lead.email));
  }

  console.log('B2B Notion leads sender');
  console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Input: ${inputPath}`);
  console.log(`Selected leads: ${leads.length}`);
  console.log(`Report: ${reportPath}`);

  if (testEmail) {
    console.log(`Test recipient override: ${testEmail}`);
  }

  if (leads.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  if (!shouldCommit) {
    for (const lead of leads) {
      console.log(
        `[DRY] ${lead.email} | ${lead.organization} | page=${lead.notionPageId ?? 'n/a'} | stage=${lead.stage ?? 'n/a'}`
      );
    }
    console.log('Dry-run done. Add --commit to send.');
    return;
  }

  const successes: SendSuccess[] = [];
  const failures: SendFailure[] = [];

  for (const lead of leads) {
    try {
      const result = await sendB2BPartnerBrandAwarenessEmail({
        email: testEmail ?? lead.email,
        firstName: lead.primaryContact,
        organization: lead.organization,
        sequenceStep: 'initial',
      });

      successes.push({
        ...lead,
        provider: result.provider,
        subject: result.subject,
        campaignKey: result.campaignKey,
        providerMessageId: result.providerMessageId ?? null,
      });
      console.log(`SENT\t${lead.organization}\t${testEmail ?? lead.email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        ...lead,
        error: message,
      });
      console.log(`FAILED\t${lead.organization}\t${testEmail ?? lead.email}\t${message}`);
    }
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        sentCount: successes.length,
        failureCount: failures.length,
        successes,
        failures,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`RESULTS\t${successes.length}\t${failures.length}\t${reportPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
