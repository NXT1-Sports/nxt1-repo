import { buildCanonicalProfilePath, type AgentIdentifier } from '@nxt1/core';
import type { RuntimeEnvironment } from '../../../config/runtime-environment.js';
import { sendSlackAlert } from '../../platform/alert.service.js';
import { toAbsoluteAppUrl } from '../../../utils/app-url.js';

type ProfileUserData = Record<string, unknown>;

interface AgentDeliverableGeneratedLifecycleInput {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly operationId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly agentId?: AgentIdentifier;
  readonly title?: string;
  readonly summary?: string;
  readonly deliverables: readonly {
    readonly url: string;
    readonly name: string;
    readonly type: 'image' | 'video';
    readonly mimeType?: string;
    readonly thumbnailUrl?: string;
    readonly storagePath?: string;
  }[];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function resolvePrimarySport(user: ProfileUserData): string | undefined {
  const sports = Array.isArray(user['sports']) ? (user['sports'] as Array<{ sport?: string }>) : [];
  const activeSportIndex = Number(user['activeSportIndex']);

  return (
    sports[Number.isFinite(activeSportIndex) && activeSportIndex >= 0 ? activeSportIndex : 0]
      ?.sport ??
    sports[0]?.sport ??
    (typeof user['sport'] === 'string' ? user['sport'] : undefined)
  );
}

function resolveAthleteName(user: ProfileUserData): string {
  const firstName = typeof user['firstName'] === 'string' ? user['firstName'].trim() : '';
  const lastName = typeof user['lastName'] === 'string' ? user['lastName'].trim() : '';
  const displayName = typeof user['displayName'] === 'string' ? user['displayName'].trim() : '';
  const username = typeof user['username'] === 'string' ? user['username'].trim() : '';

  return (
    [firstName, lastName].filter(Boolean).join(' ') || displayName || username || 'NXT1 Athlete'
  );
}

async function resolveCanonicalProfileUrl(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
}): Promise<string | null> {
  const userDoc = await input.db.collection('Users').doc(input.userId).get();
  if (!userDoc.exists) {
    return null;
  }

  const user = userDoc.data();
  if (!user) return null;

  const unicode =
    typeof user['unicode'] === 'string' || typeof user['unicode'] === 'number'
      ? user['unicode']
      : input.userId;

  const profilePath = buildCanonicalProfilePath({
    athleteName: resolveAthleteName(user),
    sport: resolvePrimarySport(user),
    unicode,
    id: input.userId,
  });

  return toAbsoluteAppUrl(profilePath, { environment: input.environment });
}

export async function processAgentDeliverableGeneratedLifecycle(
  input: AgentDeliverableGeneratedLifecycleInput
): Promise<void> {
  if (input.environment !== 'production' || input.deliverables.length === 0) {
    return;
  }

  const summary = input.summary?.trim();
  const title = input.title?.trim();
  const firstDeliverable = input.deliverables[0];
  const profileUrl = await resolveCanonicalProfileUrl({
    db: input.db,
    environment: input.environment,
    userId: input.userId,
  });
  const deliverableLines = input.deliverables.slice(0, 5).map((deliverable, index) => {
    const label = `${index + 1}. ${deliverable.name} (${deliverable.type})`;
    return deliverable.thumbnailUrl && deliverable.type === 'video'
      ? `${label}\n   poster: ${deliverable.thumbnailUrl}`
      : label;
  });

  const delivered = await sendSlackAlert({
    target: 'marketing',
    environment: input.environment,
    severity: 'info',
    title: 'Agent X Deliverable Generated',
    summary:
      title && title.length > 0
        ? `Agent X completed "${truncate(title, 120)}" and generated ${input.deliverables.length} deliverable(s) for marketing review.`
        : `Agent X generated ${input.deliverables.length} deliverable(s) for marketing review.`,
    fields: [
      { label: 'Operation ID', value: input.operationId },
      { label: 'User ID', value: input.userId },
      ...(profileUrl ? [{ label: 'Profile', value: `<${profileUrl}|Open User Profile>` }] : []),
      ...(input.threadId ? [{ label: 'Thread ID', value: input.threadId }] : []),
      ...(input.agentId ? [{ label: 'Agent', value: input.agentId }] : []),
      { label: 'Environment', value: input.environment },
      { label: 'Deliverables', value: deliverableLines.join('\n') },
      ...(summary ? [{ label: 'Summary', value: truncate(summary, 500) }] : []),
    ],
    linkText: firstDeliverable.type === 'video' ? 'Open First Video' : 'Open First Graphic',
    linkUrl: firstDeliverable.url,
  });

  if (!delivered) {
    throw new Error('Marketing Slack delivery failed');
  }
}
