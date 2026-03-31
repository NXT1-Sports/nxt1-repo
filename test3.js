const fs = require('fs');
const cheerio = require('cheerio');
async function run() {
  const url = 'https://highschool.si.com/texas/2024/05/17/denton-ryan-head-football-job-opens-after-dave-henigan-steps-down';
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 NXTPulseBot/1.0', Accept: 'text/html'}});
  const html = await res.text();
  fs.writeFileSync('dump.html', html);
  const $ = cheerio.load(html);
  let og = $('meta[property="og:image"]').attr('content');
  console.log('Final fallback logic test:', og);
}
run();
