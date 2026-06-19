import { describe, expect, it, vi } from 'vitest';
import { buildPendingAttachmentViewer } from './pending-attachments-viewer.util';

describe('buildPendingAttachmentViewer', () => {
  it('uses nativeWebPath for zero-byte native videos instead of an empty blob URL', () => {
    const createObjectURL = vi.fn(() => 'blob:empty-video');
    const revokeObjectURL = vi.fn();
    const file = new File([], 'clip.mov', { type: 'video/quicktime' });

    const viewer = buildPendingAttachmentViewer(
      [
        {
          file,
          previewUrl: 'data:image/jpeg;base64,AAAA',
          type: 'video',
          nativeWebPath: 'capacitor://localhost/_capacitor_file_/clip.mov',
        },
      ],
      0,
      { createObjectURL, revokeObjectURL }
    );

    expect(viewer.items).toEqual([
      {
        url: 'capacitor://localhost/_capacitor_file_/clip.mov',
        type: 'video',
        alt: 'clip.mov',
        name: 'clip.mov',
        size: 0,
        poster: 'data:image/jpeg;base64,AAAA',
      },
    ]);
    expect(createObjectURL).not.toHaveBeenCalled();

    viewer.cleanup();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('creates and cleans up object URLs for regular browser videos', () => {
    const createObjectURL = vi.fn(() => 'blob:playable-video');
    const revokeObjectURL = vi.fn();
    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' });

    const viewer = buildPendingAttachmentViewer([{ file, previewUrl: null, type: 'video' }], 0, {
      createObjectURL,
      revokeObjectURL,
    });

    expect(viewer.items[0]?.url).toBe('blob:playable-video');
    viewer.cleanup();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:playable-video');
  });
});
