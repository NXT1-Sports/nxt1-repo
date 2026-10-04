/**
 * @fileoverview Shared helpers for previewing and downloading Agent X document files.
 *
 * Used by both the desktop Files panel and the mobile document preview sheet so they agree on
 * which files get the native document viewer and how downloaded files are named.
 */

import { isCapacitor, isDocumentPreviewSupported } from '@nxt1/core';
import type { AgentXLibraryFile } from '../services/agent-x-files.service';
import type { NxtBrowserService } from '../../services/browser/browser.service';

type FileTypeFields = Pick<AgentXLibraryFile, 'mimeType' | 'kind'>;

export function isPdfDocumentFile(file: FileTypeFields): boolean {
  return file.kind === 'pdf' || file.mimeType === 'application/pdf';
}

export function isSpreadsheetDocumentFile(file: FileTypeFields): boolean {
  const normalizedMimeType = file.mimeType.trim().toLowerCase();
  return (
    file.kind === 'csv' ||
    normalizedMimeType === 'text/csv' ||
    normalizedMimeType.includes('spreadsheet') ||
    normalizedMimeType.includes('excel')
  );
}

export function isPresentationDocumentFile(file: FileTypeFields): boolean {
  const normalizedMimeType = file.mimeType.trim().toLowerCase();
  return (
    file.kind === 'pptx' ||
    normalizedMimeType.includes('presentationml.presentation') ||
    normalizedMimeType.includes('powerpoint')
  );
}

/** True when `nxt1-document-viewer` can render the file (PDF, Word, spreadsheet, presentation). */
export function isDocumentPreviewableFile(
  file: Pick<AgentXLibraryFile, 'mimeType' | 'kind' | 'name'>
): boolean {
  return (
    isDocumentPreviewSupported(file.mimeType, file.name) ||
    isPdfDocumentFile(file) ||
    isSpreadsheetDocumentFile(file) ||
    isPresentationDocumentFile(file)
  );
}

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/csv': '.csv',
};

/** File name for a downloaded copy: appends an extension from the MIME type when missing. */
export function resolveDownloadFileName(
  file: Pick<AgentXLibraryFile, 'name' | 'mimeType'>
): string {
  const name = file.name.trim();
  const extension = /\.[A-Za-z0-9]{1,5}$/.test(name)
    ? ''
    : (EXTENSION_BY_MIME_TYPE[file.mimeType.trim().toLowerCase()] ?? '');
  return `${name}${extension}`.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Last-resort handling for a chat deliverable that cannot be previewed: download or open it.
 *
 * This runs after async work, outside the click's user activation, so a new tab would be
 * popup-blocked. Signed export links are served as attachments, so on the web a same-tab
 * navigation downloads the file without leaving the app. Native WebViews cannot download that
 * way, so they always hand the URL to the in-app browser.
 */
export function openDeliverableFallback(
  url: string,
  browser: Pick<NxtBrowserService, 'openLink'>
): void {
  if (
    !isCapacitor() &&
    typeof document !== 'undefined' &&
    /\/media-proxy\/export\//i.test(url) &&
    !/[?&]disposition=inline\b/i.test(url)
  ) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  void browser.openLink({
    url,
    source: 'agent_x_document_link',
    surface: 'message',
  });
}
