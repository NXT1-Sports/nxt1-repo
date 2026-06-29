export type VideoPlaybackSourceDescriptor = {
  readonly videoUrl?: string | null;
  readonly cloudflareVideoId?: string | null;
  readonly readyToStream?: boolean | null;
};

export function resolvePlayableVideoUrl(
  source: VideoPlaybackSourceDescriptor | null | undefined
): string | null {
  if (!source) return null;

  const cloudflareVideoId = source.cloudflareVideoId?.trim();
  if (cloudflareVideoId && source.readyToStream === false) return null;
  if (cloudflareVideoId) {
    return buildCloudflareHlsUrl(cloudflareVideoId, source.videoUrl ?? undefined);
  }

  const videoUrl = source.videoUrl?.trim();
  if (!videoUrl) return null;

  const cloudflareHlsUrl = resolveCloudflareHlsUrl(videoUrl);
  return cloudflareHlsUrl ?? videoUrl;
}

export function resolveCloudflareHlsUrl(videoUrl: string): string | null {
  try {
    const parsed = new URL(videoUrl);
    if (isHlsSourceUrl(videoUrl)) return videoUrl;

    if (parsed.hostname === 'watch.cloudflarestream.com') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? buildCloudflareHlsUrl(videoId) : null;
    }

    if (parsed.hostname === 'iframe.videodelivery.net') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? buildCloudflareHlsUrl(videoId) : null;
    }

    if (parsed.hostname.endsWith('.cloudflarestream.com')) {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `${parsed.origin}/${videoId}/manifest/video.m3u8` : null;
    }

    if (parsed.hostname.endsWith('.videodelivery.net')) {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? buildCloudflareHlsUrl(videoId) : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildCloudflareHlsUrl(videoId: string, sourceUrl?: string): string {
  const normalizedVideoId = videoId.trim();

  try {
    const parsed = sourceUrl ? new URL(sourceUrl) : null;
    if (
      parsed &&
      parsed.hostname.endsWith('.cloudflarestream.com') &&
      parsed.hostname !== 'watch.cloudflarestream.com'
    ) {
      return `${parsed.origin}/${normalizedVideoId}/manifest/video.m3u8`;
    }
  } catch {
    return `https://videodelivery.net/${encodeURIComponent(normalizedVideoId)}/manifest/video.m3u8`;
  }

  return `https://videodelivery.net/${encodeURIComponent(normalizedVideoId)}/manifest/video.m3u8`;
}

export function isHlsSourceUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/manifest/video.m3u8');
  } catch {
    return /\/manifest\/video\.m3u8(?:[?#]|$)/i.test(url);
  }
}

export function isCloudflarePlaybackSource(
  source: VideoPlaybackSourceDescriptor | null | undefined
): boolean {
  if (!source) return false;
  if (source.cloudflareVideoId?.trim()) return true;

  const videoUrl = source.videoUrl?.trim();
  if (!videoUrl) return false;

  try {
    const parsed = new URL(videoUrl);
    return (
      parsed.hostname === 'watch.cloudflarestream.com' ||
      parsed.hostname === 'iframe.videodelivery.net' ||
      parsed.hostname.endsWith('.cloudflarestream.com') ||
      parsed.hostname.endsWith('.videodelivery.net')
    );
  } catch {
    return false;
  }
}

export function resolveCloudflareBaseEmbedUrl(
  source: VideoPlaybackSourceDescriptor | null | undefined
): string | null {
  if (!source) return null;

  const cloudflareVideoId = source.cloudflareVideoId?.trim();
  if (cloudflareVideoId && source.readyToStream === false) return null;
  if (cloudflareVideoId) return `https://iframe.videodelivery.net/${cloudflareVideoId}`;

  const videoUrl = source.videoUrl?.trim();
  if (!videoUrl) return null;

  try {
    const parsed = new URL(videoUrl);
    if (parsed.hostname === 'iframe.videodelivery.net') return videoUrl;

    if (parsed.hostname === 'watch.cloudflarestream.com') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://iframe.videodelivery.net/${videoId}` : null;
    }

    if (parsed.hostname.endsWith('.videodelivery.net')) {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://iframe.videodelivery.net/${videoId}` : null;
    }

    if (parsed.hostname.endsWith('.cloudflarestream.com')) {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://iframe.videodelivery.net/${videoId}` : null;
    }
  } catch {
    return null;
  }

  return null;
}
