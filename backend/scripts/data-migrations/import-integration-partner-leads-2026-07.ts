#!/usr/bin/env tsx
/**
 * @fileoverview Import approved integration partner leads into Investors & Partnerships Notion.
 * @module @nxt1/backend/scripts
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-integration-partner-leads-2026-07.ts
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-integration-partner-leads-2026-07.ts --commit
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-integration-partner-leads-2026-07.ts --staging
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';
import {
  getNotionInvestorsPartnershipsConfig,
  getNotionSignupDashboardDisabledReason,
  NotionIntegrationError,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
  type NotionPageSummary,
  type NotionSignupDashboardConfig,
} from '../../src/services/marketing/integrations/notion/notion-client.service.js';
import {
  upsertInvestorsPartnershipLead,
  type InvestorsPartnershipLeadInput,
} from '../../src/services/marketing/integrations/notion/investors-partnerships-entry.service.js';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

interface IntegrationPartnerSeed {
  readonly organization: string;
  readonly primaryContact: string;
  readonly contactTitle?: string;
  readonly email: string;
  readonly linkedinUrl?: string;
  readonly sourceUrl: string;
  readonly notes: string;
}

const APPROVED_LEADS: readonly IntegrationPartnerSeed[] = [
  {
    organization: 'Hudl',
    primaryContact: 'Hudl Support Team',
    email: 'support@hudl.com',
    sourceUrl: 'https://www.hudl.com/',
    notes:
      'Official site public support email. Strong sports video, analysis, and athlete workflow integration fit.',
  },
  {
    organization: 'TeamSnap',
    primaryContact: 'TeamSnap Support Team',
    email: 'help@teamsnapone.com',
    sourceUrl: 'https://www.teamsnap.com/',
    notes:
      'Official site public help email. Strong youth sports team, club, and league operations fit.',
  },
  {
    organization: 'Teamworks',
    primaryContact: 'Teamworks PR Team',
    email: 'pr@teamworks.com',
    sourceUrl: 'https://teamworks.com/contact/',
    notes:
      'Official site public PR email. Strong athletics operations and staff workflow platform.',
  },
  {
    organization: 'SportsDataIO',
    primaryContact: 'SportsDataIO Sales Team',
    email: 'sales@sportsdata.io',
    sourceUrl: 'https://sportsdata.io/apis',
    notes:
      'Official site public sales email. Sports data API provider with clear integration potential.',
  },
  {
    organization: 'Pixellot',
    primaryContact: 'Pixellot Support Team',
    email: 'support@pixellot.tv',
    sourceUrl:
      'https://www.pixellot.tv/press-releases/playon-to-exclusively-provide-pixellots-vidswap-analytics-platform-for-high-schools/',
    notes:
      'Official site public support email. Automated capture and analytics platform with school distribution fit.',
  },
  {
    organization: 'ScorePlay',
    primaryContact: 'Mariana',
    email: 'mariana@scoreplay.io',
    sourceUrl: 'https://www.scoreplay.io/blog/scoreplay-connect-open-ecosystem',
    notes:
      'Official site public email surfaced on company page. Open ecosystem for sports media workflows.',
  },
  {
    organization: 'Wowza',
    primaryContact: 'Wowza Customer Service Team',
    email: 'customerservice@wowza.com',
    sourceUrl: 'https://www.wowza.com/contact',
    notes:
      'Official site public customer service email. Streaming infrastructure with partner ecosystem relevance.',
  },
  {
    organization: 'Videon',
    primaryContact: 'Videon Info Team',
    email: 'info@videonlabs.com',
    sourceUrl: 'https://www.videonlabs.com/contact-sales',
    notes:
      'Official site public info email. Video infrastructure partner with sports media workflow relevance.',
  },
  {
    organization: 'Onform',
    primaryContact: 'Onform Support Team',
    email: 'support@onform.com',
    sourceUrl: 'https://onform.com/',
    notes:
      'Official site public support email. Coach-athlete video analysis and collaboration platform.',
  },
  {
    organization: 'Output Sports',
    primaryContact: 'Output Sports Team',
    email: 'hello@outputsports.com',
    sourceUrl: 'https://outputsports.com/demo/demo',
    notes:
      'Official site public hello email. Performance testing and coaching platform with hardware/software fit.',
  },
  {
    organization: 'SportsRecruits',
    primaryContact: 'SportsRecruits Help Team',
    email: 'help@sportsrecruits.com',
    sourceUrl: 'https://sportsrecruits.com/',
    notes:
      'Official site public help email. Recruiting workflow platform relevant to athlete and school integrations.',
  },
  {
    organization: 'NIL Club',
    primaryContact: 'NIL Club Info Team',
    email: 'info@nilclub.com',
    sourceUrl: 'https://nilclub.com/business',
    notes:
      'Official site public info email. NIL business workflow platform for schools and athlete monetization.',
  },
  {
    organization: 'Firstbeat Sports',
    primaryContact: 'Firstbeat Info Team',
    email: 'info@firstbeat.com',
    sourceUrl: 'https://content.firstbeat.com/firstbeat-sports-api-data-management',
    notes: 'Official site public info email. API and athlete performance data management fit.',
  },
  {
    organization: 'Sportradar',
    primaryContact: 'Sportradar Support Team',
    email: 'support@sportradar.com',
    sourceUrl: 'https://sportradar.com/about/locations/?lang=en-us',
    notes:
      'Official site public support email. Sports data, odds, fan engagement, and league technology platform with strong integration relevance.',
  },
  {
    organization: 'PlayOn Sports',
    primaryContact: 'PlayOn Website Support Team',
    email: 'websitesupport@playonsports.com',
    sourceUrl: 'https://playonsports.com/help',
    notes:
      'Official site public VNN support email. Strong high-school distribution, ticketing, streaming, and school workflow integration fit.',
  },
  {
    organization: 'HomeCourt',
    primaryContact: 'HomeCourt Inquiry Team',
    email: 'inquiry@homecourt.ai',
    sourceUrl: 'https://www.homecourt.ai/about',
    notes:
      'Official site public inquiry email. AI-powered player development and club workflow platform with clear athlete training integration relevance.',
  },
  {
    organization: 'CoachNow',
    primaryContact: 'CoachNow Info Team',
    email: 'info@coachnow.io',
    sourceUrl: 'https://coachnow.io/terms-of-service',
    notes:
      'Official site public info email. Coaching communication and training management platform with coach-athlete workflow fit.',
  },
  {
    organization: 'Genius Sports',
    primaryContact: 'Genius Sports Privacy Team',
    email: 'privacy@geniussports.com',
    sourceUrl: 'https://www.geniussports.com/policies/sports-player-privacy-notice/',
    notes:
      'Official site public privacy email. Sports data, broadcast, fan engagement, and analytics platform with major integration surface area.',
  },
  {
    organization: 'Catapult',
    primaryContact: 'Catapult Media Relations Team',
    email: 'media@catapultsports.com',
    sourceUrl: 'https://www.catapult.com/company/about-catapult',
    notes:
      'Official site public media email. Performance analytics and athlete monitoring platform with strong coaching and team operations integration fit.',
  },
  {
    organization: 'Opendorse',
    primaryContact: 'Julian Valentin',
    contactTitle: 'SVP, Collegiate Services & Marketing',
    email: 'julian.valentin@opendorse.com',
    linkedinUrl: 'https://www.linkedin.com/in/julianvalentin',
    sourceUrl:
      'https://biz.opendorse.com/blog/opendorse-collegiate-financial-literacy-partnership/',
    notes:
      'Official Opendorse partnership announcement names Julian Valentin as the direct contact. Public company-domain email verified on-page. Phone not listed on the source page.',
  },
  {
    organization: 'Blast Motion',
    primaryContact: 'Donovan Prostrollo',
    contactTitle: 'Senior Director, Marketing',
    email: 'dprostrollo@blastmotion.com',
    linkedinUrl: 'https://www.linkedin.com/in/donovanpro',
    sourceUrl: 'https://blastmotion.com/news/lpga-professionals/',
    notes:
      'Official Blast Motion partner announcement lists Donovan Prostrollo as the direct media contact with a company-domain email. Strong golf and swing-analysis integration fit.',
  },
  {
    organization: 'Hawk-Eye',
    primaryContact: 'Jeff Krueger',
    contactTitle: 'Commercial Manager',
    email: 'jeff.krueger@hawkeyeinnovations.com',
    linkedinUrl: 'https://www.linkedin.com/in/jeff-krueger-sales-operations-expert',
    sourceUrl: 'https://www.hawkeyeinnovations.com/pgastudios',
    notes:
      'Official Hawk-Eye PGA Studios page lists Jeff Krueger with direct company email and public phone +1 214 534 0534. Broadcast, replay, and media workflow integration fit.',
  },
  {
    organization: 'Spiideo',
    primaryContact: 'Niklas Bergdahl',
    contactTitle: 'Local Media Contact',
    email: 'niklas.bergdahl@spiideo.com',
    sourceUrl:
      'https://www.spiideo.com/news/ai-powered-swedish-sport-tech-spiideo-raises-20-million-in-growth-round-led-by-germanys-cipio-partners/',
    notes:
      'Official Spiideo news page lists Niklas Bergdahl as a local media contact with direct company email and public phone +46 760 333 030. Automated capture and video operations platform with strong sports workflow relevance.',
  },
] as const;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function resolveEnvironment(): RuntimeEnvironment {
  return hasFlag('--staging') ? 'staging' : 'production';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function withNotionRetry<T>(
  config: NotionSignupDashboardConfig,
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < config.maxAttempts) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof NotionIntegrationError) || !error.retryable) {
        throw error;
      }

      if (attempt >= config.maxAttempts) {
        break;
      }

      const backoffMs = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      console.warn(
        `Retrying ${label} after retryable Notion error (${attempt}/${config.maxAttempts}) in ${backoffMs}ms`
      );
      await wait(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed ${label}`);
}

function buildLeadNotes(seed: IntegrationPartnerSeed): string {
  const lines = [
    'Verified public email captured from official company site during integration partner research.',
  ];

  if (seed.contactTitle) {
    lines.push(`Contact Title: ${seed.contactTitle}`);
  }

  if (seed.linkedinUrl) {
    lines.push(`LinkedIn: ${seed.linkedinUrl}`);
  }

  lines.push(`Research Notes: ${seed.notes}`);
  lines.push('Batch: Integration partner leads July 2026.');

  return lines.join('\n');
}

function toLeadInput(
  seed: IntegrationPartnerSeed,
  environment: RuntimeEnvironment
): InvestorsPartnershipLeadInput {
  return {
    environment,
    organization: seed.organization,
    email: seed.email,
    primaryContact: seed.primaryContact,
    type: 'Integration Partner',
    stage: 'Lead',
    leadSource: 'Outbound',
    nextAction: 'Qualify integration fit and prepare initial partnership outreach.',
    sourceUrl: seed.sourceUrl,
    notes: buildLeadNotes(seed),
    timesContacted: 0,
  };
}

async function findExistingLead(
  config: NotionSignupDashboardConfig,
  seed: IntegrationPartnerSeed
): Promise<NotionPageSummary | null> {
  const byEmail = await withNotionRetry(config, `email lookup for ${seed.organization}`, () =>
    queryNotionDatabaseByEmail({
      config,
      property: 'Email',
      email: seed.email,
    })
  );
  if (byEmail) return byEmail;

  const byOrganization = await withNotionRetry(
    config,
    `organization lookup for ${seed.organization}`,
    () =>
      queryNotionDatabase({
        config,
        filter: {
          property: 'Organization / Name',
          title: { equals: seed.organization },
        },
      })
  );
  if (byOrganization) return byOrganization;

  return withNotionRetry(config, `primary contact lookup for ${seed.organization}`, () =>
    queryNotionDatabase({
      config,
      filter: {
        property: 'Primary Contact',
        rich_text: { equals: seed.primaryContact },
      },
    })
  );
}

async function main(): Promise<void> {
  const commit = hasFlag('--commit');
  const environment = resolveEnvironment();
  const config = getNotionInvestorsPartnershipsConfig(environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);

  if (disabledReason) {
    throw new Error(`Notion Investors & Partnerships integration unavailable: ${disabledReason}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Integration Partner Lead Import');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Lead count: ${APPROVED_LEADS.length}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const preflightResults = await Promise.all(
    APPROVED_LEADS.map(async (seed) => ({
      seed,
      existing: await findExistingLead(config, seed),
    }))
  );

  const duplicates = preflightResults.filter((result) => result.existing);
  const netNew = preflightResults.filter((result) => !result.existing);

  console.log(`Preflight net-new: ${netNew.length}`);
  console.log(`Preflight existing: ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log('');
    console.log('Existing matches found:');
    for (const duplicate of duplicates) {
      console.log(
        `  - ${duplicate.seed.organization} <${duplicate.seed.email}> -> ${duplicate.existing?.id}`
      );
    }
    console.log('');
  }

  if (!commit) {
    console.log('Dry run complete. Re-run with --commit to apply inserts.');
    return;
  }

  const results: Array<{
    readonly organization: string;
    readonly email: string;
    readonly status: 'created' | 'existing';
    readonly pageId: string;
    readonly pageUrl?: string;
  }> = [];

  for (const { seed } of netNew) {
    const result = await withNotionRetry(config, `upsert for ${seed.organization}`, () =>
      upsertInvestorsPartnershipLead(toLeadInput(seed, environment))
    );

    if (result.status === 'skipped') {
      throw new Error(`Unexpected skipped result for ${seed.organization}: ${result.reason}`);
    }

    results.push({
      organization: seed.organization,
      email: seed.email,
      status: result.status,
      pageId: result.pageId,
      pageUrl: result.pageUrl,
    });

    console.log(
      `Imported ${seed.organization} <${seed.email}> -> ${result.status} (${result.pageId})`
    );
  }

  const createdCount = results.filter((result) => result.status === 'created').length;
  const existingCount = results.filter((result) => result.status === 'existing').length;

  console.log('');
  console.log('Import complete:');
  console.log(`  created:  ${createdCount}`);
  console.log(`  existing: ${existingCount}`);
  console.log(`  skipped:  ${duplicates.length}`);
  console.log(`  total:    ${results.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Lead import failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
