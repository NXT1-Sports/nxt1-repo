import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  type TeamCallsheetDoc,
  type TeamGamePlanDoc,
  type TeamPracticeScriptDoc,
  type UniversalFileDoc,
  toUniversalFileFromTeamCallsheet,
  toUniversalFileFromTeamGamePlan,
  toUniversalFileFromTeamPracticeScript,
} from '@nxt1/core';

function toPortableTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefinedDeep(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function toUniversalFileDoc(docId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function asGamePlan(document: UniversalFileDoc): TeamGamePlanDoc | null {
  if (document.type !== 'game_plan' || document.payloadKind !== 'native') {
    return null;
  }

  const payload = document.payload;
  return {
    id: document.id,
    teamId: document.teamId,
    sport: document.sport ?? '',
    title: document.title,
    phase: payload.phase,
    status: document.status as TeamGamePlanDoc['status'],
    season: payload.season,
    division: payload.division,
    gameDate: payload.gameDate,
    opponentId: payload.opponentId,
    opponentName: payload.opponentName,
    ownTeamColor: payload.ownTeamColor,
    opponentTeamColor: payload.opponentTeamColor,
    perspectiveTeam: payload.perspectiveTeam,
    identityFocus: payload.identityFocus,
    primaryAttackPlan: payload.primaryAttackPlan,
    defensivePriorities: payload.defensivePriorities,
    specialSituations: payload.specialSituations,
    openingScript: payload.openingScript,
    strengthsWeaknesses: payload.strengthsWeaknesses,
    priorities: payload.priorities,
    planBlocks: payload.planBlocks,
    adjustmentTriggers: payload.adjustmentTriggers,
    halftimePriorities: payload.halftimePriorities,
    customSections: payload.customSections,
    linkedPlays: payload.linkedPlays,
    tags: document.tags,
    linkedPlaybookIds: payload.linkedPlaybookIds,
    scoutingReport: payload.scoutingReport,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    schemaVersion: payload.schemaVersion,
    createdBy: document.createdByUserId ?? '',
    updatedBy: document.updatedByUserId ?? '',
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function asCallsheet(document: UniversalFileDoc): TeamCallsheetDoc | null {
  if (document.type !== 'callsheet' || document.payloadKind !== 'native') {
    return null;
  }

  const payload = document.payload;
  return {
    id: document.id,
    teamId: document.teamId,
    playbookId: payload.playbookId ?? '',
    sport: document.sport,
    title: document.title,
    situation: payload.situation,
    filters: payload.filters,
    plays: payload.plays,
    groups: payload.groups,
    notes: payload.notes,
    source: payload.source,
    archived: payload.archived === true || document.status === 'archived',
    createdAt: document.createdAt,
    createdBy: document.createdByUserId,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedByUserId,
  };
}

function asPracticeScript(document: UniversalFileDoc): TeamPracticeScriptDoc | null {
  if (document.type !== 'practice_script' || document.payloadKind !== 'native') {
    return null;
  }

  const payload = document.payload;
  return {
    id: document.id,
    teamId: document.teamId,
    playbookId: payload.playbookId ?? '',
    sport: document.sport,
    title: document.title,
    focus: payload.focus,
    tempo: payload.tempo,
    scriptDate: payload.scriptDate,
    opponent: payload.opponent,
    objectives: payload.objectives,
    periods: payload.periods,
    notes: payload.notes,
    source: payload.source,
    displayOrder: payload.displayOrder,
    archived: payload.archived === true || document.status === 'archived',
    createdAt: document.createdAt,
    createdBy: document.createdByUserId,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedByUserId,
  };
}

async function loadUniversalDocument(
  db: Firestore,
  documentId: string
): Promise<UniversalFileDoc | null> {
  const snapshot = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(documentId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toUniversalFileDoc(snapshot.id, snapshot.data() ?? {});
}

export async function getUniversalGamePlanById(
  db: Firestore,
  gamePlanId: string
): Promise<TeamGamePlanDoc | null> {
  const document = await loadUniversalDocument(db, gamePlanId);
  return document ? asGamePlan(document) : null;
}

export async function listUniversalGamePlansForTeam(
  db: Firestore,
  teamId: string,
  limit = 100
): Promise<readonly TeamGamePlanDoc[]> {
  const snapshot = await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('teamId', '==', teamId)
    .where('type', '==', 'game_plan')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => asGamePlan(toUniversalFileDoc(doc.id, doc.data() ?? {})))
    .filter((item): item is TeamGamePlanDoc => item !== null);
}

export async function listUniversalGamePlansForUser(
  db: Firestore,
  userId: string,
  limit = 60
): Promise<readonly TeamGamePlanDoc[]> {
  const [updatedBySnapshot, createdBySnapshot] = await Promise.all([
    db
      .collection(UNIVERSAL_FILES_COLLECTION)
      .where('type', '==', 'game_plan')
      .where('updatedByUserId', '==', userId)
      .limit(limit)
      .get(),
    db
      .collection(UNIVERSAL_FILES_COLLECTION)
      .where('type', '==', 'game_plan')
      .where('createdByUserId', '==', userId)
      .limit(limit)
      .get(),
  ]);

  const byId = new Map<string, TeamGamePlanDoc>();
  for (const doc of [...updatedBySnapshot.docs, ...createdBySnapshot.docs]) {
    const gamePlan = asGamePlan(toUniversalFileDoc(doc.id, doc.data() ?? {}));
    if (gamePlan) {
      byId.set(gamePlan.id, gamePlan);
    }
  }

  return [...byId.values()];
}

export async function saveUniversalGamePlan(
  db: Firestore,
  gamePlan: TeamGamePlanDoc
): Promise<void> {
  const universalDoc = pruneUndefinedDeep(
    toUniversalFileFromTeamGamePlan(gamePlan)
  ) as unknown as Record<string, unknown>;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(gamePlan.id)
    .set(universalDoc, { merge: true });
}

export async function getUniversalCallsheetById(
  db: Firestore,
  callsheetId: string
): Promise<TeamCallsheetDoc | null> {
  const document = await loadUniversalDocument(db, callsheetId);
  return document ? asCallsheet(document) : null;
}

export async function listUniversalCallsheetsForPlaybook(
  db: Firestore,
  teamId: string,
  playbookId: string,
  limit = 120
): Promise<readonly TeamCallsheetDoc[]> {
  const snapshot = await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('teamId', '==', teamId)
    .where('type', '==', 'callsheet')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => asCallsheet(toUniversalFileDoc(doc.id, doc.data() ?? {})))
    .filter((item): item is TeamCallsheetDoc => item !== null)
    .filter((item) => item.playbookId === playbookId);
}

export async function saveUniversalCallsheet(
  db: Firestore,
  callsheet: TeamCallsheetDoc
): Promise<void> {
  const universalDoc = pruneUndefinedDeep(
    toUniversalFileFromTeamCallsheet(callsheet)
  ) as unknown as Record<string, unknown>;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(callsheet.id)
    .set(universalDoc, { merge: true });
}

export async function getUniversalPracticeScriptById(
  db: Firestore,
  scriptId: string
): Promise<TeamPracticeScriptDoc | null> {
  const document = await loadUniversalDocument(db, scriptId);
  return document ? asPracticeScript(document) : null;
}

export async function listUniversalPracticeScriptsForPlaybook(
  db: Firestore,
  teamId: string,
  playbookId: string,
  limit = 120
): Promise<readonly TeamPracticeScriptDoc[]> {
  const snapshot = await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('teamId', '==', teamId)
    .where('type', '==', 'practice_script')
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => asPracticeScript(toUniversalFileDoc(doc.id, doc.data() ?? {})))
    .filter((item): item is TeamPracticeScriptDoc => item !== null)
    .filter((item) => item.playbookId === playbookId);
}

export async function saveUniversalPracticeScript(
  db: Firestore,
  script: TeamPracticeScriptDoc
): Promise<void> {
  const universalDoc = pruneUndefinedDeep(
    toUniversalFileFromTeamPracticeScript(script)
  ) as unknown as Record<string, unknown>;
  await db.collection(UNIVERSAL_FILES_COLLECTION).doc(script.id).set(universalDoc, { merge: true });
}
