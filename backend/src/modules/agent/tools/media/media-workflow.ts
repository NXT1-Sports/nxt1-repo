export type MediaSourceType =
  | 'public_direct'
  | 'protected_direct'
  | 'hls_manifest'
  | 'dash_manifest'
  | 'playlist'
  | 'youtube'
  | 'staged'
  | 'cloudflare'
  | 'unknown';

export type TransportReadiness =
  | 'portable'
  | 'auth_required'
  | 'download_required'
  | 'persistence_optional'
  | 'persistence_required'
  | 'unknown';

export type RecommendedNextAction =
  | 'analyze_video'
  | 'stage_media'
  | 'call_apify_actor'
  | 'import_video'
  | 'enable_download'
  | 'review_media';

export interface MediaWorkflowArtifact {
  readonly mediaKind: 'video' | 'image' | 'audio' | 'document' | 'other';
  readonly sourceType: MediaSourceType;
  readonly transportReadiness: TransportReadiness;
  readonly analysisReady: boolean;
  readonly recommendedNextAction: RecommendedNextAction;
  readonly sourceUrl: string | null;
  readonly portableUrl: string | null;
  readonly playableUrls: readonly string[];
  readonly directMp4Urls: readonly string[];
  readonly manifestUrls: readonly string[];
  readonly stagingHeaders?: Readonly<Record<string, string>>;
  readonly rationale: string;
}

