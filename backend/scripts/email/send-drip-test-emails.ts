import 'dotenv/config';
import { sendSignupDripEmail } from '../../src/services/marketing/email/campaigns/signup/signup-drip-email.service.js';
import type { UserRole } from '@nxt1/core';

async function main() {
  const to = 'john@nxt1sports.com';
  const steps = ['profile_setup', 'agent_activation', 'reengagement'] as const;
  const roles: UserRole[] = ['athlete', 'director'];

  for (const role of roles) {
    for (const stepKey of steps) {
      console.log(`Sending ${stepKey} for ${role}...`);

      const isTeam = ['coach', 'staff', 'director'].includes(role);

      let setupFocusAreas: string[] | undefined = undefined;
      if (stepKey === 'profile_setup') {
        setupFocusAreas = [];
        setupFocusAreas.push(
          'Add a profile/program image so your account presents cleanly right away.'
        );
        setupFocusAreas.push(
          'Add a short bio or description so NXT1 and other people have the right context.'
        );
        if (!isTeam) {
          setupFocusAreas.push('Add your sport positions so recommendations stay relevant.');
        } else {
          setupFocusAreas.push(
            'Connect the sources or links that make your presence more complete.'
          );
        }
      }

      await sendSignupDripEmail({
        userId: 'test_user_id',
        email: to,
        firstName: 'Torrance',
        environment: 'staging',
        role,
        stepKey,
        paymentState: 'unpaid',
        primarySport: 'Football',
        organizationName: 'NXT1 Test Program',
        marketingEnabled: true,
        setupFocusAreas,
      });
      console.log(`Sent ${stepKey} for ${role}`);
    }
  }
}

main().catch(console.error);
