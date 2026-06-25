import type { TeamFilmReviewDoc, TeamFilmReviewSourceVideo } from '@nxt1/core';

type FilmReviewMediaSourceLike = Pick<
  TeamFilmReviewSourceVideo,
  'cloudflareVideoId' | 'storagePath' | 'videoUrl' | 'downloadUrl'
>;

type FilmReviewMediaReviewLike = Pick<
  TeamFilmReviewDoc,
  'cloudflareVideoId' | 'storagePath' | 'videoUrl' | 'sources' | 'breakdownSource'
>;

export type FilmReviewMediaAssetRefs = {
  readonly cloudflareVideoIds: readonly string[];
  readonly storagePaths: readonly string[];
};

export function collectFilmReviewMediaAssetRefs(
  review: FilmReviewMediaReviewLike
): FilmReviewMediaAssetRefs {
  const cloudflareVideoIds = new Set<string>();
  const storagePaths = new Set<string>();

  const addCloudflareVideoId = (value: string | null | undefined): void => {
    const normalized = normalizeTrimmedString(value);
    if (normalized) {
      cloudflareVideoIds.add(normalized);
    }
  };

  const addStoragePath = (value: string | null | undefined): void => {
    const normalized = normalizeTrimmedString(value);
    if (normalized) {
      storagePaths.add(normalized);
    }
  };

  const addStorageUrl = (value: string | null | undefined): void => {
    const resolvedStoragePath = extractStoragePathFromUrl(value);
    if (resolvedStoragePath) {
      storagePaths.add(resolvedStoragePath);
    }
  };

  const addSource = (source: FilmReviewMediaSourceLike | null | undefined): void => {
    if (!source) return;
    addCloudflareVideoId(source.cloudflareVideoId);
    addStoragePath(source.storagePath);
    addStorageUrl(source.videoUrl);
    addStorageUrl(source.downloadUrl);
  };

  addCloudflareVideoId(review.cloudflareVideoId);
  addStoragePath(review.storagePath);
  addStorageUrl(review.videoUrl);

  for (const source of review.sources ?? []) {
    addSource(source);
  }

  addStoragePath(review.breakdownSource?.storagePath);

  return {
    cloudflareVideoIds: [...cloudflareVideoIds],
    storagePaths: [...storagePaths],
  };
}

export function extractStoragePathFromUrl(urlInput: string | null | undefined): string | null {
  const normalizedInput = normalizeTrimmedString(urlInput);
  if (!normalizedInput) return null;

  if (normalizedInput.startsWith('gs://')) {
    const withoutScheme = normalizedInput.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex === -1) return null;
    return normalizeTrimmedString(withoutScheme.slice(slashIndex + 1).replace(/^\/+/, ''));
  }

  if (!normalizedInput.includes('://')) {
    return normalizeTrimmedString(normalizedInput.replace(/^\/+/, ''));
  }

  try {
    const url = new URL(normalizedInput);

    const firebaseObjectPath = extractFirebaseObjectPath(url.pathname);
    if (firebaseObjectPath) {
      return firebaseObjectPath;
    }

    if (url.hostname === 'storage.googleapis.com') {
      const withoutLeadingSlash = url.pathname.replace(/^\//, '');
      const slashIndex = withoutLeadingSlash.indexOf('/');
      if (slashIndex === -1) return null;
      return normalizeTrimmedString(decodeURIComponent(withoutLeadingSlash.slice(slashIndex + 1)));
    }

    return null;
  } catch {
    return null;
  }
}

function extractFirebaseObjectPath(pathname: string): string | null {
  const marker = '/o/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex === -1) return null;

  const encodedObjectPath = pathname.slice(markerIndex + marker.length).replace(/^\/+/, '');
  if (!encodedObjectPath) return null;

  return normalizeTrimmedString(decodeURIComponent(encodedObjectPath));
}

function normalizeTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
