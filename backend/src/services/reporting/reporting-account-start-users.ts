import type { Firestore } from 'firebase-admin/firestore';
import { getReportingAccountStartDate } from './account-start-date.js';

export interface ReportingAccountStartCandidate {
  readonly userId: string;
  readonly user: Record<string, unknown>;
}

export interface ReportingAccountStartUser extends ReportingAccountStartCandidate {
  readonly accountStartAt: Date;
}

function isWithinInclusiveRange(value: Date, start: Date, end: Date): boolean {
  const timestamp = value.getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

export function selectReportingAccountStartedUsers(
  users: readonly ReportingAccountStartCandidate[],
  start: Date,
  end: Date
): ReportingAccountStartUser[] {
  const uniqueUsers = new Map<string, Record<string, unknown>>();

  for (const { userId, user } of users) {
    if (!uniqueUsers.has(userId)) {
      uniqueUsers.set(userId, user);
    }
  }

  const matches: ReportingAccountStartUser[] = [];

  for (const [userId, user] of uniqueUsers.entries()) {
    const accountStartAt = getReportingAccountStartDate(user);
    if (!accountStartAt || !isWithinInclusiveRange(accountStartAt, start, end)) {
      continue;
    }

    matches.push({ userId, user, accountStartAt });
  }

  return matches;
}

export async function fetchReportingAccountStartedUsers(
  db: Firestore,
  start: Date,
  end: Date
): Promise<ReportingAccountStartUser[]> {
  const stringStart = start.toISOString();
  const stringEnd = end.toISOString();
  const queryRanges = [
    [start, end],
    [stringStart, stringEnd],
  ] as const;

  const fieldPaths = [
    'createdAt',
    'lifecycle.signup.notionDashboard.createdAt',
    'lifecycle.b2cUsers.accountStarted.createdAt',
  ] as const;

  const snapshots = await Promise.all(
    fieldPaths.flatMap((fieldPath) =>
      queryRanges.map(([rangeStart, rangeEnd]) =>
        db
          .collection('Users')
          .where(fieldPath, '>=', rangeStart)
          .where(fieldPath, '<=', rangeEnd)
          .get()
      )
    )
  );

  const candidates: ReportingAccountStartCandidate[] = snapshots.flatMap((snapshot) =>
    snapshot.docs.map((doc) => ({
      userId: doc.id,
      user: doc.data() as Record<string, unknown>,
    }))
  );

  return selectReportingAccountStartedUsers(candidates, start, end);
}
