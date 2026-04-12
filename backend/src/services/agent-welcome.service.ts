/**
 * @fileoverview Agent Welcome Service
 * @module @nxt1/backend/services/agent-welcome
 *
 * Enqueues a welcome graphic generation job when a new user signs up.
 * Routes through the BrandMediaCoordinatorAgent via the standard Agent X queue.
 *
 * This replaces the old static "Welcome to NXT1! 🏆" notification with a
 * personalized AI-generated welcome graphic.
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, UserRole } from '@nxt1/core';
import { buildAthleteWelcomePrompt, buildTeamWelcomePrompt } from '@nxt1/core';
import { logger } from '../utils/logger.js';

const USERS_COLLECTION = 'Users';
const TEAMS_COLLECTION = 'Teams';
const ORGANIZATION_COLLECTIONS = ['organizations', 'Organizations'] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WelcomeGraphicInput {
  readonly userId: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly sport?: string;
  readonly position?: string;
  readonly subjectImageUrl?: string;
  readonly teamName?: string;
  readonly teamLogoUrl?: string;
  readonly teamColors?: readonly string[];
}

export interface WelcomeGraphicGateResult {
  readonly status: 'enqueued' | 'skipped';
  readonly reason:
    | 'enqueued'
    | 'already_queued'
    | 'waiting_for_first_sync'
    | 'missing_image'
    | 'missing_organization'
    | 'user_not_found'
    | 'queue_unavailable'
    | 'enqueue_failed';
}

// ─── Lazy Queue References ──────────────────────────────────────────────────

let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;
let chatService: import('../modules/agent/services/agent-chat.service.js').AgentChatService | null =
  null;

/**
 * Inject queue deps (called by bootstrap — avoid circular imports).
 */
export function setWelcomeDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
  chatService: import('../modules/agent/services/agent-chat.service.js').AgentChatService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function collectTeamColors(team: Record<string, unknown> | undefined): string[] | undefined {
  const legacyColors = Array.isArray(team?.['colors'])
    ? (team['colors'] as unknown[]).filter(
        (value): value is string => typeof value === 'string' && value.trim() !== ''
      )
    : [];
  if (legacyColors.length > 0) return legacyColors;

  const modernColors = [
    asString(team?.['primaryColor']),
    asString(team?.['secondaryColor']),
  ].filter((value): value is string => !!value);
  return modernColors.length > 0 ? modernColors : undefined;
}

function hasCompletedFirstSync(sources: readonly Record<string, unknown>[]): boolean {
  return sources.some((source) => {
    const syncStatus = asString(source['syncStatus']);
    return syncStatus === 'success' || syncStatus === 'error' || source['lastSyncedAt'] != null;
  });
}

function isWaitingForFirstSync(sources: readonly Record<string, unknown>[]): boolean {
  return sources.length > 0 && !hasCompletedFirstSync(sources);
}

function resolveTeamDocId(userData: Record<string, unknown>): string | undefined {
  const teamCode = asRecord(userData['teamCode']);
  return (
    asString(teamCode?.['teamId']) ?? asString(teamCode?.['id']) ?? asString(userData['teamId'])
  );
}

async function resolveOrganizationDocument(
  db: Firestore,
  organizationId: string
): Promise<{
  ref: DocumentReference | null;
  data: Record<string, unknown> | undefined;
}> {
  for (const collectionName of ORGANIZATION_COLLECTIONS) {
    const ref = db.collection(collectionName).doc(organizationId);
    const snapshot = await ref.get();
    if (snapshot.exists) {
      return {
        ref,
        data: (snapshot.data() ?? {}) as Record<string, unknown>,
      };
    }
  }

  return {
    ref: null,
    data: undefined,
  };
}

async function resolveWelcomeGraphicInput(
  db: Firestore,
  userId: string
): Promise<
  | {
      readonly input: WelcomeGraphicInput;
      readonly dedupeRef: DocumentReference;
    }
  | WelcomeGraphicGateResult
