import { config as dotenv } from 'dotenv';
dotenv({ path: '../backend/.env' });
dotenv({ path: '../backend/.env.local', override: true });

async function test() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'openai/gpt-5.4-image-2',
      messages: [{ role: 'user', content: 'A tiny cat' }],
    }),
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
test();
