import 'dotenv/config';

import {
  buildFoundation50CoachesPreview,
  sendFoundation50CoachesEmail,
} from '../../src/services/marketing/email/campaigns/foundation/foundation-50-coaches-email.service.js';
import { getRuntimeEnvironment } from '../../src/config/runtime-environment.js';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { sendPlatformEmail } from '../../src/services/communications/platform-email.service.js';

interface ScriptOptions {
  readonly to: string;
  readonly commit: boolean;
  readonly firstName: string;
  readonly primarySport?: string;
  readonly organizationName?: string;
}

function parseArgs(argv: readonly string[]): ScriptOptions {
  const commit = argv.includes('--commit');
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  const firstNameArg = argv.find((arg) => arg.startsWith('--first-name='));
  const sportArg = argv.find((arg) => arg.startsWith('--sport='));
  const orgArg = argv.find((arg) => arg.startsWith('--organization='));

  return {
    to: toArg?.split('=').slice(1).join('=').trim() || 'john@nxt1sports.com',
    commit,
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

  console.log('Foundation 50 Coaches test sender');
  console.log(`Recipient: ${options.to}`);
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

  await connectToMongoDB();

  const testTestimonials = [
    {
      name: 'Coach John S.',
      school: 'State Finalist Program',
      quote:
        'We went from 4 different platforms to one. That is an assistant coach worth of time back in my season.',
    },
    {
      name: 'Coach Sarah Martinez',
      school: 'District Championship Team',
      quote:
        'The AI breakdown of film saves us hours on game prep. Our staff is seeing things they were missing.',
    },
    {
      name: 'Coach Mike Thompson',
      school: 'Class 5A Program',
      quote: 'Scout reports that actually mean something. No more guessing on recruit potential.',
    },
  ];

  const input = {
    email: options.to,
    firstName: options.firstName,
    primarySport: options.primarySport,
    organizationName: options.organizationName,
    environment,
    coachTestimonial: testTestimonials[0],
  } as const;

  try {
    try {
      const result = await sendFoundation50CoachesEmail(input);
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

      const preview = buildFoundation50CoachesPreview(input);
      await sendPlatformEmail(options.to, preview.subject, preview.html, 'support@nxt1sports.com');
      console.warn(
        'Dispatch logging unavailable (Mongo timeout). Sent campaign via SMTP fallback without dispatch record.'
      );
      console.log(`Sent ${preview.campaignKey} to ${options.to}`);
    }
  } finally {
    await disconnectFromMongoDB().catch(() => undefined);
  }
}

main().catch(console.error);
