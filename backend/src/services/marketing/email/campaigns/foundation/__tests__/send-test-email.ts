/**
 * @fileoverview Foundation 50 Coaches Email - Test/Demo
 * @module @nxt1/backend/services/marketing/email/campaigns/foundation/test
 *
 * Usage: node dist-scripts/send-foundation-50-test-email.js
 */

import { sendFoundation50CoachesEmail } from '../foundation-50-coaches-email.service.js';
import { getRuntimeEnvironment } from '../../../../../../config/runtime-environment.js';

async function sendTestEmail() {
  const runtime = getRuntimeEnvironment();

  // Rotate through test testimonials
  const testimonials = [
    {
      name: 'Coach John Smith',
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

  const selectedTestimonial = testimonials[0]; // Use first one for this test

  const testInput = {
    email: 'john@nxt1sports.com',
    firstName: 'John',
    primarySport: 'Football',
    organizationName: 'Your HS Program',
    environment: runtime,
    coachTestimonial: selectedTestimonial,
  };

  try {
    console.log('Sending Foundation 50 Coaches test email...');
    const result = await sendFoundation50CoachesEmail(testInput);
    console.log('✅ Email sent successfully!', result);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    process.exit(1);
  }
}

sendTestEmail();
