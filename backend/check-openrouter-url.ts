import { config as dotenv } from 'dotenv';
dotenv({ path: 'backend/.env' });

async function test() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log('Fetching...');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'openai/gpt-5.4-image-2',
      messages: [{ role: 'user', content: 'A tiny cat' }],
      response_format: { type: 'url' }, // Try passing this to see if OpenRouter supports it natively
    }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data).substring(0, 300));
}
test().catch(console.error);
