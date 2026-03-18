import 'dotenv/config';
import { ScrapeAndIndexProfileTool } from '../src/modules/agent/tools/scraping/scrape-and-index-profile.tool.js';
import { OpenRouterService } from '../src/modules/agent/llm/openrouter.service.js';
import { ScraperService } from '../src/modules/agent/tools/scraping/scraper.service.js';
import { getCachedScrapeResult } from '../src/modules/agent/tools/scraping/scrape-and-index-profile.tool.js';

async function main() {
  console.log('🧪 Testing 100% agentic extraction on Ryder Lyons...');
  const url =
    'https://www.maxpreps.com/ca/folsom/folsom-bulldogs/athletes/ryder-lyons/?careerid=ufohkivpbcci2';

  const scraper = new ScraperService();
  const llm = new OpenRouterService();
  const tool = new ScrapeAndIndexProfileTool(scraper, llm);

  console.log(`\n⏳ Running ScrapeAndIndexProfileTool execute()...`);
  const result = await tool.execute({ url });

  console.log('\n=============================================');
  console.log('📬 RESULT FROM TOOL EXECUTE (The Index):');
  console.log(JSON.stringify(result, null, 2));
  console.log('=============================================\n');

  const cached = getCachedScrapeResult(url);
  if (cached && cached.profile) {
    console.log('✅ Distilled Profile found in cache (what the AI successfully extracted):');
    console.log(JSON.stringify(cached.profile, null, 2));
  } else {
    console.log('❌ No valid profile in cache.');
  }
}

main().catch(console.error);
