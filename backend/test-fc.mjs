import 'dotenv/config';
import Firecrawl from '@mendable/firecrawl-js';

const f = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

const { sessions } = await f.listBrowsers({ status: 'active' });
console.log('Active sessions:', sessions?.length ?? 0);
for (const s of sessions ?? []) {
  console.log('  Deleting', s.id);
  await f.deleteBrowser(s.id);
}

console.log('\nCreating browser session...');
const r = await f.browser({
  ttl: 120,
  streamWebView: true,
  profile: { name: 'nxt1_stg_test_hudl_signin', saveChanges: true },
});
console.log('Success! id:', r.id);
console.log('  interactive:', r.interactiveLiveViewUrl?.slice(0, 60));

await f.browserExecute(r.id, {
  code: 'window.location.href = "https://www.hudl.com/login";',
  language: 'node',
  timeout: 15000,
});
console.log('  Navigated to Hudl login');

await f.deleteBrowser(r.id);
console.log('  Cleaned up');
