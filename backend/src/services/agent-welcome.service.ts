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

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, UserRole } from '@nxt1/core';
import { buildAthleteWelcomePrompt, buildTeamWelcomePrompt } from '@nxt1/core';
import { logger } from '../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WelcomeGraphicInput {
  readonly userId: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly sport?: string;
  readonly position?: string;
  readonly profileImageUrl?: string;
  readonly teamName?: string;
  readonly teamLogoUrl?: string;
  readonly teamColors?: readonly string[];
}

// ─── Lazy Queue References ──────────────────────────────────────────────────

let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;

/**
 * Inject queue deps (called by bootstrap — avoid circular imports).
 */
export function setWelcomeDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
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
): Promise<void> {
  if (!queueService || !jobRepository) {
    logger.warn('[Welcome] Agent queue not initialized — skipping welcome graphic', {
      userId: input.userId,
    });
    return;
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
      profileImageUrl: input.profileImageUrl,
      teamColors: input.teamColors,
    });
  }

  const operationId = crypto.randomUUID();
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
      teamName: input.teamName,
      profileImageUrl: input.profileImageUrl,
      teamLogoUrl: input.teamLogoUrl,
      teamColors: input.teamColors,
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
  } catch (err) {
    logger.error('[Welcome] Failed to enqueue welcome graphic job', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
