import type { PersistedMedia } from './social/scraper-media.service.js';

const SAFE_MEDIA_FIELD_NAMES = new Set([
  'displayurl',
  'displayurls',
  'imageurl',
  'imageurls',
  'mediaurl',
  'mediaurls',
  'posterurl',
  'posterurls',
  'profileimageurl',
  'profileimageurls',
  'profilepicurl',
  'profilepicurlhd',
  'thumbnailurl',
  'thumbnailurls',
  'videourl',
  'videourls',
]);

function normalizeFieldName(fieldName: string): string {
  return fieldName.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSafeMediaField(fieldName: string): boolean {
  return SAFE_MEDIA_FIELD_NAMES.has(normalizeFieldName(fieldName));
}

export interface MediaUrlMapEntry {
  readonly originalUrl: string;
  readonly url: string;
  readonly type: PersistedMedia['type'];
  readonly sourceUrl: string | null;
}

export function applyPersistedMediaToKnownFields(
  data: unknown,
  media: readonly PersistedMedia[]
): unknown {
  if (media.length === 0) return data;

  const urlMap = new Map(media.map((item) => [item.originalUrl, item.url]));

  function walk(node: unknown, parentFieldName?: string): unknown {
    if (typeof node === 'string') {
      return parentFieldName && isSafeMediaField(parentFieldName)
        ? (urlMap.get(node) ?? node)
        : node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => walk(item, parentFieldName));
    }

    if (!node || typeof node !== 'object') {
      return node;
    }

    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [key, walk(value, key)])
    );
  }

  return walk(data);
}

export function buildMediaUrlMap(media: readonly PersistedMedia[]): readonly MediaUrlMapEntry[] {
  return media.map((item) => ({
    originalUrl: item.originalUrl,
    url: item.url,
    type: item.type,
    sourceUrl: item.sourceUrl ?? null,
  }));
}
