import type {
  NotionProperties,
  NotionPropertyValue,
  NotionRichTextFragment,
} from './notion-client.service.js';

export function textFragment(content: string): NotionRichTextFragment {
  return { type: 'text', text: { content } };
}

export function compactText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function richText(value: string | null | undefined): readonly NotionRichTextFragment[] {
  const normalized = compactText(value);
  return normalized ? [textFragment(normalized)] : [];
}

export function normalizeIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function resolveCandidatePropertyName(
  properties: Record<string, { readonly type?: string } | undefined> | undefined,
  candidates: readonly string[],
  expectedType: string
): string | null {
  if (!properties) return null;

  for (const candidate of candidates) {
    const prop = properties[candidate];
    if (prop && (!prop.type || prop.type === expectedType)) {
      return candidate;
    }
  }

  return null;
}

export function mapTextToPropertyValue(
  propertyType: string | undefined,
  value: string
): NotionPropertyValue | null {
  switch (propertyType) {
    case 'select':
      return { select: { name: value } };
    case 'rich_text':
      return { rich_text: richText(value) };
    case 'title':
      return { title: [textFragment(value)] };
    default:
      return { rich_text: richText(value) };
  }
}

export function readNumberProperty(
  properties: Record<string, { readonly number?: number | null } | undefined> | undefined,
  propertyName: string
): number {
  const value = properties?.[propertyName]?.number;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function readNumberPropertyByCandidates(
  properties: Record<string, { readonly number?: number | null } | undefined> | undefined,
  candidates: readonly string[]
): number {
  if (!properties) return 0;

  for (const candidate of candidates) {
    const value = properties[candidate]?.number;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

export function extractPlainText(value: unknown): string {
  if (!Array.isArray(value)) return '';

  return value
    .map((item) => {
      const typed = item as {
        readonly plain_text?: string;
        readonly text?: { readonly content?: string };
      };
      return typed?.plain_text ?? typed?.text?.content ?? '';
    })
    .join('')
    .trim();
}

function readIntegerLikeProperty(
  property:
    | {
        readonly number?: number | null;
        readonly rich_text?: unknown[];
      }
    | undefined
): number {
  const numericValue = property?.number;
  if (typeof numericValue === 'number' && Number.isFinite(numericValue)) {
    return Math.max(0, Math.floor(numericValue));
  }

  const textValue = extractPlainText(property?.rich_text);
  const match = textValue.match(/-?\d+/);
  if (!match) return 0;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function readIntegerPropertyByCandidates(
  properties:
    | Record<
        string,
        { readonly number?: number | null; readonly rich_text?: unknown[] } | undefined
      >
    | undefined,
  candidates: readonly string[]
): number {
  if (!properties) return 0;

  for (const candidate of candidates) {
    const property = properties[candidate];
    if (!property) continue;

    const textValue = extractPlainText(property.rich_text);
    if (
      typeof property.number === 'number' ||
      property.number === null ||
      property.rich_text !== undefined ||
      textValue.length > 0
    ) {
      return readIntegerLikeProperty(property);
    }
  }

  return 0;
}

export function buildMappedTextProperties(input: {
  readonly properties: Record<string, { readonly type?: string } | undefined> | undefined;
  readonly fields: Array<{
    readonly candidates: readonly string[];
    readonly expectedType: string;
    readonly value: string | undefined;
  }>;
}): NotionProperties {
  const result: NotionProperties = {};

  for (const field of input.fields) {
    if (!field.value) continue;

    const propertyName =
      resolveCandidatePropertyName(input.properties, field.candidates, field.expectedType) ??
      resolveCandidatePropertyName(input.properties, field.candidates, 'rich_text');

    if (!propertyName) continue;

    const propertyType = input.properties?.[propertyName]?.type;
    const mapped = mapTextToPropertyValue(propertyType, field.value);
    if (mapped) {
      result[propertyName] = mapped;
    }
  }

  return result;
}
