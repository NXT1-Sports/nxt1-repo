#!/usr/bin/env node
/**
 * Legacy Subscription Migration - Brevo Email Campaign Setup
 *
 * This script prepares fallback Brevo contact/campaign payloads for migrated legacy users.
 * It generates the contact list and provides the email data for Brevo API calls.
 *
 * Usage:
 *   npm run email:setup-brevo-migration
 *
 * Prerequisites:
 *   - BREVO_API_KEY environment variable set
 *   - Brevo MCP server running
 *
 * Outputs:
 *   - logs/brevo-migration-contacts.json — Contact list for Brevo
 *   - logs/brevo-migration-campaign.json — Campaign/backfill configuration
 */

import fs from 'fs';
import path from 'path';

// 12 migrated users from the migration report (excluding blackjacket.media)
const MIGRATED_USERS = [
  {
    email: 'elitecc236@icloud.com',
    firstName: 'Elite CC',
    creditAmountCents: 1200,
    customerId: 'cus_Ty80lKA1MrzyLv',
  },
  {
    email: 'gailpaul30@gmail.com',
    firstName: 'Gail Paul',
    creditAmountCents: 1200,
    customerId: 'cus_TLOCuCygsJUTEY',
  },
  {
    email: 'julianrmayers@gmail.com',
    firstName: 'Julian Mayers',
    creditAmountCents: 4550,
    customerId: 'cus_QW5vpcbKWtTj6j',
  },
  {
    email: 'kayleebritten2026recruit@gmail.com',
    firstName: 'Kaylee Britten',
    creditAmountCents: 4550,
    customerId: 'cus_R8SZ1InCVwNiji',
  },
  {
    email: 'lukefrayer@gmail.com',
    firstName: 'Luke Frayer',
    creditAmountCents: 1200,
    customerId: 'cus_U0Anl4HZzgxAm0',
  },
  {
    email: 'michael.uland@hotmail.com',
    firstName: 'Michael Uland',
    creditAmountCents: 1200,
    customerId: 'cus_RED9YsuuGarwVS',
  },
  {
    email: 'nickjoeg@icloud.com',
    firstName: 'Nick Joe G',
    creditAmountCents: 4550,
    customerId: 'cus_Q0d6ANDxIFOVlR',
  },
  {
    email: 'nturcotte11@yahoo.com',
    firstName: 'N Turcotte',
    creditAmountCents: 4550,
    customerId: 'cus_Q57X0gMl6safNl',
  },
  {
    email: 'paytonmc22@gmail.com',
    firstName: 'Payton MC',
    creditAmountCents: 1200,
    customerId: 'cus_SzRxwQ56EDYCLF',
  },
  {
    email: 'skymarshall0820@gmail.com',
    firstName: 'Sky Marshall',
    creditAmountCents: 1200,
    customerId: 'cus_TjR9hb8gKulHt6',
  },
  {
    email: 'torreypaul@gmail.com',
    firstName: 'Torrey Paul',
    creditAmountCents: 6500,
    customerId: 'cus_P09zJdfrQnBrWU',
  },
  {
    email: 'vrupinta@yahoo.com',
    firstName: 'V Rupinta',
    creditAmountCents: 3500,
    customerId: 'cus_TAdJTuWVUIBeBg',
  },
];

// Format contact data for Brevo
function formatContactsForBrevo() {
  return MIGRATED_USERS.map((user) => ({
    email: user.email,
    firstName: user.firstName,
    attributes: {
      CREDIT_AMOUNT: (user.creditAmountCents / 100).toFixed(2),
      CREDIT_AMOUNT_FORMATTED: `$${(user.creditAmountCents / 100).toFixed(2)}`,
      CUSTOMER_ID: user.customerId,
      MIGRATION_DATE: new Date().toISOString().split('T')[0],
      CAMPAIGN_TYPE: 'legacy_subscription_migration',
    },
    listIds: [8], // Brevo list ID (you'll need to set this)
  }));
}

// Format campaign configuration (manual fallback/backfill use)
function formatCampaignConfig() {
  const totalCents = MIGRATED_USERS.reduce((sum, u) => sum + u.creditAmountCents, 0);
  const totalDollars = (totalCents / 100).toFixed(2);

  return {
    campaignName: 'Legacy Subscription to Usage Billing - May 2026',
    subject: 'Welcome to Usage-Based Billing-Your Account Credit Inside',
    senderName: 'NXT1 Sports Team',
    senderEmail: 'no-reply@nxt1sports.com',
    replyToEmail: 'support@nxt1sports.com',
    templateFile: 'legacy-subscription-migration.html',
    contacts: MIGRATED_USERS.length,
    totalCredit: totalDollars,
    description: 'Email campaign for 12 legacy subscription users migrated to usage-based billing',
    tags: ['legacy-migration', 'billing-update', 'may-2026'],
    deliveryMode: 'triggered_on_legacy_onboarding_completed',
  };
}

// Main execution
async function main() {
  try {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Generate contact list
    const contacts = formatContactsForBrevo();
    const contactsPath = path.join(logsDir, 'brevo-migration-contacts.json');
    fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
    console.log(`✅ Contact list generated: ${contactsPath}`);
    console.log(`   - ${contacts.length} contacts`);

    // Generate campaign config
    const campaignConfig = formatCampaignConfig();
    const campaignPath = path.join(logsDir, 'brevo-migration-campaign.json');
    fs.writeFileSync(campaignPath, JSON.stringify(campaignConfig, null, 2));
    console.log(`✅ Campaign config generated: ${campaignPath}`);
    console.log(`   - Campaign: ${campaignConfig.campaignName}`);
    console.log(`   - Contacts: ${campaignConfig.contacts}`);
    console.log(`   - Total Credit: ${campaignConfig.totalCredit}`);

    // Print next steps
    console.log('\n📋 NEXT STEPS:\n');
    console.log('1. Review the contact list:');
    console.log(`   cat logs/brevo-migration-contacts.json\n`);
    console.log('2. Review the campaign config:');
    console.log(`   cat logs/brevo-migration-campaign.json\n`);
    console.log('3. Create a contact list in Brevo (if not exists):');
    console.log('   - List name: "legacy-subscription-to-wallet-2026"');
    console.log("   - Note the Brevo list ID (you'll need this)\n");
    console.log('4. Upload contacts to Brevo using MCP:');
    console.log('   npm run email:migrate-legacy-brevo-upload\n');
    console.log('5. Trigger mode is now event-based (recommended):\n');
    console.log(
      '   - Email now sends when Users/{uid}.legacyOnboardingCompleted becomes true\n' +
        '   - Centralized sender: backend/src/services/marketing\n' +
        '   - Use this JSON output only for backfill/manual resend workflows\n'
    );

    console.log('\n✨ Campaign setup complete! Check the generated JSON files for details.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
