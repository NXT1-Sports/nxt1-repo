import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

type MatchCandidate = {
  teamId: string;
  teamName: string;
  sport: string;
  classOf: number;
  firstName: string;
  lastName: string;
};

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRosterName(data: FirebaseFirestore.DocumentData): {
  firstName: string;
  lastName: string;
} {
  const firstName = typeof data['firstName'] === 'string' ? normalize(data['firstName']) : '';
  const lastName = typeof data['lastName'] === 'string' ? normalize(data['lastName']) : '';

  if (firstName && lastName) {
    return { firstName, lastName };
  }

  const displayName = typeof data['displayName'] === 'string' ? data['displayName'].trim() : '';
  if (!displayName) {
    return { firstName, lastName };
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName, lastName };
  }

  return {
    firstName: firstName || normalize(parts[0]),
    lastName: lastName || normalize(parts.slice(1).join(' ')),
  };
}

function parseClassOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 3000) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 3000) {
      return parsed;
    }
  }
  return null;
}

function splitName(data: FirebaseFirestore.DocumentData): { firstName: string; lastName: string } {
  const firstName = typeof data['firstName'] === 'string' ? data['firstName'].trim() : '';
  const lastName = typeof data['lastName'] === 'string' ? data['lastName'].trim() : '';

  if (firstName && lastName) {
    return { firstName: normalize(firstName), lastName: normalize(lastName) };
  }

  const displayName =
    typeof data['displayName'] === 'string'
      ? data['displayName'].trim()
      : typeof data['name'] === 'string'
        ? data['name'].trim()
        : '';

  if (!displayName) {
    return { firstName: normalize(firstName), lastName: normalize(lastName) };
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: normalize(firstName), lastName: normalize(lastName) };
  }

  return {
    firstName: normalize(firstName || parts[0]),
    lastName: normalize(lastName || parts.slice(1).join(' ')),
  };
}

function extractCandidates(
  userId: string,
  data: FirebaseFirestore.DocumentData
): readonly MatchCandidate[] {
  const name = splitName(data);
  if (!name.firstName || !name.lastName) {
    return [];
  }

  const fallbackClassOf = parseClassOf(data['classOf']);
  const teamCode =
    data['teamCode'] && typeof data['teamCode'] === 'object'
      ? (data['teamCode'] as Record<string, unknown>)
      : null;

  const candidates = new Map<string, MatchCandidate>();

  const addCandidate = (input: {
    teamId?: string;
    teamName?: string;
    sport?: string;
    classOf?: unknown;
  }): void => {
    const teamId = normalize(input.teamId);
    const teamName = normalize(input.teamName);
    const sport = normalize(input.sport);
    const classOf = parseClassOf(input.classOf) ?? fallbackClassOf;

    if (!teamId || !teamName || !sport || classOf === null) {
      return;
    }

    const key = `${teamId}|${teamName}|${sport}|${classOf}|${name.firstName}|${name.lastName}`;
    candidates.set(key, {
      teamId,
      teamName,
      sport,
      classOf,
      firstName: name.firstName,
      lastName: name.lastName,
    });
  };

  if (teamCode) {
    addCandidate({
      teamId: typeof teamCode['teamId'] === 'string' ? teamCode['teamId'] : undefined,
      teamName:
        typeof teamCode['teamName'] === 'string'
          ? teamCode['teamName']
          : typeof teamCode['name'] === 'string'
            ? teamCode['name']
            : undefined,
      sport:
        typeof teamCode['sport'] === 'string'
          ? teamCode['sport']
          : typeof data['primarySport'] === 'string'
            ? data['primarySport']
            : undefined,
      classOf: teamCode['classOf'] ?? fallbackClassOf,
    });
  }

  const sports = Array.isArray(data['sports'])
    ? (data['sports'] as Array<Record<string, unknown>>)
    : [];
  for (const sportProfile of sports) {
    const team =
      sportProfile['team'] && typeof sportProfile['team'] === 'object'
        ? (sportProfile['team'] as Record<string, unknown>)
        : null;

    addCandidate({
      teamId: team && typeof team['teamId'] === 'string' ? team['teamId'] : undefined,
      teamName:
        team && typeof team['name'] === 'string'
          ? team['name']
          : team && typeof team['teamName'] === 'string'
            ? team['teamName']
            : undefined,
      sport: typeof sportProfile['sport'] === 'string' ? sportProfile['sport'] : undefined,
      classOf: sportProfile['classOf'] ?? fallbackClassOf,
    });
  }

  logger.debug('Computed pending roster link candidates', {
    userId,
    candidateCount: candidates.size,
  });

  return [...candidates.values()];
}