const MP4_PATTERN = /\.mp4(?:$|[?#])/i;
const HLS_PATTERN = /\.m3u8(?:$|[?#])/i;
const DASH_PATTERN = /\.mpd(?:$|[?#])/i;
const YOUTUBE_PATTERN =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i;
const CLOUDFLARE_STREAM_PATTERN = /^https?:\/\/(?:watch\.)?cloudflarestream\.com\//i;
const FIREBASE_STORAGE_PATTERN =
  /^https?:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i;
const AUTH_GATED_VIDEO_HOSTS = [/^(.+\.)?hudl\.com$/i];

export interface BuildVideoArtifactInput {
  readonly sourceUrl: string | null;
  readonly playableUrls: readonly string[];
  readonly directMp4Urls: readonly string[];
  readonly hlsUrls?: readonly string[];
  readonly dashUrls?: readonly string[];
  readonly recommendedHeaders?: Readonly<Record<string, string>>;
  readonly sourceTypeHint?: MediaSourceType;
  readonly rationale?: string;
}

export function buildVideoWorkflowArtifact(input: BuildVideoArtifactInput): MediaWorkflowArtifact {
  const playableUrls = uniqueStrings(input.playableUrls);
  const directMp4Urls = uniqueStrings(input.directMp4Urls);
  const hlsUrls = uniqueStrings(input.hlsUrls ?? []);
  const dashUrls = uniqueStrings(input.dashUrls ?? []);
  const manifestUrls = uniqueStrings([...hlsUrls, ...dashUrls]);
  const sourceUrl = input.sourceUrl ?? playableUrls[0] ?? null;
  const headers = normalizeHeaders(input.recommendedHeaders);
  const hasAuthHeaders = Object.keys(headers).length > 0;
  const requiresDownloaderByDomain =
    isLikelyAuthGatedVideoUrl(sourceUrl) ||
    directMp4Urls.some((url) => isLikelyAuthGatedVideoUrl(url));

  if (sourceUrl && YOUTUBE_PATTERN.test(sourceUrl)) {
    return {
      mediaKind: 'video',
      sourceType: 'youtube',
      transportReadiness: 'portable',
      analysisReady: true,
      recommendedNextAction: 'analyze_video',
      sourceUrl,
      portableUrl: sourceUrl,
      playableUrls: uniqueStrings([sourceUrl, ...playableUrls]),
      directMp4Urls,
      manifestUrls,
      stagingHeaders: undefined,
      rationale:
        input.rationale ?? 'YouTube links are natively portable for direct video analysis.',
    };
  }

  if (
    sourceUrl &&
    (CLOUDFLARE_STREAM_PATTERN.test(sourceUrl) || FIREBASE_STORAGE_PATTERN.test(sourceUrl))
  ) {
    const sourceType = FIREBASE_STORAGE_PATTERN.test(sourceUrl) ? 'staged' : 'cloudflare';
    return {
      mediaKind: 'video',
      sourceType,
      transportReadiness: sourceType === 'cloudflare' ? 'persistence_optional' : 'portable',
      analysisReady: true,
      recommendedNextAction: 'analyze_video',
      sourceUrl,
      portableUrl: sourceUrl,
      playableUrls: uniqueStrings([sourceUrl, ...playableUrls]),
      directMp4Urls: uniqueStrings([sourceUrl, ...directMp4Urls]),
      manifestUrls,
      stagingHeaders: undefined,
      rationale:
        input.rationale ??
        (sourceType === 'staged'
          ? 'The media has been prepared and is ready for direct video analysis.'
          : 'Cloudflare-hosted media is already portable for analysis and reuse.'),
    };
  }

  if (directMp4Urls.length > 0) {
    const portableUrl = directMp4Urls[0] ?? null;
    if (hasAuthHeaders || requiresDownloaderByDomain) {
      return {
        mediaKind: 'video',
        sourceType: 'protected_direct',
        transportReadiness: 'download_required',
        analysisReady: false,
        recommendedNextAction: 'call_apify_actor',
        sourceUrl: sourceUrl ?? portableUrl,
        portableUrl: null,
        playableUrls,
        directMp4Urls,
        manifestUrls,
        ...(hasAuthHeaders ? { stagingHeaders: headers } : {}),
        rationale:
          input.rationale ??
          (hasAuthHeaders
            ? 'A direct clip URL is available but requires authenticated access. The system will handle video format conversion before analysis.'
            : 'A direct clip URL is available from a platform-secured host. The system will handle video format conversion before analysis.'),
      };
    }

    return {
      mediaKind: 'video',
      sourceType: input.sourceTypeHint ?? 'public_direct',
      transportReadiness: 'portable',
      analysisReady: true,
      recommendedNextAction: 'analyze_video',
      sourceUrl: sourceUrl ?? portableUrl,
      portableUrl,
      playableUrls,
      directMp4Urls,
      manifestUrls,
      stagingHeaders: undefined,
      rationale:
        input.rationale ??
        'A direct MP4 URL is available and does not require authenticated request material.',
    };
  }

  if (hlsUrls.length > 0) {
    return {
      mediaKind: 'video',
      sourceType: 'hls_manifest',
      transportReadiness: 'download_required',
      analysisReady: false,
      recommendedNextAction: 'call_apify_actor',
      sourceUrl: sourceUrl ?? hlsUrls[0] ?? null,
      portableUrl: null,
      playableUrls,
      directMp4Urls,
      manifestUrls,
      ...(hasAuthHeaders ? { stagingHeaders: headers } : {}),
      rationale:
        input.rationale ??
        'Only streaming format files are available. Converting to a playable format before analysis.',
    };
  }

  if (dashUrls.length > 0) {
    return {
      mediaKind: 'video',
      sourceType: 'dash_manifest',
      transportReadiness: 'download_required',
      analysisReady: false,
      recommendedNextAction: 'call_apify_actor',
      sourceUrl: sourceUrl ?? dashUrls[0] ?? null,
      portableUrl: null,
      playableUrls,
      directMp4Urls,
      manifestUrls,
      ...(hasAuthHeaders ? { stagingHeaders: headers } : {}),
      rationale:
        input.rationale ??
        'Only streaming format files are available. Converting to a playable format before analysis.',
    };
  }

  if (input.sourceTypeHint === 'playlist' && sourceUrl) {
    return {
      mediaKind: 'video',
      sourceType: 'playlist',
      transportReadiness: hasAuthHeaders ? 'download_required' : 'unknown',
      analysisReady: false,
      recommendedNextAction: hasAuthHeaders ? 'call_apify_actor' : 'review_media',
      sourceUrl,
      portableUrl: null,
      playableUrls,
      directMp4Urls,
      manifestUrls,
      ...(hasAuthHeaders ? { stagingHeaders: headers } : {}),
      rationale:
        input.rationale ??
        (hasAuthHeaders
          ? 'Playlist clip pages should be resolved or downloaded in batch with the authenticated request bundle before analysis.'
          : 'Playlist item URLs need another acquisition step before analysis.'),
    };
  }

  return {
    mediaKind: 'video',
    sourceType: input.sourceTypeHint ?? 'unknown',
    transportReadiness: 'unknown',
    analysisReady: false,
    recommendedNextAction: 'review_media',
    sourceUrl,
    portableUrl: null,
    playableUrls,
    directMp4Urls,
    manifestUrls,
    ...(hasAuthHeaders ? { stagingHeaders: headers } : {}),
    rationale:
      input.rationale ??
      'The media source could not be classified as directly portable. Review the extraction result before choosing the next tool.',
  };
}

export function buildPortableMediaArtifact(params: {
  readonly sourceUrl: string;
  readonly mediaKind?: MediaWorkflowArtifact['mediaKind'];
  readonly rationale?: string;
}): MediaWorkflowArtifact {
  return {
    mediaKind: params.mediaKind ?? 'video',
    sourceType: FIREBASE_STORAGE_PATTERN.test(params.sourceUrl)
      ? 'staged'
      : CLOUDFLARE_STREAM_PATTERN.test(params.sourceUrl)
        ? 'cloudflare'
        : YOUTUBE_PATTERN.test(params.sourceUrl)
          ? 'youtube'
          : 'public_direct',
    transportReadiness: FIREBASE_STORAGE_PATTERN.test(params.sourceUrl)
      ? 'portable'
      : CLOUDFLARE_STREAM_PATTERN.test(params.sourceUrl)
        ? 'persistence_optional'
        : 'portable',
    analysisReady: true,
    recommendedNextAction:
      (params.mediaKind ?? 'video') === 'image' ? 'review_media' : 'analyze_video',
    sourceUrl: params.sourceUrl,
    portableUrl: params.sourceUrl,
    playableUrls: [params.sourceUrl],
    directMp4Urls: MP4_PATTERN.test(params.sourceUrl) ? [params.sourceUrl] : [],
    manifestUrls:
      HLS_PATTERN.test(params.sourceUrl) || DASH_PATTERN.test(params.sourceUrl)
        ? [params.sourceUrl]
        : [],
    rationale:
      params.rationale ?? 'This media source is already portable and ready for direct analysis.',
  };
}

export interface BuildImageArtifactInput {
  readonly url: string;
  readonly alt?: string;
  readonly sourceUrl?: string;
  readonly rationale?: string;
}

/**
 * Build a MediaWorkflowArtifact for a single image URL.
 *
 * - Firebase Storage / Firebase Hosting → staged, portable, review_media
 * - Any other public URL → public_direct, portable, review_media
 * mediaKind is always 'image'.
 */
export function buildImageWorkflowArtifact(input: BuildImageArtifactInput): MediaWorkflowArtifact {
  const url = input.url.trim();
  const isStaged = FIREBASE_STORAGE_PATTERN.test(url);

  return {
    mediaKind: 'image',
    sourceType: isStaged ? 'staged' : 'public_direct',
    transportReadiness: 'portable',
    analysisReady: true,
    recommendedNextAction: 'review_media',
    sourceUrl: input.sourceUrl ?? url,
    portableUrl: url,
    playableUrls: [url],
    directMp4Urls: [],
    manifestUrls: [],
    stagingHeaders: undefined,
    rationale:
      input.rationale ??
      (isStaged
        ? 'Image has been staged to Firebase Storage and is portable for review.'
        : 'Public image URL is portable and ready for review or write_athlete_images.'),
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeHeaders(headers?: Readonly<Record<string, string>>): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([, value]) => typeof value === 'string' && value.trim().length > 0
    )
  );
}

function isLikelyAuthGatedVideoUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AUTH_GATED_VIDEO_HOSTS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}
