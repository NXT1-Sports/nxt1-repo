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
import { isCapacitor, isAndroid } from '@nxt1/core';
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

type MediaPluginApi = {
  savePhoto: (opts: { path: string; albumIdentifier?: string }) => Promise<void>;
  saveVideo: (opts: { path: string; albumIdentifier?: string }) => Promise<void>;
  getAlbums: () => Promise<{ albums: Array<{ identifier: string; name: string }> }>;
  createAlbum: (opts: { name: string }) => Promise<void>;
  getAlbumsPath: () => Promise<{ path: string }>;
};

type MediaPluginModule = {
  Media?: MediaPluginApi;
  default?: MediaPluginApi;
};

type FilesystemStatResult = {
  size?: number;
  ctime?: number;
  mtime?: number;
};

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
   * Save an image directly from a remote HTTPS URL to the device camera roll.
   *
   * On native iOS/Android, the @capacitor-community/media plugin fetches the
   * image using its own native downloader (SDWebImageDownloader on iOS, Glide
   * on Android). This bypasses WKWebView cross-origin restrictions and does NOT
   * require a prior download-to-cache step.
   *
   * Use this method whenever you already have an HTTPS image URL (e.g. Firebase
   * Storage). It is simpler and more reliable than `saveImageFromFileUri()`.
   */
  async saveImageFromUrl(url: string): Promise<SaveImageResult> {
    if (!this.isBrowser || !isCapacitor()) {
      return { success: false, error: 'Only available on native' };
    }

    // Log without the query-string to avoid leaking signed-URL tokens.
    this.logger.info('Saving image from URL', { url: url.split('?')[0] });

    try {
      const { MediaPlugin } = await this.loadMediaPlugin();
      const albumIdentifier = await this.getOrCreateAlbumIdentifier('NXT1');
      await MediaPlugin.savePhoto({ path: url, albumIdentifier });
      await this.haptics.notification('success');
      this.logger.info('Image saved to camera roll from URL');
      return { success: true, path: 'Photos' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image';
      this.logger.error('saveImageFromUrl error', err, { url: url.split('?')[0] });
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

    // Pass the file:// URI directly to the Media plugin.
    // Capacitor.convertFileSrc() converts file:// → https://localhost/_capacitor_file_/…
    // which is a WKWebView-internal URL scheme — native SDWebImageDownloader cannot
    // resolve it outside the WebView context, causing savePhoto to fail.
    // The @capacitor-community/media plugin handles file:// URIs natively on both
    // iOS (UIImage(contentsOfFile:)) and Android without any network request.
    const fileUri = tempResult.uri;

    // Attempt to save to the photo gallery via the Media plugin
    try {
      const { MediaPlugin } = await this.loadMediaPlugin();
      const albumIdentifier = await this.getOrCreateAlbumIdentifier(album ?? 'NXT1');
      await MediaPlugin.savePhoto({ path: fileUri, albumIdentifier });

      // Clean up temp file
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
        /* noop */
      });
      return { success: true, path: 'Photos' };
    } catch (mediaErr) {
      this.logger.error('Failed to save image to camera roll', mediaErr, {
        fileUri,
      });
      // Clean up temp file even on failure
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
        /* noop */
      });
      const message = mediaErr instanceof Error ? mediaErr.message : 'Failed to save image';
      return { success: false, error: message };
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
   * Save an image that has already been written to the device filesystem.
   *
   * Use this when you already have a local file URI (e.g. from
   * `Filesystem.downloadFile()`). Skips the fetch + base64 round-trip that
   * `saveImage()` performs, making it more efficient for large files.
   *
   * Only meaningful on native Capacitor. On web it is a no-op that returns
   * `{ success: false }`.
   */
  async saveImageFromFileUri(fileUri: string, album?: string): Promise<SaveImageResult> {
    if (!this.isBrowser || !isCapacitor()) {
      return { success: false, error: 'Only available on native' };
    }

    this.logger.info('Saving image from file URI', { album });

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      // Pass the file:// URI directly — same reason as saveToGallery:
      // convertFileSrc() produces a WKWebView-internal URL that native code
      // (SDWebImageDownloader) cannot resolve. The media plugin handles file://
      // URIs natively on iOS (UIImage(contentsOfFile:)) and Android.

      try {
        const { MediaPlugin } = await this.loadMediaPlugin();
        const albumIdentifier = await this.getOrCreateAlbumIdentifier(album ?? 'NXT1');
        await MediaPlugin.savePhoto({ path: fileUri, albumIdentifier });
        // Clean up — best effort
        await Filesystem.deleteFile({ path: fileUri, directory: Directory.Cache }).catch(
          (cleanupErr: unknown) => {
            this.logger.warn('Failed to clean up cached image file', {
              error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          }
        );
        await this.haptics.notification('success');
        this.logger.info('Image saved to camera roll from file URI');
        return { success: true, path: 'Photos' };
      } catch (mediaErr) {
        this.logger.error('Failed to save to camera roll from file URI', mediaErr);
        // Clean up on failure too
        await Filesystem.deleteFile({ path: fileUri, directory: Directory.Cache }).catch(() => {
          /* noop */
        });
        const message = mediaErr instanceof Error ? mediaErr.message : 'Failed to save image';
        return { success: false, error: message };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image';
      this.logger.error('saveImageFromFileUri error', err);
      return { success: false, error: message };
    }
  }

  /**
   * Save a video directly from a remote HTTPS URL to the device camera roll.
   *
   * On native iOS/Android, the @capacitor-community/media plugin fetches the
   * video using its native downloader. This bypasses WKWebView cross-origin
   * restrictions and does NOT require a prior download-to-cache step.
   *
   * Use this method whenever you already have an HTTPS video URL (e.g. Firebase
   * Storage, Cloudflare Stream, Runway-generated videos).
   */
  async saveVideoFromUrl(url: string): Promise<SaveImageResult> {
    if (!this.isBrowser || !isCapacitor()) {
      return { success: false, error: 'Only available on native' };
    }

    // Log without the query-string to avoid leaking signed-URL tokens.
    this.logger.info('Saving video from URL', { url: url.split('?')[0] });

    // Check if this is a streaming URL that can't be saved directly
    if (this.isStreamingVideoUrl(url)) {
      this.logger.warn('Attempted to save streaming video URL', { url: url.split('?')[0] });
      return {
        success: false,
        error:
          'This video is a live stream or uses streaming technology and cannot be saved directly. Try saving a standard MP4 video instead.',
      };
    }

    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      // The @capacitor-community/media iOS saveVideo implementation has a critical
      // bug: when given an HTTPS URL, it calls `try! Data(contentsOf: url!)` which
      // is a SYNCHRONOUS blocking download on the main thread. This causes iOS to
      // immediately kill the app (watchdog timeout / force-try crash).
      //
      // Workaround: download the video to the app cache using Capacitor's async
      // Filesystem.downloadFile() first, then pass the file:// URI to saveVideo().
      // The iOS plugin skips the synchronous download branch when the path starts
      // with "file://" and saves to the Photos library safely via PHPhotoLibrary.
      //
      // Also: the plugin uses `data.lastIndex(of: ".")!` (force-unwrap) to extract
      // the file extension from the URL. For Firebase Storage / CDN signed URLs that
      // have no extension in the path, this would crash. We derive a safe .mp4
      // fallback from the URL path before the query string.
      const urlPath = url.split('?')[0];
      const rawExt = urlPath.includes('.') ? urlPath.substring(urlPath.lastIndexOf('.')) : '';
      const safeExt = /^\.[a-z0-9]{2,4}$/i.test(rawExt) ? rawExt : '.mp4';
      const fileName = `nxt1-video-${Date.now()}${safeExt}`;

      // Download to cache directory (async — does not block the main thread)
      const downloadResult = await Filesystem.downloadFile({
        url,
        path: fileName,
        directory: Directory.Cache,
      });

      const filePath = downloadResult.path;
      if (!filePath) {
        return { success: false, error: 'Failed to download video' };
      }

      this.logger.info('Video downloaded successfully', {
        fileName,
        filePath,
      });

      // Validate the downloaded file before attempting to save
      let fileInfo: FilesystemStatResult | undefined;
      try {
        fileInfo = await Filesystem.stat({
          path: fileName,
          directory: Directory.Cache,
        });

        // Check for minimum file size (videos should be at least 1KB)
        const minFileSizeBytes = 1024;
        if (!fileInfo.size || fileInfo.size < minFileSizeBytes) {
          this.logger.warn('Downloaded video file too small', {
            size: fileInfo.size,
            minSize: minFileSizeBytes,
          });
          // Clean up before returning
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
            /* noop */
          });
          return {
            success: false,
            error:
              'Downloaded video is incomplete or corrupted (too small). The video may not support direct download.',
          };
        }

        this.logger.info('Video file validated', {
          size: fileInfo.size,
          fileName,
          ctime: fileInfo.ctime,
          mtime: fileInfo.mtime,
        });
      } catch (statErr) {
        // Continue anyway — some filesystems may not support stat()
        this.logger.debug('Could not validate downloaded video stats', {
          error: statErr instanceof Error ? statErr.message : String(statErr),
        });
      }

      // Ensure path has the file:// scheme so the iOS plugin takes the safe branch
      const fileUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

      this.logger.info('Attempting to save video to camera roll', {
        fileUri,
        fileName,
        fileSize: fileInfo?.size,
        safeExt,
      });

      let saveError: unknown = null;
      try {
        const { MediaPlugin } = await this.loadMediaPlugin();
        const albumIdentifier = await this.getOrCreateAlbumIdentifier('NXT1');
        await MediaPlugin.saveVideo({ path: fileUri, albumIdentifier });
      } catch (err) {
        saveError = err;
        this.logger.error('Media plugin saveVideo call failed', err, {
          fileUri,
          fileName,
        });
      } finally {
        // Clean up temp file whether save succeeded or failed
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {
          /* noop */
        });
      }

      if (saveError) throw saveError;

      await this.haptics.notification('success');
      this.logger.info('Video saved to camera roll');
      return { success: true, path: 'Photos' };
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Failed to save video';
      const errorStr = message.toLowerCase();

      // Provide more specific error messages based on the error
      if (errorStr.includes('3302') || errorStr.includes('phphotos')) {
        message =
          'Unable to save: This video format may not be compatible with your device. Try a different video or check if the video plays properly.';
      } else if (errorStr.includes('timeout') || errorStr.includes('network')) {
        message = 'Network error while downloading. Please check your connection and try again.';
      } else if (errorStr.includes('permission') || errorStr.includes('denied')) {
        message =
          'Permission denied. Please check if the app has permission to access the photo library.';
      } else if (errorStr.includes('disk') || errorStr.includes('storage')) {
        message = 'Not enough storage space. Please free up some space and try again.';
      }

      this.logger.error('saveVideoFromUrl error', err, {
        url: url.split('?')[0],
        errorMessage: message,
      });
      return { success: false, error: message };
    }
  }

  private isStreamingVideoUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();

      // Check for HLS/streaming indicators
      if (pathname.includes('.m3u8') || pathname.includes('.m3u')) return true;
      if (pathname.includes('/manifest/')) return true;
      if (pathname.includes('/stream')) return true;

      // Check for Cloudflare Stream URLs (these need iframe/embed, not direct save)
      if (parsed.hostname.includes('cloudflarestream.com')) return true;
      if (parsed.hostname.includes('videodelivery.net')) return true;
      if (parsed.hostname === 'watch.cloudflarestream.com') return true;
      if (parsed.hostname === 'iframe.videodelivery.net') return true;

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Lazy load the @capacitor-community/media plugin.
   * This is optional — falls back gracefully if not installed.
   */
  private async loadMediaPlugin(): Promise<{
    MediaPlugin: MediaPluginApi;
  }> {
    // Dynamic import of optional peer dependency — caught at runtime if not installed
    const mod = (await import('@capacitor-community/media' as string)) as unknown as MediaPluginModule;
    const MediaPlugin = mod.Media ?? mod.default ?? mod;
    return { MediaPlugin };
  }

  /**
   * On Android, `albumIdentifier` is required by the @capacitor-community/media
   * plugin (v6+). This helper resolves the album folder path for a named album,
   * creating it if it does not exist.
   *
   * Strategy (Android):
   * 1. Try getAlbums() — returns existing albums with their folder path as identifier.
   * 2. If not found, call createAlbum() then retry getAlbums().
   * 3. Fallback: use getAlbumsPath() to get the base pictures directory and
   *    construct the path directly. This covers the case where an empty album
   *    is not yet indexed by the Android MediaStore and doesn't appear in getAlbums().
   *
   * On iOS, albumIdentifier is optional — returns undefined to allow add-only
   * permissions (NSPhotoLibraryAddUsageDescription) without requesting full access.
   */
  private async getOrCreateAlbumIdentifier(albumName: string): Promise<string | undefined> {
    if (!isAndroid()) return undefined;

    const { MediaPlugin } = await this.loadMediaPlugin();

    const findInAlbums = async (): Promise<string | undefined> => {
      try {
        const { albums } = await MediaPlugin.getAlbums();
        return albums.find((a) => a.name === albumName)?.identifier;
      } catch {
        return undefined;
      }
    };

    // 1. Try to find existing album
    let identifier = await findInAlbums();
    if (identifier) return identifier;

    // 2. Create the album (safe to call even if it already exists)
    try {
      await MediaPlugin.createAlbum({ name: albumName });
    } catch {
      // Album likely already exists — ignore
    }

    // 3. Try getAlbums() again after creation
    identifier = await findInAlbums();
    if (identifier) return identifier;

    // 4. Fallback: construct the path from getAlbumsPath().
    //    On Android, the albumIdentifier IS the folder path. An empty album may
    //    not appear in getAlbums() because the MediaStore hasn't scanned it yet,
    //    but savePhoto/saveVideo still accept an explicit path.
    try {
      const { path } = await MediaPlugin.getAlbumsPath();
      if (path) {
        const base = path.endsWith('/') ? path : `${path}/`;
        return `${base}${albumName}`;
      }
    } catch {
      this.logger.warn('getAlbumsPath() unavailable', { albumName });
    }

    this.logger.warn('Could not resolve Android album identifier', { albumName });
    // Returning undefined will cause the plugin to reject — throw a clear message
    throw new Error(`Could not find or create album "${albumName}" on this device`);
  }
}
