/**
 * @fileoverview Universal Document Viewer Component
 * @module @nxt1/ui/components/document-viewer
 *
 * Enterprise in-app document viewer for Agent X / The Lab.
 * Supports:
 * - PDF documents (Mozilla PDF.js canvas rendering, page navigation, zoom, rotation)
 * - Presentation slide decks (native slide rendering, thumbnail strip, slide navigation)
 * - Spreadsheets (multi-sheet tabs, virtualized grid, range selection, summary calculations)
 * - Word documents (via normalized PDF preview or structured content)
 * - Agent X context anchoring for targeted chat prompts
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  type DocumentPreviewAnchor,
  type DocumentPreviewManifest,
  type DocumentSheetMetadata,
  type DocumentSlideMetadata,
  type DocumentSpreadsheetCell,
  type UniversalFileDocumentType,
  resolveUniversalFileDocumentType,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { DOCUMENT_VIEWER_TEST_IDS } from '@nxt1/core/testing';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

import { NxtIconComponent } from '../icon/icon.component';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import type { AgentXLibraryFile } from '../../agent-x/services/agent-x-files.service';
import { DocumentPreviewClientService } from './document-preview-client.service';
import type { PptxPresentation } from './pptx/pptx-renderer';
import type {
  DocumentAskAgentSelection,
  DocumentCellSelection,
  DocumentViewerMode,
} from './document-viewer.types';

const MAX_DOCX_PREVIEW_BYTES = 25 * 1024 * 1024;
const DOCX_SAFE_LINK_PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);
const DOCX_FIT_PADDING_PX = 60;

const MAX_PPTX_PREVIEW_BYTES = 50 * 1024 * 1024;
/** Breathing room around the fitted slide inside the presentation stage. */
const PPTX_FIT_PADDING_PX = 16;
const DOCX_MIN_FIT_SCALE = 0.2;

/** Horizontal padding of the PDF viewport (24px each side). */
const PDF_VIEWPORT_PADDING_PX = 48;
/** Fit-to-width never upscales past this, matching the old 1.5x render capped by max-width:100%. */
const PDF_MAX_FIT_SCALE = 1.5;
/** iOS Safari silently blanks canvases above ~16.7M pixels. */
const PDF_MAX_CANVAS_PIXELS = 16_000_000;
const PDF_RESIZE_DEBOUNCE_MS = 120;

/** Cells fetched per sheet; the grid has no paging, so larger sheets show a notice. */
const SPREADSHEET_MAX_ROWS = 60;
const SPREADSHEET_MAX_COLS = 30;
/** Excel's default column width (Calibri 11) in character units. */
const SPREADSHEET_DEFAULT_COL_CHARS = 8.43;
/** Excel's default row height in points (20px). */
const SPREADSHEET_DEFAULT_ROW_POINTS = 15;
const SPREADSHEET_DEFAULT_COL_PX = 64;
const SPREADSHEET_MIN_COL_PX = 24;
const SPREADSHEET_MIN_ROW_PX = 12;

/** Inverse of the column px conversion used by the grid (Calibri 11: 7px/char + 5px). */
function pxToExcelColumnChars(px: number): number {
  return Math.max(0, Math.round(((px - 5) / 7) * 100) / 100);
}

/** Mirrors the backend's per-request edit cap. */
const MAX_CELL_EDITS_PER_SAVE = 500;
/** Keeps Ask Agent context summaries a reasonable size for large selections. */
const MAX_SELECTION_EXCERPT_CHARS = 4_000;

/** Friendly copy for preview-session / render fallback reasons; unknown codes are never shown raw. */
const FALLBACK_REASON_MESSAGES: Readonly<Record<string, string>> = {
  unsupported_word_format:
    'In-app preview supports modern Word (.docx) files. Download this older format to open it in Word.',
  document_too_large:
    'This document is too large to preview in the app. Download it to view the full file.',
  docx_render_failed: 'This Word document could not be rendered. Download it to open it in Word.',
  pdf_render_failed:
    'This PDF could not be rendered in the app. Download it or open it externally.',
  unsupported:
    'In-app preview is not available for this file type. Download or open it externally.',
  feature_disabled:
    'Document previews are turned off right now. Download or open the file externally.',
  source_not_ready: 'This file is still processing. Try again in a moment, or download it.',
  network_error:
    'The preview could not be loaded. Check your connection and try again, or download the file.',
  negotiation_failed: 'The preview could not be prepared. Download or open the file externally.',
  client_error: 'The preview could not be loaded. Download or open the file externally.',
  empty_spreadsheet: 'This spreadsheet has no sheets to preview. Download it to open it in Excel.',
  empty_presentation: 'This presentation has no slides to preview. Download it to open it.',
  presentation_render_failed:
    'This presentation could not be rendered. Download it to open it in PowerPoint.',
};

/** Converts a 1-based column index to its spreadsheet name (1 → A, 26 → Z, 27 → AA). */
export function toSpreadsheetColumnName(index: number): string {
  let n = Math.floor(index);
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// docx-preview emits the document's font names with no fallback, so any Office font the viewer
// lacks (Aptos, Calibri, Cambria...) drops to the browser default serif. Append a same-class
// stack; the document's own font still wins whenever it is installed. Carlito/Caladea are the
// metric-compatible open replacements for Calibri/Cambria when present.
const DOCX_GENERIC_FAMILIES: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);
const DOCX_SERIF_FONTS: ReadonlySet<string> = new Set([
  'times new roman',
  'times',
  'cambria',
  'georgia',
  'garamond',
  'book antiqua',
  'palatino linotype',
  'constantia',
  'century schoolbook',
  'aptos serif',
]);
const DOCX_MONO_FONTS: ReadonlySet<string> = new Set([
  'consolas',
  'courier new',
  'courier',
  'lucida console',
  'aptos mono',
  'cascadia code',
  'cascadia mono',
]);
const DOCX_SANS_STACK =
  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
const DOCX_SERIF_STACK = 'Georgia, "Times New Roman", "Liberation Serif", serif';
const DOCX_METRIC_TWINS: Readonly<Record<string, string>> = {
  calibri: 'Carlito',
  cambria: 'Caladea',
};
const DOCX_MONO_STACK = 'Consolas, Menlo, Monaco, "Courier New", monospace';

/** Appends a fallback stack to a docx `font-family` value, matched to the primary font's class. */
export function withDocxFontFallback(value: string): string {
  const families = value
    .split(',')
    .map((f) =>
      f
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase()
    )
    .filter(Boolean);
  if (families.length === 0 || families.some((f) => DOCX_GENERIC_FAMILIES.has(f))) return value;

  const primary = families[0];
  const stack = DOCX_SERIF_FONTS.has(primary)
    ? DOCX_SERIF_STACK
    : DOCX_MONO_FONTS.has(primary)
      ? DOCX_MONO_STACK
      : DOCX_SANS_STACK;
  const twin = DOCX_METRIC_TWINS[primary];
  return `${value.trim()}, ${twin ? `${twin}, ` : ''}${stack}`;
}

