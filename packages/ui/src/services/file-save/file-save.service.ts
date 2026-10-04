/**
 * @fileoverview NxtFileSaveService — Cross-platform "save this file" helper
 * @module @nxt1/ui/services/file-save
 *
 * Native (Capacitor): writes the blob to the cache directory and opens the OS share sheet
 * (Save to Files, AirDrop, Mail, Drive, …), then removes the temp file. `<a download>` does not
 * work inside native WebViews, so this is the only reliable way to hand a file to the user.
 *
 * Web: triggers a regular browser download via an object URL.
 */

import { Injectable } from '@angular/core';
import { isCapacitor } from '@nxt1/core';

export type FileSaveOutcome = 'shared' | 'downloaded' | 'cancelled';

export interface SaveBlobOptions {
  /** Share sheet title (native only). */
  readonly title?: string;
  /** Share sheet body text (native only). */
  readonly text?: string;
  /** Android chooser title (native only). */
  readonly dialogTitle?: string;
}

/** Trigger a browser download for a blob. No-op outside the browser. */
export function downloadBlobInBrowser(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode file data'));
        return;
      }

      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = () => reject(new Error('Failed to encode file data'));
    reader.readAsDataURL(blob);
  });
}

/** Capacitor Share rejects with "Share canceled" (iOS) / similar when the user dismisses the sheet. */
function isShareCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /cancel/i.test(message);
}

/** Strip path separators and characters that are invalid in cache file names. */
function toCacheFileName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || 'download';
}

@Injectable({ providedIn: 'root' })
export class NxtFileSaveService {
  async saveBlob(
    blob: Blob,
    fileName: string,
    options?: SaveBlobOptions
  ): Promise<FileSaveOutcome> {
    if (isCapacitor()) {
      return this.shareNative(blob, fileName, options);
    }

    downloadBlobInBrowser(blob, fileName);
    return 'downloaded';
  }

  private async shareNative(
    blob: Blob,
    fileName: string,
    options?: SaveBlobOptions
  ): Promise<FileSaveOutcome> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const cacheFileName = toCacheFileName(fileName);
    const base64Data = await blobToBase64(blob);

    const tempResult = await Filesystem.writeFile({
      path: cacheFileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: options?.title ?? cacheFileName,
        ...(options?.text ? { text: options.text } : {}),
        files: [tempResult.uri],
        dialogTitle: options?.dialogTitle ?? 'Save or share file',
      });
      return 'shared';
    } catch (error) {
      if (isShareCancellation(error)) return 'cancelled';
      throw error;
    } finally {
      await Filesystem.deleteFile({
        path: cacheFileName,
        directory: Directory.Cache,
      }).catch(() => {
        /* noop */
      });
    }
  }
}
