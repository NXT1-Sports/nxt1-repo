import { config as dotenv } from 'dotenv';
dotenv({ path: '.env' });

async function test() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log('Fetching...');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'openai/gpt-5.4-image-2',
      messages: [{ role: 'user', content: 'Draw a tiny cat' }],
    }),
  });
  console.log('Status:', res.status);

  if (!res.body) {
    console.log('No body');
    return;
  }

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('\nDone');
      break;
    }
    process.stdout.write(new TextDecoder().decode(value));
  }
}
test().catch(console.error);
