import { config as dotenv } from 'dotenv';
import { OpenRouterService } from '../src/modules/agent/llm/openrouter.service.js';

dotenv({ path: '.env' });
dotenv({ path: '.env.local', override: true });

async function run() {
  const service = new OpenRouterService();
  console.log('Sending image generation request to openai/gpt-5.4-image-2...');
  try {
    const res = await service.generateImage({
      prompt: 'A futuristic basketball stadium, cinematic lighting, ultra high resolution',
      modelOverride: 'openai/gpt-5.4-image-2',
    });
    console.log('\n✅ Success! Result:', {
      model: res.model,
      mimeType: res.mimeType,
      latencyMs: res.latencyMs,
      costUsd: res.costUsd,
      base64Snippet: res.imageBase64.substring(0, 40) + '...',
    });
  } catch (err) {
    console.error('\n❌ Failed to generate image:');
    if (err instanceof Error) {
      console.error(err.message);
    } else {
      console.error(err);
    }
  }
}

run();
