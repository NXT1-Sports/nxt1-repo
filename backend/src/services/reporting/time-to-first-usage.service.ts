import type { Firestore } from 'firebase-admin/firestore';
import { AgentMessageModel } from '../../models/agent/agent-message.model.js';

type Segment = 'b2b' | 'b2c';

export interface TimeToFirstUsageMedianResult {
  readonly total?: number;
  readonly b2b?: number;
  readonly b2c?: number;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate();
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    return seconds === null ? null : new Date(seconds * 1000);
  }

  return null;
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function medianFrom(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Number(median.toFixed(1));
}

export async function calculateMedianTimeToFirstUsageHours(
  db: Firestore,
  start: Date,
  end: Date,
  classifySegment?: (user: Record<string, unknown>) => Segment
): Promise<TimeToFirstUsageMedianResult> {
  const totalTimes: number[] = [];
  const b2bTimes: number[] = [];
  const b2cTimes: number[] = [];

  const signupSnapshot = await db
    .collection('Users')
    .where('lifecycle.signup.notionDashboard.createdAt', '>=', start)
    .where('lifecycle.signup.notionDashboard.createdAt', '<=', end)
    .select('lifecycle.signup.notionDashboard.createdAt', 'lifecycle', 'onboardingCompletedAt')
    .get();

  if (signupSnapshot.empty) {
    return {};
  }

  for (const userDoc of signupSnapshot.docs) {
    const userData = userDoc.data() as Record<string, unknown>;
    const signupTimestamp = toDate(getPath(userData, 'lifecycle.signup.notionDashboard.createdAt'));
    if (!signupTimestamp) continue;

    const firstMessage = await AgentMessageModel.findOne({ userId: userDoc.id, role: 'user' })
      .select({ createdAt: 1 })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    if (!firstMessage?.createdAt) continue;

    const messageDate =
      typeof firstMessage.createdAt === 'string'
        ? new Date(firstMessage.createdAt)
        : (firstMessage.createdAt as Date);
    if (Number.isNaN(messageDate.getTime())) continue;

    const hoursElapsed = (messageDate.getTime() - signupTimestamp.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed < 0) continue;

    totalTimes.push(hoursElapsed);
    if (classifySegment) {
      const segment = classifySegment(userData);
      if (segment === 'b2b') b2bTimes.push(hoursElapsed);
      else b2cTimes.push(hoursElapsed);
    }
  }

  return {
    total: medianFrom(totalTimes),
    ...(classifySegment
      ? {
          b2b: medianFrom(b2bTimes),
          b2c: medianFrom(b2cTimes),
        }
      : {}),
  };
}