@Component({
  selector: 'nxt1-document-viewer',
  standalone: true,
  imports: [CommonModule, OverlayModule, NxtIconComponent],
  template: `
    <div
      class="nxt1-doc-viewer"
      [class.nxt1-doc-viewer--compact]="_compact()"
      [attr.data-testid]="testIds.CONTAINER"
    >
      @if (loading()) {
        <div class="nxt1-doc-viewer__loading" [attr.data-testid]="testIds.LOADING">
          <div class="nxt1-doc-viewer__spinner"></div>
          <span class="nxt1-doc-viewer__loading-text">Preparing document preview...</span>
        </div>
      } @else if (error() || isFallback()) {
        <div class="nxt1-doc-viewer__fallback" [attr.data-testid]="testIds.FALLBACK">
          <div class="nxt1-doc-viewer__fallback-icon">
            <nxt1-icon [name]="iconForDocumentType(docType())" [size]="32" />
          </div>
          <div class="nxt1-doc-viewer__fallback-copy">
            <h3 class="nxt1-doc-viewer__fallback-title">{{ _file().name }}</h3>
            <p class="nxt1-doc-viewer__fallback-msg">
              {{ fallbackMessage() }}
            </p>
          </div>
          <div class="nxt1-doc-viewer__fallback-actions">
            <button
              type="button"
              class="nxt1-doc-viewer__btn nxt1-doc-viewer__btn--primary"
              [attr.data-testid]="testIds.OPEN_ORIGINAL_BTN"
              (click)="onOpenOriginal()"
            >
              <nxt1-icon name="openInNew" [size]="16" />
              <span>{{ openActionLabel() }}</span>
            </button>
            <button
              type="button"
              class="nxt1-doc-viewer__btn"
              [attr.data-testid]="testIds.DOWNLOAD_BTN"
              (click)="onDownload()"
            >
              <nxt1-icon name="download" [size]="16" />
              <span>Download</span>
            </button>
          </div>
        </div>
      } @else {
        <!-- ═══ TOOLBAR ═══ -->
        <header class="nxt1-doc-viewer__toolbar" [attr.data-testid]="testIds.TOOLBAR">
          <div class="nxt1-doc-viewer__toolbar-left">
            @if (docType() === 'pdf' || mode() === 'printable_pdf') {
              <div class="nxt1-doc-viewer__pagination" [attr.data-testid]="testIds.PAGINATION">
                <button
                  type="button"
                  class="nxt1-doc-viewer__icon-btn"
                  [disabled]="currentPage() <= 1"
                  [attr.data-testid]="testIds.PREV_PAGE_BTN"
                  aria-label="Previous page"
                  (click)="prevPage()"
                >
                  <nxt1-icon name="chevronLeft" [size]="16" />
                </button>
                <div class="nxt1-doc-viewer__page-indicator">
                  <span class="nxt1-doc-viewer__page-num">{{ currentPage() }}</span>
                  <span class="nxt1-doc-viewer__page-sep">/</span>
                  <span class="nxt1-doc-viewer__page-total">{{ totalPages() }}</span>
                </div>
                <button
                  type="button"
                  class="nxt1-doc-viewer__icon-btn"
                  [disabled]="currentPage() >= totalPages()"
                  [attr.data-testid]="testIds.NEXT_PAGE_BTN"
                  aria-label="Next page"
                  (click)="nextPage()"
                >
                  <nxt1-icon name="chevronRight" [size]="16" />
                </button>
              </div>
            } @else if (docType() === 'presentation') {
              <div class="nxt1-doc-viewer__pagination" [attr.data-testid]="testIds.PAGINATION">
                <button
                  type="button"
                  class="nxt1-doc-viewer__icon-btn"
                  [disabled]="currentSlide() <= 1"
                  [attr.data-testid]="testIds.PREV_PAGE_BTN"
                  aria-label="Previous slide"
                  (click)="prevSlide()"
                >
                  <nxt1-icon name="chevronLeft" [size]="16" />
                </button>
                <div class="nxt1-doc-viewer__page-indicator">
                  <span class="nxt1-doc-viewer__page-num">Slide {{ currentSlide() }}</span>
                  <span class="nxt1-doc-viewer__page-sep">/</span>
                  <span class="nxt1-doc-viewer__page-total">{{ totalSlides() }}</span>
                </div>
                <button
                  type="button"
                  class="nxt1-doc-viewer__icon-btn"
                  [disabled]="currentSlide() >= totalSlides()"
                  [attr.data-testid]="testIds.NEXT_PAGE_BTN"
                  aria-label="Next slide"
                  (click)="nextSlide()"
                >
                  <nxt1-icon name="chevronRight" [size]="16" />
                </button>
              </div>
            }

            @if (docType() === 'spreadsheet' && printablePdfUrl()) {
              <button
                type="button"
                class="nxt1-doc-viewer__pill-btn"
                [class.nxt1-doc-viewer__pill-btn--active]="mode() === 'printable_pdf'"
                (click)="toggleSpreadsheetPrintableMode()"
              >
                <span>{{ mode() === 'printable_pdf' ? 'Data Grid' : 'Printable View' }}</span>
              </button>
            }
          </div>

          <div class="nxt1-doc-viewer__toolbar-right">
            @if (docType() === 'pdf' || docType() === 'word' || mode() === 'printable_pdf') {
              <button
                type="button"
                class="nxt1-doc-viewer__icon-btn"
                [disabled]="zoomLevel() <= 0.5"
                [attr.data-testid]="testIds.ZOOM_OUT_BTN"
                aria-label="Zoom out"
                title="Zoom out"
                (click)="zoomOut()"
              >
                <nxt1-icon name="minus" [size]="16" />
              </button>
              <span class="nxt1-doc-viewer__zoom-label">{{ zoomPercent() }}%</span>
              <button
                type="button"
                class="nxt1-doc-viewer__icon-btn"
                [disabled]="zoomLevel() >= 3.0"
                [attr.data-testid]="testIds.ZOOM_IN_BTN"
                aria-label="Zoom in"
                title="Zoom in"
                (click)="zoomIn()"
              >
                <nxt1-icon name="plus" [size]="16" />
              </button>
              @if (docType() !== 'word' && !toolbarDownload) {
                <button
                  type="button"
                  class="nxt1-doc-viewer__icon-btn"
                  [attr.data-testid]="testIds.ROTATE_BTN"
                  aria-label="Rotate clockwise"
                  title="Rotate clockwise"
                  (click)="rotateClockwise()"
                >
                  <nxt1-icon name="refresh" [size]="16" />
                </button>
              }
            }

            @if (toolbarDownload) {
              <button
                type="button"
                class="nxt1-doc-viewer__icon-btn"
                [attr.data-testid]="testIds.DOWNLOAD_BTN"
                [attr.aria-busy]="downloadBusy"
                [disabled]="downloadBusy"
                aria-label="Download file"
                title="Download"
                (click)="onDownload()"
              >
                @if (downloadBusy) {
                  <span class="nxt1-doc-viewer__btn-spinner" aria-hidden="true"></span>
                } @else {
                  <nxt1-icon name="download" [size]="16" />
                }
              </button>
            }

            @if (showAskAgent) {
              <!-- Ask Agent Anchor Action -->
              <button
                type="button"
                class="nxt1-doc-viewer__ask-agent-btn"
                [attr.data-testid]="testIds.ASK_AGENT_BTN"
                aria-label="Ask Agent X"
                title="Ask Agent X"
                aria-haspopup="menu"
                [attr.aria-expanded]="askAgentDropdownOpen()"
                cdkOverlayOrigin
                #askAgentMenuOrigin="cdkOverlayOrigin"
                (click)="toggleAskAgentDropdown()"
              >
                <svg
                  class="nxt1-doc-viewer__agent-logo"
                  viewBox="0 0 612 792"
                  fill="currentColor"
                  stroke="currentColor"
                  stroke-width="10"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path [attr.d]="agentLogoPath" />
                  <polygon [attr.points]="agentLogoPolygon" />
                </svg>
                <span>Ask Agent X</span>
                <nxt1-icon name="chevronDown" [size]="12" />
              </button>
              @if (askAgentDropdownOpen()) {
                <ng-template
                  cdkConnectedOverlay
                  [cdkConnectedOverlayOrigin]="askAgentMenuOrigin"
                  [cdkConnectedOverlayOpen]="true"
                  [cdkConnectedOverlayHasBackdrop]="true"
                  cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                  [cdkConnectedOverlayPositions]="askAgentMenuPositions"
                  [cdkConnectedOverlayPush]="true"
                  [cdkConnectedOverlayViewportMargin]="8"
                  (backdropClick)="closeAskAgentDropdown()"
                  (detach)="closeAskAgentDropdown()"
                >
                  <div
                    class="nxt1-doc-viewer__ask-agent-dropdown"
                    [attr.data-testid]="testIds.ASK_AGENT_DROPDOWN"
                    role="menu"
                    aria-label="Select pages or slides"
                  >
                    @if (docType() === 'pdf' && totalPages() > 0) {
                      <button
                        type="button"
                        class="nxt1-doc-viewer__ask-agent-dropdown-option"
                        [attr.data-testid]="testIds.ASK_AGENT_ALL_PAGES"
                        role="menuitemcheckbox"
                        [attr.aria-checked]="isAllPagesSelected()"
                        (click)="toggleAllPages()"
                      >
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-check">
                          @if (isAllPagesSelected()) {
                            <nxt1-icon name="checkmark" [size]="14" />
                          }
                        </span>
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-label">All pages</span>
                      </button>
                      <div class="nxt1-doc-viewer__ask-agent-dropdown-divider"></div>
                      <div class="nxt1-doc-viewer__ask-agent-dropdown-list">
                        @for (pageNum of pageNumbers(); track pageNum) {
                          <button
                            type="button"
                            class="nxt1-doc-viewer__ask-agent-dropdown-option"
                            [attr.data-testid]="testIds.ASK_AGENT_PAGE_CHECKBOX"
                            role="menuitemcheckbox"
                            [attr.aria-checked]="selectedAskAgentIndices().has(pageNum)"
                            (click)="toggleAskAgentIndex(pageNum)"
                          >
                            <span class="nxt1-doc-viewer__ask-agent-dropdown-check">
                              @if (selectedAskAgentIndices().has(pageNum)) {
                                <nxt1-icon name="checkmark" [size]="14" />
                              }
                            </span>
                            <span class="nxt1-doc-viewer__ask-agent-dropdown-label"
                              >Page {{ pageNum }}</span
                            >
                          </button>
                        }
                      </div>
                    } @else if (docType() === 'presentation' && totalSlides() > 0) {
                      <button
                        type="button"
                        class="nxt1-doc-viewer__ask-agent-dropdown-option"
                        [attr.data-testid]="testIds.ASK_AGENT_ALL_PAGES"
                        role="menuitemcheckbox"
                        [attr.aria-checked]="isAllSlidesSelected()"
                        (click)="toggleAllSlides()"
                      >
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-check">
                          @if (isAllSlidesSelected()) {
                            <nxt1-icon name="checkmark" [size]="14" />
                          }
                        </span>
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-label">All slides</span>
                      </button>
                      <div class="nxt1-doc-viewer__ask-agent-dropdown-divider"></div>
                      <div class="nxt1-doc-viewer__ask-agent-dropdown-list">
                        @for (slideNum of slideNumbers(); track slideNum) {
                          <button
                            type="button"
                            class="nxt1-doc-viewer__ask-agent-dropdown-option"
                            [attr.data-testid]="testIds.ASK_AGENT_PAGE_CHECKBOX"
                            role="menuitemcheckbox"
                            [attr.aria-checked]="selectedAskAgentIndices().has(slideNum)"
                            (click)="toggleAskAgentIndex(slideNum)"
                          >
                            <span class="nxt1-doc-viewer__ask-agent-dropdown-check">
                              @if (selectedAskAgentIndices().has(slideNum)) {
                                <nxt1-icon name="checkmark" [size]="14" />
                              }
                            </span>
                            <span class="nxt1-doc-viewer__ask-agent-dropdown-label"
                              >Slide {{ slideNum }}</span
                            >
                          </button>
                        }
                      </div>
                    } @else if (docType() === 'spreadsheet') {
                      <button
                        type="button"
                        class="nxt1-doc-viewer__ask-agent-dropdown-option"
                        [attr.data-testid]="testIds.ASK_AGENT_ALL_PAGES"
                        role="menuitem"
                        (click)="confirmAskAgentSheet()"
                      >
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-label">Current sheet</span>
                      </button>
                    } @else if (docType() === 'word') {
                      <button
                        type="button"
                        class="nxt1-doc-viewer__ask-agent-dropdown-option"
                        [attr.data-testid]="testIds.ASK_AGENT_ALL_PAGES"
                        role="menuitem"
                        (click)="confirmAskAgentDocument()"
                      >
                        <span class="nxt1-doc-viewer__ask-agent-dropdown-label"
                          >Entire document</span
                        >
                      </button>
                    }
                    @if (
                      docType() !== 'spreadsheet' &&
                      docType() !== 'word' &&
                      selectedAskAgentIndices().size > 0
                    ) {
                      <div class="nxt1-doc-viewer__ask-agent-dropdown-footer">
                        <button
                          type="button"
                          class="nxt1-doc-viewer__ask-agent-dropdown-confirm"
                          [attr.data-testid]="testIds.ASK_AGENT_CONFIRM"
                          (click)="confirmAskAgentSelection()"
                        >
                          Add to chat ({{ selectedAskAgentIndices().size }})
                        </button>
                      </div>
                    }
                  </div>
                </ng-template>
              }
            }
          </div>
        </header>

        <!-- ═══ STAGE ═══ -->
        <main class="nxt1-doc-viewer__stage" [attr.data-testid]="testIds.STAGE">
          <!-- 1. PDF / Printable PDF Canvas Stage -->
          @if (docType() === 'pdf' || mode() === 'printable_pdf') {
            <div #pdfViewport class="nxt1-doc-viewer__pdf-viewport">
              <!-- Zoom is baked into the render scale (no CSS transform) so pages stay sharp and scrollable. -->
              <div
                class="nxt1-doc-viewer__canvas-container"
                [class.nxt1-doc-viewer__canvas-container--pending]="!pdfPainted()"
              >
                <canvas #pdfCanvas class="nxt1-doc-viewer__pdf-canvas"></canvas>
              </div>
            </div>
            @if (!pdfPainted()) {
              <div
                class="nxt1-doc-viewer__docx-loading"
                [attr.data-testid]="testIds.LOADING"
                aria-live="polite"
              >
                <div class="nxt1-doc-viewer__spinner"></div>
                <span class="nxt1-doc-viewer__loading-text">Preparing document preview...</span>
              </div>
            }
          }

          <!-- 1b. Word (.docx) native HTML stage -->
          @if (docType() === 'word' && mode() === 'preview') {
            <div #docxViewport class="nxt1-doc-viewer__docx-viewport">
              <div #docxStyleHost></div>
              <div
                #docxHost
                class="nxt1-doc-viewer__docx-host"
                [style.zoom]="docxFitScale() * zoomLevel()"
              ></div>
            </div>
            @if (docxRendering()) {
              <div class="nxt1-doc-viewer__docx-loading" aria-live="polite">
                <div class="nxt1-doc-viewer__spinner"></div>
                <span class="nxt1-doc-viewer__loading-text">Rendering document...</span>
              </div>
            }
          }

          <!-- 2. Presentation stage: native slide render, text outline while it loads / if it can't -->
          @if (docType() === 'presentation' && mode() !== 'printable_pdf') {
            <div
              class="nxt1-doc-viewer__presentation-stage"
              [attr.data-testid]="testIds.SLIDE_STAGE"
            >
              @if (pptxDeck(); as deck) {
                <div #slideViewport class="nxt1-doc-viewer__slide-viewport">
                  <div
                    class="nxt1-doc-viewer__slide-frame"
                    [style.width.px]="deck.widthPx * pptxFitScale()"
                    [style.height.px]="deck.heightPx * pptxFitScale()"
                  >
                    <div
                      #slideHost
                      class="nxt1-doc-viewer__slide-host"
                      [style.transform]="'scale(' + pptxFitScale() + ')'"
                    ></div>
                  </div>
                </div>
              } @else if (!pptxRendering()) {
                <div class="nxt1-doc-viewer__slide-card">
                  @if (currentSlideData(); as slide) {
                    <div class="nxt1-doc-viewer__slide-header">
                      <span class="nxt1-doc-viewer__slide-badge"
                        >Slide {{ slide.slideNumber }}</span
                      >
                      @if (slide.hasVisualElements) {
                        <span class="nxt1-doc-viewer__slide-visual-badge">
                          Diagrams / Visuals Present
                        </span>
                      }
                    </div>
                    <h2 class="nxt1-doc-viewer__slide-title">
                      {{ slide.title || 'Slide ' + slide.slideNumber }}
                    </h2>
                    <div class="nxt1-doc-viewer__slide-body">
                      <p class="nxt1-doc-viewer__slide-text">
                        {{ slide.slideText || 'No slide text.' }}
                      </p>
                    </div>
                  }
                </div>
              }

              @if (pptxRendering()) {
                <div class="nxt1-doc-viewer__docx-loading" aria-live="polite">
                  <div class="nxt1-doc-viewer__spinner"></div>
                  <span class="nxt1-doc-viewer__loading-text">Rendering slides...</span>
                </div>
              }

              <!-- Bottom slide thumbnail rail -->
              @if (slideNumbers().length > 1 || manifest()?.slides?.length) {
                <nav
                  class="nxt1-doc-viewer__slide-rail"
                  [attr.data-testid]="testIds.SLIDE_THUMB_STRIP"
                >
                  @for (slideNum of slideNumbers(); track slideNum) {
                    <button
                      type="button"
                      class="nxt1-doc-viewer__slide-thumb"
                      [class.nxt1-doc-viewer__slide-thumb--active]="slideNum === currentSlide()"
                      [class.nxt1-doc-viewer__slide-thumb--rendered]="!!pptxDeck()"
                      [attr.aria-label]="'Slide ' + slideNum"
                      (click)="goToSlide(slideNum)"
                    >
                      @if (pptxDeck(); as deck) {
                        <span
                          #slideThumbHost
                          class="nxt1-doc-viewer__thumb-canvas"
                          [attr.data-slide-number]="slideNum"
                          [style.aspect-ratio]="deck.widthPx + ' / ' + deck.heightPx"
                        ></span>
                        <span class="nxt1-doc-viewer__thumb-num">{{ slideNum }}</span>
                      } @else {
                        <span class="nxt1-doc-viewer__thumb-num">{{ slideNum }}</span>
                        <span class="nxt1-doc-viewer__thumb-label">{{ slideTitle(slideNum) }}</span>
                      }
                    </button>
                  }
                </nav>
              }
            </div>
          }

          <!-- 3. Spreadsheet Data Grid Stage -->
          @if (docType() === 'spreadsheet' && mode() !== 'printable_pdf') {
            <div
              class="nxt1-doc-viewer__grid-stage"
              [class.nxt1-doc-viewer__grid-stage--resizing-col]="resizingAxis() === 'col'"
              [class.nxt1-doc-viewer__grid-stage--resizing-row]="resizingAxis() === 'row'"
              [attr.data-testid]="testIds.GRID_CONTAINER"
            >
              <div
                #gridScrollWrap
                class="nxt1-doc-viewer__grid-scroll-wrap"
                tabindex="0"
                role="grid"
                [attr.aria-label]="currentSheet()?.name ?? 'Spreadsheet'"
                (keydown)="onGridKeydown($event)"
              >
                <table class="nxt1-doc-viewer__grid-table">
                  <colgroup>
                    <col class="nxt1-doc-viewer__grid-row-hdr-col" />
                    @for (colNum of visibleColNumbers(); track colNum) {
                      <col [style.width.px]="columnWidthPx(colNum)" />
                    }
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="nxt1-doc-viewer__grid-corner">#</th>
                      @for (col of columnHeaderLabels(); track col; let colIdx = $index) {
                        <th class="nxt1-doc-viewer__grid-col-hdr">
                          {{ col }}
                          <span
                            class="nxt1-doc-viewer__col-resize"
                            role="separator"
                            aria-orientation="vertical"
                            [attr.aria-label]="'Resize column ' + col"
                            (pointerdown)="onColumnResizeStart(colIdx + 1, $event)"
                            (dblclick)="autoFitColumn(colIdx + 1)"
                          ></span>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (rowNum of visibleRowNumbers(); track rowNum) {
                      <tr [style.height.px]="rowHeightPx(rowNum)">
                        <td class="nxt1-doc-viewer__grid-row-hdr">
                          {{ rowNum }}
                          <span
                            class="nxt1-doc-viewer__row-resize"
                            role="separator"
                            aria-orientation="horizontal"
                            [attr.aria-label]="'Resize row ' + rowNum"
                            (pointerdown)="onRowResizeStart(rowNum, $event)"
                            (dblclick)="resetRowHeight(rowNum)"
                          ></span>
                        </td>
                        @for (colNum of visibleColNumbers(); track colNum) {
                          @if (!isCellCoveredByMerge(rowNum, colNum)) {
                            @let cell = getCell(rowNum, colNum);
                            <td
                              class="nxt1-doc-viewer__grid-cell"
                              [class.nxt1-doc-viewer__grid-cell--header]="cell?.isHeader"
                              [class.nxt1-doc-viewer__grid-cell--bold]="cell?.isBold"
                              [class.nxt1-doc-viewer__grid-cell--selected]="
                                isCellSelected(rowNum, colNum)
                              "
                              [class.nxt1-doc-viewer__grid-cell--editing]="
                                isCellEditing(rowNum, colNum)
                              "
                              [attr.rowspan]="cell?.rowSpan ?? null"
                              [attr.colspan]="cell?.colSpan ?? null"
                              [style]="getCellCss(rowNum, colNum)"
                              [attr.data-cell]="rowNum + ':' + colNum"
                              (mousedown)="onCellMouseDown(rowNum, colNum, $event)"
                              (mouseenter)="onCellMouseEnter(rowNum, colNum)"
                              (dblclick)="startCellEdit(rowNum, colNum)"
                            >
                              @if (isCellEditing(rowNum, colNum)) {
                                <input
                                  #cellEditor
                                  class="nxt1-doc-viewer__grid-cell-input"
                                  type="text"
                                  [value]="cellEditDraft()"
                                  [attr.aria-label]="'Edit ' + editingCellLabel()"
                                  (input)="onCellEditInput($event)"
                                  (keydown)="onCellEditorKeydown($event)"
                                  (blur)="commitCellEdit()"
                                  (mousedown)="$event.stopPropagation()"
                                  (dblclick)="$event.stopPropagation()"
                                />
                              } @else {
                                {{ cell?.formattedValue ?? '' }}
                              }
                            </td>
                          }
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              @if (gridTruncationNotice(); as notice) {
                <div class="nxt1-doc-viewer__grid-notice">{{ notice }}</div>
              }

              @if (cellSaveError(); as saveError) {
                <div
                  class="nxt1-doc-viewer__grid-notice nxt1-doc-viewer__grid-notice--error"
                  role="alert"
                >
                  {{ saveError }}
                </div>
              } @else if (cellSavesPending() > 0) {
                <div class="nxt1-doc-viewer__grid-notice" aria-live="polite">Saving…</div>
              }

              <!-- Selection status calculation bar -->
              @if (cellSelection(); as sel) {
                <div class="nxt1-doc-viewer__range-stats" [attr.data-testid]="testIds.RANGE_STATS">
                  <span class="nxt1-doc-viewer__range-label">{{ sel.rangeA1 }}</span>
                  <span class="nxt1-doc-viewer__stat">Count: {{ sel.count }}</span>
                  @if (sel.sum !== undefined) {
                    <span class="nxt1-doc-viewer__stat">Sum: {{ sel.sum }}</span>
                    <span class="nxt1-doc-viewer__stat">Avg: {{ sel.average?.toFixed(2) }}</span>
                  }
                  <button
                    type="button"
                    class="nxt1-doc-viewer__ask-agent-small-btn"
                    (click)="onAskAgentForSelection()"
                  >
                    Ask Agent about {{ isMultiCellSelection(sel) ? 'selection' : 'cell' }}
                  </button>
                </div>
              }

              <!-- Bottom sheet tab bar -->
              @if (manifest()?.sheets; as sheetList) {
                <nav class="nxt1-doc-viewer__sheet-tabs" [attr.data-testid]="testIds.SHEET_TABS">
                  @for (sheet of sheetList; track sheet.sheetId; let idx = $index) {
                    <button
                      type="button"
                      class="nxt1-doc-viewer__sheet-tab"
                      [class.nxt1-doc-viewer__sheet-tab--active]="idx === currentSheetIndex()"
                      (click)="onSelectSheet(idx)"
                    >
                      <span>{{ sheet.name }}</span>
                    </button>
                  }
                </nav>
              }
            </div>
          }
        </main>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        flex: 1 1 auto;
        color: var(--nxt1-color-text-primary, #ffffff);
        --agent-primary: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-doc-viewer {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        flex: 1 1 auto;
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #121212) 94%, #03111f 6%);
        border: 0;
        border-radius: 0;
        overflow: hidden;
        container-type: inline-size;
        container-name: nxt1-doc-viewer;
      }

      .nxt1-doc-viewer__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 420px;
        gap: 16px;
      }

      .nxt1-doc-viewer__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(255, 255, 255, 0.12);
        border-top-color: var(--agent-primary);
        border-radius: 50%;
        animation: nxtDocSpin 0.7s linear infinite;
      }

      @keyframes nxtDocSpin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-doc-viewer__loading-text {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .nxt1-doc-viewer__fallback {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 420px;
        padding: 24px;
        text-align: center;
        gap: 16px;
      }

      .nxt1-doc-viewer__fallback-icon {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1e1e1e) 85%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__fallback-title {
        margin: 0 0 6px 0;
        font-size: 16px;
        font-weight: 700;
      }

      .nxt1-doc-viewer__fallback-msg {
        margin: 0;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        max-width: 420px;
        line-height: 1.5;
      }

      .nxt1-doc-viewer__fallback-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 8px;
      }

      .nxt1-doc-viewer__btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 16px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-default, #2a2a2a);
        background: var(--nxt1-color-surface-200, #1e1e1e);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .nxt1-doc-viewer__btn:hover {
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1e1e1e) 80%, white 20%);
      }

      .nxt1-doc-viewer__btn--primary {
        background: var(--agent-primary);
        color: #000000;
        border-color: var(--agent-primary);
      }

      .nxt1-doc-viewer__btn--primary:hover {
        background: color-mix(in srgb, var(--agent-primary) 85%, white 15%);
      }

      /* ═══ TOOLBAR ═══ */
      .nxt1-doc-viewer__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #121212) 90%, #000 10%);
        border-bottom: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 60%, transparent);
        flex-shrink: 0;
        gap: 10px;
      }

      .nxt1-doc-viewer__toolbar-left,
      .nxt1-doc-viewer__toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .nxt1-doc-viewer__pagination {
        display: flex;
        align-items: center;
        gap: 4px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1e1e1e) 65%, transparent);
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 60%, transparent);
        border-radius: 8px;
        padding: 2px 4px;
      }

      .nxt1-doc-viewer__page-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
        padding: 0 4px;
      }

      .nxt1-doc-viewer__page-sep {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.4));
      }

      .nxt1-doc-viewer__icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition:
          background 0.12s ease,
          color 0.12s ease;
      }

      .nxt1-doc-viewer__icon-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      .nxt1-doc-viewer__icon-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .nxt1-doc-viewer__zoom-label {
        font-size: 12px;
        font-weight: 600;
        min-width: 40px;
        text-align: center;
      }

      .nxt1-doc-viewer__pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 60%, transparent);
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .nxt1-doc-viewer__pill-btn:hover {
        background: rgba(255, 255, 255, 0.06);
      }

      .nxt1-doc-viewer__pill-btn--active {
        background: color-mix(in srgb, var(--agent-primary) 15%, transparent);
        border-color: var(--agent-primary);
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__ask-agent-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--agent-primary) 40%, transparent);
        background: color-mix(in srgb, var(--agent-primary) 12%, transparent);
        color: var(--agent-primary);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        flex-shrink: 0;
        white-space: nowrap;
        transition: background 0.15s ease;
      }

      .nxt1-doc-viewer__ask-agent-btn:hover {
        background: color-mix(in srgb, var(--agent-primary) 22%, transparent);
      }

      @container nxt1-doc-viewer (max-width: 520px) {
        .nxt1-doc-viewer__ask-agent-btn {
          padding: 5px 8px;
        }

        .nxt1-doc-viewer__ask-agent-btn span {
          display: none;
        }
      }

      .nxt1-doc-viewer__btn-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-top-color: currentColor;
        border-radius: 50%;
        animation: nxtDocSpin 0.7s linear infinite;
      }

      /* ═══ COMPACT (mobile sheet / narrow hosts) ═══ */
      .nxt1-doc-viewer--compact .nxt1-doc-viewer__loading,
      .nxt1-doc-viewer--compact .nxt1-doc-viewer__fallback {
        min-height: 0;
      }

      .nxt1-doc-viewer--compact .nxt1-doc-viewer__toolbar {
        justify-content: flex-start;
        padding: 6px 10px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-doc-viewer--compact .nxt1-doc-viewer__toolbar::-webkit-scrollbar {
        display: none;
      }

      .nxt1-doc-viewer--compact .nxt1-doc-viewer__toolbar-left,
      .nxt1-doc-viewer--compact .nxt1-doc-viewer__toolbar-right {
        flex-shrink: 0;
      }

      .nxt1-doc-viewer--compact .nxt1-doc-viewer__toolbar-right {
        margin-left: auto;
      }

      @media (hover: none) and (pointer: coarse) {
        .nxt1-doc-viewer--compact .nxt1-doc-viewer__icon-btn {
          width: 36px;
          height: 36px;
        }

        .nxt1-doc-viewer--compact .nxt1-doc-viewer__pill-btn,
        .nxt1-doc-viewer--compact .nxt1-doc-viewer__btn {
          min-height: 36px;
        }
      }

      .nxt1-doc-viewer__ask-agent-dropdown {
        min-width: 220px;
        max-width: 300px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1e1e1e) 98%, #fff 2%);
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 85%, transparent);
        border-radius: 10px;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-option {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.12s ease;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-option:hover {
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1e1e1e) 70%, #fff 6%);
      }

      .nxt1-doc-viewer__ask-agent-dropdown-check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 90%, transparent);
        border-radius: 4px;
        background: transparent;
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-option[aria-checked='true']
        .nxt1-doc-viewer__ask-agent-dropdown-check {
        background: color-mix(in srgb, var(--agent-primary) 15%, transparent);
        border-color: var(--agent-primary);
      }

      .nxt1-doc-viewer__ask-agent-dropdown-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-divider {
        height: 1px;
        background: color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 60%, transparent);
        margin: 4px 0;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-list {
        max-height: 240px;
        overflow-y: auto;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-footer {
        padding: 8px;
        border-top: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-default, #2a2a2a) 60%, transparent);
        display: flex;
        justify-content: flex-end;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-confirm {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--agent-primary) 40%, transparent);
        background: color-mix(in srgb, var(--agent-primary) 12%, transparent);
        color: var(--agent-primary);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .nxt1-doc-viewer__ask-agent-dropdown-confirm:hover {
        background: color-mix(in srgb, var(--agent-primary) 22%, transparent);
      }

      .nxt1-doc-viewer__agent-logo {
        width: 14px;
        height: 14px;
      }

      /* ═══ STAGE ═══ */
      .nxt1-doc-viewer__stage {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      /* PDF Viewport */
      .nxt1-doc-viewer__pdf-viewport {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 24px;
      }

      /* Auto margins (not flex centering) so a page wider than the viewport scrolls from its left edge. */
      .nxt1-doc-viewer__canvas-container {
        width: fit-content;
        margin: 0 auto;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
        border-radius: 0;
        background: #ffffff;
      }

      .nxt1-doc-viewer__canvas-container--pending {
        visibility: hidden;
      }

      /* CSS size is set per render to the logical page size; the backing store is DPR-scaled. */
      .nxt1-doc-viewer__pdf-canvas {
        display: block;
      }

      /* Word (.docx) native stage */
      .nxt1-doc-viewer__docx-viewport {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        /* Keeps clientWidth stable so the fit scale can't oscillate as a scrollbar toggles. */
        scrollbar-gutter: stable;
      }

      .nxt1-doc-viewer__docx-host {
        min-width: min-content;
      }

      .nxt1-doc-viewer__docx-host ::ng-deep .nxt1-docx-wrapper {
        background: transparent;
        padding: 24px 30px 0;
      }

      .nxt1-doc-viewer__docx-host ::ng-deep .nxt1-docx-wrapper > section.nxt1-docx {
        color: #111111;
        border-radius: 0;
      }

      .nxt1-doc-viewer__docx-host ::ng-deep .nxt1-docx-wrapper a {
        color: #1a56db;
      }

      .nxt1-doc-viewer__docx-loading {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: color-mix(in srgb, var(--nxt1-color-bg-primary, #0a0a0a) 82%, transparent);
      }

      /* Presentation Stage */
      .nxt1-doc-viewer__presentation-stage {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        position: relative;
        gap: 16px;
      }

      .nxt1-doc-viewer__slide-viewport {
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .nxt1-doc-viewer__slide-frame {
        flex: 0 0 auto;
        position: relative;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
      }

      /* The slide renders at native size; the frame scales it to fit like the PDF canvas. */
      .nxt1-doc-viewer__slide-host {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
      }

      .nxt1-doc-viewer__thumb-canvas {
        position: relative;
        display: block;
        width: 100%;
        overflow: hidden;
        background: #ffffff;
        border-radius: 2px;
      }

      .nxt1-doc-viewer__slide-thumb--rendered {
        width: 112px;
        min-width: 112px;
        padding: 4px;
        flex: 0 0 auto;
      }

      .nxt1-doc-viewer__slide-card {
        width: 100%;
        max-width: 760px;
        aspect-ratio: 16 / 9;
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #141414) 95%, #fff 5%);
        border: 1px solid var(--nxt1-color-border-subtle, #2d2d2d);
        border-radius: 12px;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5);
        padding: 24px 32px;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
      }

      .nxt1-doc-viewer__slide-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .nxt1-doc-viewer__slide-badge {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--agent-primary) 16%, transparent);
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__slide-visual-badge {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--nxt1-color-text-secondary, #aaa);
      }

      .nxt1-doc-viewer__slide-title {
        margin: 0 0 14px 0;
        font-size: 20px;
        font-weight: 800;
        line-height: 1.3;
      }

      .nxt1-doc-viewer__slide-body {
        flex: 1 1 auto;
        font-size: 14px;
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.85));
        white-space: pre-wrap;
      }

      .nxt1-doc-viewer__slide-rail {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
        max-width: 100%;
        padding: 6px 4px;
      }

      .nxt1-doc-viewer__slide-thumb {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 90px;
        max-width: 120px;
        padding: 8px;
        border-radius: 6px;
        background: var(--nxt1-color-surface-200, #1c1c1c);
        border: 1px solid var(--nxt1-color-border-subtle, #282828);
        cursor: pointer;
      }

      .nxt1-doc-viewer__slide-thumb--active {
        border-color: var(--agent-primary);
        background: color-mix(in srgb, var(--agent-primary) 12%, transparent);
      }

      .nxt1-doc-viewer__thumb-num {
        font-size: 10px;
        font-weight: 700;
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__thumb-label {
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
        text-align: center;
        color: var(--nxt1-color-text-primary, #fff);
      }

      /* Spreadsheet Grid Stage — always a white sheet, like Excel/Sheets, regardless of app theme. */
      .nxt1-doc-viewer__grid-stage {
        --nxt1-sheet-bg: #ffffff;
        --nxt1-sheet-text: #000000;
        --nxt1-sheet-gridline: #e1e1e1;
        --nxt1-sheet-header-bg: #f3f3f3;
        --nxt1-sheet-header-text: #5f6368;
        --nxt1-sheet-header-border: #c8c8c8;
        --nxt1-sheet-accent: #107c41;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        background: var(--nxt1-sheet-bg);
        color: var(--nxt1-sheet-text);
        color-scheme: light;
      }

      .nxt1-doc-viewer__grid-scroll-wrap {
        flex: 1 1 auto;
        overflow: auto;
        background: var(--nxt1-sheet-bg);
        outline: none;
      }

      .nxt1-doc-viewer__grid-table {
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
        width: max-content;
        min-width: 100%;
        font-size: 11pt;
        font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif;
        background: var(--nxt1-sheet-bg);
      }

      .nxt1-doc-viewer__grid-row-hdr-col {
        width: 44px;
      }

      .nxt1-doc-viewer__grid-corner,
      .nxt1-doc-viewer__grid-col-hdr,
      .nxt1-doc-viewer__grid-row-hdr {
        background: var(--nxt1-sheet-header-bg);
        color: var(--nxt1-sheet-header-text);
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 400;
        text-align: center;
        padding: 2px 6px;
        border-right: 1px solid var(--nxt1-sheet-header-border);
        border-bottom: 1px solid var(--nxt1-sheet-header-border);
        position: sticky;
        top: 0;
        z-index: 2;
        user-select: none;
      }

      .nxt1-doc-viewer__grid-corner {
        left: 0;
        z-index: 3;
      }

      .nxt1-doc-viewer__grid-row-hdr {
        left: 0;
        z-index: 1;
      }

      /* Excel-style resize grips on the header edges (wide hit area, thin visible line). */
      .nxt1-doc-viewer__col-resize,
      .nxt1-doc-viewer__row-resize {
        position: absolute;
        z-index: 4;
        touch-action: none;
      }

      .nxt1-doc-viewer__col-resize {
        top: 0;
        right: -4px;
        bottom: 0;
        width: 8px;
        cursor: col-resize;
      }

      .nxt1-doc-viewer__row-resize {
        left: 0;
        right: 0;
        bottom: -4px;
        height: 8px;
        cursor: row-resize;
      }

      .nxt1-doc-viewer__col-resize::after,
      .nxt1-doc-viewer__row-resize::after {
        content: '';
        position: absolute;
        background: var(--nxt1-sheet-accent);
        opacity: 0;
        transition: opacity 120ms ease;
      }

      .nxt1-doc-viewer__col-resize::after {
        top: 0;
        bottom: 0;
        left: 3px;
        width: 2px;
      }

      .nxt1-doc-viewer__row-resize::after {
        left: 0;
        right: 0;
        top: 3px;
        height: 2px;
      }

      .nxt1-doc-viewer__col-resize:hover::after,
      .nxt1-doc-viewer__row-resize:hover::after,
      .nxt1-doc-viewer__grid-stage--resizing-col .nxt1-doc-viewer__col-resize:active::after,
      .nxt1-doc-viewer__grid-stage--resizing-row .nxt1-doc-viewer__row-resize:active::after {
        opacity: 1;
      }

      .nxt1-doc-viewer__grid-stage--resizing-col,
      .nxt1-doc-viewer__grid-stage--resizing-col * {
        cursor: col-resize !important;
        user-select: none;
      }

      .nxt1-doc-viewer__grid-stage--resizing-row,
      .nxt1-doc-viewer__grid-stage--resizing-row * {
        cursor: row-resize !important;
        user-select: none;
      }

      .nxt1-doc-viewer__grid-cell {
        padding: 1px 4px;
        line-height: 1.2;
        border-right: 1px solid var(--nxt1-sheet-gridline);
        border-bottom: 1px solid var(--nxt1-sheet-gridline);
        background: var(--nxt1-sheet-bg);
        color: var(--nxt1-sheet-text);
        vertical-align: bottom;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
        user-select: text;
        cursor: cell;
      }

      .nxt1-doc-viewer__grid-cell--bold {
        font-weight: 700;
      }

      /* CSV header row (XLSX headers carry their own formatting). */
      .nxt1-doc-viewer__grid-cell--header {
        font-weight: 700;
      }

      /* Inset shadow tints the cell without hiding its own fill color. */
      .nxt1-doc-viewer__grid-cell--selected {
        box-shadow: inset 0 0 0 9999px rgba(16, 124, 65, 0.14);
        outline: 2px solid var(--nxt1-sheet-accent);
        outline-offset: -2px;
      }

      /* Excel-style in-cell editor: the cell keeps its fill, the input takes the full box. */
      .nxt1-doc-viewer__grid-cell--editing {
        padding: 0;
        outline: 2px solid var(--nxt1-sheet-accent);
        outline-offset: -2px;
        box-shadow: none;
        overflow: visible;
      }

      .nxt1-doc-viewer__grid-cell-input {
        display: block;
        width: 100%;
        min-width: 100%;
        height: 100%;
        min-height: 20px;
        box-sizing: border-box;
        padding: 1px 4px;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: inherit;
      }

      .nxt1-doc-viewer__grid-notice--error {
        color: #a4262c;
        background: #fde7e9;
      }

      .nxt1-doc-viewer__grid-notice {
        padding: 4px 16px;
        font-size: 11px;
        color: var(--nxt1-sheet-header-text);
        background: var(--nxt1-sheet-header-bg);
        border-top: 1px solid var(--nxt1-sheet-header-border);
      }

      .nxt1-doc-viewer__range-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px;
        background: var(--nxt1-sheet-header-bg);
        border-top: 1px solid var(--nxt1-sheet-header-border);
        font-size: 11px;
        font-weight: 600;
      }

      .nxt1-doc-viewer__range-label {
        color: var(--nxt1-sheet-accent);
      }

      .nxt1-doc-viewer__stat {
        color: var(--nxt1-sheet-header-text);
      }

      .nxt1-doc-viewer__ask-agent-small-btn {
        margin-left: auto;
        border: 0;
        border-radius: 4px;
        background: var(--agent-primary);
        color: #000000;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        cursor: pointer;
      }

      .nxt1-doc-viewer__sheet-tabs {
        display: flex;
        align-items: center;
        overflow-x: auto;
        background: var(--nxt1-sheet-header-bg);
        border-top: 1px solid var(--nxt1-sheet-header-border);
        padding: 0 8px;
      }

      .nxt1-doc-viewer__sheet-tab {
        border: 0;
        background: transparent;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-sheet-header-text);
        border-bottom: 2px solid transparent;
        cursor: pointer;
      }

      .nxt1-doc-viewer__sheet-tab--active {
        background: var(--nxt1-sheet-bg);
        color: var(--nxt1-sheet-accent);
        border-bottom-color: var(--nxt1-sheet-accent);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDocumentViewerComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly client = inject(DocumentPreviewClientService);
  private readonly logger = inject(NxtLoggingService).child('NxtDocumentViewerComponent');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly haptics = inject(HapticsService);

  @Input({ required: true })
  set file(value: AgentXLibraryFile) {
    if (value) {
      const previous = this._file();
      this._file.set(value);
      // A refreshed copy of the same file (e.g. re-signed URL) keeps the loaded preview, unless the
      // status moved (e.g. processing → ready) or the viewer is stuck on a fallback that may now recover.
      if (
        !!previous.id &&
        previous.id === value.id &&
        previous.sizeBytes === value.sizeBytes &&
        previous.storagePath === value.storagePath &&
        previous.status === value.status &&
        !this.isFallback() &&
        !this.error()
      ) {
        return;
      }
      void this.loadDocumentPreview(value.id);
    }
  }
  get file(): AgentXLibraryFile {
    return this._file();
  }
  protected readonly _file = signal<AgentXLibraryFile>({
    id: '',
    ownerUserId: '',
    name: '',
    normalizedName: '',
    mimeType: '',
    kind: 'doc',
    status: 'ready',
    origin: 'files_upload',
    sizeBytes: 0,
    url: '',
    createdAt: '',
    updatedAt: '',
    lastSeenAt: '',
  });

  @Input()
  set compact(value: boolean) {
    this._compact.set(value);
  }
  get compact(): boolean {
    return this._compact();
  }
  protected readonly _compact = signal<boolean>(false);

  @Input()
  set initialPage(value: number) {
    this._initialPage.set(value);
    this.currentPage.set(value);
  }
  get initialPage(): number {
    return this._initialPage();
  }
  protected readonly _initialPage = signal<number>(1);

  @Input()
  set initialSlide(value: number) {
    this._initialSlide.set(value);
    this.currentSlide.set(value);
  }
  get initialSlide(): number {
    return this._initialSlide();
  }
  protected readonly _initialSlide = signal<number>(1);

  /** Allows in-place spreadsheet cell editing; the backend still enforces write access. */
  @Input() editable = true;

  /**
   * Shows the "Ask Agent X" anchor action. Hosts that cannot hand a selection back to a chat
   * (e.g. the mobile preview sheet stacked over the chat) turn it off.
   */
  @Input() showAskAgent = true;

  /**
   * Puts a Download action in the toolbar (in place of Rotate) for hosts without their own
   * download control, e.g. the mobile preview sheet.
   */
  @Input() toolbarDownload = false;

  /** Shows a busy spinner on the toolbar Download action while the host saves the file. */
  @Input() downloadBusy = false;

  readonly anchorSelected = output<DocumentPreviewAnchor>();
  readonly askAgentRequested = output<DocumentAskAgentSelection>();

  protected readonly askAgentMenuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  ];

  readonly askAgentDropdownOpen = signal<boolean>(false);
  readonly selectedAskAgentIndices = signal<ReadonlySet<number>>(new Set());
  readonly openOriginalRequested = output<AgentXLibraryFile>();
  readonly downloadRequested = output<AgentXLibraryFile>();

  protected readonly testIds = DOCUMENT_VIEWER_TEST_IDS;
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  protected readonly pdfCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pdfCanvas');
  private readonly pdfViewport = viewChild<ElementRef<HTMLElement>>('pdfViewport');
  private readonly docxViewport = viewChild<ElementRef<HTMLElement>>('docxViewport');
  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');
  private readonly docxStyleHost = viewChild<ElementRef<HTMLElement>>('docxStyleHost');
  private readonly slideViewport = viewChild<ElementRef<HTMLElement>>('slideViewport');
  private readonly slideHost = viewChild<ElementRef<HTMLElement>>('slideHost');
  private readonly slideThumbHosts = viewChildren<ElementRef<HTMLElement>>('slideThumbHost');

  // Internal Reactive State
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly fallbackReason = signal<string | null>(null);
  readonly manifest = signal<DocumentPreviewManifest | null>(null);
  readonly mode = signal<DocumentViewerMode>('preview');

  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly currentSlide = signal<number>(1);
  readonly totalSlides = signal<number>(1);
  readonly currentSheetIndex = signal<number>(0);

  readonly zoomLevel = signal<number>(1.0);
  readonly rotation = signal<number>(0);

  readonly cellSelection = signal<DocumentCellSelection | null>(null);
  /** Where the selection started (click / drag origin) and its moving corner. */
  private readonly selectionAnchor = signal<{ row: number; col: number } | null>(null);
  private readonly selectionFocus = signal<{ row: number; col: number } | null>(null);
  private isDragSelecting = false;
  readonly editingCell = signal<{
    readonly row: number;
    readonly col: number;
    readonly sheetId: string;
    readonly original: string;
  } | null>(null);
  readonly cellEditDraft = signal('');
  readonly cellSaveError = signal<string | null>(null);
  readonly cellSavesPending = signal(0);
  /** Saves run one at a time so edits land in the order they were made. */
  private cellSaveChain: Promise<void> = Promise.resolve();
  private readonly gridScrollWrap = viewChild<ElementRef<HTMLElement>>('gridScrollWrap');
  private readonly cellEditor = viewChild<ElementRef<HTMLInputElement>>('cellEditor');
  readonly spreadsheetCells = signal<readonly DocumentSpreadsheetCell[]>([]);
  readonly spreadsheetTotalRows = signal<number>(50);
  readonly spreadsheetTotalCols = signal<number>(20);
  /** Excel character-unit widths for columns 1..n of the current range; null = default. */
  readonly spreadsheetColumnWidths = signal<readonly (number | null)[]>([]);
  /** Row heights in points for rows 1..n of the current range; null = default. */
  readonly spreadsheetRowHeights = signal<readonly (number | null)[]>([]);
  /** Which header edge is being dragged, for the global resize cursor. */
  readonly resizingAxis = signal<'col' | 'row' | null>(null);
  /** CSV has no column/row sizes, so resizes there stay local to this view. */
  private readonly canPersistSheetSizes = computed(() => {
    const m = this.manifest();
    if (!m) return false;
    const mime = m.mimeType.toLowerCase();
    return !/csv|tab-separated/.test(mime) && !/\.(csv|tsv)$/i.test(m.fileName);
  });

  private pdfDocInstance: unknown = null;
  private pdfLoadingTask: { destroy(): Promise<void> } | null = null;
  private pdfWorker: Worker | null = null;
  private pdfjsWorker: { destroy(): void } | null = null;
  private pdfLoadToken = 0;
  private isRenderingPdfPage = false;
  /** A page/zoom/rotation/resize change arrived mid-render; re-render once the current one settles. */
  private pdfRenderPending = false;
  private pdfRenderTask: { cancel(): void } | null = null;
  readonly pdfReady = signal(false);
  /** True once the first page has been drawn; the stage shows a spinner until then. */
  readonly pdfPainted = signal(false);
  /** Debounced content width of the PDF viewport; drives fit-to-width re-renders. */
  private readonly pdfViewportWidth = signal(0);

  /** Guards loadDocumentPreview / loadSpreadsheetRange against out-of-order async results. */
  private previewLoadToken = 0;
  private spreadsheetRangeToken = 0;

  private readonly docxPayload = signal<ArrayBuffer | null>(null);
  readonly docxRendering = signal(false);
  private docxRenderToken = 0;
  /** Width-fit scale for the docx page; the user's zoomLevel multiplies on top (like PDF). */
  readonly docxFitScale = signal(1);
  private docxResizeObserver: ResizeObserver | null = null;

  /** Parsed .pptx deck rendered natively; null while loading or when only the text outline is available. */
  readonly pptxDeck = signal<PptxPresentation | null>(null);
  readonly pptxRendering = signal(false);
  /** Contain-fit scale of the native slide inside the stage. */
  readonly pptxFitScale = signal(1);
  private pptxLoadToken = 0;

  readonly docType = computed<UniversalFileDocumentType>(() => {
    const f = this._file();
    return (
      this.manifest()?.documentType ?? resolveUniversalFileDocumentType(f.mimeType, f.name, f.kind)
    );
  });

  readonly isFallback = computed<boolean>(() => {
    return this.mode() === 'fallback';
  });

  readonly zoomPercent = computed<number>(() => Math.round(this.zoomLevel() * 100));

  /**
   * A derived printable PDF for spreadsheets. The manifest's pdfUrl is the source file for
   * non-PDF types, so only a PDF storage path proves a real printable rendition exists.
   */
  readonly printablePdfUrl = computed<string | null>(() => {
    const m = this.manifest();
    if (!m || m.documentType !== 'spreadsheet' || !m.pdfUrl) return null;
    return m.pdfStoragePath?.toLowerCase().endsWith('.pdf') ? m.pdfUrl : null;
  });

  readonly currentSlideData = computed<DocumentSlideMetadata | null>(() => {
    const slides = this.manifest()?.slides;
    if (!slides || slides.length === 0) return null;
    return slides.find((s) => s.slideNumber === this.currentSlide()) ?? slides[0] ?? null;
  });

  readonly currentSheet = computed<DocumentSheetMetadata | null>(() => {
    const sheets = this.manifest()?.sheets;
    if (!sheets || sheets.length === 0) return null;
    return sheets[this.currentSheetIndex()] ?? sheets[0] ?? null;
  });

  readonly columnHeaderLabels = computed<readonly string[]>(() =>
    this.visibleColNumbers().map((col) => toSpreadsheetColumnName(col))
  );

  readonly visibleColNumbers = computed<readonly number[]>(() => {
    const total = Math.min(SPREADSHEET_MAX_COLS, Math.max(10, this.spreadsheetTotalCols()));
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  readonly visibleRowNumbers = computed<readonly number[]>(() => {
    const total = Math.min(SPREADSHEET_MAX_ROWS, Math.max(20, this.spreadsheetTotalRows()));
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  readonly gridTruncationNotice = computed<string | null>(() => {
    const rows = this.spreadsheetTotalRows();
    const cols = this.spreadsheetTotalCols();
    if (rows <= SPREADSHEET_MAX_ROWS && cols <= SPREADSHEET_MAX_COLS) return null;
    const shownRows = Math.min(SPREADSHEET_MAX_ROWS, rows);
    const shownCols = Math.min(SPREADSHEET_MAX_COLS, cols);
    return `Showing first ${shownRows} rows × ${shownCols} columns of ${rows} × ${cols}. Download for the full sheet.`;
  });

  constructor() {
    // Focus the in-cell editor as soon as it renders, caret at the end.
    effect(() => {
      const input = this.cellEditor()?.nativeElement;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

    effect(() => {
      const canvas = this.pdfCanvas();
      const ready = this.pdfReady();
      this.currentPage();
      this.rotation();
      this.zoomLevel();
      this.pdfViewportWidth();
      if (canvas && ready) void this.renderCurrentPdfPage();
    });

    // Track the PDF viewport width (debounced) so fit-to-width follows panel resizes.
    effect((onCleanup) => {
      const viewport = this.pdfViewport()?.nativeElement;
      if (!viewport || typeof ResizeObserver !== 'function') return;

      this.pdfViewportWidth.set(viewport.clientWidth);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const observer = new ResizeObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(
          () => this.pdfViewportWidth.set(viewport.clientWidth),
          PDF_RESIZE_DEBOUNCE_MS
        );
      });
      observer.observe(viewport);
      onCleanup(() => {
        if (timer) clearTimeout(timer);
        observer.disconnect();
      });
    });

    effect(() => {
      const host = this.docxHost()?.nativeElement;
      const styleHost = this.docxStyleHost()?.nativeElement;
      const data = this.docxPayload();
      if (host && styleHost && data) void this.renderDocx(data, host, styleHost);
    });

    // Paint the current slide whenever the deck or slide changes (after the stage has rendered).
    afterRenderEffect(() => {
      const deck = this.pptxDeck();
      const host = this.slideHost()?.nativeElement;
      const index = this.currentSlide() - 1;
      if (deck && host) this.paintSlide(deck, host, index);
    });

    // Contain-fit the slide to the stage, following panel resizes.
    effect((onCleanup) => {
      const deck = this.pptxDeck();
      const viewport = this.slideViewport()?.nativeElement;
      if (!deck || !viewport) return;
      const refit = (): void => {
        const w = viewport.clientWidth - PPTX_FIT_PADDING_PX * 2;
        const h = viewport.clientHeight - PPTX_FIT_PADDING_PX * 2;
        if (w <= 0 || h <= 0) return;
        const next = Math.max(0.05, Math.min(w / deck.widthPx, h / deck.heightPx));
        if (Math.abs(next - this.pptxFitScale()) > 0.001) this.pptxFitScale.set(next);
      };
      refit();
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(refit);
      observer.observe(viewport);
      onCleanup(() => observer.disconnect());
    });

    // Real slide thumbnails in the rail.
    afterRenderEffect(() => {
      const deck = this.pptxDeck();
      const hosts = this.slideThumbHosts();
      if (!deck) return;
      for (const ref of hosts) {
        const host = ref.nativeElement;
        const slideNumber = Number(host.dataset['slideNumber']);
        if (!slideNumber || host.dataset['renderedSlide'] === String(slideNumber)) continue;
        host.dataset['renderedSlide'] = String(slideNumber);
        // Rail thumbs are a fixed width, so the scale is known without measuring.
        const scale = host.clientWidth > 0 ? host.clientWidth / deck.widthPx : 104 / deck.widthPx;
        this.paintSlide(deck, host, slideNumber - 1, scale);
      }
    });
  }

  /** Clears every per-document state so nothing from the previous file leaks into the next. */
  private resetViewerState(): void {
    this.error.set(null);
    this.fallbackReason.set(null);
    this.manifest.set(null);
    this.mode.set('preview');

    this.currentPage.set(this._initialPage());
    this.totalPages.set(1);
    this.currentSlide.set(this._initialSlide());
    this.totalSlides.set(1);
    this.zoomLevel.set(1);
    this.rotation.set(0);
    this.askAgentDropdownOpen.set(false);
    this.selectedAskAgentIndices.set(new Set());

    this.spreadsheetRangeToken += 1;
    this.currentSheetIndex.set(0);
    this.spreadsheetCells.set([]);
    this.spreadsheetColumnWidths.set([]);
    this.spreadsheetRowHeights.set([]);
    this.spreadsheetTotalRows.set(50);
    this.spreadsheetTotalCols.set(20);
    this.resetCellInteraction();

    this.docxRenderToken += 1;
    this.docxResizeObserver?.disconnect();
    this.docxResizeObserver = null;
    this.docxPayload.set(null);
    this.docxRendering.set(false);
    this.docxFitScale.set(1);

    this.teardownPptx();

    this.pdfLoadToken += 1;
    this.pdfReady.set(false);
    this.pdfPainted.set(false);
    this.pdfDocInstance = null;
    this.pdfRenderPending = false;
    this.pdfRenderTask?.cancel();
    void this.teardownPdfWorker();
  }

  private async loadDocumentPreview(fileId: string): Promise<void> {
    if (!fileId) return;
    const token = ++this.previewLoadToken;
    this.loading.set(true);
    // Runs after _file is set, so docType() falls back to the NEW file's mime/name, not the old manifest.
    this.resetViewerState();
    this.logger.info('Loading document preview', { fileId, fileName: this.file.name });
    this.breadcrumbs.trackStateChange('document-viewer:preview-loading', {
      fileId,
      fileName: this.file.name,
    });

    try {
      const session = await this.client.getPreviewSession(fileId);
      // The file changed while the session was negotiating; the newer load owns the viewer.
      if (token !== this.previewLoadToken) return;

      if (session.available && session.manifest) {
        const manifest = session.manifest;
        this.manifest.set(manifest);
        // Spreadsheets have no pages; pageCount there is the sheet count, so keep pagination at 1.
        this.totalPages.set(
          manifest.documentType === 'spreadsheet' ? 1 : Math.max(1, manifest.pageCount)
        );
        this.totalSlides.set(manifest.slides?.length ?? 1);
        this.currentSlide.set(this._initialSlide());
        this.currentPage.set(this._initialPage());
        this.mode.set('preview');

        this.breadcrumbs.trackStateChange('document-viewer:preview-ready', {
          fileId,
          docType: manifest.documentType,
        });

        // An empty grid / empty slide card is worse than an honest download fallback.
        if (manifest.documentType === 'spreadsheet' && !manifest.sheets?.length) {
          this.fallbackReason.set('empty_spreadsheet');
          this.mode.set('fallback');
          return;
        }
        if (manifest.documentType === 'presentation' && !manifest.slides?.length) {
          this.fallbackReason.set('empty_presentation');
          this.mode.set('fallback');
          return;
        }

        if (session.manifest.documentType === 'spreadsheet') {
          void this.loadSpreadsheetRange(0);
        } else if (session.manifest.documentType === 'pdf') {
          const pdfTargetUrl = session.manifest.pdfUrl || this.file.url;
          if (pdfTargetUrl) {
            void this.initPdfViewer(pdfTargetUrl);
          }
        } else if (session.manifest.documentType === 'word') {
          const docxTargetUrl = session.manifest.pdfUrl || this.file.url;
          if (docxTargetUrl) {
            void this.initDocxViewer(docxTargetUrl);
          }
        } else if (session.manifest.documentType === 'presentation') {
          // For non-PDF types the manifest's pdfUrl is a fresh signed URL to the source deck.
          const pptxTargetUrl = session.manifest.pdfUrl || this.file.url;
          if (pptxTargetUrl) {
            void this.initPptxViewer(pptxTargetUrl);
          }
        }

        this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_PREVIEW_OPENED, {
          document_id: fileId,
          document_type: session.manifest.documentType,
          file_name: this.file.name,
          page_count: session.manifest.pageCount,
        });
      } else if (this.docType() === 'pdf' && this.file.url) {
        // Direct PDF fallback: existing files with a valid URL can be displayed immediately
        void this.initPdfViewer(this.file.url);
        this.mode.set('preview');
      } else if (this.docType() === 'word' && this.file.url) {
        void this.initDocxViewer(this.file.url);
        this.mode.set('preview');
      } else if (this.canRenderPptxDirectly()) {
        void this.initPptxViewer(this.file.url);
        this.mode.set('preview');
      } else {
        this.fallbackReason.set(session.reason ?? 'unavailable');
        this.mode.set('fallback');
      }
    } catch (err) {
      if (token !== this.previewLoadToken) return;
      if (this.docType() === 'pdf' && this.file.url) {
        void this.initPdfViewer(this.file.url);
        this.mode.set('preview');
      } else if (this.docType() === 'word' && this.file.url) {
        void this.initDocxViewer(this.file.url);
        this.mode.set('preview');
      } else if (this.canRenderPptxDirectly()) {
        void this.initPptxViewer(this.file.url);
        this.mode.set('preview');
      } else {
        this.logger.error('Failed to load document preview', err, { fileId });
        this.error.set(err instanceof Error ? err.message : 'Failed to load preview');
        this.fallbackReason.set('client_error');
        this.mode.set('fallback');

        this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_PREVIEW_FAILED, {
          document_id: fileId,
          document_type: this.docType(),
          error_message: err instanceof Error ? err.message : 'Unknown preview error',
        });
      }
    } finally {
      if (token === this.previewLoadToken) this.loading.set(false);
    }
  }

  private async initPdfViewer(pdfUrl: string): Promise<void> {
    if (!this.isBrowser) return;

    // Overlapping loads (e.g. the file input refreshing mid-load) must not share a worker port:
    // destroying one load while the other is in flight makes PDF.js throw
    // "Cannot resolve callback N". Each load gets its own worker; stale loads bail out.
    const token = ++this.pdfLoadToken;
    try {
      this.pdfReady.set(false);
      this.pdfPainted.set(false);
      this.pdfDocInstance = null;
      await this.teardownPdfWorker();

      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (${response.status})`);
      }
      const pdfData = new Uint8Array(await response.arrayBuffer());
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (token !== this.pdfLoadToken) return;

      const worker = new Worker(new URL('./pdfjs.worker', import.meta.url), { type: 'module' });
      const pdfWorker = pdfjsLib.PDFWorker.create({ port: worker });
      this.pdfWorker = worker;
      this.pdfjsWorker = pdfWorker;
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        disableFontFace: true,
        worker: pdfWorker,
      });
      this.pdfLoadingTask = loadingTask;
      const pdf = await loadingTask.promise;
      if (token !== this.pdfLoadToken) return;

      this.pdfDocInstance = pdf;
      this.totalPages.set(pdf.numPages);
      this.pdfReady.set(true);
    } catch (err) {
      // A newer load superseded this one; its teardown caused the error.
      if (token !== this.pdfLoadToken) return;
      this.logger.warn('PDF.js canvas rendering failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.fallbackReason.set('pdf_render_failed');
      this.mode.set('fallback');
    }
  }

  private isDocxFile(): boolean {
    const f = this._file();
    return (
      f.mimeType.toLowerCase().includes('wordprocessingml.document') ||
      f.name.toLowerCase().endsWith('.docx')
    );
  }

  private async initDocxViewer(docxUrl: string): Promise<void> {
    if (!this.isBrowser) return;

    if (!this.isDocxFile()) {
      this.fallbackReason.set('unsupported_word_format');
      this.mode.set('fallback');
      return;
    }

    // Shares the render token: a file switch (or a newer init) bumps it and strands this fetch.
    const token = ++this.docxRenderToken;
    this.docxPayload.set(null);
    this.docxRendering.set(true);
    try {
      const response = await fetch(docxUrl);
      if (token !== this.docxRenderToken) return;
      if (!response.ok) {
        throw new Error(`Failed to fetch document (${response.status})`);
      }
      const data = await response.arrayBuffer();
      if (token !== this.docxRenderToken) return;
      if (data.byteLength > MAX_DOCX_PREVIEW_BYTES) {
        this.docxRendering.set(false);
        this.fallbackReason.set('document_too_large');
        this.mode.set('fallback');
        return;
      }
      this.docxPayload.set(data);
    } catch (err) {
      if (token !== this.docxRenderToken) return;
      this.docxRendering.set(false);
      this.logger.warn('DOCX fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.fallbackReason.set('docx_render_failed');
      this.mode.set('fallback');
    }
  }

  private async renderDocx(
    data: ArrayBuffer,
    host: HTMLElement,
    styleHost: HTMLElement
  ): Promise<void> {
    const token = ++this.docxRenderToken;
    try {
      const { renderAsync } = await import('docx-preview');
      if (token !== this.docxRenderToken) return;

      await renderAsync(data, host, styleHost, {
        className: 'nxt1-docx',
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        // Embedded HTML renders as a same-origin iframe; never allow it for untrusted files.
        renderAltChunks: false,
        renderComments: false,
        renderChanges: false,
        useBase64URL: true,
      });
      if (token !== this.docxRenderToken) return;

      this.sanitizeDocxLinks(host);
      this.applyDocxFontFallbacks(host, styleHost);
      this.fitDocxToViewport(host);
      this.docxRendering.set(false);
    } catch (err) {
      if (token !== this.docxRenderToken) return;
      this.docxRendering.set(false);
      this.logger.warn('DOCX render failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.fallbackReason.set('docx_render_failed');
      this.mode.set('fallback');
    }
  }

  private sanitizeDocxLinks(host: HTMLElement): void {
    for (const anchor of Array.from(host.querySelectorAll('a'))) {
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) continue;

      let protocol = '';
      try {
        protocol = new URL(href, 'https://invalid.local').protocol;
      } catch {
        // Unparseable hrefs are dropped below.
      }

      if (!DOCX_SAFE_LINK_PROTOCOLS.has(protocol)) {
        anchor.removeAttribute('href');
        continue;
      }
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
  }

  private applyDocxFontFallbacks(host: HTMLElement, styleHost: HTMLElement): void {
    for (const style of Array.from(styleHost.querySelectorAll('style'))) {
      const css = style.textContent ?? '';
      // @font-face blocks hold embedded fonts; a fallback list there would invalidate them.
      if (css.includes('@font-face')) continue;
      style.textContent = css.replace(
        /font-family:\s*([^;}]+)/g,
        (_, value: string) => `font-family: ${withDocxFontFallback(value)}`
      );
    }

    for (const el of Array.from(host.querySelectorAll<HTMLElement>('[style*="font-family"]'))) {
      el.style.fontFamily = withDocxFontFallback(el.style.fontFamily);
    }
  }

  private fitDocxToViewport(host: HTMLElement): void {
    const viewport = this.docxViewport()?.nativeElement;
    if (!viewport) return;

    this.refitDocx(viewport, host);

    // Refit continuously as the panel resizes, the same way the PDF canvas tracks its container.
    this.docxResizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'function') return;
    this.docxResizeObserver = new ResizeObserver(() => this.refitDocx(viewport, host));
    this.docxResizeObserver.observe(viewport);
  }

  private refitDocx(viewport: HTMLElement, host: HTMLElement): void {
    const page = host.querySelector<HTMLElement>('section');
    if (!page || viewport.clientWidth <= 0) return;

    // Page width is declared in pt (96/72 px); avoids reading a CSS-zoomed layout width.
    const declared = page.style.width;
    const pageWidthPx = declared.endsWith('pt')
      ? (parseFloat(declared) * 96) / 72
      : parseFloat(declared);
    if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) return;

    // Wrapper padding is scaled by the zoom too, so it belongs in the denominator.
    const fit = viewport.clientWidth / (pageWidthPx + DOCX_FIT_PADDING_PX);
    const next = Math.min(1, Math.max(DOCX_MIN_FIT_SCALE, fit));
    if (Math.abs(next - this.docxFitScale()) > 0.001) this.docxFitScale.set(next);
  }

  /** Only Open XML decks render natively; legacy binary .ppt stays on the download fallback. */
  private canRenderPptxDirectly(): boolean {
    const f = this.file;
    if (this.docType() !== 'presentation' || !f.url) return false;
    return (
      f.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      f.name.toLowerCase().endsWith('.pptx')
    );
  }

  private async initPptxViewer(pptxUrl: string): Promise<void> {
    if (!this.isBrowser) return;

    const token = ++this.pptxLoadToken;
    this.pptxRendering.set(true);
    try {
      const response = await fetch(pptxUrl);
      if (token !== this.pptxLoadToken) return;
      if (!response.ok) throw new Error(`Failed to fetch presentation (${response.status})`);
      const data = await response.arrayBuffer();
      if (token !== this.pptxLoadToken) return;
      if (data.byteLength > MAX_PPTX_PREVIEW_BYTES) {
        this.failPptxRender('document_too_large');
        return;
      }

      const { PptxPresentation } = await import('./pptx/pptx-renderer');
      const deck = await PptxPresentation.load(data, { resolveFontFamily: withDocxFontFallback });
      if (token !== this.pptxLoadToken) {
        deck.dispose();
        return;
      }

      this.totalSlides.set(deck.slideCount);
      if (this.currentSlide() > deck.slideCount) this.currentSlide.set(deck.slideCount);
      this.pptxDeck.set(deck);
      this.pptxRendering.set(false);
    } catch (err) {
      if (token !== this.pptxLoadToken) return;
      this.logger.warn('PPTX render failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.failPptxRender('presentation_render_failed');
    }
  }

  /** Keeps the extracted text outline when the manifest has one; otherwise falls back to download. */
  private failPptxRender(reason: string): void {
    this.pptxRendering.set(false);
    if (this.manifest()?.slides?.length) return;
    this.fallbackReason.set(reason);
    this.mode.set('fallback');
  }

  private paintSlide(
    deck: PptxPresentation,
    host: HTMLElement,
    index: number,
    scale?: number
  ): void {
    if (index < 0 || index >= deck.slideCount) return;
    try {
      const slide = deck.renderSlide(index);
      if (scale !== undefined) {
        // Inline: encapsulated component styles cannot target nodes created outside the template.
        Object.assign(slide.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          transformOrigin: '0 0',
          transform: `scale(${scale})`,
          pointerEvents: 'none',
        });
      }
      host.replaceChildren(slide);
      void import('./pptx/pptx-renderer').then(({ autofitPptxText }) => autofitPptxText(slide));
    } catch (err) {
      this.logger.warn('PPTX slide paint failed', {
        slide: index + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private teardownPptx(): void {
    this.pptxLoadToken += 1;
    this.pptxRendering.set(false);
    this.pptxFitScale.set(1);
    const deck = this.pptxDeck();
    this.pptxDeck.set(null);
    deck?.dispose();
  }

  protected slideTitle(slideNumber: number): string {
    const slide = this.manifest()?.slides?.find((s) => s.slideNumber === slideNumber);
    return slide?.title || `Slide ${slideNumber}`;
  }

  ngOnDestroy(): void {
    this.teardownPptx();
    this.docxRenderToken += 1;
    this.docxResizeObserver?.disconnect();
    this.docxResizeObserver = null;
    this.docxPayload.set(null);
    this.pdfReady.set(false);
    this.pdfLoadToken += 1;
    this.previewLoadToken += 1;
    this.spreadsheetRangeToken += 1;
    this.pdfRenderPending = false;
    this.pdfRenderTask?.cancel();
    this.pdfDocInstance = null;
    void this.teardownPdfWorker();
  }

  /** Destroys the current PDF.js load and its dedicated worker. */
  private async teardownPdfWorker(): Promise<void> {
    const loadingTask = this.pdfLoadingTask;
    const pdfjsWorker = this.pdfjsWorker;
    const worker = this.pdfWorker;
    this.pdfLoadingTask = null;
    this.pdfjsWorker = null;
    this.pdfWorker = null;

    await loadingTask?.destroy().catch(() => undefined);
    pdfjsWorker?.destroy();
    worker?.terminate();
  }

  private async renderCurrentPdfPage(): Promise<void> {
    if (!this.isBrowser || !this.pdfDocInstance) return;

    // PDF.js forbids concurrent renders on one canvas. Instead of dropping this request, cancel the
    // in-flight render and let its finally block start a fresh one with the latest state.
    if (this.isRenderingPdfPage) {
      this.pdfRenderPending = true;
      this.pdfRenderTask?.cancel();
      return;
    }

    const canvas = this.pdfCanvas()?.nativeElement;
    if (!canvas) return;

    const loadToken = this.pdfLoadToken;
    this.isRenderingPdfPage = true;
    this.pdfRenderPending = false;
    try {
      const pdf = this.pdfDocInstance as {
        getPage(num: number): Promise<{
          readonly rotate: number;
          getViewport(options: { scale: number; rotation?: number }): {
            width: number;
            height: number;
          };
          render(params: {
            canvas: HTMLCanvasElement | null;
            canvasContext: CanvasRenderingContext2D;
            viewport: unknown;
          }): { promise: Promise<void>; cancel(): void };
        }>;
      };

      const page = await pdf.getPage(this.currentPage());
      if (loadToken !== this.pdfLoadToken || this.pdfRenderPending) return;

      // Passing `rotation` replaces the page's own /Rotate, so add the user's turn on top of it.
      const rotation = (((page.rotate + this.rotation()) % 360) + 360) % 360;
      const base = page.getViewport({ scale: 1, rotation });

      // Fit to the viewport width (never upscaling past the old 1.5x), then apply the user's zoom.
      const available =
        (this.pdfViewport()?.nativeElement.clientWidth || this.pdfViewportWidth()) -
        PDF_VIEWPORT_PADDING_PX;
      const fitScale =
        available > 0 ? Math.min(PDF_MAX_FIT_SCALE, available / base.width) : PDF_MAX_FIT_SCALE;
      const cssScale = fitScale * this.zoomLevel();

      // Back the canvas with device pixels for sharpness, capped so iOS never blanks it.
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      let renderScale = cssScale * dpr;
      const area = base.width * base.height * renderScale * renderScale;
      if (area > PDF_MAX_CANVAS_PIXELS) renderScale *= Math.sqrt(PDF_MAX_CANVAS_PIXELS / area);

      const viewport = page.getViewport({ scale: renderScale, rotation });
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
      canvas.style.height = `${Math.floor(base.height * cssScale)}px`;

      const task = page.render({ canvas: null, canvasContext: context, viewport });
      this.pdfRenderTask = task;
      await task.promise;
      if (loadToken === this.pdfLoadToken) this.pdfPainted.set(true);
    } catch (err) {
      // Cancellation is how a superseded render ends; only real failures are worth logging.
      if (!this.pdfRenderPending && loadToken === this.pdfLoadToken) {
        this.logger.warn('Error rendering PDF page', {
          page: this.currentPage(),
          error: err instanceof Error ? err.message : String(err),
        });
        // Nothing was ever drawn: fall back rather than spin over an empty card forever.
        if (!this.pdfPainted()) {
          this.fallbackReason.set('pdf_render_failed');
          this.mode.set('fallback');
        }
      }
    } finally {
      this.pdfRenderTask = null;
      this.isRenderingPdfPage = false;
      if (this.pdfRenderPending) {
        this.pdfRenderPending = false;
        void this.renderCurrentPdfPage();
      }
    }
  }

  private async loadSpreadsheetRange(sheetIndex: number): Promise<void> {
    const manifest = this.manifest();
    const sheet = manifest?.sheets?.[sheetIndex];
    if (!sheet) return;

    // Quick tab switches can resolve out of order; only the latest request may fill the grid.
    const token = ++this.spreadsheetRangeToken;
    this.currentSheetIndex.set(sheetIndex);
    this.spreadsheetTotalRows.set(sheet.rowCount);
    this.spreadsheetTotalCols.set(sheet.columnCount);
    this.spreadsheetCells.set([]);
    this.spreadsheetColumnWidths.set([]);
    this.spreadsheetRowHeights.set([]);

    const rangeData = await this.client.getSpreadsheetRange(this.file.id, {
      sheetId: sheet.sheetId,
      startRow: 1,
      endRow: Math.min(SPREADSHEET_MAX_ROWS, sheet.rowCount),
      startCol: 1,
      endCol: Math.min(SPREADSHEET_MAX_COLS, sheet.columnCount),
    });
    if (token !== this.spreadsheetRangeToken) return;

    if (rangeData) {
      this.spreadsheetCells.set(rangeData.cells);
      // The range always starts at column 1, so widths index straight by column number.
      this.spreadsheetColumnWidths.set(rangeData.columnWidths ?? []);
      this.spreadsheetRowHeights.set(rangeData.rowHeights ?? []);
    }
  }

  /** O(1) cell lookup for the grid template, keyed `row:col`. */
  private readonly spreadsheetCellIndex = computed(() => {
    const index = new Map<string, DocumentSpreadsheetCell>();
    for (const cell of this.spreadsheetCells()) index.set(`${cell.row}:${cell.col}`, cell);
    return index;
  });

  /** Cells hidden under a merged range's top-left cell (which renders with row/colspan). */
  private readonly mergedCoveredCells = computed(() => {
    const covered = new Set<string>();
    for (const cell of this.spreadsheetCells()) {
      const rowSpan = cell.rowSpan ?? 1;
      const colSpan = cell.colSpan ?? 1;
      if (rowSpan <= 1 && colSpan <= 1) continue;
      for (let r = cell.row; r < cell.row + rowSpan; r++) {
        for (let c = cell.col; c < cell.col + colSpan; c++) {
          if (r !== cell.row || c !== cell.col) covered.add(`${r}:${c}`);
        }
      }
    }
    return covered;
  });

  protected getCell(row: number, col: number): DocumentSpreadsheetCell | undefined {
    return this.spreadsheetCellIndex().get(`${row}:${col}`);
  }

  protected isCellCoveredByMerge(row: number, col: number): boolean {
    return this.mergedCoveredCells().has(`${row}:${col}`);
  }

  /** Converts Excel character-unit widths to pixels (Calibri 11: ~7px/char + 5px padding). */
  protected columnWidthPx(col: number): number {
    const width = this.spreadsheetColumnWidths()[col - 1];
    const chars = typeof width === 'number' && width > 0 ? width : SPREADSHEET_DEFAULT_COL_CHARS;
    return Math.max(24, Math.round(chars * 7 + 5));
  }

  /** Converts Excel row heights (points) to pixels; Excel's default row is 15pt = 20px. */
  protected rowHeightPx(row: number): number {
    const height = this.spreadsheetRowHeights()[row - 1];
    const points =
      typeof height === 'number' && height > 0 ? height : SPREADSHEET_DEFAULT_ROW_POINTS;
    return Math.max(SPREADSHEET_MIN_ROW_PX, Math.round((points * 4) / 3));
  }

  protected onColumnResizeStart(col: number, event: PointerEvent): void {
    const startPx = this.columnWidthPx(col);
    this.trackHeaderResize(
      'col',
      event,
      (delta) => {
        const px = Math.max(SPREADSHEET_MIN_COL_PX, startPx + delta.x);
        this.setColumnWidthChars(col, pxToExcelColumnChars(px));
      },
      () => {
        const width = this.spreadsheetColumnWidths()[col - 1];
        if (typeof width === 'number') this.persistSheetSizes({ columnWidths: [{ col, width }] });
      }
    );
  }

  protected onRowResizeStart(row: number, event: PointerEvent): void {
    const startPx = this.rowHeightPx(row);
    this.trackHeaderResize(
      'row',
      event,
      (delta) => {
        const px = Math.max(SPREADSHEET_MIN_ROW_PX, startPx + delta.y);
        this.setRowHeightPoints(row, Math.round(px * 0.75 * 100) / 100);
      },
      () => {
        const height = this.spreadsheetRowHeights()[row - 1];
        if (typeof height === 'number') this.persistSheetSizes({ rowHeights: [{ row, height }] });
      }
    );
  }

  /** Double-clicking a column edge fits it to its widest value, as in Excel. */
  protected autoFitColumn(col: number): void {
    const measure = this.createTextMeasurer();
    let widest = 0;
    for (const cell of this.spreadsheetCells()) {
      if (cell.col !== col || (cell.colSpan ?? 1) > 1 || !cell.formattedValue) continue;
      const fontSize = cell.style?.fontSize ?? 11;
      widest = Math.max(widest, measure(cell.formattedValue, fontSize, !!cell.isBold));
    }
    // Cell padding (4px each side) plus the 1px gridline.
    const px = widest > 0 ? Math.ceil(widest) + 9 : SPREADSHEET_DEFAULT_COL_PX;
    const width = pxToExcelColumnChars(Math.max(SPREADSHEET_MIN_COL_PX, px));
    this.setColumnWidthChars(col, width);
    this.persistSheetSizes({ columnWidths: [{ col, width }] });
  }

  /** Double-clicking a row edge restores the default height. */
  protected resetRowHeight(row: number): void {
    this.setRowHeightPoints(row, null);
    this.persistSheetSizes({ rowHeights: [{ row, height: SPREADSHEET_DEFAULT_ROW_POINTS }] });
  }

  /**
   * Shared pointer drag for header resize grips. Pointer capture keeps the drag alive when the
   * cursor leaves the grip, and works the same for mouse, pen, and touch.
   */
  private trackHeaderResize(
    axis: 'col' | 'row',
    event: PointerEvent,
    onMove: (delta: { x: number; y: number }) => void,
    onEnd: () => void
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.commitCellEdit();

    const grip = event.currentTarget as HTMLElement;
    grip.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    this.resizingAxis.set(axis);

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY };
      if (!moved && Math.abs(axis === 'col' ? delta.x : delta.y) < 2) return;
      moved = true;
      onMove(delta);
    };
    const handleEnd = () => {
      grip.removeEventListener('pointermove', handleMove);
      grip.removeEventListener('pointerup', handleEnd);
      grip.removeEventListener('pointercancel', handleEnd);
      this.resizingAxis.set(null);
      if (moved) onEnd();
    };
    grip.addEventListener('pointermove', handleMove);
    grip.addEventListener('pointerup', handleEnd);
    grip.addEventListener('pointercancel', handleEnd);
  }

  private setColumnWidthChars(col: number, width: number | null): void {
    const next = [...this.spreadsheetColumnWidths()];
    while (next.length < col) next.push(null);
    next[col - 1] = width;
    this.spreadsheetColumnWidths.set(next);
  }

  private setRowHeightPoints(row: number, height: number | null): void {
    const next = [...this.spreadsheetRowHeights()];
    while (next.length < row) next.push(null);
    next[row - 1] = height;
    this.spreadsheetRowHeights.set(next);
  }

  /** Saves sizes into the .xlsx; CSV (or read-only viewers) keep the resize local. */
  private persistSheetSizes(sizes: {
    readonly columnWidths?: readonly { readonly col: number; readonly width: number }[];
    readonly rowHeights?: readonly { readonly row: number; readonly height: number }[];
  }): void {
    if (!this.editable || !this.canPersistSheetSizes()) return;
    const fileId = this.file.id;
    const sheetId = this.currentSheet()?.sheetId ?? 'sheet-1';

    this.cellSavesPending.update((n) => n + 1);
    this.cellSaveChain = this.cellSaveChain
      .then(async () => {
        const result = await this.client.updateSpreadsheetCells(fileId, {
          sheetId,
          edits: [],
          ...sizes,
        });
        // The new size stays on screen either way; only surface why it didn't save.
        if (!result.ok && this.file.id === fileId) this.cellSaveError.set(result.error);
      })
      .finally(() => this.cellSavesPending.update((n) => Math.max(0, n - 1)));
  }

  /** Measures text in the grid's font; falls back to an average glyph width without canvas. */
  private createTextMeasurer(): (text: string, fontSizePt: number, bold: boolean) => number {
    const context = this.isBrowser
      ? (document.createElement('canvas').getContext?.('2d') ?? null)
      : null;
    return (text, fontSizePt, bold) => {
      if (!context) return text.length * 7 * (fontSizePt / 11);
      context.font = `${bold ? '700 ' : ''}${fontSizePt}pt Calibri, Carlito, 'Segoe UI', Arial, sans-serif`;
      return context.measureText(text).width;
    };
  }

  /** Inline styles mirroring the workbook's fills, fonts, and alignment. */
  protected getCellCss(row: number, col: number): Record<string, string> | null {
    const cell = this.getCell(row, col);
    if (!cell) return null;
    const style = cell.style;
    const css: Record<string, string> = {};

    if (style?.backgroundColor) css['background-color'] = style.backgroundColor;
    if (style?.fontColor) css['color'] = style.fontColor;
    if (style?.isItalic) css['font-style'] = 'italic';
    const decorations = [style?.isUnderline && 'underline', style?.isStrike && 'line-through'];
    const textDecoration = decorations.filter(Boolean).join(' ');
    if (textDecoration) css['text-decoration'] = textDecoration;
    if (style?.fontSize) css['font-size'] = `${style.fontSize}pt`;
    if (style?.verticalAlign) css['vertical-align'] = style.verticalAlign;
    if (style?.wrapText) css['white-space'] = 'normal';

    // Excel defaults: numbers right-aligned, booleans centered, text left.
    const align =
      style?.horizontalAlign ??
      (typeof cell.value === 'number'
        ? 'right'
        : typeof cell.value === 'boolean'
          ? 'center'
          : undefined);
    if (align) css['text-align'] = align;

    return Object.keys(css).length > 0 ? css : null;
  }

  protected isCellSelected(row: number, col: number): boolean {
    const sel = this.cellSelection();
    if (!sel) return false;
    return row >= sel.startRow && row <= sel.endRow && col >= sel.startCol && col <= sel.endCol;
  }

  /**
   * Selects a cell, or with Shift held extends the selection from the current anchor
   * (Excel/Sheets behavior).
   */
  protected async onSelectCell(row: number, col: number, event?: MouseEvent): Promise<void> {
    const anchor = this.selectionAnchor();
    if (event?.shiftKey && anchor) {
      this.setCellSelection(anchor, { row, col });
    } else {
      this.setCellSelection({ row, col }, { row, col });
    }
    this.trackRangeSelected();
    await this.haptics.impact('light');
  }

  protected onCellMouseDown(row: number, col: number, event: MouseEvent): void {
    if (event.button !== 0) return;
    // Keep focus on the grid (for keyboard nav) and stop the browser's text-selection drag.
    event.preventDefault();
    this.commitCellEdit();
    this.focusGrid();
    void this.onSelectCell(row, col, event);
    if (event.shiftKey || !this.isBrowser) return;

    this.isDragSelecting = true;
    const endDrag = () => {
      this.isDragSelecting = false;
      window.removeEventListener('mouseup', endDrag);
      const sel = this.cellSelection();
      if (sel && this.isMultiCellSelection(sel)) this.trackRangeSelected();
    };
    window.addEventListener('mouseup', endDrag);
  }

  protected onCellMouseEnter(row: number, col: number): void {
    const anchor = this.selectionAnchor();
    if (!this.isDragSelecting || !anchor) return;
    const focus = this.selectionFocus();
    if (focus?.row === row && focus.col === col) return;
    this.setCellSelection(anchor, { row, col });
  }

  protected isMultiCellSelection(sel: DocumentCellSelection): boolean {
    return sel.startRow !== sel.endRow || sel.startCol !== sel.endCol;
  }

  protected onGridKeydown(event: KeyboardEvent): void {
    if (this.editingCell()) return;
    const focus = this.selectionFocus();
    if (!focus) return;

    const arrowDeltas: Record<string, readonly [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const arrow = arrowDeltas[event.key];
    if (arrow) {
      event.preventDefault();
      this.moveSelection(arrow[0], arrow[1], event.shiftKey);
      return;
    }

    const isModified = event.ctrlKey || event.metaKey || event.altKey;
    if (isModified) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void this.copySelectionToClipboard();
      }
      return;
    }

    switch (event.key) {
      case 'Tab':
        event.preventDefault();
        this.moveSelection(0, event.shiftKey ? -1 : 1, false);
        return;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        this.startCellEdit(focus.row, focus.col);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.clearSelectedCells();
        return;
      default:
        // Typing a character starts editing and replaces the cell's content, as in Excel.
        if (event.key.length === 1) {
          event.preventDefault();
          this.startCellEdit(focus.row, focus.col, event.key);
        }
    }
  }

  protected isCellEditing(row: number, col: number): boolean {
    const editing = this.editingCell();
    return !!editing && editing.row === row && editing.col === col;
  }

  protected editingCellLabel(): string {
    const editing = this.editingCell();
    return editing ? `${toSpreadsheetColumnName(editing.col)}${editing.row}` : '';
  }

  /** Opens the in-cell editor; `initialText` replaces the content (type-to-edit). */
  protected startCellEdit(row: number, col: number, initialText?: string): void {
    if (!this.editable || this.docType() !== 'spreadsheet') return;
    const target = this.resolveMergeMaster(row, col);
    const cell = this.getCell(target.row, target.col);
    const original = cell?.formula ? `=${cell.formula}` : (cell?.formattedValue ?? '');

    this.cellSaveError.set(null);
    this.setCellSelection(target, target);
    this.editingCell.set({
      ...target,
      sheetId: this.currentSheet()?.sheetId ?? 'sheet-1',
      original,
    });
    this.cellEditDraft.set(initialText ?? original);
  }

  protected onCellEditInput(event: Event): void {
    this.cellEditDraft.set((event.target as HTMLInputElement).value);
  }

  protected onCellEditorKeydown(event: KeyboardEvent): void {
    // The grid's own key handling must not see keystrokes meant for the editor.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitCellEdit();
      this.moveSelection(event.shiftKey ? -1 : 1, 0, false);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.commitCellEdit();
      this.moveSelection(0, event.shiftKey ? -1 : 1, false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.editingCell.set(null);
      this.focusGrid();
    }
  }

  /** Closes the editor and saves the draft if it changed. Safe to call when not editing. */
  protected commitCellEdit(): void {
    const editing = this.editingCell();
    if (!editing) return;
    this.editingCell.set(null);
    this.focusGrid();

    const draft = this.cellEditDraft();
    if (draft === editing.original) return;
    if (draft.trimStart().startsWith('=')) {
      this.cellSaveError.set(
        "Formulas can't be edited in the preview. Download the file to change formulas."
      );
      return;
    }
    this.applyCellEdits(editing.sheetId, [{ row: editing.row, col: editing.col, value: draft }]);
  }

  private clearSelectedCells(): void {
    const sel = this.cellSelection();
    if (!sel || !this.editable) return;
    const edits = this.spreadsheetCells()
      .filter(
        (cell) =>
          cell.row >= sel.startRow &&
          cell.row <= sel.endRow &&
          cell.col >= sel.startCol &&
          cell.col <= sel.endCol &&
          (cell.formattedValue ?? '') !== ''
      )
      .slice(0, MAX_CELL_EDITS_PER_SAVE)
      .map((cell) => ({ row: cell.row, col: cell.col, value: '' }));
    if (edits.length > 0) this.applyCellEdits(sel.sheetId, edits);
  }

  /**
   * Optimistically shows the edits, then saves them in order. A failed save restores the
   * previous cells and surfaces the server's message.
   */
  private applyCellEdits(
    sheetId: string,
    edits: readonly { readonly row: number; readonly col: number; readonly value: string }[]
  ): void {
    const fileId = this.file.id;
    const keys = new Set(edits.map((edit) => `${edit.row}:${edit.col}`));
    const previous = this.spreadsheetCells().filter((cell) => keys.has(`${cell.row}:${cell.col}`));

    this.mergeSpreadsheetCells(
      edits.map((edit) => {
        const existing = this.getCell(edit.row, edit.col);
        const numeric = Number(edit.value.replace(/,/g, ''));
        const value =
          edit.value.trim() === '' ? null : Number.isFinite(numeric) ? numeric : edit.value;
        return {
          ...(existing ?? { row: edit.row, col: edit.col }),
          value,
          formattedValue: edit.value,
          formula: undefined,
        };
      }),
      keys
    );

    const isSameGrid = () =>
      this.file.id === fileId && (this.currentSheet()?.sheetId ?? 'sheet-1') === sheetId;

    this.cellSavesPending.update((n) => n + 1);
    this.cellSaveChain = this.cellSaveChain
      .then(async () => {
        const result = await this.client.updateSpreadsheetCells(fileId, { sheetId, edits });
        if (!isSameGrid()) return;
        if (result.ok) {
          this.mergeSpreadsheetCells(result.cells, new Set());
          this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_RANGE_SELECTED, {
            document_id: fileId,
            sheet_name: this.currentSheet()?.name ?? '',
            range_a1: 'edit',
            cell_count: edits.length,
          });
        } else {
          this.mergeSpreadsheetCells(previous, keys);
          this.cellSaveError.set(result.error);
        }
      })
      .finally(() => this.cellSavesPending.update((n) => Math.max(0, n - 1)));
  }

  /** Replaces cells by position; `removeKeys` drops positions not present in `updates`. */
  private mergeSpreadsheetCells(
    updates: readonly DocumentSpreadsheetCell[],
    removeKeys: ReadonlySet<string>
  ): void {
    const byKey = new Map(updates.map((cell) => [`${cell.row}:${cell.col}`, cell]));
    const next = this.spreadsheetCells()
      .filter((cell) => {
        const key = `${cell.row}:${cell.col}`;
        return !removeKeys.has(key) || byKey.has(key);
      })
      .map((cell) => {
        const key = `${cell.row}:${cell.col}`;
        const update = byKey.get(key);
        if (!update) return cell;
        byKey.delete(key);
        // Keep merge spans; the server doesn't resend them for edited cells.
        return { ...update, rowSpan: cell.rowSpan, colSpan: cell.colSpan };
      });
    this.spreadsheetCells.set([...next, ...byKey.values()]);

    const anchor = this.selectionAnchor();
    const focus = this.selectionFocus();
    if (anchor && focus) this.setCellSelection(anchor, focus);
  }

  private moveSelection(deltaRow: number, deltaCol: number, extend: boolean): void {
    const focus = this.selectionFocus();
    const anchor = this.selectionAnchor();
    if (!focus || !anchor) return;
    const maxRow = this.visibleRowNumbers().length;
    const maxCol = this.visibleColNumbers().length;
    const next = {
      row: Math.min(maxRow, Math.max(1, focus.row + deltaRow)),
      col: Math.min(maxCol, Math.max(1, focus.col + deltaCol)),
    };
    if (extend) {
      this.setCellSelection(anchor, next);
    } else {
      const target = this.resolveMergeMaster(next.row, next.col);
      this.setCellSelection(target, target);
    }
    this.scrollCellIntoView(next.row, next.col);
  }

  /** Builds the selection (A1 range, Excel-style Count/Sum/Average) from two corners. */
  private setCellSelection(
    anchor: { readonly row: number; readonly col: number },
    focus: { readonly row: number; readonly col: number }
  ): void {
    this.selectionAnchor.set({ row: anchor.row, col: anchor.col });
    this.selectionFocus.set({ row: focus.row, col: focus.col });

    const sheet = this.currentSheet();
    const sheetName = sheet?.name ?? 'Sheet 1';
    const startRow = Math.min(anchor.row, focus.row);
    const endRow = Math.max(anchor.row, focus.row);
    const startCol = Math.min(anchor.col, focus.col);
    const endCol = Math.max(anchor.col, focus.col);
    const startRef = `${toSpreadsheetColumnName(startCol)}${startRow}`;
    const endRef = `${toSpreadsheetColumnName(endCol)}${endRow}`;

    const selectedCells = this.spreadsheetCells()
      .filter(
        (cell) =>
          cell.row >= startRow &&
          cell.row <= endRow &&
          cell.col >= startCol &&
          cell.col <= endCol &&
          (cell.formattedValue ?? '') !== ''
      )
      .sort((a, b) => a.row - b.row || a.col - b.col);
    const numbers = selectedCells
      .map((cell) => cell.value)
      .filter((value): value is number => typeof value === 'number');
    const sum = numbers.length > 0 ? numbers.reduce((total, n) => total + n, 0) : undefined;

    this.cellSelection.set({
      sheetId: sheet?.sheetId ?? 'sheet-1',
      sheetName,
      startRow,
      endRow,
      startCol,
      endCol,
      rangeA1: `${sheetName}!${startRef}${startRef === endRef ? '' : `:${endRef}`}`,
      selectedCells,
      count: selectedCells.length,
      sum: sum === undefined ? undefined : Number(sum.toPrecision(12)),
      average: sum === undefined ? undefined : sum / numbers.length,
    });
  }

  private trackRangeSelected(): void {
    const sel = this.cellSelection();
    if (!sel) return;
    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_RANGE_SELECTED, {
      document_id: this.file.id,
      sheet_name: sel.sheetName,
      range_a1: sel.rangeA1,
      cell_count: (sel.endRow - sel.startRow + 1) * (sel.endCol - sel.startCol + 1),
    });
  }

  /** Maps a cell hidden under a merge to the merge's top-left cell. */
  private resolveMergeMaster(row: number, col: number): { row: number; col: number } {
    if (!this.isCellCoveredByMerge(row, col)) return { row, col };
    const master = this.spreadsheetCells().find(
      (cell) =>
        row >= cell.row &&
        row < cell.row + (cell.rowSpan ?? 1) &&
        col >= cell.col &&
        col < cell.col + (cell.colSpan ?? 1)
    );
    return master ? { row: master.row, col: master.col } : { row, col };
  }

  private resetCellInteraction(): void {
    this.cellSelection.set(null);
    this.selectionAnchor.set(null);
    this.selectionFocus.set(null);
    this.editingCell.set(null);
    this.cellSaveError.set(null);
    this.isDragSelecting = false;
  }

  private focusGrid(): void {
    this.gridScrollWrap()?.nativeElement.focus({ preventScroll: true });
  }

  private scrollCellIntoView(row: number, col: number): void {
    if (!this.isBrowser) return;
    requestAnimationFrame(() => {
      this.gridScrollWrap()
        ?.nativeElement.querySelector(`[data-cell="${row}:${col}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  /** Copies the selection as tab-separated text so it pastes into Excel/Sheets as cells. */
  private async copySelectionToClipboard(): Promise<void> {
    const sel = this.cellSelection();
    if (!sel || !this.isBrowser || !navigator.clipboard) return;
    const lines: string[] = [];
    for (let row = sel.startRow; row <= sel.endRow; row++) {
      const values: string[] = [];
      for (let col = sel.startCol; col <= sel.endCol; col++) {
        values.push(this.getCell(row, col)?.formattedValue ?? '');
      }
      lines.push(values.join('\t'));
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // Clipboard permission denied; nothing useful to surface.
    }
  }

  /** Plain-text table of the selected values, so Agent X sees the data, not just the range. */
  private buildSelectionExcerpt(sel: DocumentCellSelection): string {
    const columns: string[] = [];
    for (let col = sel.startCol; col <= sel.endCol; col++) {
      columns.push(toSpreadsheetColumnName(col));
    }
    const lines = [`Selected cells ${sel.rangeA1}`, `Columns: ${columns.join(' | ')}`];
    for (let row = sel.startRow; row <= sel.endRow; row++) {
      const values: string[] = [];
      for (let col = sel.startCol; col <= sel.endCol; col++) {
        values.push(this.getCell(row, col)?.formattedValue ?? '');
      }
      if (values.every((value) => value === '')) continue;
      lines.push(`Row ${row}: ${values.join(' | ')}`);
    }
    const excerpt = lines.join('\n');
    return excerpt.length > MAX_SELECTION_EXCERPT_CHARS
      ? `${excerpt.slice(0, MAX_SELECTION_EXCERPT_CHARS)}\n… (selection truncated)`
      : excerpt;
  }

  protected async onSelectSheet(index: number): Promise<void> {
    // Save an in-progress edit against the sheet it was typed on before the grid swaps.
    this.commitCellEdit();
    await this.haptics.impact('light');
    await this.loadSpreadsheetRange(index);
    this.resetCellInteraction();

    const sheet = this.currentSheet();
    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_SHEET_CHANGED, {
      document_id: this.file.id,
      sheet_id: sheet?.sheetId ?? '',
      sheet_name: sheet?.name ?? '',
    });
  }

  protected async prevPage(): Promise<void> {
    if (this.currentPage() > 1) {
      await this.haptics.impact('light');
      // The render effect tracks currentPage; no direct render call (it would race the effect).
      this.currentPage.update((p) => p - 1);

      this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_PAGE_CHANGED, {
        document_id: this.file.id,
        page_number: this.currentPage(),
        total_pages: this.totalPages(),
      });
    }
  }

  protected async nextPage(): Promise<void> {
    if (this.currentPage() < this.totalPages()) {
      await this.haptics.impact('light');
      this.currentPage.update((p) => p + 1);

      this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_PAGE_CHANGED, {
        document_id: this.file.id,
        page_number: this.currentPage(),
        total_pages: this.totalPages(),
      });
    }
  }

  protected async prevSlide(): Promise<void> {
    if (this.currentSlide() > 1) {
      await this.haptics.impact('light');
      this.currentSlide.update((s) => s - 1);

      this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_SLIDE_CHANGED, {
        document_id: this.file.id,
        slide_number: this.currentSlide(),
        total_slides: this.totalSlides(),
      });
    }
  }

  protected async nextSlide(): Promise<void> {
    if (this.currentSlide() < this.totalSlides()) {
      await this.haptics.impact('light');
      this.currentSlide.update((s) => s + 1);

      this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_SLIDE_CHANGED, {
        document_id: this.file.id,
        slide_number: this.currentSlide(),
        total_slides: this.totalSlides(),
      });
    }
  }

  protected async goToSlide(slideNum: number): Promise<void> {
    await this.haptics.impact('light');
    this.currentSlide.set(slideNum);

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_SLIDE_CHANGED, {
      document_id: this.file.id,
      slide_number: slideNum,
      total_slides: this.totalSlides(),
    });
  }

  protected toggleSpreadsheetPrintableMode(): void {
    if (this.mode() === 'printable_pdf') {
      this.mode.set('preview');
      return;
    }
    // Only offered when a real printable PDF exists; load it so the canvas never shows stale pages.
    const url = this.printablePdfUrl();
    if (!url) return;
    this.currentPage.set(1);
    this.totalPages.set(1);
    this.mode.set('printable_pdf');
    void this.initPdfViewer(url);
  }

  protected zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(3.0, z + 0.25));
  }

  protected zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(0.5, z - 0.25));
  }

  protected rotateClockwise(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  protected askAgentButtonLabel(): string {
    return 'Ask Agent X';
  }

  protected toggleAskAgentDropdown(): void {
    this.askAgentDropdownOpen.update((open) => !open);
    if (this.askAgentDropdownOpen() && this.selectedAskAgentIndices().size === 0) {
      this.prefillCurrentAnchor();
    }
  }

  protected closeAskAgentDropdown(): void {
    this.askAgentDropdownOpen.set(false);
  }

  protected toggleAskAgentIndex(index: number): void {
    this.selectedAskAgentIndices.update((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  protected toggleAllPages(): void {
    if (this.isAllPagesSelected()) {
      this.selectedAskAgentIndices.set(new Set());
    } else {
      this.selectedAskAgentIndices.set(new Set(this.pageNumbers()));
    }
  }

  protected toggleAllSlides(): void {
    if (this.isAllSlidesSelected()) {
      this.selectedAskAgentIndices.set(new Set());
    } else {
      this.selectedAskAgentIndices.set(new Set(this.slideNumbers()));
    }
  }

  protected isAllPagesSelected(): boolean {
    return this.totalPages() > 0 && this.selectedAskAgentIndices().size === this.totalPages();
  }

  protected isAllSlidesSelected(): boolean {
    return this.totalSlides() > 0 && this.selectedAskAgentIndices().size === this.totalSlides();
  }

  protected pageNumbers(): readonly number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i + 1);
  }

  protected slideNumbers(): readonly number[] {
    return Array.from({ length: this.totalSlides() }, (_, i) => i + 1);
  }

  private prefillCurrentAnchor(): void {
    if (this.docType() === 'pdf') {
      this.selectedAskAgentIndices.set(new Set([this.currentPage()]));
    } else if (this.docType() === 'presentation') {
      this.selectedAskAgentIndices.set(new Set([this.currentSlide()]));
    }
  }

  protected confirmAskAgentSelection(): void {
    const indices = Array.from(this.selectedAskAgentIndices()).sort((a, b) => a - b);
    if (indices.length === 0) return;

    const isAllSelected =
      this.docType() === 'presentation' ? this.isAllSlidesSelected() : this.isAllPagesSelected();

    const f = this.file;
    const anchors: DocumentPreviewAnchor[] = indices.map((index) => {
      if (this.docType() === 'presentation') {
        return {
          documentFileId: f.id,
          anchorType: 'slide',
          slideNumber: index,
          label: `Slide ${index}`,
        };
      }
      return {
        documentFileId: f.id,
        anchorType: 'page',
        pageNumber: index,
        label: `Page ${index}`,
      };
    });

    this.askAgentRequested.emit({ anchors, isAllSelected });
    this.closeAskAgentDropdown();

    const anchorType = this.docType() === 'presentation' ? 'slide' : 'page';
    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: f.id,
      anchor_type: anchorType,
      anchor_label:
        indices.length === 1
          ? (anchors[0]?.label ?? '')
          : `${indices.length} ${anchorType === 'slide' ? 'slides' : 'pages'}`,
      anchor_count: indices.length,
    });
  }

  protected confirmAskAgentSheet(): void {
    const f = this.file;
    const sheet = this.currentSheet();
    const anchor: DocumentPreviewAnchor = {
      documentFileId: f.id,
      anchorType: 'sheet',
      sheetId: sheet?.sheetId,
      sheetName: sheet?.name,
      label: sheet ? `Sheet: ${sheet.name}` : 'Spreadsheet',
    };
    this.askAgentRequested.emit({ anchors: [anchor], isAllSelected: false });
    this.closeAskAgentDropdown();

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: f.id,
      anchor_type: 'sheet',
      anchor_label: anchor.label ?? '',
      anchor_count: 1,
    });
  }

  protected confirmAskAgentDocument(): void {
    const f = this.file;
    const anchor: DocumentPreviewAnchor = {
      documentFileId: f.id,
      anchorType: 'document',
      label: 'Entire document',
    };
    this.askAgentRequested.emit({ anchors: [anchor], isAllSelected: true });
    this.closeAskAgentDropdown();

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: f.id,
      anchor_type: 'document',
      anchor_label: anchor.label ?? '',
      anchor_count: 1,
    });
  }

  protected onAskAgentForCurrentAnchor(): void {
    const f = this.file;
    let anchor: DocumentPreviewAnchor;

    if (this.docType() === 'presentation') {
      anchor = {
        documentFileId: f.id,
        anchorType: 'slide',
        slideNumber: this.currentSlide(),
        label: `Slide ${this.currentSlide()}`,
      };
    } else if (this.docType() === 'spreadsheet') {
      const sheet = this.currentSheet();
      anchor = {
        documentFileId: f.id,
        anchorType: 'sheet',
        sheetId: sheet?.sheetId,
        sheetName: sheet?.name,
        label: sheet ? `Sheet: ${sheet.name}` : 'Spreadsheet',
      };
    } else {
      anchor = {
        documentFileId: f.id,
        anchorType: 'page',
        pageNumber: this.currentPage(),
        label: `Page ${this.currentPage()}`,
      };
    }

    this.askAgentRequested.emit({ anchors: [anchor], isAllSelected: false });

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: f.id,
      anchor_type: anchor.anchorType,
      anchor_label: anchor.label || '',
      anchor_count: 1,
    });
  }

  protected onAskAgentForSelection(): void {
    const sel = this.cellSelection();
    if (!sel) return;

    const anchor: DocumentPreviewAnchor = {
      documentFileId: this.file.id,
      anchorType: 'cell_range',
      sheetId: sel.sheetId,
      sheetName: sel.sheetName,
      rangeA1: sel.rangeA1,
      label: sel.rangeA1,
    };

    this.askAgentRequested.emit({
      anchors: [anchor],
      isAllSelected: false,
      excerpts: [this.buildSelectionExcerpt(sel)],
    });

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: this.file.id,
      anchor_type: 'cell_range',
      anchor_label: sel.rangeA1,
      anchor_count: 1,
    });
  }

  protected onOpenOriginal(): void {
    this.openOriginalRequested.emit(this.file);
  }

  protected onDownload(): void {
    this.downloadRequested.emit(this.file);
  }

  protected iconForDocumentType(type: UniversalFileDocumentType): string {
    switch (type) {
      case 'presentation':
        return 'expand';
      case 'spreadsheet':
        return 'documentText';
      case 'pdf':
      case 'word':
      default:
        return 'documentText';
    }
  }

  protected openActionLabel(): string {
    switch (this.docType()) {
      case 'presentation':
        return 'Open Presentation';
      case 'spreadsheet':
        return 'Open Spreadsheet';
      default:
        return 'Open Original';
    }
  }

  protected fallbackMessage(): string {
    // Raw reason codes are diagnostics, not user copy; unknown ones use the generic message below.
    const reason = this.fallbackReason();
    const mapped = reason ? FALLBACK_REASON_MESSAGES[reason] : undefined;
    if (mapped) return mapped;

    switch (this.docType()) {
      case 'presentation':
        return 'Presentation preview is not available for this deck. Open externally or download to view.';
      case 'spreadsheet':
        return 'Spreadsheet preview is not available for this file. Open externally or download to view.';
      default:
        return 'Document preview is currently unavailable for this file. Download or open externally to review.';
    }
  }
}
