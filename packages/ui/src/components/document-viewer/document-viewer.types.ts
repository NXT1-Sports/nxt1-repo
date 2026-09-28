/**
 * @fileoverview Document Viewer Types & Interfaces
 * @module @nxt1/ui/components/document-viewer
 */

import type { DocumentPreviewManifest, DocumentSpreadsheetCell } from '@nxt1/core';

export type DocumentViewerMode = 'preview' | 'printable_pdf' | 'fallback';

export interface DocumentPreviewSession {
  readonly available: boolean;
  readonly reason?: string;
  readonly manifest?: DocumentPreviewManifest;
}

export interface DocumentCellSelection {
  readonly sheetId: string;
  readonly sheetName: string;
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
  readonly rangeA1: string;
  readonly selectedCells: readonly DocumentSpreadsheetCell[];
  readonly count: number;
  readonly sum?: number;
  readonly average?: number;
}

export type DocumentZoomMode = 'fit_width' | 'fit_page' | 'custom';
