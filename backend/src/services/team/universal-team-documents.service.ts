import type { Firestore } from 'firebase-admin/firestore';
import {
  UNIVERSAL_FILES_COLLECTION,
  getUniversalStructuredDocumentPayload,
  type TeamCallsheetDoc,
  type TeamGamePlanDoc,
  type TeamPracticeScriptDoc,
  type UniversalCallsheetFilePayload,
  type UniversalFileDoc,
  type UniversalGamePlanPayload,
  type UniversalPracticeScriptFilePayload,
  toUniversalFileFromTeamCallsheet,
  toUniversalFileFromTeamGamePlan,
  toUniversalFileFromTeamPracticeScript,
} from '@nxt1/core';
import { scheduleUniversalFileSemanticSync } from './universal-file-semantic.service.js';

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

function getPrimaryClassification(document: UniversalFileDoc): string | undefined {
  const classificationRoute = document.classification?.route;
  if (typeof classificationRoute === 'string' && classificationRoute.trim().length > 0) {
    return classificationRoute.trim();
  }

  const classificationPrimary = document.classification?.primary;
  if (typeof classificationPrimary === 'string' && classificationPrimary.trim().length > 0) {
    return classificationPrimary.trim();
  }

  return document.type !== 'file' ? document.type : undefined;
}

function getContentPayload<T extends object>(
  payload: unknown
): { readonly data?: T; readonly text?: string } | null {
  if (payload && typeof payload === 'object' && 'content' in payload) {
    const content = (payload as { content?: unknown }).content;
    if (content && typeof content === 'object') {
      const data =
        'data' in content &&
        (content as { data?: unknown }).data &&
        typeof (content as { data?: unknown }).data === 'object'
          ? ((content as { data: T }).data ?? undefined)
          : undefined;
      const text =
        typeof (content as { text?: unknown }).text === 'string'
          ? (content as { text: string }).text
          : undefined;

      if (data || text) {
        return {
          ...(data ? { data } : {}),
          ...(text ? { text } : {}),
        };
      }
    }
  }

  const structuredPayload = getUniversalStructuredDocumentPayload(payload);
  if (!structuredPayload?.structuredData && !structuredPayload?.textContent) {
    return null;
  }

  return {
    ...(structuredPayload.structuredData ? { data: structuredPayload.structuredData as T } : {}),
    ...(structuredPayload.textContent ? { text: structuredPayload.textContent } : {}),
  };
}

function getDocumentSubtype(document: UniversalFileDoc): string | undefined {
  return getPrimaryClassification(document);
}

function getStructuredPayload<T extends object>(
  document: UniversalFileDoc,
  subtype: string
): T | null {
  if (document.payloadKind !== 'native') {
    return null;
  }

  const contentPayload = getContentPayload<T>(document.payload);
  const structuredPayload = getUniversalStructuredDocumentPayload(document.payload);
  const documentSubtype = getDocumentSubtype(document);

  if (document.type === subtype) {
    if (contentPayload?.data) {
      return contentPayload.data as T;
    }
    if (structuredPayload?.structuredData) {
      return structuredPayload.structuredData as T;
    }
    return document.payload as T;
  }

  if (document.type === 'file' && documentSubtype === subtype) {
    if (contentPayload?.data) {
      return contentPayload.data as T;
    }
    if (structuredPayload?.structuredData) {
      return structuredPayload.structuredData as T;
    }
  }

  return null;
}

async function queryDocumentsBySubtype(params: {
  readonly db: Firestore;
  readonly teamId?: string;
  readonly userId?: string;
  readonly userField?: 'updatedByUserId' | 'createdByUserId';
  readonly subtype: 'game_plan' | 'callsheet' | 'practice_script';
  readonly limit: number;
}): Promise<readonly UniversalFileDoc[]> {
  const { db, teamId, userId, userField, subtype, limit } = params;
  const legacyQuery = db.collection(UNIVERSAL_FILES_COLLECTION).where('type', '==', subtype);
  const classifiedFileQuery = db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .where('type', '==', 'file')
    .where('classification.primary', '==', subtype);

  const scopedLegacyQuery = teamId
    ? legacyQuery.where('teamId', '==', teamId)
    : userField && userId
      ? legacyQuery.where(userField, '==', userId)
      : legacyQuery;
  const scopedClassifiedFileQuery = teamId
    ? classifiedFileQuery.where('teamId', '==', teamId)
    : userField && userId
      ? classifiedFileQuery.where(userField, '==', userId)
      : classifiedFileQuery;

  const [legacySnapshot, classifiedFileSnapshot] = await Promise.all([
    scopedLegacyQuery.orderBy('updatedAt', 'desc').limit(limit).get(),
    scopedClassifiedFileQuery.orderBy('updatedAt', 'desc').limit(limit).get(),
  ]);

  const byId = new Map<string, UniversalFileDoc>();
  for (const doc of [...legacySnapshot.docs, ...classifiedFileSnapshot.docs]) {
    byId.set(doc.id, toUniversalFileDoc(doc.id, doc.data() ?? {}));
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        Date.parse(toPortableTimestamp(right.updatedAt)) -
        Date.parse(toPortableTimestamp(left.updatedAt))
    )
    .slice(0, limit);
}

