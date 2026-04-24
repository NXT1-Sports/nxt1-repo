function resolveOutputMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function drawToCanvas(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create offscreen canvas context');
    }
    context.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  if (typeof document === 'undefined') {
    throw new Error('Document is not available for image normalization');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create canvas context');
  }
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mimeType, quality: 0.92 });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Failed to convert canvas to blob'));
      },
      mimeType,
      0.92
    );
  });
}

/** Cap dimensions to avoid decoding full 12MP+ images on mobile. */
const MAX_DIMENSION = 1920;

function clampDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height };
  }
  const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

async function normalizeWithImageBitmap(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const mimeType = resolveOutputMimeType(file.type);
    const { width, height } = clampDimensions(bitmap.width, bitmap.height);
    const canvas = drawToCanvas(bitmap, width, height);
    const blob = await canvasToBlob(canvas, mimeType);
    return new File([blob], file.name, {
      type: blob.type || mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

async function normalizeWithImageElement(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to load image for normalization'));
      element.src = objectUrl;
    });

    const mimeType = resolveOutputMimeType(file.type);
    const { width, height } = clampDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = drawToCanvas(image, width, height);
    const blob = await canvasToBlob(canvas, mimeType);

    return new File([blob], file.name, {
      type: blob.type || mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function normalizeImageFileForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined') {
    return file;
  }

  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }

  try {
    return (await normalizeWithImageBitmap(file)) ?? (await normalizeWithImageElement(file));
  } catch {
    return file;
  }
}
