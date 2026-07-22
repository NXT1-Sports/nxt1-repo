#!/usr/bin/env tsx
/**
 * @fileoverview Import approved Ohio high school football 2026 outbound leads.
 * @module @nxt1/backend/scripts
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-ohio-hs-football-2026-leads.ts
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-ohio-hs-football-2026-leads.ts --commit
 *   npx tsx --tsconfig tsconfig.scripts.json --import dotenv/config scripts/data-migrations/import-ohio-hs-football-2026-leads.ts --staging
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { RuntimeEnvironment } from '../../src/config/runtime-environment.js';
import {
  getNotionSignupDashboardConfig,
  getNotionSignupDashboardDisabledReason,
  NotionIntegrationError,
  queryNotionDatabase,
  queryNotionDatabaseByEmail,
  type NotionPageSummary,
  type NotionSignupDashboardConfig,
} from '../../src/services/marketing/integrations/notion/notion-client.service.js';
import {
  upsertB2BOutboundLead,
  type B2BOutboundLeadInput,
} from '../../src/services/marketing/integrations/notion/signup-dashboard-entry.service.js';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = resolve(__filename, '../../..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

interface ApprovedLeadSeed {
  readonly organization: string;
  readonly primaryContact: string;
  readonly role: string;
  readonly email: string;
  readonly sourceUrl: string;
  readonly sourceQuality: string;
  readonly notes: string;
}

const APPROVED_LEADS: readonly ApprovedLeadSeed[] = [
  {
    organization: 'New Albany High School',
    primaryContact: 'Mark Solis',
    role: 'Head Football Coach',
    email: 'solis.1@napls.us',
    sourceUrl: 'https://www.naeagles.com/hs-head-coach-directory',
    sourceQuality: 'High - Official school athletics head coach directory',
    notes: 'Competitive Columbus area program, experienced head coach',
  },
  {
    organization: 'Delaware Hayes High School',
    primaryContact: 'Ryan Montgomery',
    role: 'Head Football Coach',
    email: 'montgopa@delawarecityschools.net',
    sourceUrl: 'https://dcsathletics.dcs.k12.oh.us/athletic-department/coaches-directory',
    sourceQuality: 'High - Official school district athletics coaches directory',
    notes: 'Growing program in Delaware County, north of Columbus',
  },
  {
    organization: 'Princeton High School',
    primaryContact: 'Andre Parker',
    role: 'Head Football Coach',
    email: 'Aparker@vikingmail.org',
    sourceUrl: 'https://vikenation.org/sports/football/coaches',
    sourceQuality: 'High - Official school athletics coaching staff page',
    notes: 'Cincinnati area program with competitive Greater Miami Conference',
  },
  {
    organization: 'Gahanna Lincoln High School',
    primaryContact: 'Bruce Ward',
    role: 'Head Football Coach',
    email: 'wardbj@gjps.org',
    sourceUrl: 'https://www.gahannalincolnlions.com/directory',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Columbus suburb program, OCC-Ohio division',
  },
  {
    organization: 'Olentangy Orange High School',
    primaryContact: 'Wes Schroeder',
    role: 'Head Football Coach',
    email: 'wesley_schroeder@olsd.us',
    sourceUrl: 'https://www.olentangyorangeathletics.com/directory',
    sourceQuality: 'High - Official school athletics directory',
    notes: 'Fast-growing program in Delaware County, Division I competitor',
  },
  {
    organization: 'Olentangy Berlin High School',
    primaryContact: 'Mark Nori',
    role: 'Head Football Coach',
    email: 'mark_nori@olsd.us',
    sourceUrl: 'https://www.berlinbearsathletics.com/directory',
    sourceQuality: 'High - Official school athletics directory',
    notes: 'Newer school in Olentangy district, building competitive program',
  },
  {
    organization: 'La Salle High School',
    primaryContact: 'Patrick McLaughlin',
    role: 'Head Football Coach',
    email: 'pmclaughlin@lasallehs.net',
    sourceUrl: 'https://www.golancers.net/football/coaches-4/varsity/',
    sourceQuality: 'High - Official school athletics varsity coaches page',
    notes: 'Cincinnati GCL powerhouse, all-time winningest coach McLaughlin',
  },
  {
    organization: 'Springboro High School',
    primaryContact: 'Ryan Wilhite',
    role: 'Head Football Coach',
    email: 'rwilhite@springboro.org',
    sourceUrl: 'https://www.boropanthers.org/page/21a7d547-67c5-40ae-9f53-ac2f3e9fc4cd',
    sourceQuality: 'High - Official school athletics coaching staff directory',
    notes: 'Dayton area program, consistent playoff competitor',
  },
  {
    organization: 'Reynoldsburg High School',
    primaryContact: 'JoJuan Armour',
    role: 'Head Football Coach',
    email: 'jojuan.armour@reyn.org',
    sourceUrl: 'https://athletics.reyn.org/contact-us',
    sourceQuality: 'High - Official school athletics contact page',
    notes: 'Columbus area program, former NFL player as head coach',
  },
  {
    organization: 'Perrysburg High School',
    primaryContact: 'Dirk Conner',
    role: 'Head Football Coach',
    email: 'dconner@perrysburgschools.net',
    sourceUrl: 'https://www.perrysburgschools.net/Football.aspx',
    sourceQuality: 'High - Official school district football page',
    notes: 'Northwest Ohio program near Toledo, competitive Division I',
  },
  {
    organization: 'Marysville High School',
    primaryContact: 'Mike Young',
    role: 'Head Football Coach',
    email: 'mike.young@mevsd.us',
    sourceUrl: 'https://www.marysvillemonarchs.com/page/4896e855-84ec-44fb-86dc-edd47e5fe9b1',
    sourceQuality: 'High - Official school athletics page with phone',
    notes: 'Central Ohio program, OCC-Capital division',
  },
  {
    organization: 'Brecksville-Broadview Heights High School',
    primaryContact: 'Jason Black',
    role: 'Head Football Coach',
    email: 'blackj@bbhcsd.org',
    sourceUrl: 'https://www.beesathletics.org/page/6201e512-a3a8-498e-8b81-383c01d19256',
    sourceQuality: 'High - Official school athletics fall sports page',
    notes: 'Cleveland suburb program, competitive Division II',
  },
  {
    organization: 'Sycamore High School',
    primaryContact: 'Darryn Chenault',
    role: 'Head Football Coach',
    email: 'chenaultd@sycamoreschools.org',
    sourceUrl: 'https://sycamoreaviators.org/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory with phone',
    notes: 'Cincinnati area program, competitive GMC division',
  },
  {
    organization: 'Oak Hills High School',
    primaryContact: 'Dan Scholz',
    role: 'Head Football Coach',
    email: 'scholz_d@ohlsd.org',
    sourceUrl: 'https://www.oakhillssports.com/football/coaches-4/varsity/',
    sourceQuality: 'High - Official school athletics varsity coaches page',
    notes: 'Cincinnati area program, returning head coach with experience',
  },
  {
    organization: 'Austintown Fitch High School',
    primaryContact: 'T.J. Parker',
    role: 'Head Football Coach',
    email: 'tparker@austintownschools.org',
    sourceUrl: 'https://austintownathletics.com/athletic-directory',
    sourceQuality: 'High - Official school athletics directory',
    notes: 'Youngstown area program, competitive Division II',
  },
  {
    organization: 'St. Ignatius High School',
    primaryContact: 'Tom Kaufman',
    role: 'Head Football Coach',
    email: 'tkaufman@ignatius.edu',
    sourceUrl: 'https://ignatiuswildcats.com/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory with phone',
    notes: 'Cleveland powerhouse program, perennial Division I state contender',
  },
  {
    organization: 'Sidney High School',
    primaryContact: 'Kyle Coleman',
    role: 'Head Football Coach',
    email: 'kyle.coleman@sidneycityschools.org',
    sourceUrl: 'https://www.sidneyjackets.org/directory',
    sourceQuality: 'High - Official school athletics directory',
    notes: 'West Ohio program, Division II competitor',
  },
  {
    organization: 'Piqua High School',
    primaryContact: 'Bill Nees',
    role: 'Head Football Coach',
    email: 'Neesb@piqua.org',
    sourceUrl: 'https://www.piquaathletics.com/sport/football/boys/',
    sourceQuality: 'High - Official school athletics football page',
    notes: 'Dayton area program, MVL division',
  },
  {
    organization: 'Toledo Central Catholic High School',
    primaryContact: 'Greg Dempsey',
    role: 'Head Football Coach & Athletic Director',
    email: 'gdempsey@centralcatholic.org',
    sourceUrl: 'https://www.fightingirishathletics.org/page/93dbd8f7-89dd-4ced-9d0f-0fc9df917187',
    sourceQuality: 'High - Official school athletics coaching/staff directory',
    notes: 'Toledo powerhouse, 2-time recent state champions (2022, 2023)',
  },
  {
    organization: 'Wadsworth High School',
    primaryContact: 'Justin Todd',
    role: 'Head Football Coach',
    email: 'jtodd@wadsworthschools.org',
    sourceUrl: 'https://wadsworthgrizzlyfootball.com/meet-the-coaches',
    sourceQuality: 'High - Official school football program coaches page',
    notes: 'Akron area program, 2025 Cleveland Browns Coach of the Year',
  },
] as const;

const BATCH_3_APPROVED_LEADS: readonly ApprovedLeadSeed[] = [
  {
    organization: 'Mount Vernon High School',
    primaryContact: 'Mark Weber',
    role: 'Head Football Coach',
    email: 'mweber@mvcsd.us',
    sourceUrl: 'https://athletics.mt-vernon.k12.oh.us/sports/football',
    sourceQuality: 'High - Official school athletics football page',
    notes: 'Official athletics football page lists head coach and direct email.',
  },
  {
    organization: 'Taylor High School',
    primaryContact: 'David Dransman',
    role: 'Football - Varsity Head Coach',
    email: 'ths.football@trlsd.org',
    sourceUrl: 'https://taylorathletics.org/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Official athletics staff directory lists varsity head coach and email.',
  },
  {
    organization: 'Notre Dame-Cathedral Latin School',
    primaryContact: 'Sam Vander Ven',
    role: 'Football - Varsity Head Coach',
    email: 'sam.vanderven@ndcl.org',
    sourceUrl: 'https://ndclathletics.org/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Official athletics staff directory lists varsity head coach and email.',
  },
  {
    organization: 'Wyoming High School',
    primaryContact: 'Aaron Hancock',
    role: 'Football - Varsity Head Coach',
    email: 'hancocka@wyomingcityschools.org',
    sourceUrl: 'https://wyomingathletics.org/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Official athletics staff directory lists varsity head coach and email.',
  },
  {
    organization: 'Fairfield High School',
    primaryContact: 'Justin Roden',
    role: 'Football - Varsity Head Coach',
    email: 'roden_j@fairfieldcityschools.com',
    sourceUrl: 'https://fairfieldindians.com/staff-directory',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Official athletics staff directory lists varsity head coach and email.',
  },
  {
    organization: 'Franklin High School',
    primaryContact: 'David Alford',
    role: 'Varsity Head Coach',
    email: 'dalford@franklincityschools.com',
    sourceUrl: 'https://www.gowildcatathletics.com/directory',
    sourceQuality: 'High - Official school athletics coaches directory',
    notes: 'Official athletics coaches directory lists varsity head coach and email.',
  },
  {
    organization: 'Trotwood-Madison High School',
    primaryContact: 'Jeff Graham',
    role: 'Football - Varsity Head Coach',
    email: 'jtg8154@gmail.com',
    sourceUrl: 'https://trotwoodmadisonrams.org/information/directory/index',
    sourceQuality: 'High - Official school athletics staff directory',
    notes: 'Official athletics staff directory lists varsity head coach and email.',
  },
] as const;

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function resolveApprovedLeads(): readonly ApprovedLeadSeed[] {
  return hasFlag('--batch-3-only') ? BATCH_3_APPROVED_LEADS : APPROVED_LEADS;
}

function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function stripOrganizationSuffix(value: string): string {
  return value
    .replace(/[.,]/g, ' ')
    .replace(
      /\b(?:high school|hs|school|academy|club|college|university|athletic department|athletics|prep)\b\s*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOrganizationMatchCandidates(organization: string): readonly string[] {
  const normalized = compactText(organization);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const base = stripOrganizationSuffix(normalized);
  const variantBase = base.length > 0 ? base : normalized;

  if (base.length > 0) {
    candidates.add(base);
  }

  candidates.add(`${variantBase} High School`);
  candidates.add(`${variantBase} School`);
  candidates.add(`${variantBase} HS`);

  return [...candidates].filter((candidate) => candidate.length > 0);
}

function buildOrganizationStartsWithCandidates(organization: string): readonly string[] {
  const normalized = compactText(organization);
  if (!normalized) return [];

  const base = stripOrganizationSuffix(normalized);
  const value = base.length > 0 ? base : normalized;
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 3) return [];

  const prefixes = new Set<string>();
  for (let wordCount = words.length - 1; wordCount >= 2; wordCount -= 1) {
    const prefix = words.slice(0, wordCount).join(' ').trim();
    if (prefix.length >= 4) {
      prefixes.add(prefix);
    }
  }

  return [...prefixes];
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

function buildLeadNotes(seed: ApprovedLeadSeed): string {
  return [
    `Role: ${seed.role}`,
    `Source Quality: ${seed.sourceQuality}`,
    `Research Notes: ${seed.notes}`,
    'Batch: Ohio high school football coaches 2026.',
  ].join('\n');
}

function toLeadInput(
  seed: ApprovedLeadSeed,
  environment: RuntimeEnvironment
): B2BOutboundLeadInput {
  return {
    environment,
    organization: seed.organization,
    email: seed.email,
    primaryContact: seed.primaryContact,
    partnerType: 'School/University',
    stage: 'Lead',
    leadSource: 'Outbound Discovery',
    nextAction: 'Qualify organization and prepare initial outreach.',
    sourceUrl: seed.sourceUrl,
    notes: buildLeadNotes(seed),
  };
}

async function findExistingLead(
  config: NotionSignupDashboardConfig,
  seed: ApprovedLeadSeed
): Promise<NotionPageSummary | null> {
  const byEmail = await withNotionRetry(config, `email lookup for ${seed.organization}`, () =>
    queryNotionDatabaseByEmail({
      config,
      property: 'Email',
      email: seed.email,
    })
  );
  if (byEmail) return byEmail;

  for (const candidate of buildOrganizationMatchCandidates(seed.organization)) {
    const byOrganization = await withNotionRetry(
      config,
      `organization lookup for ${seed.organization}`,
      () =>
        queryNotionDatabase({
          config,
          filter: {
            property: 'Organization',
            title: { equals: candidate },
          },
        })
    );
    if (byOrganization) return byOrganization;
  }

  for (const prefix of buildOrganizationStartsWithCandidates(seed.organization)) {
    const byPrefix = await withNotionRetry(
      config,
      `organization prefix lookup for ${seed.organization}`,
      () =>
        queryNotionDatabase({
          config,
          filter: {
            property: 'Organization',
            title: { starts_with: prefix },
          },
        })
    );
    if (byPrefix) return byPrefix;
  }

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
  const approvedLeads = resolveApprovedLeads();
  const config = getNotionSignupDashboardConfig(environment);
  const disabledReason = getNotionSignupDashboardDisabledReason(config);

  if (disabledReason) {
    throw new Error(`Notion signup dashboard integration unavailable: ${disabledReason}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Ohio HS Football 2026 Lead Import');
  console.log(`  Environment: ${environment}`);
  console.log(`  Mode: ${commit ? 'COMMIT MODE' : 'DRY RUN (no writes)'}`);
  console.log(`  Lead count: ${approvedLeads.length}`);
  console.log(`  Batch scope: ${hasFlag('--batch-3-only') ? 'batch-3 only' : 'full seed list'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const preflightResults = await Promise.all(
    approvedLeads.map(async (seed) => ({
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

  if (duplicates.length > 0) {
    throw new Error('Aborting commit because one or more approved leads now already exist.');
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
      upsertB2BOutboundLead(toLeadInput(seed, environment))
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
  console.log(`  total:    ${results.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Lead import failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
