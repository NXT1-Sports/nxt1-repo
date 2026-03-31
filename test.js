const cheerio = require('cheerio');
async function run() {
  const url = 'https://highschool.si.com/texas/2024/05/17/denton-ryan-head-football-job-opens-after-dave-henigan-steps-down';
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 NXTPulsebot'}});
  const html = await res.text();
  const $ = cheerio.load(html);
  let img = $('article img').first().attr('src') || $('figure img').first().attr('src') || $('img').not('[src*="logo"]').first().attr('src');
  let og = $('meta[property="og:image"]').attr('content');
  console.log('DOM Image:', img);
  console.log('OG Image:', og);
}
run();
