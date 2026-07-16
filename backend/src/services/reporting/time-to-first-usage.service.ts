import type { Firestore } from 'firebase-admin/firestore';
import { AgentMessageModel } from '../../models/agent/agent-message.model.js';
import { getReportingAccountStartDate } from './account-start-date.js';

type Segment = 'b2b' | 'b2c';

export interface TimeToFirstUsageMedianResult {
  readonly total?: number;
  readonly b2b?: number;
  readonly b2c?: number;
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

  const [b2bSnapshot, b2cSnapshot] = await Promise.all([
    db
      .collection('Users')
      .where('lifecycle.signup.notionDashboard.createdAt', '>=', start)
      .where('lifecycle.signup.notionDashboard.createdAt', '<=', end)
      .select(
        'lifecycle.signup.notionDashboard.createdAt',
        'lifecycle.b2cUsers.accountStarted.createdAt',
        'lifecycle',
        'onboardingCompletedAt',
        'createdAt'
      )
      .get(),
    db
      .collection('Users')
      .where('lifecycle.b2cUsers.accountStarted.createdAt', '>=', start)
      .where('lifecycle.b2cUsers.accountStarted.createdAt', '<=', end)
      .select(
        'lifecycle.signup.notionDashboard.createdAt',
        'lifecycle.b2cUsers.accountStarted.createdAt',
        'lifecycle',
        'onboardingCompletedAt',
        'createdAt'
      )
      .get(),
  ]);

  const userDocs = new Map<string, Record<string, unknown>>();

  for (const snapshot of [b2bSnapshot, b2cSnapshot]) {
    for (const userDoc of snapshot.docs) {
      userDocs.set(userDoc.id, userDoc.data() as Record<string, unknown>);
    }
  }

  if (userDocs.size === 0) {
    return {};
  }

  for (const [userId, userData] of userDocs.entries()) {
    const signupTimestamp = getReportingAccountStartDate(userData);
    if (!signupTimestamp) continue;

    const firstMessage = await AgentMessageModel.findOne({ userId, role: 'user' })
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
