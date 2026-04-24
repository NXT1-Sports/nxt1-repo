import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeImageFileForUpload } from './image-normalization';

describe('normalizeImageFileForUpload', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;

  function createFakeFile(name: string, type: string, size = 100): File {
    const content = new Uint8Array(size);
    return new File([content], name, { type, lastModified: 1234567890 });
  }

  // Use a real class so `instanceof OffscreenCanvas` works in canvasToBlob
  class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return { drawImage: vi.fn() };
    }
    convertToBlob({ type }: { type?: string; quality?: number } = {}) {
      return Promise.resolve(new Blob(['normalized'], { type: type || 'image/jpeg' }));
    }
  }

  beforeEach(() => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      close: vi.fn(),
    });

    globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;
  });

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  });

  it('should return the original file for GIFs', async () => {
    const gif = createFakeFile('animation.gif', 'image/gif');
    const result = await normalizeImageFileForUpload(gif);
    expect(result).toBe(gif);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('should return the original file for non-image types', async () => {
    const pdf = createFakeFile('doc.pdf', 'application/pdf');
    const result = await normalizeImageFileForUpload(pdf);
    expect(result).toBe(pdf);
  });

  it('should normalize a JPEG file', async () => {
    const jpeg = createFakeFile('photo.jpg', 'image/jpeg');
    const result = await normalizeImageFileForUpload(jpeg);

    expect(result).not.toBe(jpeg);
    expect(result.name).toBe('photo.jpg');
    expect(result.lastModified).toBe(1234567890);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(jpeg, {
      imageOrientation: 'from-image',
    });
  });

  it('should normalize a PNG file', async () => {
    const png = createFakeFile('screenshot.png', 'image/png');
    const result = await normalizeImageFileForUpload(png);

    expect(result).not.toBe(png);
    expect(result.name).toBe('screenshot.png');
  });

  it('should normalize a WebP file', async () => {
    const webp = createFakeFile('image.webp', 'image/webp');
    const result = await normalizeImageFileForUpload(webp);

    expect(result).not.toBe(webp);
    expect(result.name).toBe('image.webp');
  });

  it('should clamp oversized images to 1920px max dimension', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 4032,
      height: 3024,
      close: vi.fn(),
    });

    const constructorSpy = vi.fn();
    class SpyOffscreenCanvas extends MockOffscreenCanvas {
      constructor(w: number, h: number) {
        super(w, h);
        constructorSpy(w, h);
      }
    }
    globalThis.OffscreenCanvas = SpyOffscreenCanvas as unknown as typeof OffscreenCanvas;

    const jpeg = createFakeFile('huge.jpg', 'image/jpeg');
    await normalizeImageFileForUpload(jpeg);

    // 4032 × 3024 → ratio = 1920/4032 = 0.4762 → 1920 × 1440
    expect(constructorSpy).toHaveBeenCalledWith(1920, 1440);
  });

  it('should not clamp images within the max dimension', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 1200,
      height: 900,
      close: vi.fn(),
    });

    const constructorSpy = vi.fn();
    class SpyOffscreenCanvas extends MockOffscreenCanvas {
      constructor(w: number, h: number) {
        super(w, h);
        constructorSpy(w, h);
      }
    }
    globalThis.OffscreenCanvas = SpyOffscreenCanvas as unknown as typeof OffscreenCanvas;

    const jpeg = createFakeFile('small.jpg', 'image/jpeg');
    await normalizeImageFileForUpload(jpeg);

    expect(constructorSpy).toHaveBeenCalledWith(1200, 900);
  });

  it('should close the bitmap even on canvas error', async () => {
    const closeFn = vi.fn();
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 800,
      height: 600,
      close: closeFn,
    });

    // Make OffscreenCanvas fail by returning null context (still a class for instanceof)
    class BrokenOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return null;
      }
    }
    globalThis.OffscreenCanvas = BrokenOffscreenCanvas as unknown as typeof OffscreenCanvas;

    const jpeg = createFakeFile('photo.jpg', 'image/jpeg');
    const result = await normalizeImageFileForUpload(jpeg);

    expect(closeFn).toHaveBeenCalled();
    // Outer catch returns original file
    expect(result).toBe(jpeg);
  });

  it('should return the original file when createImageBitmap is unavailable', async () => {
    // @ts-expect-error - testing unavailable API
    globalThis.createImageBitmap = undefined;

    // Also make the fallback Image path fail so the outer catch returns original
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new Error('Not supported in test');
    };

    try {
      const jpeg = createFakeFile('photo.jpg', 'image/jpeg');
      const result = await normalizeImageFileForUpload(jpeg);

      expect(result).toBe(jpeg);
      expect(result.name).toBe('photo.jpg');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
    }
  });
});
