const cheerio = require('cheerio');
async function run() {
  const url = 'https://www.si.com/high-school/texas/2024/05/17/denton-ryan-head-football-job-opens-after-dave-henigan-steps-down';
  const origin = new URL(url).origin;
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}});
  const html = await res.text();
  const $ = cheerio.load(html);
  let bodyImage = $('article img').first().attr('src') || $('figure img').first().attr('src') || $('.article-content img').first().attr('src');
  let imageUrl;
  if (bodyImage) {
    if (bodyImage.startsWith('//')) bodyImage = 'https:' + bodyImage;
    else if (bodyImage.startsWith('/')) bodyImage = origin + bodyImage;
      imageUrl = bodyImage;
    }
  }
    let ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && ogImage.startsWith('http')) {
      const lower = ogImage.toLowerCase();
        imageUrl = ogImage;
      }
    }
  }
  console.log('Original OG:', $('meta[property="og:image"]').attr('content'));
  console.log('Final URL extracted:', imageUrl);
}
run();
