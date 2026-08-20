/**
 * @fileoverview Agent X selected context types.
 *
 * Portable, backend-first context payloads attached to a chat turn.
 */

/** Domain of context selected by the user for the next chat turn. */
export type AgentXSelectedContextKind =
  'film_play' | 'playbook_item' | 'game_plan_item' | 'document' | 'custom';

/** Source system that produced the context object. */
export type AgentXSelectedContextSourceType =
  'film_review' | 'playbook' | 'game_plan' | 'agent_x' | 'external';

/** Optional source metadata for a selected context chip. */
export interface AgentXSelectedContextSource {
  readonly type: AgentXSelectedContextSourceType;
  readonly id?: string;
  readonly label?: string;
}
/** Optional time range used for media contexts such as film clips. */
export interface AgentXSelectedContextTimeRange {
  readonly startSec: number;
  readonly endSec?: number;
}

/** Optional entity references related to the selected context. */
export interface AgentXSelectedContextEntityRef {
  readonly type: string;
  readonly id: string;
  readonly label?: string;
}

/** Optional media URLs associated with the selected context. */
export interface AgentXSelectedContextMedia {
  readonly videoUrl?: string;
  readonly imageUrl?: string;
  readonly thumbnailUrl?: string;
  readonly cloudflareVideoId?: string;
}

/** Normalized point in the rendered media frame, where 0..1 maps to width/height. */
export interface AgentXSelectedContextAnnotationPoint {
  readonly x: number;
  readonly y: number;
}

/** Normalized bounds around a user-drawn annotation in the rendered media frame. */
export interface AgentXSelectedContextAnnotationBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type AgentXSelectedContextAnnotationKind = 'freehand' | 'square' | 'circle';

/** Compact drawing data attached to a selected media context. */
export interface AgentXSelectedContextAnnotation {
  readonly kind: AgentXSelectedContextAnnotationKind;
  readonly bounds: AgentXSelectedContextAnnotationBounds;
  readonly strokeCount: number;
  readonly points?: readonly AgentXSelectedContextAnnotationPoint[];
}

/** Scalar metadata values allowed on selected context payloads. */
export type AgentXSelectedContextMetadataValue = string | number | boolean | null;

const AGENT_X_SELECTED_CONTEXT_BUNDLE_THRESHOLD = 4;
const AGENT_X_SELECTED_CONTEXT_BUNDLE_PREVIEW_LIMIT = 3;
const AGENT_X_SELECTED_CONTEXT_ENTITY_REF_LIMIT = 200;

/** Drag payload MIME type used when moving selected context into Agent X chat. */
export const AGENT_X_SELECTED_CONTEXT_DRAG_MIME = 'application/x-nxt1-agent-x-selected-context';

/**
 * Structured context explicitly selected by the user and attached to one chat turn.
 */
export interface AgentXSelectedContext {
  readonly id: string;
  readonly kind: AgentXSelectedContextKind;
  readonly title: string;
  readonly summary?: string;
  readonly source?: AgentXSelectedContextSource;
  readonly timeRange?: AgentXSelectedContextTimeRange;
  readonly entityRefs?: readonly AgentXSelectedContextEntityRef[];
  readonly media?: AgentXSelectedContextMedia;
  readonly annotation?: AgentXSelectedContextAnnotation;
  readonly metadata?: Readonly<Record<string, AgentXSelectedContextMetadataValue>>;
}

/** One-or-many selected contexts transferred through browser drag-and-drop. */
export type AgentXSelectedContextDragPayload =
  AgentXSelectedContext | readonly AgentXSelectedContext[];

const SELECTED_CONTEXT_KINDS = new Set<AgentXSelectedContextKind>([
  'film_play',
  'playbook_item',
  'game_plan_item',
  'document',
  'custom',
]);