> {
  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) {
    return { status: 'skipped', reason: 'user_not_found' };
  }

  const userData = (userSnapshot.data() ?? {}) as Record<string, unknown>;
  const role = (asString(userData['role']) ?? 'athlete') as UserRole;
  const displayName =
    asString(userData['displayName']) ??
    (`${asString(userData['firstName']) ?? ''} ${asString(userData['lastName']) ?? ''}`.trim() ||
      'Athlete');

  if (role === 'coach' || role === 'director') {
    const teamDocId = resolveTeamDocId(userData);
    if (!teamDocId) {
      return { status: 'skipped', reason: 'missing_organization' };
    }

    const teamSnapshot = await db.collection(TEAMS_COLLECTION).doc(teamDocId).get();
    const teamData = teamSnapshot.exists
      ? ((teamSnapshot.data() ?? {}) as Record<string, unknown>)
      : undefined;
    const organizationId = asString(teamData?.['organizationId']);
    if (!organizationId) {
      return { status: 'skipped', reason: 'missing_organization' };
    }

    const organization = await resolveOrganizationDocument(db, organizationId);
    if (!organization.ref || !organization.data) {
      return { status: 'skipped', reason: 'missing_organization' };
    }

    if (organization.data['welcomeGraphicQueued'] === true) {
      return { status: 'skipped', reason: 'already_queued' };
    }

    const relevantSources = (() => {
      const teamSources = asRecordArray(teamData?.['connectedSources']);
      if (teamSources.length > 0) return teamSources;
      return asRecordArray(userData['connectedSources']);
    })();
    if (isWaitingForFirstSync(relevantSources)) {
      return { status: 'skipped', reason: 'waiting_for_first_sync' };
    }

    const teamLogoUrl =
      asString(organization.data['logoUrl']) ??
      asString(teamData?.['logoUrl']) ??
      asString(teamData?.['teamLogoImg']);
    if (!teamLogoUrl) {
      return { status: 'skipped', reason: 'missing_image' };
    }

    const teamColors = collectTeamColors(organization.data) ?? collectTeamColors(teamData);

    return {
      input: {
        userId,
        displayName,
        role,
        sport: asString(teamData?.['sport']) ?? asString(teamData?.['sportName']),
        teamName: asString(organization.data['name']) ?? asString(teamData?.['teamName']),
        teamLogoUrl,
        teamColors,
      },
      dedupeRef: organization.ref,
    };
  }

  if (userData['welcomeGraphicQueued'] === true) {
    return { status: 'skipped', reason: 'already_queued' };
  }

  const connectedSources = asRecordArray(userData['connectedSources']);
  if (isWaitingForFirstSync(connectedSources)) {
    return { status: 'skipped', reason: 'waiting_for_first_sync' };
  }

  const profileImgs = Array.isArray(userData['profileImgs'])
    ? (userData['profileImgs'] as unknown[]).filter(
        (value): value is string => typeof value === 'string' && value.trim() !== ''
      )
    : [];
  const subjectImageUrl = profileImgs[0];
  if (!subjectImageUrl) {
    return { status: 'skipped', reason: 'missing_image' };
  }

  const sports = asRecordArray(userData['sports']);
  const activeSportIndex =
    typeof userData['activeSportIndex'] === 'number' && userData['activeSportIndex'] >= 0
      ? userData['activeSportIndex']
      : 0;
  const primarySport = sports[activeSportIndex] ?? sports[0];
  const team = asRecord(primarySport?.['team']);

  return {
    input: {
      userId,
      displayName,
      role,
      sport: asString(primarySport?.['sport']),
      position: Array.isArray(primarySport?.['positions'])
        ? asString((primarySport?.['positions'] as unknown[])[0])
        : undefined,
      subjectImageUrl,
      teamName: asString(team?.['name']),
      teamLogoUrl: asString(team?.['logoUrl']),
      teamColors: collectTeamColors(team),
    },
    dedupeRef: userRef,
  };
}

