#!/usr/bin/env node
/** Debug: show raw Perplexity response */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const today = new Date().toISOString().split('T')[0];

const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://nxt1.com',
    'X-Title': 'NXT1 Pulse',
  },
  body: JSON.stringify({
    model: 'perplexity/sonar',
    messages: [
      { role: 'system', content: 'You are a sports news research assistant. Return ONLY valid JSON arrays. No markdown fences, no explanation.' },
      { role: 'user', content: `Search the web for today's (${today}) top high school and college sports recruiting news articles. Find 10 real articles from legitimate sports news publishers.\n\nFor EACH article provide: title, excerpt, source, sourceUrl, sport, state, publishedAt.\n\nReturn ONLY a JSON array. No markdown.` },
    ],
    max_tokens: 8192,
    temperature: 0.3,
  }),
});

const data = await resp.json();
const content = data?.choices?.[0]?.message?.content ?? 'NO CONTENT';
console.log('Status:', resp.status);
console.log('Raw response (first 2000 chars):');
console.log(content.slice(0, 2000));
