/**
 * @fileoverview NxtArchiveService — Cross-platform ZIP export helper
 * @module @nxt1/ui/services/archive
 */

import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isCapacitor } from '@nxt1/core';
import JSZip from 'jszip';
import { NxtLoggingService } from '../logging/logging.service';

export type ArchiveDownloadSource =
  | {
      readonly kind: 'url';
      readonly url: string;
      readonly fetchInit?: RequestInit;
    }
  | {
      readonly kind: 'blob';
      readonly blob: Blob;
    }
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'bytes';
      readonly bytes: ArrayBuffer | Uint8Array;
    };

export interface ArchiveDownloadEntry {
  readonly path: string;
  readonly source: ArchiveDownloadSource;
}

export interface ArchiveDownloadManifest {
  readonly path?: string;
  readonly data: unknown;
}

export interface DownloadZipOptions {
  readonly fileName: string;
  readonly entries: readonly ArchiveDownloadEntry[];
  readonly rootFolderName?: string;
  readonly manifest?: ArchiveDownloadManifest;
  readonly compression?: 'STORE' | 'DEFLATE';
}

export interface DownloadZipResult {
  readonly success: boolean;
  readonly fileName?: string;
  readonly entryCount?: number;
  readonly exportedFrom?: 'browser' | 'native';
  readonly error?: string;
}

@Injectable({ providedIn: 'root' })
export class NxtArchiveService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('NxtArchiveService');

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  async downloadZip(options: DownloadZipOptions): Promise<DownloadZipResult> {
    if (!this.isBrowser) {
      return { success: false, error: 'Not available during SSR' };
    }

    const sanitizedFileName = this.ensureZipExtension(options.fileName);
    const entries = options.entries
      .map((entry) => ({
        ...entry,
        path: this.normalizeArchivePath(entry.path),
      }))
      .filter((entry) => entry.path.length > 0);

    if (entries.length === 0) {
      return { success: false, error: 'No files were provided for the ZIP export' };
    }

    this.logger.info('Preparing ZIP download', {
      fileName: sanitizedFileName,
      entryCount: entries.length,
      hasManifest: !!options.manifest,
    });

    try {
      const zip = new JSZip();
      const usedPaths = new Map<string, number>();
      const rootFolderPath = options.rootFolderName
        ? this.normalizeArchivePath(options.rootFolderName)
        : '';

      for (const entry of entries) {
        const data = await this.resolveArchiveSource(entry.source);
        const relativePath = rootFolderPath ? `${rootFolderPath}/${entry.path}` : entry.path;
        const uniquePath = this.ensureUniqueArchivePath(relativePath, usedPaths);
        zip.file(uniquePath, data);
      }

      if (options.manifest) {
        const manifestPath = this.normalizeArchivePath(options.manifest.path ?? 'manifest.json');
        const relativeManifestPath = rootFolderPath
          ? `${rootFolderPath}/${manifestPath}`
          : manifestPath;
        zip.file(relativeManifestPath, JSON.stringify(options.manifest.data, null, 2));
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: options.compression ?? 'DEFLATE',
        compressionOptions: { level: 9 },
        streamFiles: true,
      });

      if (isCapacitor()) {
        await this.shareNativeZip(blob, sanitizedFileName);
        return {
          success: true,
          fileName: sanitizedFileName,
          entryCount: entries.length,
          exportedFrom: 'native',
        };
      }

      this.downloadBlob(blob, sanitizedFileName);
      return {
        success: true,
        fileName: sanitizedFileName,
        entryCount: entries.length,
        exportedFrom: 'browser',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create ZIP export';
      this.logger.error('ZIP download failed', err, {
        fileName: sanitizedFileName,
        entryCount: entries.length,
      });
      return { success: false, error: message };
    }
  }

  private async resolveArchiveSource(
    source: ArchiveDownloadSource
  ): Promise<Blob | string | Uint8Array | ArrayBuffer> {
    switch (source.kind) {
      case 'blob':
        return source.blob;
      case 'bytes':
        return source.bytes;
      case 'text':
        return source.text;
      case 'url': {
        const response = await fetch(source.url, source.fetchInit);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${source.url} (${response.status})`);
        }

        return response.blob();
      }
    }
  }

  private downloadBlob(blob: Blob, fileName: string): void {
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

  private async shareNativeZip(blob: Blob, fileName: string): Promise<void> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const base64Data = await this.blobToBase64(blob);
    const cacheFileName = fileName.endsWith('.zip') ? fileName : `${fileName}.zip`;

    const tempResult = await Filesystem.writeFile({
      path: cacheFileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: 'NXT1 ZIP export',
        text: 'Share or save your ZIP export',
        files: [tempResult.uri],
        dialogTitle: 'Share ZIP export',
      });
    } finally {
      await Filesystem.deleteFile({
        path: cacheFileName,
        directory: Directory.Cache,
      }).catch(() => {
        /* noop */
      });
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to encode ZIP data'));
          return;
        }

        resolve(result.split(',')[1] ?? result);
      };
      reader.onerror = () => reject(new Error('Failed to encode ZIP data'));
      reader.readAsDataURL(blob);
    });
  }

  private normalizeArchivePath(value: string): string {
    return value
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => this.sanitizeArchiveSegment(segment))
      .filter((segment) => segment.length > 0)
      .join('/');
  }

  private sanitizeArchiveSegment(value: string): string {
    const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const withoutControlChars = Array.from(normalized, (character) => {
      const codePoint = character.codePointAt(0) ?? 0x20;
      return codePoint <= 0x1f ? ' ' : character;
    }).join('');

    const stripped = withoutControlChars
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/g, '')
      .replace(/^\.+/g, '');

    if (!stripped || stripped === '.' || stripped === '..') {
      return 'item';
    }

    return stripped;
  }

  private ensureZipExtension(fileName: string): string {
    const normalized = fileName.trim().replace(/\.zip$/i, '');
    const safeBase = this.normalizeArchivePath(normalized) || 'archive';
    return `${safeBase}.zip`;
  }

  private ensureUniqueArchivePath(path: string, usedPaths: Map<string, number>): string {
    const nextIndex = (usedPaths.get(path) ?? 0) + 1;
    usedPaths.set(path, nextIndex);

    if (nextIndex === 1) {
      return path;
    }

    const lastSlashIndex = path.lastIndexOf('/');
    const directory = lastSlashIndex >= 0 ? path.slice(0, lastSlashIndex + 1) : '';
    const fileName = lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path;
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
    const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';

    const duplicatePath = `${directory}${baseName} (${nextIndex})${extension}`;
    if (usedPaths.has(duplicatePath)) {
      return this.ensureUniqueArchivePath(duplicatePath, usedPaths);
    }

    usedPaths.set(duplicatePath, 1);
    return duplicatePath;
  }
}
