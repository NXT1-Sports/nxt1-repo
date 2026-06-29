import { bundleAgentXSelectedContexts, type AgentXSelectedContext } from '@nxt1/core';

const MAX_SELECTED_CONTEXTS = 12;
const MAX_SELECTED_CONTEXT_ENTITY_REFS = 200;
const MAX_TEXT_FIELD_LEN = 600;
const MAX_ANNOTATION_POINTS = 80;

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

function normalizeAnnotation(
  raw: AgentXSelectedContext['annotation'] | undefined
): AgentXSelectedContext['annotation'] | undefined {
  if (!raw || !isSelectedContextAnnotationKind(raw.kind)) {
    return undefined;
  }

  const bounds = raw.bounds;
  if (
    !bounds ||
    !isNormalizedNumber(bounds.minX) ||
    !isNormalizedNumber(bounds.minY) ||
    !isNormalizedNumber(bounds.maxX) ||
    !isNormalizedNumber(bounds.maxY) ||
    bounds.maxX < bounds.minX ||
    bounds.maxY < bounds.minY
  ) {
    return undefined;
  }

  const points = Array.isArray(raw.points)
    ? raw.points
        .filter((point) => isNormalizedNumber(point.x) && isNormalizedNumber(point.y))
        .slice(0, MAX_ANNOTATION_POINTS)
        .map((point) => ({ x: roundNormalized(point.x), y: roundNormalized(point.y) }))
    : undefined;

  return {
    kind: raw.kind,
    bounds: {
      minX: roundNormalized(bounds.minX),
      minY: roundNormalized(bounds.minY),
      maxX: roundNormalized(bounds.maxX),
      maxY: roundNormalized(bounds.maxY),
    },
    strokeCount:
      typeof raw.strokeCount === 'number' && Number.isFinite(raw.strokeCount) && raw.strokeCount > 0
        ? Math.round(raw.strokeCount)
        : 1,
    ...(raw.kind === 'freehand' && points?.length ? { points } : {}),
  };
}

function isSelectedContextAnnotationKind(
  kind: unknown
): kind is NonNullable<AgentXSelectedContext['annotation']>['kind'] {
  return kind === 'freehand' || kind === 'square' || kind === 'circle';
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
    const annotation = normalizeAnnotation(rawContext.annotation);

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
      ...(rawContext.media
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
      ...(annotation ? { annotation } : {}),
      ...(rawContext.metadata ? { metadata: rawContext.metadata } : {}),
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
    const annotation = formatAnnotationInstruction(context);
    return `${index + 1}. ${context.kind} (${source}): ${context.title}${timeRange}${summary}${annotation}`;
  });

  return `${intent}\n\n[Selected contexts (confirmed by user for this turn):\n${contextLines.join(
    '\n'
  )}\n]\n[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant. If a selected context includes a drawing annotation, treat the annotation coordinates as the user-selected area even if the raw video frame does not visibly contain the overlay.]`;
}

function formatAnnotationInstruction(context: AgentXSelectedContext): string {
  const annotation = context.annotation ?? annotationFromLegacyMetadata(context.metadata);
  if (!annotation) {
    return formatFilmContextInstruction(context);
  }

  const bounds = annotation.bounds;
  const centerX = roundNormalized((bounds.minX + bounds.maxX) / 2);
  const centerY = roundNormalized((bounds.minY + bounds.maxY) / 2);
  const frameRegion = describeFrameRegion(centerX, centerY);
  const markedFrameTimestamp = formatMarkedFrameTimestampInstruction(context.metadata);
  const snapshotInstruction = formatAnnotationSnapshotInstruction(context.metadata);
  const pointSample = annotation.points?.length
    ? ` Normalized path points: ${annotation.points
        .map((point) => `${point.x},${point.y}`)
        .join(' | ')}.`
    : '';

  return `${formatFilmContextInstruction(context)} — User drawing annotation: ${annotation.kind}, ${annotation.strokeCount} stroke(s), video-frame normalized bounds x=${bounds.minX}-${bounds.maxX}, y=${bounds.minY}-${bounds.maxY}, centered in the ${frameRegion} of the video frame.${markedFrameTimestamp}${snapshotInstruction}${pointSample}`;
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

function formatMarkedFrameTimestampInstruction(
  metadata: AgentXSelectedContext['metadata'] | undefined
): string {
  const currentTimeSec = metadata?.['currentTimeSec'];
  if (
    typeof currentTimeSec !== 'number' ||
    !Number.isFinite(currentTimeSec) ||
    currentTimeSec < 0
  ) {
    return '';
  }

  return ` Marked-frame timestamp: ${Number(currentTimeSec.toFixed(3))}s; use this exact timestamp when generating fallback still frames instead of the play start.`;
}

function formatAnnotationSnapshotInstruction(
  metadata: AgentXSelectedContext['metadata'] | undefined
): string {
  if (!metadata || metadata['annotationSnapshotAttached'] !== true) {
    return '';
  }

  const attachmentName =
    typeof metadata['annotationSnapshotAttachmentName'] === 'string'
      ? metadata['annotationSnapshotAttachmentName'].trim()
      : '';
  const attachmentLabel = attachmentName ? ` named "${attachmentName}"` : '';

  return ` A flattened annotated full-frame image attachment${attachmentLabel} is included with this turn; treat it as a visual reference only. Use the structured annotation bounds/points to understand the user-selected focus area while analyzing the video directly (no required annotation-burn preprocessing step).`;
}

function annotationFromLegacyMetadata(
  metadata: AgentXSelectedContext['metadata'] | undefined
): AgentXSelectedContext['annotation'] | undefined {
  if (!metadata || metadata['hasDrawing'] !== true || typeof metadata['drawBounds'] !== 'string') {
    return undefined;
  }

  const values = metadata['drawBounds'].split(',').map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !isNormalizedNumber(value))) {
    return undefined;
  }

  const [minX, minY, maxX, maxY] = values;
  if (maxX < minX || maxY < minY) {
    return undefined;
  }

  return {
    kind: 'freehand',
    bounds: {
      minX: roundNormalized(minX),
      minY: roundNormalized(minY),
      maxX: roundNormalized(maxX),
      maxY: roundNormalized(maxY),
    },
    strokeCount:
      typeof metadata['drawStrokeCount'] === 'number' && metadata['drawStrokeCount'] > 0
        ? Math.round(metadata['drawStrokeCount'])
        : 1,
  };
}

function describeFrameRegion(centerX: number, centerY: number): string {
  const horizontal = centerX < 0.33 ? 'left' : centerX > 0.67 ? 'right' : 'middle';
  const vertical = centerY < 0.33 ? 'top' : centerY > 0.67 ? 'bottom' : 'center';
  return `${vertical}-${horizontal}`;
}

function isNormalizedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function roundNormalized(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
