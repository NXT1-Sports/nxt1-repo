import 'dotenv/config';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendB2BPartnerBrandAwarenessEmail } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';

type B2BSequenceStep = 'initial' | 'follow_up';

const MAX_AUTOMATED_TOUCHES = 3;

interface NotionLeadRecord {
  readonly notionPageId?: string | null;
  readonly organization: string;
  readonly primaryContact?: string | null;
  readonly email: string;
  readonly stage?: string | null;
  readonly type?: string | null;
  readonly nextFollowUp?: string | null;
  readonly timesContacted?: number | null;
}

interface SendSuccess extends NotionLeadRecord {
  readonly provider: string;
  readonly subject: string;
  readonly campaignKey: string;
  readonly providerMessageId: string | null;
  readonly notionUpdated: boolean;
}

interface SendFailure extends NotionLeadRecord {
  readonly error: string;
}

interface NotionSyncFailure extends NotionLeadRecord {
  readonly error: string;
}

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const inputArg = args.find((arg) => arg.startsWith('--input='));
const reportArg = args.find((arg) => arg.startsWith('--report='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const testEmailArg = args.find((arg) => arg.startsWith('--test-email='));
const sequenceStepArg = args.find((arg) => arg.startsWith('--sequence-step='));
const allowStageMismatch = args.includes('--allow-stage-mismatch');
const followUpDaysArg = args.find((arg) => arg.startsWith('--follow-up-days='));
const skipNotionSync = args.includes('--skip-notion-sync');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const notionToken = (process.env['NOTION_API_TOKEN'] ?? '').trim();
const notionApiBaseUrl = (process.env['NOTION_API_BASE_URL'] ?? 'https://api.notion.com/v1').trim();
const notionApiVersion = (process.env['NOTION_API_VERSION'] ?? '2022-06-28').trim();

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

function parseSequenceStep(value: string | undefined): B2BSequenceStep {
  const normalized = (value ?? '').trim().toLowerCase();

  if (normalized === 'follow_up' || normalized === 'follow-up') {
    return 'follow_up';
  }

  return 'initial';
}

function normalizeStage(stage: string | null | undefined): string {
  return (stage ?? '').trim().toLowerCase();
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveFollowUpDays(value: string | undefined): number {
  const parsed = parsePositiveInteger(value);
  return parsed ?? 2;
}

function isStageAllowedForStep(stage: string | null | undefined, step: B2BSequenceStep): boolean {
  const normalized = normalizeStage(stage);
  if (step === 'follow_up') {
    return normalized === 'contacted';
  }

  return normalized === 'lead';
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
  const timesContactedRaw = candidate.timesContacted;
  const timesContacted =
    typeof timesContactedRaw === 'number' && Number.isFinite(timesContactedRaw)
      ? timesContactedRaw
      : null;

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
    timesContacted,
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

async function notionRequest<T>(path: string, method: 'GET' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch(`${notionApiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': notionApiVersion,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Notion request failed (${response.status}): ${details.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function readCurrentTimesContacted(lead: NotionLeadRecord): Promise<number> {
  if (!lead.notionPageId) {
    return lead.timesContacted ?? 0;
  }

  const page = await notionRequest<{
    properties?: { 'Times Contacted'?: { number?: number | null } };
  }>(`/pages/${lead.notionPageId}`, 'GET');

  const current = page.properties?.['Times Contacted']?.number;
  return typeof current === 'number' && Number.isFinite(current) ? current : 0;
}

async function syncNotionAfterSend(
  lead: NotionLeadRecord,
  sequenceStep: B2BSequenceStep,
  followUpDays: number
): Promise<void> {
  if (!lead.notionPageId) {
    throw new Error('Missing notionPageId on lead record.');
  }

  const currentTimesContacted = await readCurrentTimesContacted(lead);
  const nextTimesContacted = currentTimesContacted + 1;
  const reachedAutomationLimit = nextTimesContacted >= MAX_AUTOMATED_TOUCHES;
  const today = new Date();
  const lastContactedAt = today.toISOString().slice(0, 10);
  const nextFollowUp = reachedAutomationLimit
    ? null
    : new Date(today.getTime() + followUpDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextStage = reachedAutomationLimit ? 'Phone Call Due' : 'Contacted';
  const nextActionText = reachedAutomationLimit
    ? 'Automated follow-ups complete. Phone call due.'
    : sequenceStep === 'follow_up'
      ? 'Monitor reply, then decide on final touchpoint.'
      : 'Wait for reply, then run follow-up sequence if needed.';

  await notionRequest(`/pages/${lead.notionPageId}`, 'PATCH', {
    properties: {
      Stage: { status: { name: nextStage } },
      'Times Contacted': { number: nextTimesContacted },
      'Last Contacted At': { date: { start: lastContactedAt } },
      'Next Follow-Up': { date: nextFollowUp ? { start: nextFollowUp } : null },
      'Next Action': {
        rich_text: [
          {
            type: 'text',
            text: {
              content: nextActionText,
            },
          },
        ],
      },
    },
  });
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
  const sequenceStep = parseSequenceStep(sequenceStepArg?.split('=').slice(1).join('='));
  const followUpDays = resolveFollowUpDays(followUpDaysArg?.split('=').slice(1).join('='));
  const notionSyncEnabled = !skipNotionSync;

  let leads = loadLeads(inputPath);

  if (onlyEmails) {
    leads = leads.filter((lead) => onlyEmails.has(lead.email));
  }

  const skippedStageMismatch = allowStageMismatch
    ? []
    : leads.filter((lead) => !isStageAllowedForStep(lead.stage, sequenceStep));

  if (!allowStageMismatch) {
    leads = leads.filter((lead) => isStageAllowedForStep(lead.stage, sequenceStep));
  }

  console.log('B2B Notion leads sender');
  console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Sequence step: ${sequenceStep}`);
  console.log(`Stage guardrail: ${allowStageMismatch ? 'DISABLED' : 'ENABLED'}`);
  console.log(`Notion sync: ${notionSyncEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Next follow-up offset (days): ${followUpDays}`);
  console.log(`Input: ${inputPath}`);
  console.log(`Selected leads: ${leads.length}`);
  console.log(`Skipped stage mismatch: ${skippedStageMismatch.length}`);
  console.log(`Report: ${reportPath}`);

  if (testEmail) {
    console.log(`Test recipient override: ${testEmail}`);
  }

  if (leads.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  if (shouldCommit && notionSyncEnabled && !notionToken) {
    throw new Error(
      'NOTION_API_TOKEN is required for Notion sync. Use --skip-notion-sync to bypass.'
    );
  }

  if (!shouldCommit) {
    if (skippedStageMismatch.length > 0) {
      for (const lead of skippedStageMismatch) {
        console.log(`[SKIP] ${lead.email} | ${lead.organization} | stage=${lead.stage ?? 'n/a'}`);
      }
    }

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
  const notionSyncFailures: NotionSyncFailure[] = [];

  for (const lead of leads) {
    try {
      const result = await sendB2BPartnerBrandAwarenessEmail({
        email: testEmail ?? lead.email,
        firstName: lead.primaryContact,
        organization: lead.organization,
        sequenceStep,
      });

      let notionUpdated = false;
      if (notionSyncEnabled) {
        try {
          await syncNotionAfterSend(lead, sequenceStep, followUpDays);
          notionUpdated = true;
        } catch (notionError) {
          const message = notionError instanceof Error ? notionError.message : String(notionError);
          notionSyncFailures.push({
            ...lead,
            error: message,
          });
          console.log(`NOTION_FAILED\t${lead.organization}\t${lead.email}\t${message}`);
        }
      }

      successes.push({
        ...lead,
        provider: result.provider,
        subject: result.subject,
        campaignKey: result.campaignKey,
        providerMessageId: result.providerMessageId ?? null,
        notionUpdated,
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
        notionSyncFailureCount: notionSyncFailures.length,
        skippedCount: skippedStageMismatch.length,
        sequenceStep,
        guardrailEnabled: !allowStageMismatch,
        notionSyncEnabled,
        followUpDays,
        successes,
        failures,
        notionSyncFailures,
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
