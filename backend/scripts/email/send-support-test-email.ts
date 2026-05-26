import 'dotenv/config';

import { buildSupportEmailTemplate } from '../../src/services/communications/templates/support-email-template.js';
import { sendPlatformEmail } from '../../src/services/communications/platform-email.service.js';

interface ScriptOptions {
  readonly to: string;
  readonly commit: boolean;
}

function parseArgs(argv: readonly string[]): ScriptOptions {
  const commit = argv.includes('--commit');
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  const to = toArg?.split('=').slice(1).join('=').trim() || 'john@nxt1sports.com';

  return { to, commit };
}

function hasSmtpCredentials(): boolean {
  const user = (process.env['GMAIL_USER'] ?? process.env['SMTP_USER'] ?? '').trim();
  const pass = (process.env['GMAIL_APP_PASSWORD'] ?? process.env['SMTP_PASS'] ?? '').trim();
  return user.length > 0 && pass.length > 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const subject = 'NXT1 Support Test Email';
  const html = buildSupportEmailTemplate({
    title: 'Support Request Received',
    preheader: 'This is a regular support template verification email.',
    greeting: 'Hi John,',
    bodyLines: [
      'This is a test of the regular NXT1 Support HTML template.',
      'It is intentionally plain and non-marketing, designed for support updates and ticket communications.',
      'If you are reading this, the template and SMTP send path are both working.',
    ],
    ticketId: 'TEST-SUPPORT-EMAIL-001',
    footerNote:
      'You received this because a support template test was requested in the NXT1 backend workspace.',
  });

  console.log('Support template test sender');
  console.log(`Recipient: ${options.to}`);
  console.log(`Mode: ${options.commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Subject: ${subject}`);

  if (!options.commit) {
    console.log('Dry run complete. Re-run with --commit to send.');
    return;
  }

  if (!hasSmtpCredentials()) {
    throw new Error(
      'Missing SMTP credentials. Expected GMAIL_USER/GMAIL_APP_PASSWORD or SMTP_USER/SMTP_PASS.'
    );
  }

  await sendPlatformEmail(options.to, subject, html, 'support@nxt1sports.com');
  console.log(`Sent support test email to ${options.to}`);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
