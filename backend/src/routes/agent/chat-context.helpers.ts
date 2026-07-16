import { bundleAgentXSelectedContexts, type AgentXSelectedContext } from '@nxt1/core';

const MAX_SELECTED_CONTEXTS = 12;
const MAX_SELECTED_CONTEXT_ENTITY_REFS = 200;
const MAX_TEXT_FIELD_LEN = 600;
const AGENT_ONLY_ANNOTATION_METADATA_KEYS = new Set([
  'annotationSnapshotAttached',
  'annotationSnapshotAttachmentName',
  'annotationStrokeColor',
  'annotationStrokeColorHex',
  'drawAnnotationKind',
  'drawBounds',
  'drawStrokeCount',
  'hasDrawing',
  'renderedDrawBounds',
]);

function isFilmReviewContext(context: AgentXSelectedContext): boolean {
  return context.source?.type === 'film_review' || context.metadata?.['itemType'] === 'film_review';
}

function trimText(value: unknown, maxLen = MAX_TEXT_FIELD_LEN): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= maxLen) {
    return trimmed;
  }

  if (maxLen <= 3) {
    return trimmed.slice(0, maxLen);
  }

  return `${trimmed.slice(0, maxLen - 3)}...`;
}

function normalizeTimeRange(
  raw: AgentXSelectedContext['timeRange'] | undefined
): AgentXSelectedContext['timeRange'] | undefined {
  if (
    !raw ||
    typeof raw.startSec !== 'number' ||
    !Number.isFinite(raw.startSec) ||
    raw.startSec < 0
  ) {
    return undefined;
  }

  const startSec = Number(raw.startSec.toFixed(3));
  const endSec =
    typeof raw.endSec === 'number' && Number.isFinite(raw.endSec) && raw.endSec >= startSec
      ? Number(raw.endSec.toFixed(3))
      : undefined;

  return {
    startSec,
    ...(typeof endSec === 'number' ? { endSec } : {}),
  };
}

function sanitizeSelectedContextMetadata(
  metadata: AgentXSelectedContext['metadata'] | undefined
): AgentXSelectedContext['metadata'] | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(metadata).filter(
    ([key, value]) =>
      value !== undefined &&
      !AGENT_ONLY_ANNOTATION_METADATA_KEYS.has(key) &&
      !key.startsWith('annotationDebug')
  );

  return sanitizedEntries.length > 0
    ? (Object.fromEntries(sanitizedEntries) as AgentXSelectedContext['metadata'])
    : undefined;
}

export function normalizeSelectedContextsForPayload(
  selectedContexts: readonly AgentXSelectedContext[] | undefined
): AgentXSelectedContext[] {
  const bundledSelectedContexts = bundleAgentXSelectedContexts(selectedContexts ?? []);
  if (!bundledSelectedContexts.length) {
    return [];
  }

  const normalized: AgentXSelectedContext[] = [];

  for (const rawContext of bundledSelectedContexts) {
    const id = trimText(rawContext?.id, 120);
    const title = trimText(rawContext?.title, 160);
    if (!id || !title) {
      continue;
    }

    const summary = trimText(rawContext.summary, 600);
    const sourceType = rawContext.source?.type;
    const sourceLabel = trimText(rawContext.source?.label, 120);
    const sourceId = trimText(rawContext.source?.id, 120);
    const timeRange = normalizeTimeRange(rawContext.timeRange);
    const sanitizedMetadata = sanitizeSelectedContextMetadata(rawContext.metadata);

    const context: AgentXSelectedContext = {
      id,
      kind: rawContext.kind,
      title,
      ...(summary ? { summary } : {}),
      ...(sourceType
        ? {
            source: {
              type: sourceType,
              ...(sourceId ? { id: sourceId } : {}),
              ...(sourceLabel ? { label: sourceLabel } : {}),
            },
          }
        : {}),
      ...(timeRange ? { timeRange } : {}),
      ...(rawContext.entityRefs?.length
        ? {
            entityRefs: rawContext.entityRefs
              .map((entityRef) => {
                const type = trimText(entityRef.type, 80);
                const entityId = trimText(entityRef.id, 120);
                const label = trimText(entityRef.label, 160);
                if (!type || !entityId) {
                  return null;
                }
                return {
                  type,
                  id: entityId,
                  ...(label ? { label } : {}),
                };
              })
              .filter((entityRef): entityRef is NonNullable<typeof entityRef> => !!entityRef)
              .slice(0, MAX_SELECTED_CONTEXT_ENTITY_REFS),
          }
        : {}),
      ...(rawContext.media && !isFilmReviewContext(rawContext)
        ? {
            media: {
              ...(trimText(rawContext.media.videoUrl, 400)
                ? { videoUrl: trimText(rawContext.media.videoUrl, 400) }
                : {}),
              ...(trimText(rawContext.media.imageUrl, 400)
                ? { imageUrl: trimText(rawContext.media.imageUrl, 400) }
                : {}),
              ...(trimText(rawContext.media.thumbnailUrl, 400)
                ? { thumbnailUrl: trimText(rawContext.media.thumbnailUrl, 400) }
                : {}),
              ...(trimText(rawContext.media.cloudflareVideoId, 128)
                ? { cloudflareVideoId: trimText(rawContext.media.cloudflareVideoId, 128) }
                : {}),
            },
          }
        : {}),
      ...(sanitizedMetadata ? { metadata: sanitizedMetadata } : {}),
    };

    normalized.push(context);
    if (normalized.length >= MAX_SELECTED_CONTEXTS) {
      break;
    }
  }

  return normalized;
}

