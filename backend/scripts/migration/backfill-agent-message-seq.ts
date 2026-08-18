import 'dotenv/config';
import { connectToMongoDB, disconnectFromMongoDB } from '../../src/config/database.config.js';
import { AgentThreadModel } from '../../src/models/agent/agent-thread.model.js';
import { AgentMessageModel } from '../../src/models/agent/agent-message.model.js';

/**
 * Backfill deterministic ordering fields (`seq`, `turnSeq`) on existing
 * `AgentMessage` rows and seed `AgentThread.messageSeqCounter`.
 *
 * Ordering model (matches AgentChatService.addMessage):
 *   - Messages are numbered `seq = 1..N` in `createdAt` order.
 *   - `user` rows open a turn: `turnSeq = seq`.
 *   - assistant/tool/system rows inherit the `turnSeq` of the user row that
 *     started their operation (matched by `operationId`); when the operation's
 *     user row can't be matched (legacy rows without operationId), they anchor
 *     to the most recent user turn seen so far.
 *
 * Safe to re-run: threads whose messages already all carry `seq` are skipped
 * unless `--force` is passed. Use `--dry-run` to preview and `--thread=<id>`
 * to scope to a single thread.
 */

interface RawMessageRow {
  readonly _id: unknown;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly operationId?: string;
  readonly createdAt?: string;
  readonly seq?: number;
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const threadArg = process.argv.slice(2).find((a) => a.startsWith('--thread='));
const onlyThreadId = threadArg ? threadArg.split('=')[1] : undefined;

async function backfillThread(threadId: string): Promise<{ updated: number; skipped: boolean }> {
  const rows = (await AgentMessageModel.find({ threadId, deletedAt: null })
    .select('_id role operationId createdAt seq')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .exec()) as unknown as RawMessageRow[];

  if (rows.length === 0) return { updated: 0, skipped: true };

  const alreadyComplete = rows.every((row) => typeof row.seq === 'number');
  if (alreadyComplete && !force) return { updated: 0, skipped: true };

  const operationTurnSeq = new Map<string, number>();
  let lastUserTurnSeq = 0;
  const updates: { id: unknown; seq: number; turnSeq: number }[] = [];

  rows.forEach((row, index) => {
    const seq = index + 1;
    const operationId = row.operationId?.trim();

    let turnSeq: number;
    if (row.role === 'user') {
      turnSeq = seq;
      lastUserTurnSeq = seq;
      if (operationId) operationTurnSeq.set(operationId, seq);
    } else if (operationId && operationTurnSeq.has(operationId)) {
      turnSeq = operationTurnSeq.get(operationId)!;
    } else {
      turnSeq = lastUserTurnSeq > 0 ? lastUserTurnSeq : seq;
    }

    updates.push({ id: row._id, seq, turnSeq });
  });

  if (dryRun) return { updated: updates.length, skipped: false };

  await AgentMessageModel.bulkWrite(
    updates.map((u) => ({
      updateOne: {
        filter: { _id: u.id },
        update: { $set: { seq: u.seq, turnSeq: u.turnSeq } },
      },
    }))
  );

  await AgentThreadModel.updateOne(
    { _id: threadId },
    { $set: { messageSeqCounter: rows.length } }
  ).exec();

  return { updated: updates.length, skipped: false };
}

async function run(): Promise<void> {
  await connectToMongoDB();

  const threadIds = onlyThreadId
    ? [onlyThreadId]
    : (
        (await AgentThreadModel.find({}).select('_id').lean().exec()) as unknown as {
          _id: unknown;
        }[]
      ).map((t) => String(t._id));

  console.log(
    `[backfill-agent-message-seq] ${dryRun ? '(dry-run) ' : ''}Processing ${threadIds.length} thread(s)...`
  );

  let processed = 0;
  let updatedThreads = 0;
  let updatedMessages = 0;

  for (const threadId of threadIds) {
    const { updated, skipped } = await backfillThread(threadId);
    processed += 1;
    if (!skipped) {
      updatedThreads += 1;
      updatedMessages += updated;
    }
    if (processed % 100 === 0) {
      console.log(`  ...${processed}/${threadIds.length} threads scanned`);
    }
  }

  console.log(
    `[backfill-agent-message-seq] Done. Threads updated: ${updatedThreads}, messages updated: ${updatedMessages}.`
  );

  await disconnectFromMongoDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('[backfill-agent-message-seq] Failed', err);
  process.exit(1);
});
