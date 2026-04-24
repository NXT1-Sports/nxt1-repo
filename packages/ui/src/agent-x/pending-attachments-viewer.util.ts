import type { MediaViewerItem } from '../components/media-viewer/media-viewer.types';

/** Minimal shape needed to map pending attachments into shared media-viewer items. */
export interface PendingAttachmentViewerFile {
  readonly file: File;
  readonly previewUrl: string | null;
  readonly type?: string;
  readonly isImage?: boolean;
  readonly isVideo?: boolean;
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

      let url: string | null = file.previewUrl;

      if (!url && kind === 'doc' && objectUrlApi) {
        url = objectUrlApi.createObjectURL(file.file);
        tempObjectUrls.push(url);
      }

      // Match operation-chat behavior: image/video require preview URL.
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
          size: file.file.size,
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
