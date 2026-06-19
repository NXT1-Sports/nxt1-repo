import type { MediaViewerItem } from '../../components/media-viewer/media-viewer.types';

/** Minimal shape needed to map pending attachments into shared media-viewer items. */
export interface PendingAttachmentViewerFile {
  readonly file: File;
  readonly previewUrl: string | null;
  readonly type?: string;
  readonly isImage?: boolean;
  readonly isVideo?: boolean;
  /**
   * WebView-accessible native media path (e.g. `capacitor://localhost/...` on iOS).
   * Set for native Capacitor gallery picks where `file.size === 0` because the
   * browser File is a lightweight placeholder and `createObjectURL(file)` would
   * produce an unplayable empty blob URL.
   */
  readonly nativeWebPath?: string;
}

export interface PendingAttachmentViewerResult {
  readonly items: readonly MediaViewerItem[];
  readonly initialIndex: number;
  cleanup(): void;
}

interface ObjectUrlApi {
  createObjectURL(file: File): string;
  revokeObjectURL(url: string): void;
}

/**
 * Shared mapper for pending Agent X attachments to the media viewer model.
 * Used by both shell input chips and operation chat to ensure identical behavior.
 */
export function buildPendingAttachmentViewer(
  files: readonly PendingAttachmentViewerFile[],
  index: number,
  objectUrlApi?: ObjectUrlApi
): PendingAttachmentViewerResult {
  const tempObjectUrls: string[] = [];

  const resolveKind = (file: PendingAttachmentViewerFile): 'image' | 'video' | 'doc' => {
    if (file.type === 'image' || file.isImage) return 'image';
    if (file.type === 'video' || file.isVideo) return 'video';
    return 'doc';
  };

  const viewable = files
    .map((file) => {
      const kind = resolveKind(file);

      let url: string | null = null;

      if (kind === 'image') {
        // previewUrl is a blob/data URL for the image — use directly.
        url = file.previewUrl;
      } else if (kind === 'video') {
        // previewUrl is a JPEG canvas thumbnail — NOT a playable video.
        // For native Capacitor videos, the File can be a lightweight placeholder.
        // createObjectURL on that placeholder produces an unplayable blob URL.
        // Prefer the WebView-accessible native path whenever available.
        if (file.nativeWebPath) {
          url = file.nativeWebPath;
        } else if (objectUrlApi) {
          url = objectUrlApi.createObjectURL(file.file);
          tempObjectUrls.push(url);
        }
      } else if (kind === 'doc' && objectUrlApi) {
        url = objectUrlApi.createObjectURL(file.file);
        tempObjectUrls.push(url);
      }

      // Require a resolvable URL to include the item.
      if (!url) {
        return null;
      }

      return {
        original: file,
        item: {
          url,
          type: kind,
          alt: file.file.name,
          name: file.file.name,
          // For native videos the JS File is a zero-byte placeholder;
          // propagate the real size so the viewer can show it correctly.
          size: file.file.size || 0,
          // Pass the thumbnail as a poster image when available.
          ...(kind === 'video' && file.previewUrl ? { poster: file.previewUrl } : {}),
        } as MediaViewerItem,
      };
    })
    .filter((entry): entry is { original: PendingAttachmentViewerFile; item: MediaViewerItem } =>
      Boolean(entry)
    );

  const items = viewable.map((entry) => entry.item);
  const target = files[index];
  const mediaIndex = target ? viewable.findIndex((entry) => entry.original === target) : -1;

  return {
    items,
    initialIndex: Math.max(0, mediaIndex),
    cleanup: () => {
      if (!objectUrlApi) return;
      for (const url of tempObjectUrls) {
        objectUrlApi.revokeObjectURL(url);
      }
    },
  };
}
