/**
 * @fileoverview Knowledge Base Seed Script
 * @module @nxt1/backend/scripts/seed-knowledge
 *
 * Seeds the agentGlobalKnowledge collection with authoritative NXT1 platform
 * knowledge documents. Run this once after initial deployment, and re-run
 * whenever platform documentation changes.
 *
 * Usage:
 *   npm run seed:knowledge
 *
 * Idempotent: same content hash = skip. Safe to run multiple times.
 * Documents are ingested in series to avoid embedding API rate limits.
 */

import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../backend/src/config/database.config.js';
import { OpenRouterService } from '../../backend/src/modules/agent/llm/openrouter.service.js';
import { KnowledgeIngestionService } from '../../backend/src/modules/agent/memory/knowledge-ingestion.service.js';
import { PLATFORM_GUIDE_DOC } from './documents/platform-guide.js';
import { AGENT_X_DOC } from './documents/agent-x.js';
import { TEAMS_DOC } from './documents/teams.js';
import { ACCOUNT_BILLING_DOC } from './documents/account-billing.js';
import { TROUBLESHOOTING_DOC } from './documents/troubleshooting.js';
import { BRAND_AND_MESSAGING_DOC } from './documents/brand-and-messaging.js';

// ─── Documents to seed (in order) ────────────────────────────────────────────

const SEED_DOCUMENTS = [
  PLATFORM_GUIDE_DOC,
  AGENT_X_DOC,
  TEAMS_DOC,
  ACCOUNT_BILLING_DOC,
  TROUBLESHOOTING_DOC,
  BRAND_AND_MESSAGING_DOC,
] as const;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('🌱 NXT1 Knowledge Base Seed Script');
  console.log('══════════════════════════════════════');
  console.log(`  Documents to process: ${SEED_DOCUMENTS.length}`);
  console.log('');

  // ── Connect ─────────────────────────────────────────────────────────────
  console.log('🔌 Connecting to MongoDB...');
  await connectToMongoDB();
  console.log('   ✅ Connected\n');

  // ── Initialize services ──────────────────────────────────────────────────
  const llm = new OpenRouterService();
  const ingestion = new KnowledgeIngestionService(llm);

  // ── Ingest each document in series ───────────────────────────────────────
  let totalChunksCreated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < SEED_DOCUMENTS.length; i++) {
    const doc = SEED_DOCUMENTS[i];
    const num = `[${i + 1}/${SEED_DOCUMENTS.length}]`;

    console.log(`${num} Processing: "${doc.title}"`);
    console.log(`     Category:  ${doc.category}`);
    console.log(`     Source:    ${doc.sourceRef}`);
    console.log(`     Content:   ${doc.content.length.toLocaleString()} chars`);

    try {
      const result = await ingestion.ingest({
        ...doc,
        chunkSize: 2048,
        chunkOverlap: 256,
      });

      if (result.chunksCreated === 0) {
        console.log(
          `     ⏭️  Skipped (identical content already in knowledge base, version ${result.version})\n`
        );
        totalSkipped++;
      } else {
        console.log(
          `     ✅ Ingested: ${result.chunksCreated} chunks (version ${result.version})\n`
        );
        totalChunksCreated += result.chunksCreated;
      }
    } catch (err) {
      console.error(`     ❌ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
      // Continue with remaining documents — partial success is better than total failure
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(1);

  console.log('══════════════════════════════════════');
  console.log('📊 Seed Complete');
  console.log(`   New chunks created: ${totalChunksCreated}`);
  console.log(`   Documents skipped:  ${totalSkipped}`);
  console.log(`   Duration:           ${durationSec}s`);
  console.log('══════════════════════════════════════\n');

  if (totalChunksCreated > 0) {
    console.log('✅ Knowledge base seeded successfully.');
    console.log('   The Atlas Vector Search index will index new documents automatically.');
    console.log('   Run "GET /agent-x/knowledge/status" to verify the knowledge base contents.\n');
  } else if (totalSkipped === SEED_DOCUMENTS.length) {
    console.log('⏭️  All documents already up to date — no changes made.\n');
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error during seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectFromMongoDB();
    process.exit(0);
  });
