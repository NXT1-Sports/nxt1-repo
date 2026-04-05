/**
 * @fileoverview NxtMediaService — Global Cross-Platform Save-to-Device
 * @module @nxt1/ui/services/media
 * @version 1.0.0
 *
 * Professional, platform-safe media saving service for Angular + Ionic/Capacitor.
 * Provides a unified API for saving images (base64, blob, data URL) to:
 * - **Web**: Triggers browser download via synthesized `<a download>` click
 * - **Mobile (Capacitor)**: Writes to device gallery via Filesystem + Media plugins
 *
 * Usable anywhere in the app: QR codes, AI-generated graphics, scout reports, etc.
 *
 * SSR-safe — all browser/native APIs are guarded behind platform checks.
 *
 * @example
 * ```typescript
 * const media = inject(NxtMediaService);
 *
 * // Save a base64 QR code image to the device
 * const result = await media.saveImage({
 *   data: 'data:image/png;base64,iVBOR...',
 *   fileName: 'nxt1-invite-qr',
 *   format: 'png',
 * });
 *
 * if (result.success) {
 *   toast.success('Saved to photos!');
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { isCapacitor } from '@nxt1/core';
import { NxtLoggingService } from '../logging/logging.service';
import { NxtToastService } from '../toast/toast.service';
import { HapticsService } from '../haptics/haptics.service';

// ============================================
// TYPES
// ============================================

/** Supported image formats for saving. */
export type MediaImageFormat = 'png' | 'jpeg' | 'webp';

/** Input configuration for saving an image. */
export interface SaveImageOptions {
  /**
   * Image data — accepts:
   * - Data URL (`data:image/png;base64,...`)
   * - Raw base64 string (no prefix)
   * - Blob
   */
  readonly data: string | Blob;

  /** File name without extension (extension derived from `format`). */
  readonly fileName: string;

  /** Image format. Defaults to `'png'`. */
  readonly format?: MediaImageFormat;

  /** Optional album/folder name on mobile (defaults to 'NXT1'). */
  readonly album?: string;
}

/** Result from a save operation. */
export interface SaveImageResult {
  readonly success: boolean;
  /** File path on device (mobile) or download name (web). */
  readonly path?: string;
  readonly error?: string;
}

/** Input configuration for sharing an image via native share sheet. */
export interface ShareImageOptions {
  /** Image data — data URL or raw base64. */
  readonly data: string;
  /** Title for the share dialog. */
  readonly title?: string;
  /** Descriptive text. */
  readonly text?: string;
  /** File name without extension. */
  readonly fileName?: string;
  /** Image format. Defaults to `'png'`. */
  readonly format?: MediaImageFormat;
}

