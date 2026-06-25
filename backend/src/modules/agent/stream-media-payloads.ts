export type StreamMediaPayload = {
  type: 'image' | 'video';
  url: string;
  mimeType?: string;
  thumbnailUrl?: string;
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function inferMediaType(url: string, mimeType?: string): 'image' | 'video' | null {
  const lowerMime = (mimeType ?? '').toLowerCase();
  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime.startsWith('video/')) return 'video';

  const lowerUrl = url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(lowerUrl)) return 'image';
  if (/\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(?:\?|#|$)/i.test(lowerUrl)) return 'video';
  if (/videodelivery\.net\//i.test(lowerUrl)) return 'video';
  if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(lowerUrl)) {
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#%]|$)/i.test(lowerUrl)) return 'image';
    if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#%]|$)/i.test(lowerUrl)) return 'video';
    if (/(?:\/|%2F)videos?(?:\/|%2F)/i.test(lowerUrl)) return 'video';
    if (/(?:\/|%2F)images?(?:\/|%2F)/i.test(lowerUrl)) return 'image';
  }
  return null;
}

function storageObjectPathFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      return match?.[1] ? decodeURIComponent(match[1]).replace(/^\/+/, '') : null;
    }

    if (hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? decodeURIComponent(parts.slice(1).join('/')) : null;
    }

    if (hostname.endsWith('.storage.googleapis.com')) {
      return decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || null;
    }
  } catch {
    return null;
  }

  return null;
}

function mediaDirectoryKeyFromUrl(value: string): string | null {
  const objectPath = storageObjectPathFromUrl(value);
  if (!objectPath) return null;
  const lastSlash = objectPath.lastIndexOf('/');
  return lastSlash > 0 ? objectPath.slice(0, lastSlash).toLowerCase() : null;
}

function shareStorageMediaDirectory(leftUrl: string, rightUrl: string): boolean {
  const leftDirectory = mediaDirectoryKeyFromUrl(leftUrl);
  const rightDirectory = mediaDirectoryKeyFromUrl(rightUrl);
  return !!leftDirectory && leftDirectory === rightDirectory;
}

function isStorageVideoDirectoryImage(url: string): boolean {
  const directory = mediaDirectoryKeyFromUrl(url);
  return !!directory && /(?:^|\/)video$/.test(directory);
}

function firstHttpUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && isHttpUrl(trimmed)) return trimmed;
  }
  return undefined;
}

