import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenv } from 'dotenv';

import type { Firestore } from 'firebase-admin/firestore';

import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { syncMarketingReplyMailbox } from '../../src/services/marketing/lifecycle/marketing-reply-mailbox-sync.service.js';
import { suppressMarketingRepliesForInboundMessage } from '../../src/services/marketing/lifecycle/marketing-reply-suppression.service.js';
import { stagingDb } from '../../src/utils/firebase-staging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

dotenv({ path: path.join(backendRoot, '.env') });
dotenv({ path: path.join(backendRoot, '.env.local'), override: true });

const B2B_LEADS_COLLECTION = 'MarketingB2BOutboundLeads';
const INVESTORS_LEADS_COLLECTION = 'MarketingInvestorsPartnershipOutboundLeads';

interface SmokeLeadConfig {
  readonly collection: string;
  readonly id: string;
  readonly data: Record<string, unknown>;
}

function buildSmokeEmail(): string {
  const override = process.env['MARKETING_REPLY_SMOKE_EMAIL']?.trim().toLowerCase();
  if (override) return override;
  return `smoke-reply-${Date.now()}@nxt1smoke.invalid`;
}

function resolveSupportMailboxEmail(): string {
  return (process.env['SUPPORT_EMAIL']?.trim().toLowerCase() || 'support@nxt1sports.com').trim();
}

async function seedLead(db: Firestore, lead: SmokeLeadConfig): Promise<void> {
  await db.collection(lead.collection).doc(lead.id).set(lead.data, { merge: true });
}

async function deleteLead(db: Firestore, lead: SmokeLeadConfig): Promise<void> {
  await db.collection(lead.collection).doc(lead.id).delete();
}

async function readLead(
  db: Firestore,
  collection: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const snapshot = await db.collection(collection).doc(id).get();
  return snapshot.exists ? ((snapshot.data() as Record<string, unknown>) ?? null) : null;
}

function assertLeadSuppressed(lead: Record<string, unknown> | null, label: string): void {
  if (!lead) {
    throw new Error(`${label} smoke lead missing after suppression`);
  }

  if (lead['status'] !== 'replied') {
    throw new Error(`${label} status expected replied, received ${String(lead['status'])}`);
  }

  if (lead['replied'] !== true) {
    throw new Error(`${label} replied expected true, received ${String(lead['replied'])}`);
  }

  if (lead['nextFollowUpAt'] !== null) {
    throw new Error(
      `${label} nextFollowUpAt expected null, received ${String(lead['nextFollowUpAt'])}`
    );
  }

  if (typeof lead['repliedAt'] !== 'string' || !(lead['repliedAt'] as string).includes('T')) {
    throw new Error(`${label} repliedAt was not written`);
  }
}

async function main(): Promise<void> {
  const smokeEmail = buildSmokeEmail();
  const mailboxEmail = resolveSupportMailboxEmail();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const repliedAt = new Date();
  const b2bLeadId = `smoke-b2b-${runId}`;
  const investorsLeadId = `smoke-investors-${runId}`;

  const leads: readonly SmokeLeadConfig[] = [
    {
      collection: B2B_LEADS_COLLECTION,
      id: b2bLeadId,
      data: {
        organization: `SMOKE TEST B2B ${runId}`,
        email: smokeEmail,
        primaryContact: 'Smoke Coach',
        partnerType: 'Club/Academy',
        status: 'contacted',
        replied: false,
        touchCount: 2,
        sourceUrl: 'https://example.invalid/smoke-b2b',
        nextFollowUpAt: '2026-07-10T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        notes: 'Smoke test seed for marketing reply suppression.',
      },
    },
    {
      collection: INVESTORS_LEADS_COLLECTION,
      id: investorsLeadId,
      data: {
        organization: `SMOKE TEST INVESTORS ${runId}`,
        email: smokeEmail,
        primaryContact: 'Smoke Investor',
        leadType: 'Investor',
        status: 'contacted',
        replied: false,
        touchCount: 1,
        sourceUrl: 'https://example.invalid/smoke-investors',
        nextFollowUpAt: '2026-07-11T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        notes: 'Smoke test seed for marketing reply suppression.',
      },
    },
  ];

  console.log('Starting marketing reply suppression live smoke');
  console.log(
    JSON.stringify(
      {
        target: 'staging',
        mailboxEmail,
        smokeEmail,
        runId,
      },
      null,
      2
    )
  );

  try {
    await connectToMongoDB();

    const syncResult = await syncMarketingReplyMailbox({ db: stagingDb });
    console.log('Support mailbox sync result');
    console.log(JSON.stringify(syncResult, null, 2));

    for (const lead of leads) {
      await seedLead(stagingDb, lead);
    }

    const suppressionResult = await suppressMarketingRepliesForInboundMessage({
      db: stagingDb,
      mailboxEmail,
      senderEmail: smokeEmail,
      repliedAt,
      subject: `Smoke Test Reply ${runId}`,
      provider: 'gmail',
      externalThreadId: `smoke-thread-${runId}`,
    });

    console.log('Suppression result');
    console.log(JSON.stringify(suppressionResult, null, 2));

    const [b2bLead, investorsLead] = await Promise.all([
      readLead(stagingDb, B2B_LEADS_COLLECTION, b2bLeadId),
      readLead(stagingDb, INVESTORS_LEADS_COLLECTION, investorsLeadId),
    ]);

    assertLeadSuppressed(b2bLead, 'B2B');
    assertLeadSuppressed(investorsLead, 'Investors');

    console.log('Verification passed');
    console.log(
      JSON.stringify(
        {
          b2b: {
            status: b2bLead?.['status'],
            replied: b2bLead?.['replied'],
            repliedAt: b2bLead?.['repliedAt'],
            nextFollowUpAt: b2bLead?.['nextFollowUpAt'],
          },
          investors: {
            status: investorsLead?.['status'],
            replied: investorsLead?.['replied'],
            repliedAt: investorsLead?.['repliedAt'],
            nextFollowUpAt: investorsLead?.['nextFollowUpAt'],
          },
        },
        null,
        2
      )
    );
  } finally {
    for (const lead of leads) {
      await deleteLead(stagingDb, lead);
    }
    await disconnectFromMongoDB();
    console.log('Cleaned up Firestore smoke docs');
  }
}

main().catch((error) => {
  console.error('Marketing reply suppression smoke failed');
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
