import { config as dotenv } from 'dotenv';
dotenv({ path: '.env' });

async function test() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json();
  const models = data.data as { id: string }[];
  console.log('Image models:');
  console.log(
    models
      .map((m) => m.id)
      .filter((id) => id.includes('image') || id.includes('dall-e') || id.includes('flux'))
  );
}
test().catch(console.error);
