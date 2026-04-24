import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

async function run() {
  await mongoose.connect(process.env.MONGO || process.env.MONGO_AI!);
  const db = mongoose.connection.db;

  console.log('Connected. Creating vector index...');
  try {
    await db.collection('agentmemories').createSearchIndex({
      name: 'agent_memory_vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'userId' },
          { type: 'filter', path: 'target' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'teamId' },
          { type: 'filter', path: 'organizationId' },
        ],
      },
    });
    console.log('Index created successfully!');
  } catch (err) {
    console.error('Error creating index:', err);
  }
  process.exit(0);
}
run();
