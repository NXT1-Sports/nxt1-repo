/**
 * Send B2B partner brand awareness campaign.
 *
 * Default mode is dry-run. Use --commit to actually send.
 *
 * Usage examples:
 *   npm run email:b2b-partner:dry-run
 *   npm run email:b2b-partner:send -- --limit=1
 */

import 'dotenv/config';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';
import {
  buildB2BPartnerBrandAwarenessEmail,
  sendB2BPartnerBrandAwarenessEmail,
} from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';
import {
  createB2BPartnerCampaignState,
  markB2BPartnerCampaignSent,
  mergeB2BPartnerCampaignState,
  selectB2BPartnerCampaignRecipients,
  summarizeB2BPartnerCampaignState,
  type B2BPartnerCampaignState,
  type B2BPartnerCampaignStateEntry,
} from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-state.js';
import type { B2BPartnerOutreachSequenceStep } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const previewArg = args.find((arg) => arg.startsWith('--preview='));
const stepArg = args.find((arg) => arg.startsWith('--step='));
const testEmailArg = args.find((arg) => arg.startsWith('--test-email='));
const reportArg = args.find((arg) => arg.startsWith('--report='));

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReportPath = resolve(
  scriptDir,
  '../../reports/marketing/b2b-partner-program-invite-state.json'
);

function parseSequenceStep(value: string | undefined): B2BPartnerOutreachSequenceStep {
  if (!value) {
    return 'initial';
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'follow-up' || normalized === 'follow_up' ? 'follow_up' : 'initial';
}

const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const sequenceStep = parseSequenceStep(stepArg?.split('=').slice(1).join('='));
const onlyEmails = onlyArg
  ? new Set(
      onlyArg
        .split('=')
        .slice(1)
        .join('=')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  : null;
const testEmail = testEmailArg?.split('=').slice(1).join('=').trim().toLowerCase() || null;
const previewPath = previewArg
  ? resolve(process.cwd(), previewArg.split('=').slice(1).join('='))
  : null;
const reportPath = reportArg
  ? resolve(process.cwd(), reportArg.split('=').slice(1).join('='))
  : defaultReportPath;

function loadCampaignState(now: Date): B2BPartnerCampaignState {
  if (!existsSync(reportPath)) {
    return createB2BPartnerCampaignState(B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS, now);
  }

  const raw = readFileSync(reportPath, 'utf8');
  const parsed = JSON.parse(raw) as B2BPartnerCampaignState;
  return mergeB2BPartnerCampaignState(parsed, B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS, now);
}

function persistCampaignState(state: B2BPartnerCampaignState): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(state, null, 2), 'utf8');
}

function updateCampaignState(
  state: B2BPartnerCampaignState,
  recipient: B2BPartnerCampaignStateEntry,
  nextRecipient: B2BPartnerCampaignStateEntry,
  now: Date
): B2BPartnerCampaignState {
  return {
    ...state,
    updatedAt: now.toISOString(),
    recipients: state.recipients.map((entry) =>
      entry.email === recipient.email ? nextRecipient : entry
    ),
  };
}

async function main(): Promise<void> {
  const now = new Date();
  let state = loadCampaignState(now);
  let recipients = selectB2BPartnerCampaignRecipients(state, sequenceStep, now);

  if (onlyEmails) {
    recipients = recipients.filter((recipient) => onlyEmails.has(recipient.email));
  }

  if (Number.isFinite(limit) && limit && limit > 0) {
    recipients = recipients.slice(0, limit);
  }

  const preview = buildB2BPartnerBrandAwarenessEmail({
    firstName: recipients[0]?.primaryContact,
    organization: recipients[0]?.organization,
    sequenceStep,
  });
  const summary = summarizeB2BPartnerCampaignState(state, now);

  console.log('B2B partner brand awareness sender');
  console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Campaign: ${preview.campaignKey}`);
  console.log(`Sequence step: ${sequenceStep}`);
  console.log(`Subject: ${preview.subject}`);
  console.log(`Roster total: ${summary.total}`);
  console.log(
    `Counters: not_sent=${summary.notSent}, sent=${summary.sent}, follow_up_due=${summary.followUpDue}, follow_up_sent=${summary.followUpSent}, replied=${summary.replied}, paused=${summary.paused}`
  );
  console.log(`Queues: initial=${summary.initialQueue}, follow_up=${summary.followUpQueue}`);
  console.log(`Selected recipients: ${recipients.length}`);
  console.log(`State file: ${reportPath}`);

  if (testEmail) {
    console.log(`Test recipient override: ${testEmail}`);
  }

  if (previewPath) {
    writeFileSync(previewPath, preview.html, 'utf8');
    console.log(`Preview written: ${previewPath}`);
  }

  if (recipients.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  if (!shouldCommit) {
    for (const recipient of recipients) {
      console.log(
        `[DRY] ${recipient.email} | ${recipient.organization} | sends=${recipient.sendCount} | status=${recipient.deliveryStatus} | next=${recipient.nextFollowUpAt ?? 'n/a'}`
      );
    }
    console.log('Dry-run done. Add --commit to send.');
    return;
  }

  persistCampaignState(state);

  let sentCount = 0;

  if (testEmail) {
    const seedRecipient = recipients[0] ?? state.recipients[0];

    if (!seedRecipient) {
      throw new Error('No recipients available to build test email payload.');
    }

    const result = await sendB2BPartnerBrandAwarenessEmail({
      email: testEmail,
      firstName: seedRecipient.primaryContact,
      organization: seedRecipient.organization,
      sequenceStep,
    });

    console.log(
      `Sent test email to ${testEmail} using ${seedRecipient.organization} personalization via ${result.provider}`
    );
    return;
  }

  for (const recipient of recipients) {
    const result = await sendB2BPartnerBrandAwarenessEmail({
      email: recipient.email,
      firstName: recipient.primaryContact,
      organization: recipient.organization,
      sequenceStep,
    });

    const nextRecipient = markB2BPartnerCampaignSent(
      recipient,
      {
        sequenceStep: result.sequenceStep,
        sentAt: now.toISOString(),
        campaignKey: result.campaignKey,
        subject: result.subject,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      },
      now
    );

    state = updateCampaignState(state, recipient, nextRecipient, now);
    sentCount += 1;
    console.log(
      `Sent ${sentCount}/${recipients.length}: ${recipient.email} | ${recipient.organization}`
    );
  }

  persistCampaignState(state);

  console.log(`Done. Sent: ${sentCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
