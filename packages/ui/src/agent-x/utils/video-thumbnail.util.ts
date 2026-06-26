export async function createInlineVideoThumbnail(file: File): Promise<string | null> {
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
    return await new Promise<string | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;

      const cleanup = (): void => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objectUrl);
      };

      const fail = (): void => {
        cleanup();
        resolve(null);
      };

      const capture = (): void => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          fail();
          return;
        }

        const maxWidth = 160;
        const aspectRatio = width / height;
        const canvasWidth = Math.min(maxWidth, width);
        const canvasHeight = Math.max(1, Math.round(canvasWidth / aspectRatio));
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          fail();
          return;
        }

        context.drawImage(video, 0, 0, canvasWidth, canvasHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        cleanup();
        resolve(dataUrl);
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
