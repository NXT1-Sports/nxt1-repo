import 'dotenv/config';

import type { UserRole } from '@nxt1/core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildMonthlyCampaign02Preview,
  sendMonthlyCampaign02Email,
} from '../../src/services/marketing/email/campaigns/monthly/monthly-campaign-02-email.service.js';
import { getRuntimeEnvironment } from '../../src/config/runtime-environment.js';
import { sendPlatformEmail } from '../../src/services/communications/platform-email.service.js';

const ATHLETE_REMOTE_IMAGE_URL =
  'https://raw.githubusercontent.com/NXT1-Sports/nxt1-repo/main/packages/design-tokens/assets/images/email-campaign-mobile-athlete.png';
const ATHLETE_INLINE_IMAGE_CID = 'athlete-campaign-mobile@nxt1sports.com';
const COACH_REMOTE_IMAGE_URL =
  'https://raw.githubusercontent.com/NXT1-Sports/nxt1-repo/main/packages/design-tokens/assets/images/email-campaign-coach.png';
const COACH_INLINE_IMAGE_CID = 'coach-campaign@nxt1sports.com';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ATHLETE_IMAGE_PATH = resolve(
  SCRIPT_DIR,
  '../../../packages/design-tokens/assets/images/email-campaign-mobile-athlete.png'
);
const COACH_IMAGE_PATH = resolve(
  SCRIPT_DIR,
  '../../../packages/design-tokens/assets/images/email-campaign-coach.png'
);

interface ScriptOptions {
  readonly to: string;
  readonly commit: boolean;
  readonly role: UserRole;
  readonly firstName: string;
  readonly primarySport?: string;
  readonly organizationName?: string;
}

function parseArgs(argv: readonly string[]): ScriptOptions {
  const commit = argv.includes('--commit');
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  const roleArg = argv.find((arg) => arg.startsWith('--role='));
  const firstNameArg = argv.find((arg) => arg.startsWith('--first-name='));
  const sportArg = argv.find((arg) => arg.startsWith('--sport='));
  const orgArg = argv.find((arg) => arg.startsWith('--organization='));

  const roleCandidate = roleArg?.split('=').slice(1).join('=').trim() as UserRole | undefined;
  const role: UserRole =
    roleCandidate === 'athlete' || roleCandidate === 'coach' || roleCandidate === 'director'
      ? roleCandidate
      : 'director';

  return {
    to: toArg?.split('=').slice(1).join('=').trim() || 'john@nxt1sports.com',
    commit,
    role,
    firstName: firstNameArg?.split('=').slice(1).join('=').trim() || 'John',
    primarySport: sportArg?.split('=').slice(1).join('=').trim() || undefined,
    organizationName: orgArg?.split('=').slice(1).join('=').trim() || undefined,
  };
}

function hasEmailCredentials(): boolean {
  const user = (process.env['GMAIL_USER'] ?? process.env['SMTP_USER'] ?? '').trim();
  const pass = (process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS'] ?? '').trim();
  return user.length > 0 && pass.length > 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const environment = getRuntimeEnvironment();

  console.log('Monthly campaign 02 test sender');
  console.log(`Recipient: ${options.to}`);
  console.log(`Role: ${options.role}`);
  console.log(`Mode: ${options.commit ? 'COMMIT' : 'DRY RUN'}`);

  if (!options.commit) {
    console.log('Dry run complete. Re-run with --commit to send.');
    return;
  }

  if (!hasEmailCredentials()) {
    throw new Error(
      'Missing SMTP credentials. Expected GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS.'
    );
  }

  const input = {
    email: options.to,
    role: options.role,
    firstName: options.firstName,
    primarySport: options.primarySport,
    organizationName: options.organizationName,
    environment,
  } as const;

  try {
    const result = await sendMonthlyCampaign02Email(input);
    console.log(`Sent ${result.campaignKey} to ${result.email}`);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDispatchTimeout =
      message.includes('marketingEmailDispatches.insertOne') &&
      message.includes('buffering timed out');

    if (!isDispatchTimeout) {
      throw err;
    }

    const preview = buildMonthlyCampaign02Preview(input);
    const isAthlete = options.role === 'athlete';
    const isCoachTrack = options.role === 'coach' || options.role === 'director';
    let html = preview.html;

    if (isAthlete) {
      html = html.replaceAll(ATHLETE_REMOTE_IMAGE_URL, `cid:${ATHLETE_INLINE_IMAGE_CID}`);
    }
    if (isCoachTrack) {
      html = html.replaceAll(COACH_REMOTE_IMAGE_URL, `cid:${COACH_INLINE_IMAGE_CID}`);
    }

    await sendPlatformEmail(options.to, preview.subject, html, 'support@nxt1sports.com', {
      attachments: [
        ...(isAthlete
          ? [
              {
                filename: 'email-campaign-mobile-athlete.png',
                path: ATHLETE_IMAGE_PATH,
                cid: ATHLETE_INLINE_IMAGE_CID,
              },
            ]
          : []),
        ...(isCoachTrack
          ? [
              {
                filename: 'email-campaign-coach.png',
                path: COACH_IMAGE_PATH,
                cid: COACH_INLINE_IMAGE_CID,
              },
            ]
          : []),
      ],
    });
    console.warn(
      'Dispatch logging unavailable (Mongo timeout). Sent campaign via SMTP fallback without dispatch record.'
    );
    console.log(`Sent ${preview.campaignKey} to ${options.to}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
