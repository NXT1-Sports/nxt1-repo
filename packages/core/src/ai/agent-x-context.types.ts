/**
 * @fileoverview Agent X selected context types.
 *
 * Portable, backend-first context payloads attached to a chat turn.
 */

/** Domain of context selected by the user for the next chat turn. */
export type AgentXSelectedContextKind =
  | 'film_play'
  | 'playbook_item'
  | 'game_plan_item'
  | 'document'
  | 'custom';

/** Source system that produced the context object. */
export type AgentXSelectedContextSourceType =
  | 'film_review'
  | 'playbook'
  | 'game_plan'
  | 'agent_x'
  | 'external';

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

/** Serialize a selected context for browser drag-and-drop transfer. */
export function serializeAgentXSelectedContextForDrag(context: AgentXSelectedContext): string {
  return JSON.stringify(context);
}

/** Parse and validate a selected-context drag payload from a JSON string. */
export function parseAgentXSelectedContextDragPayload(
  rawPayload: string
): AgentXSelectedContext | null {
  if (!rawPayload.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(rawPayload);
    return isAgentXSelectedContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