const SELECTED_CONTEXT_SOURCE_TYPES = new Set<AgentXSelectedContextSourceType>([
  'film_review',
  'playbook',
  'game_plan',
  'agent_x',
  'external',
]);

/** Serialize one or more selected contexts for browser drag-and-drop transfer. */
export function serializeAgentXSelectedContextForDrag(
  context: AgentXSelectedContextDragPayload
): string {
  return JSON.stringify(context);
}

/** Parse and validate a selected-context drag payload from a JSON string. */
export function parseAgentXSelectedContextDragPayload(
  rawPayload: string
): readonly AgentXSelectedContext[] | null {
  if (!rawPayload.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (isAgentXSelectedContext(parsed)) {
      return [parsed];
    }

    if (Array.isArray(parsed) && parsed.every((entry) => isAgentXSelectedContext(entry))) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Collapse large same-source context drops into a single context chip while preserving
 * the referenced item ids for backend retrieval.
 */
export function bundleAgentXSelectedContexts(
  contexts: readonly AgentXSelectedContext[]
): AgentXSelectedContext[] {
  if (contexts.length < AGENT_X_SELECTED_CONTEXT_BUNDLE_THRESHOLD) {
    return [...contexts];
  }

  const grouped = new Map<string, AgentXSelectedContext[]>();
  const standalone: AgentXSelectedContext[] = [];
  const orderedKeys: string[] = [];

  for (const context of contexts) {
    const bundleKey = resolveSelectedContextBundleKey(context);
    if (!bundleKey) {
      standalone.push(context);
      continue;
    }

    if (!grouped.has(bundleKey)) {
      grouped.set(bundleKey, []);
      orderedKeys.push(bundleKey);
    }

    grouped.get(bundleKey)!.push(context);
  }

  const bundled = new Map<string, AgentXSelectedContext>();
  for (const bundleKey of orderedKeys) {
    const group = grouped.get(bundleKey) ?? [];
    if (group.length < AGENT_X_SELECTED_CONTEXT_BUNDLE_THRESHOLD) {
      for (const context of group) {
        bundled.set(context.id, context);
      }
      continue;
    }

    const representative = group[0]!;
    const sourceLabel = representative.source?.label?.trim();
    const count = group.length;
    const entityRefs = collectBundledSelectedContextEntityRefs(group).slice(
      0,
      AGENT_X_SELECTED_CONTEXT_ENTITY_REF_LIMIT
    );

    const previewTitles = entityRefs
      .slice(0, AGENT_X_SELECTED_CONTEXT_BUNDLE_PREVIEW_LIMIT)
      .map((entry) => entry.label);
    const moreCount = entityRefs.length - previewTitles.length;
    const bundleLabel = formatSelectedContextKindLabel(representative.kind, count);
    const previewText =
      previewTitles.length > 0
        ? ` Includes ${previewTitles.join(', ')}${moreCount > 0 ? `, and ${moreCount} more.` : '.'}`
        : '';

    bundled.set(representative.id, {
      id: `${representative.kind}:${representative.source!.type}:${representative.source!.id}:bundle`,
      kind: representative.kind,
      title: bundleLabel,
      summary: `${sourceLabel ? `From ${sourceLabel}.` : 'Bundled from one source.'}${previewText}`,
      source: representative.source,
      entityRefs,
      ...(representative.media && hasSharedSelectedContextMedia(group)
        ? { media: representative.media }
        : {}),
      metadata: {
        bundleCount: count,
      },
    });
  }

  const resolved: AgentXSelectedContext[] = [];
  const seenIds = new Set<string>();
  for (const context of contexts) {
    const bundleKey = resolveSelectedContextBundleKey(context);
    if (!bundleKey) {
      if (!seenIds.has(context.id)) {
        resolved.push(context);
        seenIds.add(context.id);
      }
      continue;
    }

    const groupedContext = grouped.get(bundleKey) ?? [];
    if (groupedContext.length < AGENT_X_SELECTED_CONTEXT_BUNDLE_THRESHOLD) {
      if (!seenIds.has(context.id)) {
        resolved.push(context);
        seenIds.add(context.id);
      }
      continue;
    }

    const representative = groupedContext[0];
    const bundledContext = representative ? bundled.get(representative.id) : undefined;
    if (bundledContext && !seenIds.has(bundledContext.id)) {
      resolved.push(bundledContext);
      seenIds.add(bundledContext.id);
    }
  }

  return resolved;
}

/** Runtime guard for selected context objects crossing UI drag boundaries. */
export function isAgentXSelectedContext(value: unknown): value is AgentXSelectedContext {
  if (!isRecord(value)) return false;

  const id = value['id'];
  const title = value['title'];
  const kind = value['kind'];

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof title !== 'string' || title.trim().length === 0) return false;
  if (typeof kind !== 'string' || !SELECTED_CONTEXT_KINDS.has(kind as AgentXSelectedContextKind)) {
    return false;
  }

  if (value['summary'] !== undefined && typeof value['summary'] !== 'string') return false;
  if (value['source'] !== undefined && !isSelectedContextSource(value['source'])) return false;
  if (value['timeRange'] !== undefined && !isSelectedContextTimeRange(value['timeRange'])) {
    return false;
  }
  if (value['entityRefs'] !== undefined && !isSelectedContextEntityRefs(value['entityRefs'])) {
    return false;
  }
  if (value['media'] !== undefined && !isSelectedContextMedia(value['media'])) return false;
  if (value['annotation'] !== undefined && !isSelectedContextAnnotation(value['annotation'])) {
    return false;
  }
  if (value['metadata'] !== undefined && !isSelectedContextMetadata(value['metadata']))
    return false;

  return true;
}

function resolveSelectedContextBundleKey(context: AgentXSelectedContext): string | null {
  const sourceType = context.source?.type?.trim();
  const sourceId = context.source?.id?.trim();

  if (!sourceType || !sourceId) return null;
  if (context.annotation) return null;
  if (isBundledSelectedContext(context)) return null;

  return `${context.kind}::${sourceType}::${sourceId}`;
}

function isBundledSelectedContext(context: AgentXSelectedContext): boolean {
  const bundleCount = context.metadata?.['bundleCount'];
  return typeof bundleCount === 'number' && Number.isFinite(bundleCount) && bundleCount >= 2;
}

function formatSelectedContextKindLabel(kind: AgentXSelectedContextKind, count: number): string {
  const singular = kind.replace(/_/g, ' ');
  if (count === 1) {
    return `1 selected ${singular}`;
  }

  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(singular)) {
    return `${count} selected ${singular.slice(0, -1)}ies`;
  }

  if (singular.endsWith('s')) {
    return `${count} selected ${singular}`;
  }

  return `${count} selected ${singular}s`;
}