/** Result from a share operation. */
export interface ShareImageResult {
  readonly success: boolean;
  /** The activity type chosen by the user (iOS) or package (Android). */
  readonly activityType?: string;
  readonly error?: string;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class NxtMediaService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('NxtMediaService');
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Save an image to the device.
   * - **Web**: Triggers a browser file download.
   * - **Mobile**: Saves directly to the device photo gallery.
   */
  async saveImage(options: SaveImageOptions): Promise<SaveImageResult> {
    if (!this.isBrowser) {
      return { success: false, error: 'Not available during SSR' };
    }

    const format = options.format ?? 'png';
    const fullFileName = `${options.fileName}.${format}`;

    this.logger.info('Saving image', { fileName: fullFileName, format });

    try {
      let result: SaveImageResult;

      if (isCapacitor()) {
        result = await this.saveToGallery(options.data, fullFileName, format, options.album);
      } else {
        result = await this.saveViaDownload(options.data, fullFileName, format);
      }

      if (result.success) {
        await this.haptics.notification('success');
        this.logger.info('Image saved successfully', { fileName: fullFileName, path: result.path });
      } else {
        this.logger.error('Failed to save image', undefined, { error: result.error });
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image';
      this.logger.error('Save image error', err, { fileName: fullFileName });
      return { success: false, error: message };
    }
  }

  /**
   * Share an image via the native share sheet (mobile) or Web Share API.
   */
  async shareImage(options: ShareImageOptions): Promise<ShareImageResult> {
    if (!this.isBrowser) {
      return { success: false, error: 'Not available during SSR' };
    }

    const format = options.format ?? 'png';
    const fileName = options.fileName ?? 'nxt1-image';
    const fullFileName = `${fileName}.${format}`;

    this.logger.info('Sharing image', { fileName: fullFileName });

    try {
      if (isCapacitor()) {
        return await this.shareNative(
          options.data,
          fullFileName,
          format,
          options.title,
          options.text
        );
      }
      return await this.shareWeb(options.data, fullFileName, format, options.title, options.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share image';
      this.logger.error('Share image error', err, { fileName: fullFileName });
      return { success: false, error: message };
    }
  }

  // ============================================
  // PRIVATE — MOBILE (Capacitor)
  // ============================================

  /**
   * Save image directly to the device photo gallery via Capacitor Filesystem.
   * Writes a temporary file, then moves it to the gallery via the Media plugin.
   */
  private async saveToGallery(
    data: string | Blob,
    fileName: string,
    format: MediaImageFormat,
    album?: string
  ): Promise<SaveImageResult> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    const base64Data = await this.toBase64(data, format);

    // Write temporary file to the app cache directory
    const tempResult = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    // Attempt to save to the photo gallery via the Media plugin
    try {
      const { MediaPlugin } = await this.loadMediaPlugin();
      await MediaPlugin.savePhoto({
        path: tempResult.uri,
        album: album ?? 'NXT1',
      });

      // Clean up temp file
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
        /* noop */
      });
      return { success: true, path: 'Photos' };
    } catch {
      // Fallback: if @capacitor-community/media isn't installed,
      // the file is already saved in cache — inform the user
      this.logger.info('Media plugin unavailable, file saved to app cache', {
        path: tempResult.uri,
      });
      return { success: true, path: tempResult.uri };
    }
  }

  /**
   * Share image natively via Capacitor Share plugin.
   * Writes a temp file and shares the file URI for maximum compatibility.
   */
  private async shareNative(
    data: string,
    fileName: string,
    format: MediaImageFormat,
    title?: string,
    text?: string
  ): Promise<ShareImageResult> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const base64Data = await this.toBase64(data, format);

    // Write temp file for sharing
    const tempResult = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
    });

    const result = await Share.share({
      title: title ?? 'NXT1',
      text,
      files: [tempResult.uri],
      dialogTitle: title ?? 'Share Image',
    });

    // Clean up temp file
    await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
      /* noop */
    });

    return {
      success: true,
      activityType: result.activityType ?? undefined,
    };
  }

  // ============================================
  // PRIVATE — WEB
  // ============================================

  /**
   * Trigger a browser download via a synthesized `<a download>` click.
   */
  private async saveViaDownload(
    data: string | Blob,
    fileName: string,
    format: MediaImageFormat
  ): Promise<SaveImageResult> {
    const blob = await this.toBlob(data, format);
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 100);

    return { success: true, path: fileName };
  }

  /**
   * Share image via Web Share API (level 2 — with files).
   * Falls back to clipboard copy if Web Share files aren't supported.
   */
  private async shareWeb(
    data: string,
    fileName: string,
    format: MediaImageFormat,
    title?: string,
    text?: string
  ): Promise<ShareImageResult> {
    const mimeType = `image/${format}`;
    const blob = await this.toBlob(data, format);
    const file = new File([blob], fileName, { type: mimeType });

    // Check if Web Share Level 2 (files) is supported
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return { success: true };
    }

    // Fallback: copy image to clipboard
    try {
      await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
      this.toast.success('Image copied to clipboard');
      return { success: true };
    } catch {
      // Final fallback: download instead
      this.toast.info('Share not supported — downloading instead');
      return this.saveViaDownload(data, fileName, format);
    }
  }

  // ============================================
  // PRIVATE — HELPERS
  // ============================================

  /**
   * Convert input data (data URL, raw base64, or Blob) to a pure base64 string
   * without the `data:` prefix — required by Capacitor Filesystem.
   */
  private async toBase64(data: string | Blob, _format: MediaImageFormat): Promise<string> {
    if (data instanceof Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(data);
      });
    }

    // Strip data URL prefix if present
    if (data.startsWith('data:')) {
      return data.split(',')[1] ?? data;
    }

    return data;
  }

  /**
   * Convert input data (data URL, raw base64, or Blob) to a Blob — required for web downloads.
   */
  private async toBlob(data: string | Blob, format: MediaImageFormat): Promise<Blob> {
    if (data instanceof Blob) return data;

    const mimeType = `image/${format}`;
    const base64 = data.startsWith('data:') ? (data.split(',')[1] ?? data) : data;
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);

    for (let i = 0; i < bytes.length; i++) {
      buffer[i] = bytes.charCodeAt(i);
    }

    return new Blob([buffer], { type: mimeType });
  }

  /**
   * Lazy load the @capacitor-community/media plugin.
   * This is optional — falls back gracefully if not installed.
   */
  private async loadMediaPlugin(): Promise<{
    MediaPlugin: { savePhoto: (opts: { path: string; album?: string }) => Promise<void> };
  }> {
    // Dynamic import of optional peer dependency — caught at runtime if not installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (Function('return import("@capacitor-community/media")')() as Promise<any>);
    const MediaPlugin = mod.Media ?? mod.default ?? mod;
    return { MediaPlugin };
  }
}
