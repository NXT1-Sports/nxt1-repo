import { config } from 'dotenv';
config();
async function run() {
  try {
    const { MemorySummarizationService } =
      await import('../src/modules/agent/memory/memory-summarization.service.ts');
    console.log('Imports succeeded.');
  } catch (err) {
    console.error('IMPORT ERROR:', err);
  }
}
run();