function hasSharedSelectedContextMedia(contexts: readonly AgentXSelectedContext[]): boolean {
  const firstMedia = contexts[0]?.media;
  if (!firstMedia) return false;

  return contexts.every(
    (context) =>
      context.media?.videoUrl === firstMedia.videoUrl &&
      context.media?.imageUrl === firstMedia.imageUrl &&
      context.media?.thumbnailUrl === firstMedia.thumbnailUrl &&
      context.media?.cloudflareVideoId === firstMedia.cloudflareVideoId
  );
}

function collectBundledSelectedContextEntityRefs(
  contexts: readonly AgentXSelectedContext[]
): AgentXSelectedContextEntityRef[] {
  const refs = new Map<string, AgentXSelectedContextEntityRef>();

  for (const context of contexts) {
    const candidates =
      context.entityRefs && context.entityRefs.length > 0
        ? context.entityRefs
        : [
            {
              type: context.kind,
              id: context.id,
              label: context.title,
            } satisfies AgentXSelectedContextEntityRef,
          ];

    for (const candidate of candidates) {
      const type = candidate.type.trim();
      const id = candidate.id.trim();
      if (!type || !id) continue;

      const key = `${type}::${id}`;
      const existing = refs.get(key);
      if (!existing) {
        refs.set(key, {
          type,
          id,
          ...(candidate.label?.trim() ? { label: candidate.label.trim() } : {}),
        });
        continue;
      }

      if (!existing.label?.trim() && candidate.label?.trim()) {
        refs.set(key, {
          ...existing,
          label: candidate.label.trim(),
        });
      }
    }
  }

  return [...refs.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSelectedContextSource(value: unknown): value is AgentXSelectedContextSource {
  if (!isRecord(value)) return false;

  const type = value['type'];
  if (typeof type !== 'string') return false;
  if (!SELECTED_CONTEXT_SOURCE_TYPES.has(type as AgentXSelectedContextSourceType)) return false;

  return isOptionalString(value['id']) && isOptionalString(value['label']);
}

function isSelectedContextTimeRange(value: unknown): value is AgentXSelectedContextTimeRange {
  if (!isRecord(value)) return false;

  const startSec = value['startSec'];
  const endSec = value['endSec'];

  if (!isFiniteNonNegativeNumber(startSec)) return false;
  return endSec === undefined || isFiniteNonNegativeNumber(endSec);
}

function isSelectedContextEntityRefs(
  value: unknown
): value is readonly AgentXSelectedContextEntityRef[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!isRecord(entry)) return false;

      return (
        typeof entry['type'] === 'string' &&
        entry['type'].trim().length > 0 &&
        typeof entry['id'] === 'string' &&
        entry['id'].trim().length > 0 &&
        isOptionalString(entry['label'])
      );
    })
  );
}

