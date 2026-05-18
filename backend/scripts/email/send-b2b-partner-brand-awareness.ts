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

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS } from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-recipients.js';
import {
  buildB2BPartnerBrandAwarenessEmail,
  sendB2BPartnerBrandAwarenessEmail,
} from '../../src/services/marketing/email/campaigns/b2b/b2b-partner-brand-awareness-email.service.js';

const args = process.argv.slice(2);
const shouldCommit = args.includes('--commit');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const previewArg = args.find((arg) => arg.startsWith('--preview='));

const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
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

let recipients = B2B_PARTNER_BRAND_AWARENESS_RECIPIENTS.map((recipient) => ({
  ...recipient,
  email: recipient.email.trim().toLowerCase(),
}));

if (onlyEmails) {
  recipients = recipients.filter((recipient) => onlyEmails.has(recipient.email));
}

if (Number.isFinite(limit) && limit && limit > 0) {
  recipients = recipients.slice(0, limit);
}

const previewPath = previewArg
  ? resolve(process.cwd(), previewArg.split('=').slice(1).join('='))
  : null;

async function main(): Promise<void> {
  const preview = buildB2BPartnerBrandAwarenessEmail({
    firstName: recipients[0]?.firstName,
  });

  console.log('B2B partner brand awareness sender');
  console.log(`Mode: ${shouldCommit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Campaign: ${preview.campaignKey}`);
  console.log(`Subject: ${preview.subject}`);
  console.log(`Selected recipients: ${recipients.length}`);

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
      console.log(`[DRY] ${recipient.email} | ${preview.subject}`);
    }
    console.log('Dry-run done. Add --commit to send.');
    return;
  }

  let sentCount = 0;

  for (const recipient of recipients) {
    await sendB2BPartnerBrandAwarenessEmail(recipient);
    sentCount += 1;
    console.log(`Sent ${sentCount}/${recipients.length}: ${recipient.email}`);
  }

  console.log(`Done. Sent: ${sentCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
