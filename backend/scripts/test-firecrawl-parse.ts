import Firecrawl from '@mendable/firecrawl-js';
import * as fs from 'fs';

async function main() {
  const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  // just type check it
  console.log(typeof client.parse);
}
main();
