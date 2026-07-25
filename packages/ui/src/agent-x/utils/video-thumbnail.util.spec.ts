import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInlineVideoThumbnail, createVideoThumbnailFile } from './video-thumbnail.util';

describe('video thumbnail utilities', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it('returns null for non-video files', async () => {
    const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' });

    await expect(createInlineVideoThumbnail(file)).resolves.toBeNull();
    await expect(createVideoThumbnailFile(file)).resolves.toBeNull();
  });

  it('captures a video frame as a durable JPEG file', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:video'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') {
        const video = {
          videoWidth: 1920,
          videoHeight: 1080,
          duration: 0,
          preload: '',
          muted: false,
          playsInline: false,
          onerror: null as (() => void) | null,
          onloadeddata: null as (() => void) | null,
          pause: vi.fn(),
          load: vi.fn(),
          removeAttribute: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          set src(_value: string) {
            setTimeout(() => this.onloadeddata?.(), 0);
          },
        };
        return video as unknown as HTMLVideoElement;
      }

      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
        vi.spyOn(canvas, 'getContext').mockReturnValue({
          drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(canvas, 'toBlob').mockImplementation((callback: BlobCallback) => {
          callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
        });
        return canvas;
      }

      return originalCreateElement(tagName);
    });

    const file = new File(['video'], 'Buchtel Full Game Film.mp4', { type: 'video/mp4' });
    const thumbnail = await createVideoThumbnailFile(file);

    expect(thumbnail).toBeInstanceOf(File);
    expect(thumbnail?.name).toBe('Buchtel Full Game Film-thumbnail.jpg');
    expect(thumbnail?.type).toBe('image/jpeg');
    expect(thumbnail?.size).toBeGreaterThan(0);
  });
});
