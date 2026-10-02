/**
 * @fileoverview Universal Document Viewer Component
 * @module @nxt1/ui/components/document-viewer
 *
 * Enterprise in-app document viewer for Agent X / The Lab.
 * Supports:
 * - PDF documents (Mozilla PDF.js canvas rendering, page navigation, zoom, rotation)
 * - Presentation slide decks (16:9 stage, thumbnail strip, speaker notes, slide navigation)
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
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
import type { DocumentCellSelection, DocumentViewerMode } from './document-viewer.types';

@Component({
  selector: 'nxt1-document-viewer',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div
      class="nxt1-doc-viewer"
      [class.nxt1-doc-viewer--compact]="_compact()"
      [class.nxt1-doc-viewer--fullscreen]="isFullscreen()"
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

            @if (docType() === 'spreadsheet') {
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
            @if (docType() === 'pdf' || mode() === 'printable_pdf') {
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

            @if (docType() === 'presentation') {
              <button
                type="button"
                class="nxt1-doc-viewer__pill-btn"
                [class.nxt1-doc-viewer__pill-btn--active]="speakerNotesOpen()"
                [attr.data-testid]="testIds.SPEAKER_NOTES_TOGGLE"
                (click)="toggleSpeakerNotes()"
              >
                <span>Speaker Notes</span>
              </button>
            }

            <!-- Ask Agent Anchor Action -->
            <button
              type="button"
              class="nxt1-doc-viewer__ask-agent-btn"
              [attr.data-testid]="testIds.ASK_AGENT_BTN"
              aria-label="Ask Agent X about current view"
              (click)="onAskAgentForCurrentAnchor()"
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
              <span>{{ askAgentButtonLabel() }}</span>
            </button>

            <button
              type="button"
              class="nxt1-doc-viewer__icon-btn"
              [attr.data-testid]="testIds.FULLSCREEN_BTN"
              aria-label="Toggle fullscreen"
              title="Fullscreen"
              (click)="toggleFullscreen()"
            >
              <nxt1-icon name="expand" [size]="16" />
            </button>
          </div>
        </header>

        <!-- ═══ STAGE ═══ -->
        <main class="nxt1-doc-viewer__stage" [attr.data-testid]="testIds.STAGE">
          <!-- 1. PDF / Printable PDF Canvas Stage -->
          @if (docType() === 'pdf' || mode() === 'printable_pdf') {
            <div class="nxt1-doc-viewer__pdf-viewport">
              <div class="nxt1-doc-viewer__canvas-container" [style.transform]="canvasTransform()">
                <canvas #pdfCanvas class="nxt1-doc-viewer__pdf-canvas"></canvas>
              </div>
            </div>
          }

          <!-- 2. Presentation 16:9 Stage -->
          @if (docType() === 'presentation' && mode() !== 'printable_pdf') {
            <div
              class="nxt1-doc-viewer__presentation-stage"
              [attr.data-testid]="testIds.SLIDE_STAGE"
            >
              <div class="nxt1-doc-viewer__slide-card">
                @if (currentSlideData(); as slide) {
                  <div class="nxt1-doc-viewer__slide-header">
                    <span class="nxt1-doc-viewer__slide-badge">Slide {{ slide.slideNumber }}</span>
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

              <!-- Speaker notes drawer -->
              @if (speakerNotesOpen()) {
                <div
                  class="nxt1-doc-viewer__speaker-notes-drawer"
                  [attr.data-testid]="testIds.SPEAKER_NOTES_DRAWER"
                >
                  <div class="nxt1-doc-viewer__speaker-notes-header">
                    <h4>Speaker Notes & Coaching Cues</h4>
                    <button
                      type="button"
                      class="nxt1-doc-viewer__drawer-close"
                      (click)="toggleSpeakerNotes()"
                    >
                      <nxt1-icon name="close" [size]="14" />
                    </button>
                  </div>
                  <p class="nxt1-doc-viewer__speaker-notes-text">
                    {{ currentSlideData()?.speakerNotes || 'No speaker notes for this slide.' }}
                  </p>
                </div>
              }

              <!-- Bottom slide thumbnail rail -->
              @if (manifest()?.slides; as slideList) {
                <nav
                  class="nxt1-doc-viewer__slide-rail"
                  [attr.data-testid]="testIds.SLIDE_THUMB_STRIP"
                >
                  @for (s of slideList; track s.slideNumber) {
                    <button
                      type="button"
                      class="nxt1-doc-viewer__slide-thumb"
                      [class.nxt1-doc-viewer__slide-thumb--active]="
                        s.slideNumber === currentSlide()
                      "
                      (click)="goToSlide(s.slideNumber)"
                    >
                      <span class="nxt1-doc-viewer__thumb-num">{{ s.slideNumber }}</span>
                      <span class="nxt1-doc-viewer__thumb-label">{{
                        s.title || 'Slide ' + s.slideNumber
                      }}</span>
                    </button>
                  }
                </nav>
              }
            </div>
          }

          <!-- 3. Spreadsheet Data Grid Stage -->
          @if (docType() === 'spreadsheet' && mode() !== 'printable_pdf') {
            <div class="nxt1-doc-viewer__grid-stage" [attr.data-testid]="testIds.GRID_CONTAINER">
              <div class="nxt1-doc-viewer__grid-scroll-wrap">
                <table class="nxt1-doc-viewer__grid-table">
                  <thead>
                    <tr>
                      <th class="nxt1-doc-viewer__grid-corner">#</th>
                      @for (col of columnHeaderLabels(); track col) {
                        <th class="nxt1-doc-viewer__grid-col-hdr">{{ col }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (rowNum of visibleRowNumbers(); track rowNum) {
                      <tr>
                        <td class="nxt1-doc-viewer__grid-row-hdr">{{ rowNum }}</td>
                        @for (colNum of visibleColNumbers(); track colNum) {
                          @let cell = getCell(rowNum, colNum);
                          <td
                            class="nxt1-doc-viewer__grid-cell"
                            [class.nxt1-doc-viewer__grid-cell--header]="cell?.isHeader"
                            [class.nxt1-doc-viewer__grid-cell--bold]="cell?.isBold"
                            [class.nxt1-doc-viewer__grid-cell--selected]="
                              isCellSelected(rowNum, colNum)
                            "
                            (click)="onSelectCell(rowNum, colNum, $event)"
                          >
                            {{ cell?.formattedValue ?? '' }}
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

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
                    Ask Agent about selection
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
      }

      .nxt1-doc-viewer--fullscreen {
        position: fixed;
        inset: 0;
        z-index: 9999;
        border-radius: 0;
        border: 0;
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
        transition: background 0.15s ease;
      }

      .nxt1-doc-viewer__ask-agent-btn:hover {
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
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 24px;
      }

      .nxt1-doc-viewer__canvas-container {
        transform-origin: top center;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
        border-radius: 0;
        background: #ffffff;
      }

      .nxt1-doc-viewer__pdf-canvas {
        display: block;
        max-width: 100%;
        height: auto;
      }

      /* Presentation Stage */
      .nxt1-doc-viewer__presentation-stage {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        position: relative;
        gap: 16px;
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

      .nxt1-doc-viewer__speaker-notes-drawer {
        position: absolute;
        bottom: 72px;
        left: 24px;
        right: 24px;
        max-height: 160px;
        overflow-y: auto;
        padding: 14px 18px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #161616) 95%, #000 5%);
        border: 1px solid var(--nxt1-color-border-subtle, #333);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      }

      .nxt1-doc-viewer__speaker-notes-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .nxt1-doc-viewer__speaker-notes-header h4 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__drawer-close {
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-secondary, #aaa);
        cursor: pointer;
      }

      .nxt1-doc-viewer__speaker-notes-text {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      /* Spreadsheet Grid Stage */
      .nxt1-doc-viewer__grid-stage {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
      }

      .nxt1-doc-viewer__grid-scroll-wrap {
        flex: 1 1 auto;
        overflow: auto;
      }

      .nxt1-doc-viewer__grid-table {
        border-collapse: collapse;
        min-width: 100%;
        font-size: 12px;
        font-family: inherit;
      }

      .nxt1-doc-viewer__grid-corner,
      .nxt1-doc-viewer__grid-col-hdr,
      .nxt1-doc-viewer__grid-row-hdr {
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1c1c1c) 80%, #000 20%);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        font-weight: 700;
        padding: 6px 12px;
        border: 1px solid var(--nxt1-color-border-subtle, #282828);
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
        text-align: center;
      }

      .nxt1-doc-viewer__grid-cell {
        padding: 6px 12px;
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-border-subtle, #282828) 80%, transparent);
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        user-select: text;
        cursor: cell;
      }

      .nxt1-doc-viewer__grid-cell--bold {
        font-weight: 700;
      }

      .nxt1-doc-viewer__grid-cell--header {
        background: rgba(255, 255, 255, 0.04);
        font-weight: 600;
      }

      .nxt1-doc-viewer__grid-cell--selected {
        background: color-mix(in srgb, var(--agent-primary) 22%, transparent);
        outline: 1px solid var(--agent-primary);
      }

      .nxt1-doc-viewer__range-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200, #1c1c1c) 90%, #000 10%);
        border-top: 1px solid var(--nxt1-color-border-subtle, #282828);
        font-size: 11px;
        font-weight: 600;
      }

      .nxt1-doc-viewer__range-label {
        color: var(--agent-primary);
      }

      .nxt1-doc-viewer__stat {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
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
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #141414) 95%, #000 5%);
        border-top: 1px solid var(--nxt1-color-border-subtle, #282828);
        padding: 2px 8px;
      }

      .nxt1-doc-viewer__sheet-tab {
        border: 0;
        background: transparent;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        border-bottom: 2px solid transparent;
        cursor: pointer;
      }

      .nxt1-doc-viewer__sheet-tab--active {
        color: var(--agent-primary);
        border-bottom-color: var(--agent-primary);
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
      this._file.set(value);
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

  readonly anchorSelected = output<DocumentPreviewAnchor>();
  readonly askAgentRequested = output<DocumentPreviewAnchor>();
  readonly openOriginalRequested = output<AgentXLibraryFile>();
  readonly downloadRequested = output<AgentXLibraryFile>();

  protected readonly testIds = DOCUMENT_VIEWER_TEST_IDS;
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  protected readonly pdfCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pdfCanvas');

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
  readonly speakerNotesOpen = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  readonly cellSelection = signal<DocumentCellSelection | null>(null);
  readonly spreadsheetCells = signal<readonly DocumentSpreadsheetCell[]>([]);
  readonly spreadsheetTotalRows = signal<number>(50);
  readonly spreadsheetTotalCols = signal<number>(20);

  private pdfDocInstance: unknown = null;
  private pdfLoadingTask: { destroy(): Promise<void> } | null = null;
  private pdfWorker: Worker | null = null;
  private pdfjsRuntime: { GlobalWorkerOptions: { workerPort: Worker | null } } | null = null;
  private isRenderingPdfPage = false;
  readonly pdfReady = signal(false);

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

  readonly canvasTransform = computed<string>(() => {
    return `scale(${this.zoomLevel()}) rotate(${this.rotation()}deg)`;
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

  readonly columnHeaderLabels = computed<readonly string[]>(() => {
    const total = Math.min(30, Math.max(10, this.spreadsheetTotalCols()));
    return Array.from({ length: total }, (_, i) => String.fromCharCode(65 + i));
  });

  readonly visibleColNumbers = computed<readonly number[]>(() => {
    const total = Math.min(30, Math.max(10, this.spreadsheetTotalCols()));
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  readonly visibleRowNumbers = computed<readonly number[]>(() => {
    const total = Math.min(60, Math.max(20, this.spreadsheetTotalRows()));
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  constructor() {
    effect(() => {
      const canvas = this.pdfCanvas();
      const ready = this.pdfReady();
      this.currentPage();
      if (canvas && ready) void this.renderCurrentPdfPage();
    });
  }

  private async loadDocumentPreview(fileId: string): Promise<void> {
    if (!fileId) return;
    this.loading.set(true);
    this.error.set(null);
    this.fallbackReason.set(null);
    this.logger.info('Loading document preview', { fileId, fileName: this.file.name });
    this.breadcrumbs.trackStateChange('document-viewer:preview-loading', {
      fileId,
      fileName: this.file.name,
    });

    try {
      const session = await this.client.getPreviewSession(fileId);

      if (session.available && session.manifest) {
        this.manifest.set(session.manifest);
        this.totalPages.set(Math.max(1, session.manifest.pageCount));
        this.totalSlides.set(session.manifest.slides?.length ?? 1);
        this.currentSlide.set(this._initialSlide());
        this.currentPage.set(this._initialPage());
        this.mode.set('preview');

        this.breadcrumbs.trackStateChange('document-viewer:preview-ready', {
          fileId,
          docType: session.manifest.documentType,
        });

        if (session.manifest.documentType === 'spreadsheet') {
          void this.loadSpreadsheetRange(0);
        } else if (session.manifest.documentType === 'pdf') {
          const pdfTargetUrl = session.manifest.pdfUrl || this.file.url;
          if (pdfTargetUrl) {
            void this.initPdfViewer(pdfTargetUrl);
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
      } else {
        this.fallbackReason.set(session.reason ?? 'unavailable');
        this.mode.set('fallback');
      }
    } catch (err) {
      if (this.docType() === 'pdf' && this.file.url) {
        void this.initPdfViewer(this.file.url);
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
      this.loading.set(false);
    }
  }

  private async initPdfViewer(pdfUrl: string): Promise<void> {
    if (!this.isBrowser) return;

    try {
      this.pdfReady.set(false);
      await this.pdfLoadingTask?.destroy().catch(() => undefined);

      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (${response.status})`);
      }
      const pdfData = new Uint8Array(await response.arrayBuffer());
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      this.pdfWorker ??= new Worker(new URL('./pdfjs.worker', import.meta.url), {
        type: 'module',
      });
      this.pdfjsRuntime = pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerPort = this.pdfWorker;
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        disableFontFace: true,
      });
      this.pdfLoadingTask = loadingTask;
      const pdf = await loadingTask.promise;
      this.pdfDocInstance = pdf;
      this.totalPages.set(pdf.numPages);
      this.pdfReady.set(true);
    } catch (err) {
      this.logger.warn('PDF.js canvas rendering failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.fallbackReason.set('pdf_render_failed');
      this.mode.set('fallback');
    }
  }

  ngOnDestroy(): void {
    this.pdfReady.set(false);
    void this.pdfLoadingTask?.destroy().catch(() => undefined);
    this.pdfLoadingTask = null;
    this.pdfDocInstance = null;
    if (this.pdfjsRuntime?.GlobalWorkerOptions.workerPort === this.pdfWorker) {
      this.pdfjsRuntime.GlobalWorkerOptions.workerPort = null;
    }
    this.pdfWorker?.terminate();
    this.pdfWorker = null;
    this.pdfjsRuntime = null;
  }

  private async renderCurrentPdfPage(): Promise<void> {
    if (!this.isBrowser || !this.pdfDocInstance || this.isRenderingPdfPage) return;

    const canvas = this.pdfCanvas()?.nativeElement;
    if (!canvas) return;

    this.isRenderingPdfPage = true;
    try {
      const pdf = this.pdfDocInstance as {
        getPage(num: number): Promise<{
          getViewport(options: { scale: number }): { width: number; height: number };
          render(params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
            promise: Promise<void>;
          };
        }>;
      };

      const page = await pdf.getPage(this.currentPage());
      const viewport = page.getViewport({ scale: 1.5 });
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    } catch (err) {
      this.logger.warn('Error rendering PDF page', {
        page: this.currentPage(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isRenderingPdfPage = false;
    }
  }

  private async loadSpreadsheetRange(sheetIndex: number): Promise<void> {
    const manifest = this.manifest();
    const sheet = manifest?.sheets?.[sheetIndex];
    if (!sheet) return;

    this.currentSheetIndex.set(sheetIndex);
    this.spreadsheetTotalRows.set(sheet.rowCount);
    this.spreadsheetTotalCols.set(sheet.columnCount);

    const rangeData = await this.client.getSpreadsheetRange(this.file.id, {
      sheetId: sheet.sheetId,
      startRow: 1,
      endRow: Math.min(60, sheet.rowCount),
      startCol: 1,
      endCol: Math.min(30, sheet.columnCount),
    });

    if (rangeData) {
      this.spreadsheetCells.set(rangeData.cells);
    }
  }

  protected getCell(row: number, col: number): DocumentSpreadsheetCell | undefined {
    return this.spreadsheetCells().find((c) => c.row === row && c.col === col);
  }

  protected isCellSelected(row: number, col: number): boolean {
    const sel = this.cellSelection();
    if (!sel) return false;
    return row >= sel.startRow && row <= sel.endRow && col >= sel.startCol && col <= sel.endCol;
  }

  protected async onSelectCell(row: number, col: number, _event?: MouseEvent): Promise<void> {
    await this.haptics.impact('light');
    const sheet = this.currentSheet();
    const sheetName = sheet?.name ?? 'Sheet 1';
    const sheetId = sheet?.sheetId ?? 'sheet-1';

    const colLetter = String.fromCharCode(65 + col - 1);
    const rangeA1 = `${sheetName}!${colLetter}${row}`;
    const cell = this.getCell(row, col);

    const sel: DocumentCellSelection = {
      sheetId,
      sheetName,
      startRow: row,
      endRow: row,
      startCol: col,
      endCol: col,
      rangeA1,
      selectedCells: cell ? [cell] : [],
      count: 1,
      sum: typeof cell?.value === 'number' ? cell.value : undefined,
      average: typeof cell?.value === 'number' ? cell.value : undefined,
    };

    this.cellSelection.set(sel);

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_RANGE_SELECTED, {
      document_id: this.file.id,
      sheet_name: sheetName,
      range_a1: rangeA1,
      cell_count: 1,
    });
  }

  protected async onSelectSheet(index: number): Promise<void> {
    await this.haptics.impact('light');
    await this.loadSpreadsheetRange(index);
    this.cellSelection.set(null);

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
      this.currentPage.update((p) => p - 1);
      void this.renderCurrentPdfPage();

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
      void this.renderCurrentPdfPage();

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

  protected toggleSpeakerNotes(): void {
    this.speakerNotesOpen.update((v) => !v);
  }

  protected toggleSpreadsheetPrintableMode(): void {
    this.mode.update((m) => (m === 'printable_pdf' ? 'preview' : 'printable_pdf'));
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

  protected toggleFullscreen(): void {
    this.isFullscreen.update((f) => !f);
  }

  protected askAgentButtonLabel(): string {
    switch (this.docType()) {
      case 'presentation':
        return `Ask Agent (Slide ${this.currentSlide()})`;
      case 'spreadsheet':
        return 'Ask Agent';
      case 'pdf':
      default:
        return `Ask Agent (Page ${this.currentPage()})`;
    }
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

    this.askAgentRequested.emit(anchor);

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: f.id,
      anchor_type: anchor.anchorType,
      anchor_label: anchor.label || '',
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

    this.askAgentRequested.emit(anchor);

    this.analytics?.trackEvent(APP_EVENTS.DOCUMENT_ASK_AGENT, {
      document_id: this.file.id,
      anchor_type: 'cell_range',
      anchor_label: sel.rangeA1,
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
    const reason = this.fallbackReason();
    if (reason) {
      return `Document preview is currently unavailable (${reason}). Download or open externally to review.`;
    }

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
