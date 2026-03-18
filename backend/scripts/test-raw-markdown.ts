import 'dotenv/config';
import { ScraperService } from '../src/modules/agent/tools/scraping/scraper.service.js';
import { preprocessMarkdown } from '../src/modules/agent/tools/scraping/distillers/index.js';

async function main() {
  const url =
    'https://www.maxpreps.com/ca/folsom/folsom-bulldogs/athletes/ryder-lyons/football/stats/?careerid=ufohkivpbcci2';
  const scraper = new ScraperService();

  try {
    const result = await scraper.scrape({ url });
    const cleaned = preprocessMarkdown(result.markdownContent ?? '');

    // Find the stats table section
    const lines = cleaned.split('\n');
    let statsStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (
        lower.includes('passing') ||
        lower.includes('rushing') ||
        lower.includes('game log') ||
        lower.includes('season totals') ||
        lower.includes('career stats')
      ) {
        if (statsStart === -1) statsStart = Math.max(0, i - 5);
      }
    }

    if (statsStart >= 0) {
      console.log('=== STATS SECTION FOUND (around line', statsStart, ') ===');
      console.log(lines.slice(statsStart, Math.min(lines.length, statsStart + 200)).join('\n'));
    } else {
      console.log('=== NO OBVIOUS STATS SECTION — printing last 300 lines ===');
      console.log(lines.slice(Math.max(0, lines.length - 300)).join('\n'));
    }

    console.log('\n\n=== TOTAL CLEANED LENGTH:', cleaned.length, '===');
  } catch (err) {
    console.error('Scrape error:', err);
  }
}

main().catch(console.error);