function isSelectedContextMedia(value: unknown): value is AgentXSelectedContextMedia {
  if (!isRecord(value)) return false;

  return (
    isOptionalString(value['videoUrl']) &&
    isOptionalString(value['imageUrl']) &&
    isOptionalString(value['thumbnailUrl'])
  );
}

function isSelectedContextAnnotation(value: unknown): value is AgentXSelectedContextAnnotation {
  if (!isRecord(value)) return false;

  return (
    isSelectedContextAnnotationKind(value['kind']) &&
    isSelectedContextAnnotationBounds(value['bounds']) &&
    isFiniteNonNegativeNumber(value['strokeCount']) &&
    (value['points'] === undefined || isSelectedContextAnnotationPoints(value['points']))
  );
}

function isSelectedContextAnnotationKind(
  value: unknown
): value is AgentXSelectedContextAnnotationKind {
  return value === 'freehand' || value === 'square' || value === 'circle';
}

function isSelectedContextAnnotationBounds(
  value: unknown
): value is AgentXSelectedContextAnnotationBounds {
  if (!isRecord(value)) return false;

  return (
    isNormalizedNumber(value['minX']) &&
    isNormalizedNumber(value['minY']) &&
    isNormalizedNumber(value['maxX']) &&
    isNormalizedNumber(value['maxY']) &&
    value['maxX'] >= value['minX'] &&
    value['maxY'] >= value['minY']
  );
}

function isSelectedContextAnnotationPoints(
  value: unknown
): value is readonly AgentXSelectedContextAnnotationPoint[] {
  return (
    Array.isArray(value) &&
    value.every(
      (point) => isRecord(point) && isNormalizedNumber(point['x']) && isNormalizedNumber(point['y'])
    )
  );
}

function isSelectedContextMetadata(
  value: unknown
): value is Readonly<Record<string, AgentXSelectedContextMetadataValue>> {
  if (!isRecord(value)) return false;

  return Object.values(value).every(
    (entry) =>
      entry === null ||
      typeof entry === 'string' ||
      (typeof entry === 'number' && Number.isFinite(entry)) ||
      typeof entry === 'boolean'
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNormalizedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