export async function linkPendingRosterEntriesForUser(params: {
  userId: string;
  userData: FirebaseFirestore.DocumentData;
}): Promise<void> {
  const { userId, userData } = params;
  const db = admin.firestore();

  const candidates = extractCandidates(userId, userData);
  if (candidates.length === 0) {
    return;
  }

  const unicode = typeof userData['unicode'] === 'string' ? userData['unicode'].trim() : '';
  const profileCode = unicode || userId;
  const firstName = typeof userData['firstName'] === 'string' ? userData['firstName'].trim() : '';
  const lastName = typeof userData['lastName'] === 'string' ? userData['lastName'].trim() : '';
  const displayName =
    typeof userData['displayName'] === 'string' && userData['displayName'].trim()
      ? userData['displayName'].trim()
      : [firstName, lastName].filter(Boolean).join(' ');

  const linkedEntryIds = new Set<string>();
  const pendingByTeam = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

  for (const candidate of candidates) {
    let pendingDocs = pendingByTeam.get(candidate.teamId);
    if (!pendingDocs) {
      const query = await db
        .collection('RosterEntries')
        .where('status', '==', 'pending')
        .where('teamId', '==', candidate.teamId)
        .get();
      pendingDocs = query.docs;
      pendingByTeam.set(candidate.teamId, pendingDocs);
    }

    const matchingDocs = pendingDocs.filter((doc) => {
      const data = doc.data() ?? {};
      const classOf = parseClassOf(data['classOfWhenJoined'] ?? data['classOf']);
      const sport = normalize(typeof data['sport'] === 'string' ? data['sport'] : undefined);
      const teamName = normalize(
        typeof data['teamName'] === 'string'
          ? data['teamName']
          : typeof data['team'] === 'string'
            ? data['team']
            : undefined
      );
      const rosterName = normalizeRosterName(data);

      return (
        classOf === candidate.classOf &&
        sport === candidate.sport &&
        teamName === candidate.teamName &&
        rosterName.firstName === candidate.firstName &&
        rosterName.lastName === candidate.lastName
      );
    });

    if (matchingDocs.length === 0) {
      continue;
    }

    if (matchingDocs.length > 1) {
      logger.warn('Pending roster auto-link skipped due to ambiguity', {
        userId,
        teamId: candidate.teamId,
        teamName: candidate.teamName,
        sport: candidate.sport,
        classOf: candidate.classOf,
      });
      continue;
    }

    const doc = matchingDocs[0];
    if (!doc || linkedEntryIds.has(doc.id)) {
      continue;
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const data = snap.data() ?? {};

      if (String(data['status'] ?? '').toLowerCase() !== 'pending') {
        return;
      }

      tx.set(
        doc.ref,
        {
          userId,
          status: 'active',
          ...(unicode ? { unicode } : {}),
          profileCode,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(displayName ? { displayName } : {}),
          claimStatus: admin.firestore.FieldValue.delete(),
          pendingMatchFirstName: admin.firestore.FieldValue.delete(),
          pendingMatchLastName: admin.firestore.FieldValue.delete(),
          pendingMatchSport: admin.firestore.FieldValue.delete(),
          pendingMatchClassOf: admin.firestore.FieldValue.delete(),
          pendingMatchTeamName: admin.firestore.FieldValue.delete(),
          pendingMatchVersion: admin.firestore.FieldValue.delete(),
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    linkedEntryIds.add(doc.id);
  }

  if (linkedEntryIds.size > 0) {
    logger.info('Pending roster entries auto-linked', {
      userId,
      linkedCount: linkedEntryIds.size,
      entryIds: [...linkedEntryIds],
    });
  }
}
