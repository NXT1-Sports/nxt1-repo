import 'dotenv/config';
import {
  connectToMongoDB,
  disconnectFromMongoDB,
} from '../../backend/src/config/database.config.js';
import { GlobalKnowledgeModel } from '../../backend/src/modules/agent/memory/global-knowledge.model.js';

async function main(): Promise<void> {
  console.log('🗑️  Clearing agentGlobalKnowledge collection...');
  await connectToMongoDB();

  const result = await GlobalKnowledgeModel.deleteMany({});
  console.log(`✅ Deleted ${result.deletedCount} chunks from agentGlobalKnowledge`);

  await disconnectFromMongoDB();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
