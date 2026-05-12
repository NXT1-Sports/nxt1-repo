import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../../backend/src/config/database.config.js';
import { HelpArticleModel } from '../../../backend/src/models/help-center/help-article.model.js';
import { HELP_CENTER_TROUBLESHOOTING_ARTICLES } from './help-center-seed-content.js';

const articles = HELP_CENTER_TROUBLESHOOTING_ARTICLES;
// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n⚙️  NXT1 Help Center — Troubleshooting Articles Seed');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Articles to seed: ${articles.length}\n`);

  await connectToMongoDB();
  console.log('  ✅ MongoDB connected\n');

  let created = 0;
  let updated = 0;
  const startTime = Date.now();

  for (const article of articles) {
    const existing = await HelpArticleModel.findOne({ slug: article.slug });

    if (existing) {
      await HelpArticleModel.updateOne({ slug: article.slug }, { $set: article });
      console.log(`  🔄 Updated:  "${article.title}"`);
      updated++;
    } else {
      await HelpArticleModel.create(article);
      console.log(`  ✅ Created:  "${article.title}"`);
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
