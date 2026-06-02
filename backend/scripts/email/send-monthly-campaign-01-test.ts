import 'dotenv/config';

import type { UserRole } from '@nxt1/core';
import { sendMonthlyCampaign01Email } from '../../src/services/marketing/email/campaigns/monthly/monthly-campaign-01-email.service.js';
import { getRuntimeEnvironment } from '../../src/config/runtime-environment.js';

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

  console.log('Monthly campaign 01 test sender');
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

  const result = await sendMonthlyCampaign01Email({
    email: options.to,
    role: options.role,
    firstName: options.firstName,
    primarySport: options.primarySport,
    organizationName: options.organizationName,
    environment: getRuntimeEnvironment(),
  });

  console.log(`Sent ${result.campaignKey} to ${result.email}`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
