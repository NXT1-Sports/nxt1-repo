const cheerio = require('cheerio');
async function run() {
  const url = 'https://highschool.si.com/texas/2024/05/17/denton-ryan-head-football-job-opens-after-dave-henigan-steps-down';
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}});
  const html = await res.text();
  const $ = cheerio.load(html);
  let og = $('meta[property="og:image"]').attr('content');
  console.log('Final fallback logic test:', og);
}
run();
