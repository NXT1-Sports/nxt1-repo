import 'dotenv/config';
import type { UserRole } from '@nxt1/core';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { sendB2CClosedWonEmail } from '../../src/services/marketing/email/campaigns/closed-won/closed-won-email.service.js';
import { sendSignupDripEmail } from '../../src/services/marketing/email/campaigns/signup/signup-drip-email.service.js';
import { sendTrialCreditsFinishedEmail } from '../../src/services/marketing/email/campaigns/trial-credits-finished/trial-credits-finished-email.service.js';
import { sendUsageStartedEmail } from '../../src/services/marketing/email/campaigns/usage-started/usage-started-email.service.js';
import { SIGNUP_DRIP_STEP_SEQUENCE } from '../../src/services/marketing/lifecycle/signup-drip.service.js';

async function main() {
  await connectToMongoDB();

  const to = process.env['TEST_EMAIL_RECIPIENT'] ?? 'john@nxt1sports.com';
  const roles: UserRole[] = ['athlete', 'director'];

  console.log(`=== Testing All Email Sequence Templates to: ${to} ===\n`);

  try {
    // 1. Drip Campaign Sequence (9 Steps x 2 Roles)
    for (const role of roles) {
      for (const stepKey of SIGNUP_DRIP_STEP_SEQUENCE) {
        console.log(`Sending drip step [${stepKey}] for role [${role}]...`);

        const isTeam = ['coach', 'staff', 'director'].includes(role);

        let setupFocusAreas: string[] | undefined = undefined;
        if (stepKey === 'profile_setup') {
          setupFocusAreas = [
            'Add a profile/program image so your account presents cleanly right away.',
            'Add a short bio or description so NXT1 and other people have the right context.',
            isTeam
              ? 'Connect the sources or links that make your presence more complete.'
              : 'Add your sport positions so recommendations stay relevant.',
          ];
        }

        await sendSignupDripEmail({
          userId: 'test_user_id',
          email: to,
          firstName: 'Torrance',
          environment: 'staging',
          role,
          stepKey,
          paymentState: stepKey.includes('post_purchase') ? 'paid' : 'unpaid',
          primarySport: 'Football',
          organizationName: 'NXT1 Test Program',
          marketingEnabled: true,
          setupFocusAreas,
        });
      }
    }

    // 2. Triggered Event Emails
    console.log('\nSending Triggered Lifecycle Event Emails...');

    console.log('Sending Usage Started Email...');
    await sendUsageStartedEmail({
      userId: 'test_user_id',
      email: to,
      firstName: 'Torrance',
      environment: 'staging',
      role: 'athlete',
      primarySport: 'Football',
      marketingEnabled: true,
    });

    console.log('Sending Trial Credits Finished Email...');
    await sendTrialCreditsFinishedEmail({
      userId: 'test_user_id',
      email: to,
      firstName: 'Torrance',
      environment: 'staging',
      role: 'athlete',
      primarySport: 'Football',
      marketingEnabled: true,
    });

    console.log('Sending B2C Closed Won Email...');
    await sendB2CClosedWonEmail({
      userId: 'test_user_id',
      email: to,
      firstName: 'Torrance',
      environment: 'staging',
      paymentSource: 'stripe_checkout',
      amountFormatted: '$49.00',
      marketingEnabled: true,
    });

    console.log('\n=== All Email Sequence Tests Dispatched Successfully! ===');
  } finally {
    await disconnectFromMongoDB();
  }
}

main().catch(console.error);