export function enrichIntentWithSelectedContexts(
  intent: string,
  selectedContexts: readonly AgentXSelectedContext[]
): string {
  if (!selectedContexts.length) {
    return intent;
  }

  const contextLines = selectedContexts.map((context, index) => {
    const timeRange = context.timeRange
      ? ` @ ${context.timeRange.startSec}s-${context.timeRange.endSec ?? context.timeRange.startSec}s`
      : '';
    const source = context.source?.label ?? context.source?.type ?? 'context';
    const summary = context.summary ? ` — ${context.summary}` : '';
    const filmContext = formatFilmContextInstruction(context);
    return `${index + 1}. ${context.kind} (${source}): ${context.title}${timeRange}${summary}${filmContext}`;
  });

  return `${intent}\n\n[Selected contexts (confirmed by user for this turn):\n${contextLines.join(
    '\n'
  )}\n]\n[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant.]`;
}

function formatFilmContextInstruction(context: AgentXSelectedContext): string {
  const metadata = context.metadata;
  if (!metadata) return '';

  const details: string[] = [];
  const ownTeamId = trimText(metadata['teamId'], 80);
  const ownTeamColor =
    trimText(metadata['ownTeamColor'], 80) ??
    trimText(metadata['teamColor'], 80) ??
    trimText(metadata['primaryColor'], 80);
  const opponentName = trimText(metadata['opponentName'], 120);
  const opponentTeamColor = trimText(metadata['opponentTeamColor'], 80);
  const perspective = trimText(metadata['perspective'], 40);
  const sport = trimText(metadata['sport'], 40);
  const odk = trimText(metadata['odk'], 40) ?? trimText(metadata['ODK'], 40);
  const formation = trimText(metadata['formation'], 80);
  const playNumber = metadata['playNumber'];

  if (ownTeamId) details.push(`ownTeamId=${ownTeamId}`);
  if (ownTeamColor) details.push(`ownTeamColor=${ownTeamColor}`);
  if (opponentName) details.push(`opponent=${opponentName}`);
  if (opponentTeamColor) details.push(`opponentTeamColor=${opponentTeamColor}`);
  if (perspective) details.push(`perspective=${perspective}`);
  if (sport) details.push(`sport=${sport}`);
  if (odk) details.push(`breakdownODK=${odk}`);
  if (formation) details.push(`formation=${formation}`);
  if (typeof playNumber === 'number' && Number.isFinite(playNumber)) {
    details.push(`playNumber=${Math.round(playNumber)}`);
  }

  return details.length ? ` — Film context: ${details.join(', ')}.` : '';
}
