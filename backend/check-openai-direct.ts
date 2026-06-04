import { config as dotenv } from 'dotenv';
dotenv({ path: 'backend/.env' });

async function test() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('No OpenAI API Key found');
    return;
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'dall-e-3', // OpenAI maps their newest image model through dall-e-3 generally
      prompt: 'A tiny cat',
      n: 1,
      size: '1024x1024',
    }),
  });
  console.log('Status directly to OpenAI:', res.status);
  const data = await res.json();
  console.log(JSON.stringify(data).substring(0, 500));
}
test().catch(console.error);