function asGamePlan(document: UniversalFileDoc): TeamGamePlanDoc | null {
  const payload = getStructuredPayload<UniversalGamePlanPayload>(document, 'game_plan');
  if (!payload) {
    return null;
  }

  return {
    id: document.id,
    teamId: document.teamId ?? '',
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
    sourceDocumentIds: payload.sourceDocumentIds ?? payload.linkedPlaybookIds,
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
  const payload = getStructuredPayload<UniversalCallsheetFilePayload>(document, 'callsheet');
  if (!payload) {
    return null;
  }

  return {
    id: document.id,
    teamId: document.teamId ?? '',
    sourceDocumentId: payload.sourceDocumentId ?? payload.playbookId ?? '',
    playbookId: payload.playbookId ?? payload.sourceDocumentId ?? '',
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
  const payload = getStructuredPayload<UniversalPracticeScriptFilePayload>(
    document,
    'practice_script'
  );
  if (!payload) {
    return null;
  }

  return {
    id: document.id,
    teamId: document.teamId ?? '',
    sourceDocumentId: payload.sourceDocumentId ?? payload.playbookId ?? '',
    playbookId: payload.playbookId ?? payload.sourceDocumentId ?? '',
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

async function scanTeamDocumentsBySubtype(params: {
  readonly db: Firestore;
  readonly teamId: string;
  readonly subtype: 'callsheet' | 'practice_script';
  readonly limit: number;
  readonly matchDocument?: (document: UniversalFileDoc) => boolean;
}): Promise<readonly UniversalFileDoc[]> {
  const { db, teamId, subtype, limit, matchDocument } = params;
  const batchSize = Math.max(limit * 2, 50);
  const matches: UniversalFileDoc[] = [];
  let offset = 0;

  while (matches.length < limit) {
    const snapshot = await db
      .collection(UNIVERSAL_FILES_COLLECTION)
      .where('teamId', '==', teamId)
      .orderBy('updatedAt', 'desc')
      .offset(offset)
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      break;
    }

    const filtered = snapshot.docs
      .map((doc) => toUniversalFileDoc(doc.id, doc.data() ?? {}))
      .filter((document) => getDocumentSubtype(document) === subtype)
      .filter((document) => (matchDocument ? matchDocument(document) : true));

    matches.push(...filtered);
    offset += snapshot.size;

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return matches.slice(0, limit);
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
  const documents = await queryDocumentsBySubtype({ db, teamId, subtype: 'game_plan', limit });

  return documents
    .map((doc) => asGamePlan(doc))
    .filter((item): item is TeamGamePlanDoc => item !== null);
}

export async function listUniversalGamePlansForUser(
  db: Firestore,
  userId: string,
  limit = 60
): Promise<readonly TeamGamePlanDoc[]> {
  const [updatedDocuments, createdDocuments] = await Promise.all([
    queryDocumentsBySubtype({
      db,
      userId,
      userField: 'updatedByUserId',
      subtype: 'game_plan',
      limit,
    }),
    queryDocumentsBySubtype({
      db,
      userId,
      userField: 'createdByUserId',
      subtype: 'game_plan',
      limit,
    }),
  ]);

  const byId = new Map<string, TeamGamePlanDoc>();
  for (const doc of [...updatedDocuments, ...createdDocuments]) {
    const gamePlan = asGamePlan(doc);
    if (gamePlan) {
      byId.set(gamePlan.id, gamePlan);
    }
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        Date.parse(toPortableTimestamp(right.updatedAt)) -
        Date.parse(toPortableTimestamp(left.updatedAt))
    )
    .slice(0, limit);
}

export async function saveUniversalGamePlan(
  db: Firestore,
  gamePlan: TeamGamePlanDoc
): Promise<void> {
  const projectedDocument = toUniversalFileFromTeamGamePlan(gamePlan);
  const universalDoc = pruneUndefinedDeep(projectedDocument) as unknown as Record<string, unknown>;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(gamePlan.id)
    .set(universalDoc, { merge: true });
  scheduleUniversalFileSemanticSync({ db, document: projectedDocument });
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
  const documents = await scanTeamDocumentsBySubtype({
    db,
    teamId,
    subtype: 'callsheet',
    limit,
    matchDocument: (document) =>
      (() => {
        const payload = getStructuredPayload<{
          playbookId?: string;
          sourceDocumentId?: string;
        }>(document, 'callsheet');
        return payload?.sourceDocumentId === playbookId || payload?.playbookId === playbookId;
      })(),
  });

  return documents
    .map((doc) => asCallsheet(doc))
    .filter((item): item is TeamCallsheetDoc => item !== null)
    .slice(0, limit);
}

export async function saveUniversalCallsheet(
  db: Firestore,
  callsheet: TeamCallsheetDoc
): Promise<void> {
  const projectedDocument = toUniversalFileFromTeamCallsheet(callsheet);
  const universalDoc = pruneUndefinedDeep(projectedDocument) as unknown as Record<string, unknown>;
  await db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(callsheet.id)
    .set(universalDoc, { merge: true });
  scheduleUniversalFileSemanticSync({ db, document: projectedDocument });
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
  const documents = await scanTeamDocumentsBySubtype({
    db,
    teamId,
    subtype: 'practice_script',
    limit,
    matchDocument: (document) =>
      (() => {
        const payload = getStructuredPayload<{
          playbookId?: string;
          sourceDocumentId?: string;
        }>(document, 'practice_script');
        return payload?.sourceDocumentId === playbookId || payload?.playbookId === playbookId;
      })(),
  });

  return documents
    .map((doc) => asPracticeScript(doc))
    .filter((item): item is TeamPracticeScriptDoc => item !== null)
    .slice(0, limit);
}

export async function saveUniversalPracticeScript(
  db: Firestore,
  script: TeamPracticeScriptDoc
): Promise<void> {
  const projectedDocument = toUniversalFileFromTeamPracticeScript(script);
  const universalDoc = pruneUndefinedDeep(projectedDocument) as unknown as Record<string, unknown>;
  await db.collection(UNIVERSAL_FILES_COLLECTION).doc(script.id).set(universalDoc, { merge: true });
  scheduleUniversalFileSemanticSync({ db, document: projectedDocument });
}