function maybePushMedia(
  seen: Set<string>,
  output: StreamMediaPayload[],
  urlValue: unknown,
  mimeTypeValue?: unknown,
  forcedType?: 'image' | 'video',
  thumbnailUrlValue?: unknown
): void {
  if (typeof urlValue !== 'string') return;
  const url = urlValue.trim();
  if (!url || !isHttpUrl(url)) return;
  const mimeType = typeof mimeTypeValue === 'string' ? mimeTypeValue : undefined;
  const type = forcedType ?? inferMediaType(url, mimeType);
  if (!type) return;
  const thumbnailUrl =
    typeof thumbnailUrlValue === 'string' && isHttpUrl(thumbnailUrlValue.trim())
      ? thumbnailUrlValue.trim()
      : undefined;
  const dedupeKey = `${type}|${url}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  output.push({
    type,
    url,
    ...(mimeType ? { mimeType } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  });
}

function assignMediaThumbnailFallbacks(
  media: readonly StreamMediaPayload[]
): readonly StreamMediaPayload[] {
  const imageMedia = media.filter((item) => item.type === 'image');
  if (!imageMedia.length) return media;

  const usedStorageVideoPosterUrls = new Set<string>();
  const withThumbnails = media.map((item) => {
    if (item.type !== 'video' || item.thumbnailUrl) return item;
    const sameDirectoryPoster = imageMedia.find((image) =>
      shareStorageMediaDirectory(image.url, item.url)
    );
    const namedPoster = imageMedia.find((image) =>
      /(?:thumb|thumbnail|poster|preview|cover|graphic|title[-_\s]?card|intro|generated)/i.test(
        image.url
      )
    );
    const fallbackPoster =
      sameDirectoryPoster ?? namedPoster ?? (imageMedia.length === 1 ? imageMedia[0] : undefined);
    if (!fallbackPoster) return item;
    if (sameDirectoryPoster && isStorageVideoDirectoryImage(sameDirectoryPoster.url)) {
      for (const image of imageMedia) {
        if (
          isStorageVideoDirectoryImage(image.url) &&
          shareStorageMediaDirectory(image.url, item.url)
        ) {
          usedStorageVideoPosterUrls.add(image.url);
        }
      }
    }
    return { ...item, thumbnailUrl: fallbackPoster.url };
  });

  return withThumbnails.filter(
    (item) => item.type !== 'image' || !usedStorageVideoPosterUrls.has(item.url)
  );
}

export function extractMediaPayloads(
  toolResult: Record<string, unknown>
): readonly StreamMediaPayload[] {
  const seen = new Set<string>();
  const media: StreamMediaPayload[] = [];
  const visited = new WeakSet<object>();

  const collectFromRecord = (record: Record<string, unknown>): void => {
    if (visited.has(record)) return;
    visited.add(record);
    const thumbnailUrl = firstHttpUrl(
      record['thumbnailUrl'],
      record['posterUrl'],
      record['poster'],
      record['previewUrl'],
      record['coverUrl']
    );

    maybePushMedia(seen, media, record['imageUrl'], record['mimeType'], 'image');
    maybePushMedia(seen, media, record['videoUrl'], record['mimeType'], 'video', thumbnailUrl);
    maybePushMedia(seen, media, record['url'], record['mimeType']);
    maybePushMedia(seen, media, record['publicUrl'], record['mimeType']);
    maybePushMedia(seen, media, record['downloadUrl'], record['mimeType']);
    maybePushMedia(seen, media, record['outputUrl'], record['mimeType'], undefined, thumbnailUrl);
    maybePushMedia(seen, media, record['output_url'], record['mimeType'], undefined, thumbnailUrl);
    maybePushMedia(seen, media, record['output_path'], record['mimeType'], undefined, thumbnailUrl);

    const imageUrls = record['imageUrls'];
    if (Array.isArray(imageUrls)) {
      for (const url of imageUrls) maybePushMedia(seen, media, url, record['mimeType'], 'image');
    }

    const videoUrls = record['videoUrls'];
    if (Array.isArray(videoUrls)) {
      for (const url of videoUrls)
        maybePushMedia(seen, media, url, record['mimeType'], 'video', thumbnailUrl);
    }

    for (const key of ['persistedMediaUrls', 'mediaUrls'] as const) {
      const urls = record[key];
      if (!Array.isArray(urls)) continue;
      for (const url of urls) maybePushMedia(seen, media, url, record['mimeType']);
    }

    const files = record['files'];
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        const fileRecord = file as Record<string, unknown>;
        const fileThumbnailUrl = firstHttpUrl(
          fileRecord['thumbnailUrl'],
          fileRecord['posterUrl'],
          fileRecord['poster'],
          fileRecord['previewUrl'],
          fileRecord['coverUrl']
        );
        maybePushMedia(
          seen,
          media,
          fileRecord['url'],
          fileRecord['mimeType'],
          undefined,
          fileThumbnailUrl
        );
        maybePushMedia(
          seen,
          media,
          fileRecord['downloadUrl'],
          fileRecord['mimeType'],
          undefined,
          fileThumbnailUrl
        );
        maybePushMedia(
          seen,
          media,
          fileRecord['outputUrl'],
          fileRecord['mimeType'],
          undefined,
          fileThumbnailUrl
        );
        maybePushMedia(
          seen,
          media,
          fileRecord['output_url'],
          fileRecord['mimeType'],
          undefined,
          fileThumbnailUrl
        );
        maybePushMedia(
          seen,
          media,
          fileRecord['output_path'],
          fileRecord['mimeType'],
          undefined,
          fileThumbnailUrl
        );
      }
    }

    const attachments = record['attachments'];
    if (Array.isArray(attachments)) {
      for (const attachment of attachments) {
        if (!attachment || typeof attachment !== 'object') continue;
        const attachmentRecord = attachment as Record<string, unknown>;
        const forcedType =
          attachmentRecord['type'] === 'image' || attachmentRecord['type'] === 'video'
            ? attachmentRecord['type']
            : undefined;
        const attachmentThumbnailUrl = firstHttpUrl(
          attachmentRecord['thumbnailUrl'],
          attachmentRecord['posterUrl'],
          attachmentRecord['poster'],
          attachmentRecord['previewUrl'],
          attachmentRecord['coverUrl']
        );
        maybePushMedia(
          seen,
          media,
          attachmentRecord['url'],
          attachmentRecord['mimeType'],
          forcedType,
          attachmentThumbnailUrl
        );
        maybePushMedia(
          seen,
          media,
          attachmentRecord['downloadUrl'],
          attachmentRecord['mimeType'],
          forcedType,
          attachmentThumbnailUrl
        );
      }
    }

    const mediaArtifact = record['mediaArtifact'];
    if (mediaArtifact && typeof mediaArtifact === 'object' && !Array.isArray(mediaArtifact)) {
      collectFromRecord(mediaArtifact as Record<string, unknown>);
    }

    const mediaArtifacts = record['mediaArtifacts'];
    if (Array.isArray(mediaArtifacts)) {
      for (const artifact of mediaArtifacts) {
        if (!artifact || typeof artifact !== 'object') continue;
        collectFromRecord(artifact as Record<string, unknown>);
      }
    }

    for (const nestedKey of ['data', 'result', 'artifacts', 'taskResults'] as const) {
      const nested = record[nestedKey];
      if (Array.isArray(nested)) {
        for (const entry of nested) {
          if (entry && typeof entry === 'object')
            collectFromRecord(entry as Record<string, unknown>);
        }
        continue;
      }
      if (nested && typeof nested === 'object') {
        collectFromRecord(nested as Record<string, unknown>);
      }
    }
  };

  collectFromRecord(toolResult);

  const mediaWithFallbacks = assignMediaThumbnailFallbacks(media);
  const fallbackPoster =
    mediaWithFallbacks.find(
      (item) =>
        item.type === 'image' &&
        /(?:thumb|thumbnail|poster|preview|cover|graphic|title[-_\s]?card|intro|generated)/i.test(
          item.url
        )
    ) ?? mediaWithFallbacks.find((item) => item.type === 'image');

  if (!fallbackPoster) return mediaWithFallbacks;

  return mediaWithFallbacks.map((item) =>
    item.type === 'video' && !item.thumbnailUrl
      ? { ...item, thumbnailUrl: fallbackPoster.url }
      : item
  );
}
