import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../../backend/src/config/database.config.js';
import { HelpFaqModel } from '../../../backend/src/models/help-center/help-faq.model.js';
import { HELP_CENTER_POPULAR_FAQS } from './help-center-seed-content.js';

const faqs = HELP_CENTER_POPULAR_FAQS;
// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n⚙️  NXT1 Help Center — Popular FAQs Seed');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  FAQs to seed: ${faqs.length}\n`);

  await connectToMongoDB();
  console.log('  ✅ MongoDB connected\n');

  let created = 0;
  let updated = 0;
  const startTime = Date.now();

  for (const faq of faqs) {
    const existing = await HelpFaqModel.findOne({ question: faq.question });

    if (existing) {
      await HelpFaqModel.updateOne({ question: faq.question }, { $set: faq });
      console.log(`  🔄 Updated:  "${faq.question}"`);
      updated++;
    } else {
      await HelpFaqModel.create(faq);
      console.log(`  ✅ Created:  "${faq.question}"`);
      created++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('📊 Seed Complete');
  console.log(`   Created:  ${created}`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Duration: ${duration}s`);
  console.log('══════════════════════════════════════════════════════════\n');

  await disconnectFromMongoDB();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