export async function enqueueWelcomeGraphicIfReady(
  db: Firestore,
  input: { readonly userId: string },
  environment: 'staging' | 'production' = 'production'
): Promise<WelcomeGraphicGateResult> {
  if (!queueService || !jobRepository) {
    return { status: 'skipped', reason: 'queue_unavailable' };
  }

  try {
    const resolved = await resolveWelcomeGraphicInput(db, input.userId);
    if ('status' in resolved) {
      return resolved;
    }

    await resolved.dedupeRef.update({ welcomeGraphicQueued: true });
    const operationId = await enqueueWelcomeGraphic(db, resolved.input, environment);
    if (!operationId) {
      return { status: 'skipped', reason: 'enqueue_failed' };
    }

    return { status: 'enqueued', reason: 'enqueued' };
  } catch (err) {
    logger.error('[Welcome] Failed to evaluate welcome graphic readiness', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'skipped', reason: 'enqueue_failed' };
  }
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Enqueue a welcome graphic generation job for a newly registered user.
 * Fire-and-forget — callers should not await the graphic completion.
 */
export async function enqueueWelcomeGraphic(
  db: Firestore,
  input: WelcomeGraphicInput,
  environment: 'staging' | 'production' = 'production'
): Promise<string | null> {
  if (!queueService || !jobRepository) {
    logger.warn('[Welcome] Agent queue not initialized — skipping welcome graphic', {
      userId: input.userId,
    });
    return null;
  }

  const isTeam = input.role === 'coach' || input.role === 'director';

  // Build the intent prompt based on user role
  let intent: string;
  if (isTeam && input.teamName) {
    intent = buildTeamWelcomePrompt({
      teamName: input.teamName,
      sport: input.sport,
      logoUrl: input.teamLogoUrl,
      teamColors: input.teamColors,
    });
  } else {
    intent = buildAthleteWelcomePrompt({
      firstName: input.displayName.split(' ')[0] || input.displayName,
      sport: input.sport,
      position: input.position,
      subjectImageUrl: input.subjectImageUrl,
      teamColors: input.teamColors,
    });
  }

  const operationId = crypto.randomUUID();

  // Create a MongoDB thread so the worker persists the result and deep links work
  let threadId: string | undefined;
  if (chatService) {
    try {
      const thread = await chatService.createThread({
        userId: input.userId,
        title: 'Welcome Graphic',
        category: 'graphics',
      });
      threadId = thread.id;

      // Seed the thread with a user-friendly display message so the
      // chat UI looks clean, rather than exposing the massive prompt instructions.
      const displayMessage =
        isTeam && input.teamName
          ? `Can you create a welcome graphic for ${input.teamName}?`
          : `Can you create a welcome graphic for me?`;

      // Seed the thread with a system-initiated user message for context
      await chatService.addMessage({
        threadId,
        userId: input.userId,
        role: 'user',
        content: displayMessage,
        origin: 'database_event',
      });
      logger.info('[Welcome] Thread created for welcome graphic', {
        userId: input.userId,
        threadId,
      });
    } catch (err) {
      logger.warn('[Welcome] Failed to create thread — job will run without persistence', {
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const payload: AgentJobPayload = {
    operationId,
    userId: input.userId,
    intent,
    sessionId: crypto.randomUUID(),
    origin: 'database_event',
    agent: 'brand_media_coordinator',
    context: {
      origin: 'registration',
      userId: input.userId,
      userRole: input.role,
      displayName: input.displayName,
      sport: input.sport,
      position: input.position,
      subjectImageUrl: input.subjectImageUrl,
      teamName: input.teamName,
      teamLogoUrl: input.teamLogoUrl,
      teamColors: input.teamColors,
      ...(threadId ? { threadId } : {}),
    },
  };

  try {
    await jobRepository.withDb(db).create(payload);
    await queueService.enqueue(payload, environment);

    logger.info('[Welcome] Welcome graphic job enqueued', {
      userId: input.userId,
      operationId,
      role: input.role,
      sport: input.sport,
    });
    return operationId;
  } catch (err) {
    logger.error('[Welcome] Failed to enqueue welcome graphic job', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
