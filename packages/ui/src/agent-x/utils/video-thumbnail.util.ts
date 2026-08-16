const VIDEO_THUMBNAIL_MIME_TYPE = 'image/jpeg';
const VIDEO_THUMBNAIL_QUALITY = 0.9;
const VIDEO_THUMBNAIL_MAX_EDGE_PX = 720;

type VideoThumbnailCapture = {
  readonly canvas: HTMLCanvasElement;
};

function buildThumbnailFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || 'video';
  return `${baseName}-thumbnail.jpg`;
}

async function createVideoThumbnailCapture(file: File): Promise<VideoThumbnailCapture | null> {
  if (!file.type.startsWith('video/')) {
    return null;
  }

  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<VideoThumbnailCapture | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;

      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (timeoutId) clearTimeout(timeoutId);
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objectUrl);
      };

      const fail = (): void => {
        cleanup();
        resolve(null);
      };

      // Timeout after 5 seconds to prevent infinite hangs if browser decoder limit is reached
      timeoutId = setTimeout(() => {
        fail();
      }, 5000);

      const capture = (): void => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          fail();
          return;
        }

        const maxEdge = Math.max(width, height);
        const scale =
          maxEdge > VIDEO_THUMBNAIL_MAX_EDGE_PX ? VIDEO_THUMBNAIL_MAX_EDGE_PX / maxEdge : 1;
        const canvasWidth = Math.max(1, Math.round(width * scale));
        const canvasHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          fail();
          return;
        }

        context.drawImage(video, 0, 0, canvasWidth, canvasHeight);
        cleanup();
        resolve({ canvas });
      };

      video.onerror = () => fail();
      video.onloadeddata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const targetTime = duration > 0.25 ? Math.min(1, duration * 0.1) : 0;
        if (targetTime <= 0) {
          capture();
          return;
        }

        const handleSeeked = (): void => {
          video.removeEventListener('seeked', handleSeeked);
          capture();
        };

        video.addEventListener('seeked', handleSeeked, { once: true });
        try {
          video.currentTime = targetTime;
        } catch {
          video.removeEventListener('seeked', handleSeeked);
          capture();
        }
      };
    });
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

export async function createInlineVideoThumbnail(file: File): Promise<string | null> {
  const capture = await createVideoThumbnailCapture(file);
  if (!capture) {
    return null;
  }

  return capture.canvas.toDataURL(VIDEO_THUMBNAIL_MIME_TYPE, VIDEO_THUMBNAIL_QUALITY);
}

export async function createVideoThumbnailFile(file: File): Promise<File | null> {
  if (typeof File === 'undefined') {
    return null;
  }

  const capture = await createVideoThumbnailCapture(file);
  if (!capture || typeof capture.canvas.toBlob !== 'function') {
    return null;
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    capture.canvas.toBlob(resolve, VIDEO_THUMBNAIL_MIME_TYPE, VIDEO_THUMBNAIL_QUALITY);
  });

  if (!blob || blob.size <= 0) {
    return null;
  }

  return new File([blob], buildThumbnailFileName(file.name), {
    type: VIDEO_THUMBNAIL_MIME_TYPE,
    lastModified: Date.now(),
  });
}
