import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, type SafeHtml, type SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { getSportPlaybookConfig } from '@nxt1/core';
import type {
  DiagramAssetDetail,
  DiagramAssetKind,
  DiagramAssetSummary,
  DiagramFieldStyle,
  DiagramLayout,
  DiagramPlayer,
  DiagramPlayerShape,
  DiagramRoute,
  DiagramRouteType,
  DiagramZone,
} from '@nxt1/core/ai';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import {
  NxtMediaViewerService,
  type MediaViewerBreakdown,
  type MediaViewerBreakdownEditorConfig,
  type MediaViewerBreakdownSection,
  type MediaViewerDiagramSvgTarget,
  type MediaViewerDiagramToolsConfig,
} from '../../../components/media-viewer';
import { NxtModalHeaderComponent } from '../../../components/overlay/modal-header.component';
import { NxtStateViewComponent } from '../../../components/state-view';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXDiagramService } from '../../services/agent-x-diagram.service';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import {
  DIAGRAM_DEFENSIVE_SHELL_OPTIONS,
  DIAGRAM_FIELD_STYLE_OPTIONS,
  DIAGRAM_ROUTE_TYPE_OPTIONS,
  EMPTY_DIAGRAM_FILTERS,
  type DiagramBuilderSelection,
  type DiagramDefensiveShell,
  type DiagramBuilderTool,
} from './agent-x-diagrams-panel.types';
import {
  applyFootballDefensiveShell,
  buildSvgPath,
  buildDiagramDragContext,
  cloneDiagramLayout,
  createRouteId,
  createZoneId,
  getDiagramKindLabel,
  getFieldPalette,
  getPlayerById,
  getRouteById,
  getRouteColor as resolveRouteColor,
  getZoneById,
  matchesDiagramQuery,
  relievePlayerOverlap,
  removeFootballDefensiveShell,
  snapDiagramLayoutToGrid,
} from './agent-x-diagrams-panel.utils';
import {
  parseTags,
  toTitleCase,
  type MutationResponse,
  type PlaybookDetailResponse,
  type PlaybooksResponse,
  type PlaybookPlay,
  type PlaybookSummary,
} from './agent-x-playbooks-panel.types';
import { getStageDisplayNameValue } from './agent-x-playbooks-panel.utils';

interface DiagramBuilderDragState {
  readonly type: DiagramBuilderSelection['type'];
  readonly id: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly pointerId: number;
  readonly historyCaptured: boolean;
}

interface DiagramRouteDrawState {
  readonly type: DiagramRouteType;
  readonly start: DiagramPoint;
  readonly current: DiagramPoint;
  readonly pointerId: number;
}

type DiagramPendingPlacement =
  | { readonly kind: 'player'; readonly shape: DiagramPlayerShape }
  | { readonly kind: 'route'; readonly type: DiagramRouteType }
  | { readonly kind: 'zone'; readonly shape: 'rect' | 'text' };

interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

interface LinkedPlayContext {
  readonly playbookId: string;
  readonly playIndex: number;
  readonly play: PlaybookPlay;
  readonly playbook: PlaybookSummary;
}

interface DiagramPalettePlayerTool {
  readonly shape: DiagramPlayerShape;
  readonly label: string;
  readonly title: string;
}

interface DiagramPaletteRouteTool {
  readonly type: DiagramRouteType;
  readonly label: string;
  readonly title: string;
  readonly kind: 'line' | 'block' | 'motion';
}

const DIAGRAM_PLAYER_PALETTE: readonly DiagramPalettePlayerTool[] = [
  { shape: 'circle', label: 'O', title: 'Add circle player' },
  { shape: 'triangle', label: 'Tri', title: 'Add triangle marker' },
  { shape: 'square', label: 'Sq', title: 'Add square player' },
] as const;

const DIAGRAM_ROUTE_PALETTE: readonly DiagramPaletteRouteTool[] = [
  { type: 'go', label: 'Line', title: 'Add route line', kind: 'line' },
  { type: 'block', label: 'Block', title: 'Add block line', kind: 'block' },
  { type: 'drag', label: 'Motion', title: 'Add motion line', kind: 'motion' },
] as const;

const MAX_BUILDER_HISTORY_STEPS = 100;

@Component({
  selector: 'nxt1-agent-x-diagrams-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtIconComponent,
    NxtModalHeaderComponent,
    NxtStateViewComponent,
    AgentXContextDragDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="diagrams-panel" [attr.data-testid]="testIds.PANEL_CONTAINER">
      <aside class="diagrams-panel__rail" aria-label="Diagram library">
        <div class="diagrams-panel__toolbar">
          <div class="diagrams-panel__search-wrap">
            <nxt1-icon name="search" [size]="14"></nxt1-icon>
            <input
              class="diagrams-panel__search"
              type="search"
              [ngModel]="filters().query"
              (ngModelChange)="setSearchQuery($event)"
              placeholder="Search diagrams"
            />
          </div>
        </div>

        @if (service.loading()) {
          <div
            class="diagrams-panel__loading-rail"
            [attr.data-testid]="testIds.LOADING_SKELETON"
            aria-hidden="true"
          >
            @for (item of skeletonItems; track item) {
              <div class="diagrams-panel__loading-card diagrams-panel__loading-card--library"></div>
            }
          </div>
        } @else if (service.error()) {
          <nxt1-state-view
            variant="error"
            title="Unable to load"
            [message]="service.error() ?? 'Failed to load diagrams'"
            actionLabel="Try Again"
            actionIcon="refresh"
            [attr.data-testid]="testIds.ERROR_STATE"
            (action)="refresh()"
          />
        } @else {
          <div class="diagrams-panel__list" [attr.data-testid]="testIds.LIST_CONTAINER">
            @for (diagram of filteredDiagrams(); track diagram.id) {
              <button
                type="button"
                class="diagrams-panel__list-item"
                [class.diagrams-panel__list-item--active]="diagram.id === service.selectedId()"
                [nxtAgentXContextDrag]="buildContext(diagram)"
                [attr.data-testid]="testIds.LIST_ITEM"
                (click)="selectDiagram(diagram.id)"
              >
                <span class="diagrams-panel__thumb">
                  <img [src]="diagram.imageUrl" [alt]="diagram.title" loading="lazy" />
                </span>
                <span class="diagrams-panel__item-main">
                  <span class="diagrams-panel__item-title">{{ diagram.title }}</span>
                  <span class="diagrams-panel__item-meta">
                    {{ diagram.sport | titlecase }} • {{ getKindLabel(diagram.kind) }}
                  </span>
                </span>
              </button>
            }
          </div>
        }
      </aside>

      <section class="diagrams-panel__viewer" [attr.data-testid]="testIds.VIEWER">
        @if (service.loading()) {
          <div class="diagrams-panel__loading-viewer" aria-hidden="true">
            <div class="diagrams-panel__loading-card diagrams-panel__loading-card--viewer"></div>
            <div class="diagrams-panel__loading-card diagrams-panel__loading-card--toolbar"></div>
          </div>
        } @else if (selectedDiagram(); as diagram) {
          <div
            class="diagrams-panel__workspace"
            [class.diagrams-panel__workspace--modal]="editMode()"
            [attr.role]="editMode() ? 'dialog' : null"
            [attr.aria-modal]="editMode() ? 'true' : null"
            [attr.aria-label]="editMode() ? 'Edit ' + diagram.title : null"
          >
            @if (editMode()) {
              <nxt1-modal-header
                [title]="diagram.title"
                subtitle="Diagram Editor"
                closePosition="left"
                [showBorder]="true"
                closeTestId="agent-x-diagram-editor-close"
                (closeModal)="toggleEditMode(diagram)"
              />
            }
            <div
              class="diagrams-panel__builder-toolbar"
              [attr.data-testid]="testIds.BUILDER_TOOLBAR"
            >
              <div
                class="diagrams-panel__tool-group diagrams-panel__tool-group--builder"
                aria-label="Builder tools"
              >
                <div class="diagrams-panel__tool-cluster">
                  <div
                    class="diagrams-panel__palette"
                    aria-label="Diagram creation tools"
                    [attr.data-testid]="testIds.BUILDER_TOOL_PALETTE"
                  >
                    <button
                      type="button"
                      class="diagrams-panel__palette-btn"
                      [class.diagrams-panel__palette-btn--active]="editMode()"
                      [attr.aria-label]="editMode() ? 'Close builder' : 'Open builder'"
                      [attr.data-testid]="testIds.BUILDER_EDIT_BUTTON"
                      [attr.title]="editMode() ? 'Close builder' : 'Open builder'"
                      (click)="toggleEditMode(diagram)"
                    >
                      <nxt1-icon name="pencil" [size]="14"></nxt1-icon>
                    </button>

                    @if (editMode()) {
                      @for (tool of playerPalette; track tool.shape) {
                        <button
                          type="button"
                          class="diagrams-panel__palette-btn"
                          [class.diagrams-panel__palette-btn--active]="
                            isPendingPlayerPlacement(tool.shape)
                          "
                          [attr.title]="tool.title"
                          [attr.aria-label]="tool.title"
                          [attr.data-testid]="testIds.BUILDER_ADD_PLAYER_BUTTON"
                          (click)="addPlayer(tool.shape)"
                        >
                          <span
                            class="diagrams-panel__palette-icon diagrams-panel__palette-icon--player"
                            [class.diagrams-panel__palette-icon--circle]="tool.shape === 'circle'"
                            [class.diagrams-panel__palette-icon--triangle]="
                              tool.shape === 'triangle'
                            "
                            [class.diagrams-panel__palette-icon--square]="tool.shape === 'square'"
                            aria-hidden="true"
                          ></span>
                        </button>
                      }

                      <button
                        type="button"
                        class="diagrams-panel__palette-btn"
                        [class.diagrams-panel__palette-btn--active]="isPendingZonePlacement('text')"
                        title="Add text label"
                        aria-label="Add text label"
                        [attr.data-testid]="testIds.BUILDER_ADD_TEXT_BUTTON"
                        (click)="addTextLabel()"
                      >
                        <span class="diagrams-panel__palette-text-icon" aria-hidden="true">Ab</span>
                      </button>

                      @for (tool of routePalette; track tool.kind) {
                        <button
                          type="button"
                          class="diagrams-panel__palette-btn"
                          [class.diagrams-panel__palette-btn--active]="
                            isPendingRoutePlacement(tool.type)
                          "
                          [attr.title]="tool.title"
                          [attr.aria-label]="tool.title"
                          [attr.data-testid]="
                            tool.kind === 'block'
                              ? testIds.BUILDER_ADD_BLOCK_BUTTON
                              : tool.kind === 'motion'
                                ? testIds.BUILDER_ADD_MOTION_BUTTON
                                : testIds.BUILDER_ADD_ROUTE_BUTTON
                          "
                          (click)="addRoute(tool.type)"
                        >
                          <span
                            class="diagrams-panel__palette-icon diagrams-panel__palette-icon--route"
                            [class.diagrams-panel__palette-icon--block-line]="tool.kind === 'block'"
                            [class.diagrams-panel__palette-icon--motion-line]="
                              tool.kind === 'motion'
                            "
                            aria-hidden="true"
                          ></span>
                        </button>
                      }

                      <button
                        type="button"
                        class="diagrams-panel__palette-btn"
                        [class.diagrams-panel__palette-btn--active]="isPendingZonePlacement('rect')"
                        title="Add zone shape"
                        aria-label="Add zone shape"
                        [attr.data-testid]="testIds.BUILDER_ADD_ZONE_BUTTON"
                        (click)="addZone()"
                      >
                        <span
                          class="diagrams-panel__palette-icon diagrams-panel__palette-icon--zone"
                          aria-hidden="true"
                        ></span>
                      </button>

                      @if (builderLayout(); as layout) {
                        <details class="diagrams-panel__options-menu">
                          <summary
                            class="diagrams-panel__palette-btn diagrams-panel__options-trigger"
                            aria-label="Background styles"
                            title="Background styles"
                          >
                            <nxt1-icon name="image" [size]="14"></nxt1-icon>
                          </summary>

                          <div
                            class="diagrams-panel__options-popover diagrams-panel__options-popover--compact"
                          >
                            <section
                              class="diagrams-panel__inspector-section diagrams-panel__inspector-section--compact"
                            >
                              <h3>Background</h3>
                              <div class="diagrams-panel__segmented">
                                @for (option of fieldStyleOptions; track option.id) {
                                  <button
                                    type="button"
                                    [class.diagrams-panel__segment--active]="
                                      (layout.fieldStyle ?? 'classic') === option.id
                                    "
                                    [attr.data-testid]="testIds.BUILDER_FIELD_STYLE_OPTION"
                                    (click)="updateFieldStyle(option.id)"
                                  >
                                    {{ option.label }}
                                  </button>
                                }
                              </div>
                            </section>
                          </div>
                        </details>

                        @if (supportsDefensiveShells(layout)) {
                          <details class="diagrams-panel__options-menu">
                            <summary
                              class="diagrams-panel__palette-btn diagrams-panel__options-trigger"
                              aria-label="Defensive shells"
                              title="Defensive shells"
                            >
                              <nxt1-icon name="shield" [size]="14"></nxt1-icon>
                            </summary>

                            <div
                              class="diagrams-panel__options-popover diagrams-panel__options-popover--compact"
                              [attr.data-testid]="testIds.BUILDER_INSPECTOR"
                            >
                              <section
                                class="diagrams-panel__inspector-section diagrams-panel__inspector-section--compact"
                              >
                                <h3>Defensive Shells</h3>
                                <div
                                  class="diagrams-panel__segmented diagrams-panel__segmented--shells"
                                >
                                  @for (option of defensiveShellOptions; track option.id) {
                                    <button type="button" (click)="applyDefensiveShell(option.id)">
                                      {{ option.label }}
                                    </button>
                                  }
                                </div>
                                <button
                                  type="button"
                                  class="diagrams-panel__tool-btn diagrams-panel__primary-btn--full"
                                  (click)="clearDefensiveShell()"
                                >
                                  Clear Shell Overlay
                                </button>
                              </section>
                            </div>
                          </details>
                        }
                      }
                    }
                  </div>
                </div>

                @if (editMode() && builderLayout(); as layout) {
                  @if (selectedRoute(); as route) {
                    <input
                      class="diagrams-panel__toolbar-input diagrams-panel__toolbar-input--label"
                      [ngModel]="route.label ?? ''"
                      (ngModelChange)="updateSelectedRouteLabel($event)"
                      aria-label="Line label"
                      placeholder="Label"
                    />
                    <select
                      class="diagrams-panel__toolbar-input diagrams-panel__toolbar-select"
                      [ngModel]="route.type ?? 'go'"
                      (ngModelChange)="updateSelectedRouteType($event)"
                      aria-label="Line type"
                    >
                      @for (option of routeTypeOptions; track option.id) {
                        <option [ngValue]="option.id">{{ option.label }}</option>
                      }
                    </select>
                    <input
                      class="diagrams-panel__toolbar-color"
                      type="color"
                      [ngModel]="getRouteColor(route)"
                      (ngModelChange)="updateSelectedRouteColor($event)"
                      aria-label="Line color"
                    />
                    <label class="diagrams-panel__toolbar-check">
                      <input
                        type="checkbox"
                        [ngModel]="route.curve === true"
                        (ngModelChange)="updateSelectedRouteCurve($event)"
                      />
                      Curve
                    </label>
                  } @else if (selectedZone(); as zone) {
                    <input
                      class="diagrams-panel__toolbar-input diagrams-panel__toolbar-input--label"
                      [ngModel]="zone.label"
                      (ngModelChange)="updateSelectedZoneLabel($event)"
                      aria-label="Zone label"
                      placeholder="Label"
                    />
                  }
                }
              </div>

              @if (editMode()) {
                <div class="diagrams-panel__tool-group diagrams-panel__tool-group--save">
                  @if (builderDirty()) {
                    <span class="diagrams-panel__dirty-dot">Unsaved</span>
                  }
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [disabled]="service.saving() || !canUndo()"
                    [attr.aria-label]="'Undo last builder change'"
                    [attr.data-testid]="testIds.BUILDER_UNDO_BUTTON"
                    title="Undo"
                    (click)="undoBuilderChange()"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [disabled]="service.saving() || !canRedo()"
                    [attr.aria-label]="'Redo last builder change'"
                    [attr.data-testid]="testIds.BUILDER_REDO_BUTTON"
                    title="Redo"
                    (click)="redoBuilderChange()"
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [disabled]="service.saving() || !builderDirty()"
                    [attr.data-testid]="testIds.BUILDER_DISCARD_BUTTON"
                    (click)="discardBuilderDraft()"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn diagrams-panel__tool-btn--primary"
                    [disabled]="service.saving() || !builderDirty()"
                    [attr.data-testid]="testIds.BUILDER_SAVE_BUTTON"
                    (click)="saveBuilderDraft(diagram)"
                  >
                    Save
                  </button>
                </div>
              }
            </div>

            <div
              class="diagrams-panel__builder-body"
              [class.diagrams-panel__builder-body--editing]="editMode()"
            >
              <div class="diagrams-panel__image-stage" [attr.data-testid]="testIds.BUILDER_CANVAS">
                @if (getRenderableLayout(diagram); as layout) {
                  <svg
                    class="diagrams-panel__builder-svg"
                    [class.diagrams-panel__builder-svg--readonly]="!editMode()"
                    [class.diagrams-panel__builder-svg--placing]="hasPendingPlacement()"
                    [attr.viewBox]="getLayoutViewBox(layout)"
                    [attr.aria-label]="layout.title"
                    (pointerdown)="handleBuilderCanvasPointerDown($event)"
                    (pointermove)="handleBuilderPointerMove($event)"
                    (pointerup)="finishBuilderDrag($event)"
                    (pointercancel)="finishBuilderDrag($event)"
                    (pointerleave)="handleBuilderPointerLeave($event)"
                    role="img"
                  >
                    <defs>
                      <marker
                        id="builder-arr-go"
                        markerWidth="11"
                        markerHeight="11"
                        refX="9.4"
                        refY="5.5"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M0,0 L11,5.5 L0,11 L2.5,5.5 z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-block"
                        markerWidth="14"
                        markerHeight="14"
                        refX="7"
                        refY="7"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path
                          d="M7,1.8 L7,12.2 M2,6.2 L12,6.2"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="2.6"
                          stroke-linecap="round"
                        ></path>
                      </marker>
                      <marker
                        id="builder-arr-screen"
                        markerWidth="12"
                        markerHeight="12"
                        refX="10.6"
                        refY="6"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <rect
                          x="1.3"
                          y="1.3"
                          width="9.4"
                          height="9.4"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="1.9"
                          rx="1.4"
                          ry="1.4"
                        ></rect>
                      </marker>
                      <marker
                        id="builder-arr-pick"
                        markerWidth="13"
                        markerHeight="13"
                        refX="9.3"
                        refY="6.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <circle
                          cx="6.5"
                          cy="6.5"
                          r="5.2"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="2.2"
                        ></circle>
                      </marker>
                      <marker
                        id="builder-arr-cut"
                        markerWidth="11"
                        markerHeight="11"
                        refX="9.5"
                        refY="5.5"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M0,0 L11,5.5 L0,11 Z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-drag"
                        markerWidth="11"
                        markerHeight="11"
                        refX="9.1"
                        refY="5.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,1 L9.2,5.5 L0,10 L2,5.5 z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-space"
                        markerWidth="10"
                        markerHeight="10"
                        refX="6.2"
                        refY="5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <circle cx="5" cy="5" r="2.9" fill="context-stroke"></circle>
                      </marker>
                      <marker
                        id="builder-arr-fade"
                        markerWidth="11"
                        markerHeight="11"
                        refX="6.8"
                        refY="5.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path
                          d="M0,5.5 L6.8,2.2 L8.8,5.5 L6.8,8.8 Z"
                          fill="context-stroke"
                          opacity="0.68"
                        ></path>
                      </marker>
                    </defs>
                    <rect
                      class="diagrams-panel__field-bg"
                      [attr.class]="getFieldClass(layout)"
                      [attr.fill]="getFieldFill(layout)"
                      x="0"
                      y="0"
                      [attr.width]="layout.fieldWidth"
                      [attr.height]="layout.fieldHeight"
                    ></rect>
                    @for (stripe of getFieldStripes(layout); track stripe.id) {
                      <rect
                        [attr.x]="stripe.x"
                        [attr.y]="stripe.y"
                        [attr.width]="stripe.width"
                        [attr.height]="stripe.height"
                        [attr.fill]="stripe.fill"
                        [attr.opacity]="stripe.opacity"
                      ></rect>
                    }
                    @for (line of getFieldLines(layout); track line.id) {
                      <line
                        class="diagrams-panel__field-line"
                        [attr.x1]="line.x1"
                        [attr.y1]="line.y1"
                        [attr.x2]="line.x2"
                        [attr.y2]="line.y2"
                        [attr.stroke]="line.stroke"
                      ></line>
                    }
                    @for (hash of getFootballHashMarks(layout); track hash.id) {
                      <line
                        class="diagrams-panel__hash-mark"
                        [attr.x1]="hash.x1"
                        [attr.y1]="hash.y1"
                        [attr.x2]="hash.x2"
                        [attr.y2]="hash.y2"
                        [attr.stroke]="hash.stroke"
                      ></line>
                    }
                    <line
                      class="diagrams-panel__los-line"
                      x1="10"
                      [attr.y1]="layout.losY"
                      [attr.x2]="layout.fieldWidth - 10"
                      [attr.y2]="layout.losY"
                      [attr.stroke]="getLosStroke(layout)"
                    ></line>
                    @if (layout.sport === 'football') {
                      <text
                        x="16"
                        [attr.y]="layout.losY - 6"
                        [attr.fill]="getLosTextFill(layout)"
                        class="diagrams-panel__los-text"
                      >
                        LOS
                      </text>
                      @for (marker of getFootballYardNumbers(layout); track marker.id) {
                        <text
                          class="diagrams-panel__yard-number"
                          [attr.x]="marker.leftX"
                          [attr.y]="marker.y"
                          [attr.fill]="marker.fill"
                          [attr.transform]="marker.leftTransform"
                        >
                          {{ marker.label }}
                        </text>
                        <text
                          class="diagrams-panel__yard-number"
                          [attr.x]="marker.rightX"
                          [attr.y]="marker.y"
                          [attr.fill]="marker.fill"
                          [attr.transform]="marker.rightTransform"
                        >
                          {{ marker.label }}
                        </text>
                      }
                    }

                    @if (editMode() && pendingPlacement(); as placement) {
                      @if (placementPreviewPoint(); as point) {
                        <g class="diagrams-panel__placement-preview" aria-hidden="true">
                          @if (placement.kind === 'player') {
                            @if (placement.shape === 'square') {
                              <rect
                                [attr.x]="point.x - playerSquareHalfSize"
                                [attr.y]="point.y - playerSquareHalfSize"
                                [attr.width]="playerSquareHalfSize * 2"
                                [attr.height]="playerSquareHalfSize * 2"
                                rx="4.5"
                              ></rect>
                            } @else if (placement.shape === 'diamond') {
                              <polygon [attr.points]="getPlacementDiamondPoints(point)"></polygon>
                            } @else if (placement.shape === 'triangle') {
                              <polygon [attr.points]="getPlacementTrianglePoints(point)"></polygon>
                            } @else {
                              <circle
                                [attr.cx]="point.x"
                                [attr.cy]="point.y"
                                [attr.r]="playerCircleRadius"
                              ></circle>
                            }
                            <text [attr.x]="point.x" [attr.y]="point.y + playerLabelYOffset">
                              {{ getDefaultPlayerLabel(placement.shape) }}
                            </text>
                          } @else if (placement.kind === 'route') {
                            <path
                              [attr.d]="getPlacementRoutePath(placement.type, point, layout)"
                              [attr.stroke]="getPlacementRouteColor(placement.type)"
                              [attr.stroke-dasharray]="getPlacementRouteDasharray(placement.type)"
                              [attr.marker-end]="getPlacementRouteMarker(placement.type)"
                            ></path>
                          } @else if (placement.shape === 'text') {
                            <text [attr.x]="point.x" [attr.y]="point.y">Text</text>
                          } @else {
                            <rect
                              [attr.x]="point.x - 60"
                              [attr.y]="point.y - 36"
                              width="120"
                              height="72"
                              rx="10"
                            ></rect>
                            <text [attr.x]="point.x - 50" [attr.y]="point.y - 16">New Zone</text>
                          }
                        </g>
                      }
                    }

                    @for (zone of layout.zones ?? []; track zone.id) {
                      <g
                        class="diagrams-panel__zone-node"
                        [class.diagrams-panel__zone-node--defense]="zone.team === 'defense'"
                        [class.diagrams-panel__node--selected]="
                          editMode() && isSelected('zone', zone.id)
                        "
                        [attr.data-testid]="testIds.BUILDER_ZONE_NODE"
                        (pointerdown)="startBuilderDrag($event, 'zone', zone.id)"
                        (click)="selectBuilderEntity($event, 'zone', zone.id)"
                      >
                        @if (zone.shape === 'text') {
                          <text
                            class="diagrams-panel__text-node-label"
                            [attr.x]="zone.x"
                            [attr.y]="zone.y + 18"
                          >
                            {{ zone.label }}
                          </text>
                        } @else if (zone.shape === 'ellipse') {
                          <ellipse
                            [attr.cx]="zone.x + zone.width / 2"
                            [attr.cy]="zone.y + zone.height / 2"
                            [attr.rx]="zone.width / 2"
                            [attr.ry]="zone.height / 2"
                          ></ellipse>
                        } @else {
                          <rect
                            [attr.x]="zone.x"
                            [attr.y]="zone.y"
                            [attr.width]="zone.width"
                            [attr.height]="zone.height"
                            rx="10"
                          ></rect>
                        }
                        @if (zone.shape !== 'text') {
                          <text [attr.x]="zone.x + 10" [attr.y]="zone.y + 20">
                            {{ zone.label }}
                          </text>
                        }
                      </g>
                    }

                    @for (route of layout.routes; track getRouteTrackId(route, $index)) {
                      <g
                        class="diagrams-panel__route-node"
                        [class.diagrams-panel__node--selected]="
                          editMode() && isSelected('route', getRouteId(route, $index))
                        "
                        [attr.data-testid]="testIds.BUILDER_ROUTE_NODE"
                        (pointerdown)="startBuilderDrag($event, 'route', getRouteId(route, $index))"
                        (click)="selectBuilderEntity($event, 'route', getRouteId(route, $index))"
                      >
                        <path
                          class="diagrams-panel__route-hit-area"
                          [attr.d]="getRoutePath(route)"
                        ></path>
                        <path
                          [attr.d]="getRoutePath(route)"
                          [attr.stroke]="getRouteColor(route)"
                          [attr.stroke-width]="getRouteStrokeWidth(route)"
                          [attr.stroke-dasharray]="getRouteDasharray(route)"
                          [attr.opacity]="getRouteOpacity(route)"
                          [attr.marker-end]="getRouteMarker(route)"
                        ></path>
                      </g>
                    }

                    @for (player of layout.players; track player.id) {
                      <g
                        class="diagrams-panel__player-node"
                        [class.diagrams-panel__player-node--defense]="player.team === 'defense'"
                        [class.diagrams-panel__node--selected]="
                          editMode() && isSelected('player', player.id)
                        "
                        [attr.data-testid]="testIds.BUILDER_PLAYER_NODE"
                        (pointerdown)="startBuilderDrag($event, 'player', player.id)"
                        (dblclick)="startInlinePlayerLabelEdit($event, player)"
                        (click)="selectBuilderEntity($event, 'player', player.id)"
                      >
                        @if (player.shape === 'square') {
                          <rect
                            [attr.x]="player.x - playerSquareHalfSize"
                            [attr.y]="player.y - playerSquareHalfSize"
                            [attr.width]="playerSquareHalfSize * 2"
                            [attr.height]="playerSquareHalfSize * 2"
                            rx="4.5"
                          ></rect>
                        } @else if (player.shape === 'diamond') {
                          <polygon [attr.points]="getDiamondPoints(player)"></polygon>
                        } @else if (player.shape === 'triangle') {
                          <polygon [attr.points]="getTrianglePoints(player)"></polygon>
                        } @else {
                          <circle
                            [attr.cx]="player.x"
                            [attr.cy]="player.y"
                            [attr.r]="playerCircleRadius"
                          ></circle>
                        }
                        <text [attr.x]="player.x" [attr.y]="player.y + playerLabelYOffset">
                          {{ getPlayerLabel(player) }}
                        </text>
                        @if (isEditingPlayerLabel(player.id)) {
                          <foreignObject
                            [attr.x]="player.x - 24"
                            [attr.y]="player.y - 13"
                            width="48"
                            height="26"
                          >
                            <input
                              xmlns="http://www.w3.org/1999/xhtml"
                              class="diagrams-panel__player-label-editor"
                              [attr.data-inline-player-label-input]="player.id"
                              [ngModel]="inlinePlayerLabelDraft()"
                              (ngModelChange)="inlinePlayerLabelDraft.set($event)"
                              (pointerdown)="$event.stopPropagation()"
                              (click)="$event.stopPropagation()"
                              (keydown)="handleInlinePlayerLabelKeydown($event)"
                              (blur)="commitInlinePlayerLabel()"
                              aria-label="Edit player label"
                              maxlength="9"
                              autofocus
                            />
                          </foreignObject>
                        }
                      </g>
                    }
                    <rect
                      class="diagrams-panel__title-bar"
                      x="0"
                      y="0"
                      [attr.width]="layout.fieldWidth"
                      height="30"
                    ></rect>
                    <text
                      class="diagrams-panel__title-text"
                      [attr.x]="layout.fieldWidth / 2"
                      y="20"
                    >
                      {{ layout.title }}
                    </text>
                  </svg>
                } @else {
                  @if (getViewerInlineSvg(diagram); as svgMarkup) {
                    <div
                      class="diagrams-panel__viewer-svg"
                      [innerHTML]="svgMarkup"
                      [attr.data-testid]="testIds.VIEWER_IMAGE"
                      [attr.aria-label]="diagram.title"
                    ></div>
                  } @else if (getViewerSvgSrc(diagram); as svgSrc) {
                    <object
                      class="diagrams-panel__viewer-image diagrams-panel__viewer-image--svg"
                      type="image/svg+xml"
                      [data]="svgSrc"
                      [attr.data-testid]="testIds.VIEWER_IMAGE"
                      [attr.aria-label]="diagram.title"
                    >
                      @if (!imageFailed()) {
                        <img
                          class="diagrams-panel__viewer-image"
                          [src]="diagram.imageUrl"
                          [alt]="diagram.title"
                          (error)="imageFailed.set(true)"
                        />
                      } @else {
                        <div class="diagrams-panel__state diagrams-panel__state--inside">
                          <nxt1-icon name="image" [size]="28"></nxt1-icon>
                          <h3>Preview Unavailable</h3>
                          <p>The diagram asset is saved, but the image preview could not load.</p>
                        </div>
                      }
                    </object>
                  } @else if (!imageFailed()) {
                    <img
                      class="diagrams-panel__viewer-image"
                      [src]="diagram.imageUrl"
                      [alt]="diagram.title"
                      [attr.data-testid]="testIds.VIEWER_IMAGE"
                      (error)="imageFailed.set(true)"
                    />
                  } @else {
                    <div class="diagrams-panel__state diagrams-panel__state--inside">
                      <nxt1-icon name="image" [size]="28"></nxt1-icon>
                      <h3>Preview Unavailable</h3>
                      <p>The diagram asset is saved, but the image preview could not load.</p>
                    </div>
                  }
                }
              </div>
            </div>
          </div>
        } @else {
          <div class="diagrams-panel__viewer-empty">
            <nxt1-icon name="image" [size]="36"></nxt1-icon>
            <h3>Select a Diagram</h3>
            <p>Choose a play, formation, or drill board from the library.</p>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
      }

      .diagrams-panel {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 14px;
        height: 100%;
        min-height: 0;
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        scrollbar-color: var(--agent-border, rgba(0, 0, 0, 0.08)) transparent;
      }

      .diagrams-panel__rail,
      .diagrams-panel__viewer {
        min-height: 0;
        border: 0;
        background: transparent;
      }

      .diagrams-panel__rail {
        grid-column: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 0;
      }

      .diagrams-panel__toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        padding: 0 0 8px;
      }

      .diagrams-panel__search-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        height: 34px;
        padding: 0 10px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-muted, var(--nxt1-color-text-tertiary));
      }

      .diagrams-panel__search {
        width: 100%;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font: inherit;
        font-size: 13px;
      }

      .diagrams-panel__search::placeholder {
        color: var(--agent-text-muted, var(--nxt1-color-text-tertiary));
      }

      .diagrams-panel__list,
      .diagrams-panel__loading-rail {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 8px;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 0 0;
      }

      .diagrams-panel__loading-viewer {
        display: grid;
        gap: 10px;
        height: 100%;
        min-height: 0;
        padding: 12px;
      }

      .diagrams-panel__list-item {
        display: grid;
        grid-template-rows: 132px auto;
        gap: 9px;
        min-height: 214px;
        width: 100%;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: inherit;
        padding: 8px;
        text-align: left;
        cursor: pointer;
        transition:
          border-color 160ms ease,
          background 160ms ease,
          transform 160ms ease;
      }

      .diagrams-panel__list-item:hover,
      .diagrams-panel__list-item--active {
        border-color: var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
      }

      .diagrams-panel__list-item--active {
        transform: none;
      }

      .diagrams-panel__thumb {
        position: relative;
        display: block;
        width: 100%;
        height: 132px;
        overflow: hidden;
        border-radius: 6px;
        background: var(--agent-surface-hover, var(--nxt1-color-surface-200));
      }

      .diagrams-panel__thumb img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .diagrams-panel__item-main {
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: flex-start;
        gap: 5px;
      }

      .diagrams-panel__item-title {
        overflow: hidden;
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .diagrams-panel__item-meta {
        overflow: hidden;
        color: var(--agent-text-muted, var(--nxt1-color-text-tertiary));
        font-size: 11px;
        line-height: 1.35;
        text-overflow: ellipsis;
      }

      .diagrams-panel__kind-pill {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        min-height: 20px;
        border-radius: 999px;
        padding: 0 8px;
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
      }

      .diagrams-panel__kind-pill--play {
        border: 1px solid var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__kind-pill--drill {
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        background: var(--agent-surface-hover, var(--nxt1-color-surface-200));
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
      }

      .diagrams-panel__viewer {
        display: none;
        grid-column: 1;
        grid-row: 1;
        overflow: visible;
        border-radius: 0;
      }

      .diagrams-panel__workspace {
        container-type: inline-size;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      .diagrams-panel__workspace--modal {
        position: fixed;
        inset: 18px;
        z-index: 1000;
        grid-template-rows: auto auto minmax(0, 1fr);
        overflow: hidden;
        border: 1px solid rgba(204, 255, 0, 0.22);
        border-radius: 10px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58);
      }

      .diagrams-panel__workspace--modal::before {
        content: '';
        position: fixed;
        inset: -18px;
        z-index: -1;
        background: rgba(0, 0, 0, 0.68);
      }

      .diagrams-panel__builder-toolbar {
        display: flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 10px;
        min-width: 0;
        border-bottom: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        padding: 9px 10px;
        background: var(--agent-surface, var(--nxt1-color-surface-100));
      }

      .diagrams-panel__tool-group {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
      }

      .diagrams-panel__tool-group--builder {
        flex: 1 1 420px;
      }

      .diagrams-panel__tool-cluster {
        display: flex;
        align-items: center;
        flex: 0 1 auto;
        flex-wrap: nowrap;
        gap: 8px;
        min-width: 0;
      }

      .diagrams-panel__tool-group--save {
        margin-left: auto;
        flex: 0 0 auto;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: flex-end;
      }

      @container (max-width: 560px) {
        .diagrams-panel__tool-group--builder {
          flex-basis: 100%;
        }

        .diagrams-panel__tool-group--save {
          width: 100%;
          margin-left: 0;
        }
      }

      .diagrams-panel__tool-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 30px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        padding: 0 10px;
      }

      .diagrams-panel__tool-btn--icon {
        width: 34px;
        min-width: 34px;
        padding: 0;
      }

      .diagrams-panel__tool-btn:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .diagrams-panel__tool-btn--active,
      .diagrams-panel__tool-btn--primary {
        border-color: var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__options-menu {
        display: inline-flex;
        position: relative;
      }

      .diagrams-panel__options-menu[open] .diagrams-panel__options-trigger {
        border-color: var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__options-trigger {
        list-style: none;
      }

      .diagrams-panel__options-trigger::-webkit-details-marker {
        display: none;
      }

      .diagrams-panel__options-popover {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 20;
        display: grid;
        gap: 12px;
        width: min(320px, calc(100vw - 48px));
        max-height: min(520px, calc(100vh - 190px));
        overflow-y: auto;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 10px;
        background: var(--agent-surface, var(--nxt1-color-surface-100));
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        padding: 12px;
      }

      .diagrams-panel__options-popover--compact {
        width: min(280px, calc(100vw - 48px));
      }

      .diagrams-panel__inspector-section--compact {
        padding-bottom: 0;
      }

      .diagrams-panel__toolbar-input,
      .diagrams-panel__toolbar-select,
      .diagrams-panel__toolbar-color {
        min-height: 30px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font: inherit;
        font-size: 12px;
      }

      .diagrams-panel__toolbar-input,
      .diagrams-panel__toolbar-select {
        min-width: 0;
        padding: 0 10px;
      }

      .diagrams-panel__toolbar-input--label {
        width: clamp(120px, 16vw, 180px);
      }

      .diagrams-panel__toolbar-select {
        width: clamp(98px, 11vw, 132px);
      }

      .diagrams-panel__toolbar-color {
        width: 34px;
        min-width: 34px;
        padding: 2px;
        cursor: pointer;
      }

      .diagrams-panel__toolbar-check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 30px;
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .diagrams-panel__toolbar-check input {
        margin: 0;
      }

      .diagrams-panel__palette {
        display: flex;
        align-items: stretch;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
        padding-left: 2px;
      }

      .diagrams-panel__palette-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        min-height: 30px;
        min-width: 34px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: color-mix(
          in srgb,
          var(--agent-bg, var(--nxt1-color-bg-primary)) 92%,
          #ffffff 8%
        );
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        cursor: pointer;
        font-size: 11px;
        font-weight: 850;
        padding: 0;
        transition:
          border-color 160ms ease,
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease;
      }

      .diagrams-panel__palette-btn:hover {
        border-color: var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
        transform: translateY(-1px);
      }

      .diagrams-panel__palette-btn--active {
        border-color: var(--agent-primary, var(--nxt1-color-primary));
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__palette-icon,
      .diagrams-panel__palette-text-icon {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: currentColor;
        flex: 0 0 auto;
      }

      .diagrams-panel__palette-icon--circle::before,
      .diagrams-panel__palette-icon--square::before,
      .diagrams-panel__palette-icon--zone::before {
        content: '';
        display: block;
        width: 13px;
        height: 13px;
        border: 2px solid currentColor;
      }

      .diagrams-panel__palette-icon--circle::before {
        border-radius: 999px;
      }

      .diagrams-panel__palette-icon--square::before {
        border-radius: 3px;
      }

      .diagrams-panel__palette-icon--triangle::before {
        content: '';
        display: block;
        width: 0;
        height: 0;
        border-right: 7px solid transparent;
        border-bottom: 14px solid currentColor;
        border-left: 7px solid transparent;
      }

      .diagrams-panel__palette-text-icon {
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
      }

      .diagrams-panel__palette-icon--route::before,
      .diagrams-panel__palette-icon--route::after {
        content: '';
        position: absolute;
        top: 8px;
        left: 1px;
        display: block;
        width: 14px;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
      }

      .diagrams-panel__palette-icon--route::after {
        top: 5px;
        left: 10px;
        width: 7px;
        height: 7px;
        border-top: 2px solid currentColor;
        border-right: 2px solid currentColor;
        background: transparent;
        transform: rotate(45deg);
      }

      .diagrams-panel__palette-icon--block-line::after {
        top: 3px;
        left: 12px;
        width: 2px;
        height: 13px;
        border: 0;
        border-radius: 999px;
        background: currentColor;
        transform: none;
      }

      .diagrams-panel__palette-icon--motion-line::before {
        height: 0;
        border-top: 2px dashed currentColor;
        background: transparent;
      }

      .diagrams-panel__palette-icon--zone::before {
        width: 16px;
        border-style: dashed;
        border-radius: 999px;
        opacity: 0.85;
      }

      .diagrams-panel__dirty-dot {
        color: var(--agent-primary, var(--nxt1-color-primary));
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .diagrams-panel__builder-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
      }

      .diagrams-panel__builder-body--editing {
        grid-template-columns: minmax(0, 1fr);
      }

      .diagrams-panel__image-stage {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        min-height: 0;
        overflow: auto;
        padding: 18px;
        background:
          linear-gradient(
            color-mix(
                in srgb,
                var(--agent-text-muted, var(--nxt1-color-text-tertiary)) 10%,
                transparent
              )
              1px,
            transparent 1px
          ),
          linear-gradient(
            90deg,
            color-mix(
                in srgb,
                var(--agent-text-muted, var(--nxt1-color-text-tertiary)) 10%,
                transparent
              )
              1px,
            transparent 1px
          ),
          var(--agent-bg, var(--nxt1-color-bg-primary));
        background-size: 24px 24px;
      }

      .diagrams-panel__viewer-image {
        display: block;
        width: auto;
        height: auto;
        max-width: 980px;
        max-height: 100%;
        object-fit: contain;
        border-radius: 4px;
      }

      .diagrams-panel__viewer-image--svg,
      .diagrams-panel__viewer-svg {
        display: block;
        width: auto;
        height: auto;
        max-width: 980px;
        max-height: 100%;
        flex: 0 0 auto;
      }

      .diagrams-panel__viewer-svg :where(svg) {
        display: block;
        width: auto;
        height: auto;
        max-width: 980px;
        max-height: 100%;
      }

      .diagrams-panel__builder-svg {
        display: block;
        width: auto;
        height: auto;
        max-width: 980px;
        max-height: 100%;
        border-radius: 4px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        touch-action: none;
        user-select: none;
      }

      .diagrams-panel__builder-svg--readonly .diagrams-panel__player-node,
      .diagrams-panel__builder-svg--readonly .diagrams-panel__route-node,
      .diagrams-panel__builder-svg--readonly .diagrams-panel__zone-node {
        cursor: default;
      }

      .diagrams-panel__builder-svg--placing {
        cursor: crosshair;
      }

      .diagrams-panel__field-line {
        stroke-width: 1.35;
      }

      .diagrams-panel__hash-mark {
        stroke-linecap: round;
        stroke-width: 1.9;
      }

      .diagrams-panel__los-line {
        stroke-dasharray: 12 4;
        stroke-width: 3.4;
      }

      .diagrams-panel__los-text {
        font-family: Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
      }

      .diagrams-panel__yard-number {
        font-family: Arial, sans-serif;
        font-size: 20px;
        font-style: italic;
        font-weight: 800;
        opacity: 0.14;
        pointer-events: none;
        text-anchor: middle;
      }

      .diagrams-panel__route-node path {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2.6;
      }

      .diagrams-panel__route-node path:not(.diagrams-panel__route-hit-area) {
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.32));
      }

      .diagrams-panel__route-hit-area {
        fill: none;
        pointer-events: stroke;
        stroke: transparent;
        stroke-width: 18;
      }

      .diagrams-panel__route-node text,
      .diagrams-panel__zone-node text {
        fill: #f8fafc;
        font-family: Arial, sans-serif;
        font-size: 11px;
        font-weight: 800;
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.5);
        stroke-width: 3.5px;
      }

      .diagrams-panel__zone-node .diagrams-panel__text-node-label {
        fill: #f8fafc;
        font-size: 15px;
        letter-spacing: 0;
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.72);
        stroke-width: 4px;
      }

      .diagrams-panel__zone-node,
      .diagrams-panel__player-node {
        cursor: grab;
      }

      .diagrams-panel__route-node {
        cursor: grab;
      }

      .diagrams-panel__placement-preview {
        opacity: 0.64;
        pointer-events: none;
      }

      .diagrams-panel__placement-preview circle,
      .diagrams-panel__placement-preview rect,
      .diagrams-panel__placement-preview polygon {
        fill: rgba(255, 255, 255, 0.86);
        stroke: var(--agent-primary, var(--nxt1-color-primary));
        stroke-dasharray: 4 3;
        stroke-width: 1.8;
      }

      .diagrams-panel__placement-preview path {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 4.6;
      }

      .diagrams-panel__placement-preview text {
        fill: #102a43;
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: 900;
        paint-order: stroke;
        stroke: rgba(255, 255, 255, 0.72);
        stroke-width: 3px;
        text-anchor: middle;
      }

      .diagrams-panel__zone-node rect,
      .diagrams-panel__zone-node ellipse {
        fill: rgba(0, 120, 255, 0.13);
        stroke: rgba(0, 120, 255, 0.55);
        stroke-dasharray: 5 3;
        stroke-width: 1.2;
      }

      .diagrams-panel__zone-node--defense rect,
      .diagrams-panel__zone-node--defense ellipse {
        fill: rgba(255, 77, 79, 0.12);
        stroke: rgba(255, 77, 79, 0.55);
      }

      .diagrams-panel__player-node circle,
      .diagrams-panel__player-node rect,
      .diagrams-panel__player-node polygon {
        fill: rgba(255, 255, 255, 0.97);
        stroke: rgba(16, 42, 67, 0.46);
        stroke-width: 1.9;
      }

      .diagrams-panel__player-node--defense circle,
      .diagrams-panel__player-node--defense rect,
      .diagrams-panel__player-node--defense polygon {
        fill: rgba(255, 255, 255, 0.97);
        stroke: rgba(16, 42, 67, 0.46);
      }

      .diagrams-panel__player-node text {
        fill: #102a43;
        font-family: Arial, sans-serif;
        font-size: 9px;
        font-weight: 900;
        pointer-events: none;
        text-anchor: middle;
      }

      .diagrams-panel__player-label-editor {
        width: 48px;
        height: 26px;
        border: 1px solid var(--agent-primary, var(--nxt1-color-primary));
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 0 0 2px rgba(146, 255, 0, 0.2);
        color: #102a43;
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: 900;
        outline: none;
        padding: 0 5px;
        text-align: center;
        text-transform: uppercase;
      }

      .diagrams-panel__node--selected circle,
      .diagrams-panel__node--selected rect,
      .diagrams-panel__node--selected polygon,
      .diagrams-panel__node--selected ellipse,
      .diagrams-panel__node--selected path {
        filter: drop-shadow(0 0 10px var(--agent-primary, var(--nxt1-color-primary)));
        stroke: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__title-bar {
        fill: rgba(9, 15, 11, 0.72);
      }

      .diagrams-panel__title-text {
        fill: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 700;
        text-anchor: middle;
      }

      .diagrams-panel__legend-bar,
      .diagrams-panel__annotation-strip {
        fill: rgba(9, 15, 11, 0.62);
      }

      .diagrams-panel__annotation-strip {
        fill: rgba(9, 15, 11, 0.58);
      }

      .diagrams-panel__legend-text {
        fill: rgba(255, 255, 255, 0.9);
        font-family: Arial, sans-serif;
        font-size: 8.5px;
      }

      .diagrams-panel__annotation-text {
        dominant-baseline: middle;
        fill: rgba(255, 255, 255, 0.92);
        font-family: Arial, sans-serif;
        font-size: 9px;
        font-weight: 600;
      }

      .diagrams-panel__inspector-section {
        display: grid;
        gap: 10px;
        padding: 0 0 14px;
      }

      .diagrams-panel__inspector-section + .diagrams-panel__inspector-section {
        border-top: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        padding-top: 14px;
      }

      .diagrams-panel__inspector-section h3 {
        margin: 0;
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font-size: 12px;
        text-transform: uppercase;
      }

      .diagrams-panel__inspector-section label {
        display: grid;
        gap: 5px;
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        font-size: 11px;
        font-weight: 800;
      }

      .diagrams-panel__inspector-section input,
      .diagrams-panel__inspector-section select {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font: inherit;
        font-size: 12px;
        padding: 8px;
      }

      .diagrams-panel__segmented {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .diagrams-panel__segmented--shells {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .diagrams-panel__segmented button {
        min-height: 30px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
      }

      .diagrams-panel__primary-btn--full {
        width: 100%;
      }

      .diagrams-panel__segment--active {
        border-color: var(--agent-primary, var(--nxt1-color-primary)) !important;
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10)) !important;
        color: var(--agent-primary, var(--nxt1-color-primary)) !important;
      }

      .diagrams-panel__check-row {
        align-items: center;
        display: flex !important;
        grid-template-columns: none !important;
      }

      .diagrams-panel__check-row input {
        width: auto;
      }

      .diagrams-panel__state,
      .diagrams-panel__viewer-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        min-height: 220px;
        padding: 24px;
        color: var(--agent-text-muted, var(--nxt1-color-text-tertiary));
        text-align: center;
      }

      .diagrams-panel__state h3,
      .diagrams-panel__viewer-empty h3 {
        margin: 10px 0 4px;
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
        font-size: 15px;
      }

      .diagrams-panel__state p,
      .diagrams-panel__viewer-empty p {
        max-width: 280px;
        margin: 0;
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        font-size: 12px;
        line-height: 1.5;
      }

      .diagrams-panel__state--inside h3 {
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
      }

      .diagrams-panel__state--inside p {
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
      }

      .diagrams-panel__primary-btn {
        margin-top: 12px;
        border: 1px solid var(--agent-primary, var(--nxt1-color-primary));
        border-radius: 8px;
        background: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
        color: var(--agent-primary, var(--nxt1-color-primary));
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        padding: 8px 12px;
      }

      .diagrams-panel__loading-card {
        min-height: 88px;
        border-radius: 12px;
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s) infinite
          ease-in-out;
      }

      .diagrams-panel__loading-card--library {
        min-height: 214px;
      }

      .diagrams-panel__loading-card--viewer {
        min-height: clamp(280px, 52vh, 520px);
      }

      .diagrams-panel__loading-card--toolbar {
        min-height: 56px;
      }

      @media (prefers-reduced-motion: reduce) {
        .diagrams-panel__loading-card {
          animation: none;
          background-position: 50% 50%;
        }
      }

      @media (max-width: 760px) {
        .diagrams-panel {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 1fr);
        }

        .diagrams-panel__workspace--modal {
          inset: 0;
          border-radius: 0;
        }

        .diagrams-panel__workspace--modal::before {
          inset: 0;
        }

        .diagrams-panel__viewer {
          display: none;
        }

        .diagrams-panel__builder-body--editing {
          grid-template-columns: 1fr;
        }

        .diagrams-panel__rail {
          grid-column: 1;
          grid-row: 1;
        }
      }
    `,
  ],
})
export class AgentXDiagramsPanelComponent implements OnChanges {
  @Input() sport: string | null = null;
  @Input() teamId: string | null = null;

  private readonly http = inject(HttpClient);
  protected readonly service = inject(AgentXDiagramService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(NxtToastService);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;
  protected readonly testIds = TEST_IDS.DIAGRAMS_LAB;
  protected readonly skeletonItems = [1, 2, 3, 4] as const;
  protected readonly defensiveShellOptions = DIAGRAM_DEFENSIVE_SHELL_OPTIONS;
  protected readonly fieldStyleOptions = DIAGRAM_FIELD_STYLE_OPTIONS;
  protected readonly playerPalette = DIAGRAM_PLAYER_PALETTE;
  protected readonly routePalette = DIAGRAM_ROUTE_PALETTE;
  protected readonly routeTypeOptions = DIAGRAM_ROUTE_TYPE_OPTIONS;
  protected readonly filters = signal(EMPTY_DIAGRAM_FILTERS);
  protected readonly imageFailed = signal(false);
  protected readonly editMode = signal(false);
  protected readonly activeTool = signal<DiagramBuilderTool>('select');
  protected readonly builderLayout = signal<DiagramLayout | null>(null);
  protected readonly builderSelection = signal<DiagramBuilderSelection | null>(null);
  protected readonly pendingPlacement = signal<DiagramPendingPlacement | null>(null);
  protected readonly placementPreviewPoint = signal<DiagramPoint | null>(null);
  protected readonly editingPlayerLabelId = signal<string | null>(null);
  protected readonly inlinePlayerLabelDraft = signal('');
  protected readonly builderDirty = signal(false);
  private readonly builderBaselineLayout = signal<DiagramLayout | null>(null);
  private readonly builderUndoStack = signal<readonly DiagramLayout[]>([]);
  private readonly builderRedoStack = signal<readonly DiagramLayout[]>([]);
  private readonly builderDrag = signal<DiagramBuilderDragState | null>(null);
  private readonly routeDraw = signal<DiagramRouteDrawState | null>(null);
  private lastPlayerTap: { readonly id: string; readonly time: number } | null = null;
  private suppressNextModalSvgClick = false;

  protected readonly filteredDiagrams: Signal<readonly DiagramAssetSummary[]> = computed(() => {
    const filters = this.filters();
    return this.service
      .diagrams()
      .filter((diagram) => diagram.kind === 'sport_play')
      .filter((diagram) => matchesDiagramQuery(diagram, filters.query));
  });

  protected readonly selectedDiagram: Signal<DiagramAssetDetail | DiagramAssetSummary | null> =
    computed(() => this.service.selectedDiagram());
  protected readonly selectedPlayer = computed(() => {
    const selection = this.builderSelection();
    return selection?.type === 'player' ? getPlayerById(this.builderLayout(), selection.id) : null;
  });
  protected readonly selectedRoute = computed(() => {
    const selection = this.builderSelection();
    return selection?.type === 'route' ? getRouteById(this.builderLayout(), selection.id) : null;
  });
  protected readonly selectedZone = computed(() => {
    const selection = this.builderSelection();
    return selection?.type === 'zone' ? getZoneById(this.builderLayout(), selection.id) : null;
  });
  protected readonly canUndo = computed(() => this.builderUndoStack().length > 0);
  protected readonly canRedo = computed(() => this.builderRedoStack().length > 0);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sport'] || changes['teamId']) {
      void this.refresh();
    }
  }

  isDetailView(): boolean {
    return false;
  }

  getHeaderTitle(): string {
    return this.selectedDiagram()?.title ?? 'Diagrams Lab';
  }

  getHeaderSubtitle(): string {
    const diagram = this.selectedDiagram();
    if (!diagram) {
      return 'Saved plays, formations, and drill boards in one visual library';
    }

    const parts = [this.getKindLabel(diagram.kind)];
    const sport = diagram.sport.trim();
    if (sport) parts.push(sport);

    return parts.join(' • ');
  }

  getSelectedDiagram(): DiagramAssetSummary | null {
    return this.selectedDiagram();
  }

  isSaving(): boolean {
    return this.service.saving();
  }

  openSelectedDiagramEditor(): void {
    const url = this.selectedDiagram()?.editUrl;
    if (!url) return;
    this.openEditor(url);
  }

  async deleteSelectedDiagram(): Promise<void> {
    const diagram = this.selectedDiagram();
    if (!diagram) return;
    await this.deleteDiagram(diagram);
  }

  protected async refresh(options?: { readonly background?: boolean }): Promise<void> {
    await this.service.load({ sport: this.sport, kind: 'sport_play', limit: 75 }, options);
    this.imageFailed.set(false);
  }

  public async reload(options?: { readonly background?: boolean }): Promise<void> {
    await this.refresh(options);
  }

  public async openDiagramAssetModal(assetId: string): Promise<void> {
    this.imageFailed.set(false);
    this.resetBuilder();
    await this.service.select(assetId);

    const diagram = this.selectedDiagram();
    if (!diagram || diagram.id !== assetId) {
      throw new Error(`Diagram asset ${assetId} could not be loaded.`);
    }

    await this.openDiagramModal(diagram);
  }

  public async prepareEmbeddedDiagramEditor(
    assetId: string
  ): Promise<MediaViewerDiagramToolsConfig | null> {
    this.imageFailed.set(false);
    this.resetBuilder();
    await this.service.select(assetId);

    const diagram = this.selectedDiagram();
    if (!diagram || diagram.id !== assetId) {
      throw new Error(`Diagram asset ${assetId} could not be loaded.`);
    }

    this.prepareModalBuilder(diagram);
    return this.buildDiagramToolsConfig(diagram);
  }

  public async saveEmbeddedDiagramEditor(
    assetId: string,
    values: { readonly title?: string; readonly description?: string | null }
  ): Promise<boolean> {
    if (this.selectedDiagram()?.id !== assetId) {
      await this.service.select(assetId);
    }

    const diagram = this.selectedDiagram();
    if (!diagram || diagram.id !== assetId) {
      throw new Error(`Diagram asset ${assetId} could not be loaded.`);
    }

    return this.saveDiagramMetadata(assetId, {
      title: values.title?.trim() || diagram.title,
      description: values.description ?? diagram.description ?? '',
    });
  }

  public resetEmbeddedDiagramEditor(): void {
    this.resetBuilder();
  }

  protected async selectDiagram(id: string): Promise<void> {
    this.imageFailed.set(false);
    this.resetBuilder();
    await this.service.select(id);
    const diagram = this.selectedDiagram();
    if (diagram) {
      await this.openDiagramModal(diagram);
    }
  }

  private async openDiagramModal(diagram: DiagramAssetDetail | DiagramAssetSummary): Promise<void> {
    try {
      this.prepareModalBuilder(diagram);
      const linkedPlayContext = await this.resolveLinkedPlayContext(diagram);
      await this.mediaViewer.open({
        items: [
          {
            url: diagram.imageUrl,
            storagePath: diagram.storagePath,
            type: 'image',
            alt: diagram.title,
            caption: diagram.title,
            breakdown: linkedPlayContext
              ? this.buildLinkedPlayBreakdown(linkedPlayContext.play)
              : this.buildDiagramModalBreakdown(diagram),
          },
        ],
        source: 'agent-x-diagrams-lab',
        showShare: false,
        variant: 'playbook-breakdown',
        playbookEditor: this.buildDiagramEditorConfig(diagram, linkedPlayContext),
      });
    } catch {
      this.toast.error('Unable to open play diagram');
    } finally {
      this.resetBuilder();
    }
  }

  private prepareModalBuilder(diagram: DiagramAssetDetail | DiagramAssetSummary): void {
    this.resetBuilder();
    if (!('sourceLayout' in diagram) || !diagram.sourceLayout) return;

    const nextLayout = cloneDiagramLayout(diagram.sourceLayout);
    this.builderLayout.set(nextLayout);
    this.builderBaselineLayout.set(cloneDiagramLayout(nextLayout));
    this.builderSelection.set(null);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.cancelInlinePlayerLabelEdit();
    this.resetBuilderHistory();
    this.builderDirty.set(false);
    this.activeTool.set('select');
    this.editMode.set(true);
  }

  private buildDiagramEditorConfig(
    diagram: DiagramAssetDetail | DiagramAssetSummary,
    linkedPlayContext: LinkedPlayContext | null
  ): MediaViewerBreakdownEditorConfig {
    if (linkedPlayContext) {
      const play = linkedPlayContext.play;
      const sportConfig = getSportPlaybookConfig(linkedPlayContext.playbook.sport || diagram.sport);
      const formationLabel = sportConfig.formationLabel || 'Formation';
      const personnelLabel = sportConfig.personnelLabel || 'Personnel';

      return {
        title: play.title || play.name || diagram.title || 'Untitled Play',
        editLabel: 'Edit',
        saveLabel: 'Save',
        savingLabel: 'Saving...',
        startInEditMode: true,
        fields: [
          {
            key: 'name',
            label: 'Play Name',
            value: play.name ?? play.title ?? diagram.title ?? '',
            required: true,
            placeholder: 'Enter play name',
          },
          { key: 'series', label: 'Series', value: play.series ?? '', placeholder: 'Series' },
          {
            key: 'category',
            label: 'Category',
            value: play.category ?? '',
            placeholder: 'Category',
          },
          {
            key: 'formation',
            label: formationLabel,
            value: play.formation ?? '',
            placeholder: formationLabel,
          },
          {
            key: 'personnel',
            label: personnelLabel,
            value: play.personnel ?? '',
            placeholder: personnelLabel,
          },
          {
            key: 'objective',
            label: 'Objective',
            value: play.objective ?? '',
            type: 'textarea',
            rows: 3,
            placeholder: 'Objective',
          },
          {
            key: 'playBreakdown',
            label: 'Play Breakdown',
            value: play.playBreakdown ?? '',
            type: 'textarea',
            rows: 5,
            placeholder: 'Assignments, reads, route concepts, and why it works',
          },
          {
            key: 'installNotes',
            label: 'Install Notes',
            value: play.installNotes ?? '',
            type: 'textarea',
            rows: 3,
            placeholder: 'Use clean lines or bullets',
          },
          {
            key: 'conceptTags',
            label: 'Concept Tags',
            value: (play.conceptTags ?? []).join(', '),
            type: 'textarea',
            rows: 2,
            placeholder: 'Comma-separated',
          },
          {
            key: 'installStage',
            label: 'Install Stage',
            value: play.installStage ?? '',
            type: 'select',
            options: [
              { value: '', label: 'Select stage' },
              { value: 'install', label: 'Install' },
              { value: 'rep', label: 'Rep' },
              { value: 'game-ready', label: 'Game-Ready' },
            ],
          },
          {
            key: 'coachingPoints',
            label: 'Coaching Points',
            value: (play.coachingPoints ?? []).join('\n'),
            type: 'textarea',
            rows: 4,
            placeholder: 'One point per line',
          },
          {
            key: 'commonBusts',
            label: 'Common Busts',
            value: (play.commonBusts ?? []).join('\n'),
            type: 'textarea',
            rows: 3,
            placeholder: 'One bust per line',
          },
          {
            key: 'correctionCues',
            label: 'Correction Cues',
            value: (play.correctionCues ?? []).join('\n'),
            type: 'textarea',
            rows: 3,
            placeholder: 'One cue per line',
          },
          {
            key: 'drillProgression',
            label: 'Drill Progression',
            value: (play.drillProgression ?? []).join('\n'),
            type: 'textarea',
            rows: 3,
            placeholder: 'One drill step per line',
          },
          {
            key: 'situations',
            label: 'Situations',
            value: (play.situations ?? []).join(', '),
            type: 'textarea',
            rows: 2,
            placeholder: 'Comma-separated',
          },
        ],
        diagramTools: this.buildDiagramToolsConfig(diagram),
        onSave: async (values) => {
          const playSaved = await this.saveLinkedPlayContext(linkedPlayContext, values, diagram.id);
          if (!playSaved) return;

          const saved = await this.saveDiagramMetadata(diagram.id, {
            title: values['name']?.trim() || diagram.title,
            description:
              values['playBreakdown']?.trim() ||
              values['installNotes']?.trim() ||
              diagram.description ||
              '',
          });
          if (saved) {
            await this.mediaViewer.dismiss();
          }
        },
      };
    }

    return {
      title: diagram.title || 'Untitled Play',
      editLabel: 'Edit',
      saveLabel: 'Save',
      savingLabel: 'Saving...',
      startInEditMode: true,
      fields: [
        {
          key: 'title',
          label: 'Play Name',
          value: diagram.title ?? '',
          required: true,
          placeholder: 'Enter play name',
        },
        {
          key: 'description',
          label: 'Play Notes',
          value: diagram.description ?? '',
          type: 'textarea',
          rows: 5,
          placeholder: 'Assignments, reads, coaching points, or install notes',
        },
      ],
      diagramTools: this.buildDiagramToolsConfig(diagram),
      onSave: async (values) => {
        const saved = await this.saveDiagramMetadata(diagram.id, values);
        if (saved) {
          await this.mediaViewer.dismiss();
        }
      },
    };
  }

  private buildDiagramToolsConfig(
    diagram: DiagramAssetDetail | DiagramAssetSummary
  ): MediaViewerDiagramToolsConfig {
    const hasEditableLayout = 'sourceLayout' in diagram && Boolean(diagram.sourceLayout);

    return {
      title: 'Diagram Tools',
      description: hasEditableLayout
        ? 'Add play art directly from this modal. Use the main Save button to persist the play fields and diagram together.'
        : 'This saved play only has a flat image preview right now.',
      unavailableMessage:
        'This play is image-only. Ask Agent X to generate an editable diagram variation to unlock diagram tools.',
      getPreviewUrl: () => this.getModalBuilderPreviewDataUrl(),
      getPreviewSvg: () => this.getModalBuilderPreviewSvg(),
      getStatus: () => (this.builderDirty() ? 'Unsaved' : hasEditableLayout ? 'Ready' : null),
      onSvgPointerDown: (event, target) => this.handleModalSvgPointerDown(event, target),
      onSvgPointerMove: (event) => this.handleBuilderPointerMove(event),
      onSvgPointerUp: (event) => this.finishBuilderDrag(event),
      onSvgPointerCancel: (event) => this.finishBuilderDrag(event),
      onSvgPointerLeave: (event) => this.handleBuilderPointerLeave(event),
      onSvgClick: (event, target) => this.handleModalSvgClick(event, target),
      onSvgDoubleClick: (event, target) => this.handleModalSvgDoubleClick(event, target),
      actions: hasEditableLayout
        ? [
            {
              id: 'add-circle-player',
              label: 'Add O',
              ariaLabel: 'Add offensive player',
              icon: 'circle-player',
              run: () => this.addModalPlayer('circle'),
            },
            {
              id: 'add-defender',
              label: 'Add D',
              ariaLabel: 'Add defender',
              icon: 'triangle-player',
              run: () => this.addModalPlayer('triangle'),
            },
            {
              id: 'add-blocker',
              label: 'Add Blocker',
              ariaLabel: 'Add square blocker',
              icon: 'square-player',
              run: () => this.addModalPlayer('square'),
            },
            {
              id: 'add-route',
              label: 'Add Route',
              ariaLabel: 'Add route line',
              icon: 'route',
              run: () => this.addModalRoute('go'),
            },
            {
              id: 'add-block-line',
              label: 'Add Block',
              ariaLabel: 'Add block line',
              icon: 'block',
              run: () => this.addModalRoute('block'),
            },
            {
              id: 'add-motion-line',
              label: 'Add Motion',
              ariaLabel: 'Add motion line',
              icon: 'motion',
              run: () => this.addModalRoute('drag'),
            },
            {
              id: 'add-text',
              label: 'Add Text',
              ariaLabel: 'Add text label',
              icon: 'text',
              run: () => this.addModalTextLabel(),
            },
            {
              id: 'add-zone',
              label: 'Add Zone',
              ariaLabel: 'Add zone shape',
              icon: 'zone',
              run: () => this.addModalZone(),
            },
            {
              id: 'cycle-background',
              label: 'Background',
              ariaLabel: 'Change field background style',
              icon: 'background',
              variant: 'secondary',
              run: () => this.cycleModalFieldStyle(),
            },
            ...(diagram.sport === 'football'
              ? [
                  {
                    id: 'cycle-defensive-shell',
                    label: 'Defensive Shell',
                    ariaLabel: 'Apply next defensive shell',
                    icon: 'shield' as const,
                    variant: 'secondary' as const,
                    run: () => this.cycleModalDefensiveShell(),
                  },
                ]
              : []),
            {
              id: 'undo-diagram-change',
              label: 'Undo',
              ariaLabel: 'Undo last diagram change',
              icon: 'undo',
              variant: 'secondary',
              disabled: () => !this.canUndo(),
              run: () => this.undoBuilderChange(),
            },
            {
              id: 'redo-diagram-change',
              label: 'Redo',
              ariaLabel: 'Redo diagram change',
              icon: 'redo',
              variant: 'secondary',
              disabled: () => !this.canRedo(),
              run: () => this.redoBuilderChange(),
            },
            {
              id: 'discard-diagram-change',
              label: 'Discard',
              ariaLabel: 'Discard diagram changes',
              icon: 'discard',
              variant: 'secondary',
              disabled: () => !this.builderDirty(),
              run: () => this.discardBuilderDraft(),
            },
          ]
        : [],
    };
  }

  private async saveDiagramMetadata(id: string, values: Record<string, string>): Promise<boolean> {
    const title = values['title']?.trim() ?? '';
    if (!title) {
      this.toast.error('Add a play name before saving');
      return false;
    }

    try {
      const layout = this.builderLayout();
      const preparedLayout = layout ? this.finalizeSpatialLayout({ ...layout, title }) : null;
      await this.service.update(id, {
        title,
        description: values['description']?.trim() ?? '',
        ...(preparedLayout ? { sourceLayout: preparedLayout } : {}),
      });
      if (preparedLayout) {
        this.builderLayout.set(cloneDiagramLayout(preparedLayout));
        this.builderBaselineLayout.set(cloneDiagramLayout(preparedLayout));
        this.resetBuilderHistory();
        this.syncBuilderDirty();
      }
      this.toast.success('Play updated');
      return true;
    } catch {
      this.toast.error('Could not update play');
      return false;
    }
  }

  private async resolveLinkedPlayContext(
    diagram: DiagramAssetDetail | DiagramAssetSummary
  ): Promise<LinkedPlayContext | null> {
    const teamId = this.teamId?.trim();
    if (!teamId) return null;

    const diagramImageUrl = diagram.imageUrl.trim();
    const diagramTitle = diagram.title.trim().toLowerCase();

    const response = await firstValueFrom(
      this.http.get<PlaybooksResponse>(`${this.baseUrl}/playbooks`, {
        params: {
          teamId,
          limit: '200',
          sport: diagram.sport,
        },
      })
    );

    if (!response.success || !response.data?.playbooks?.length) {
      return null;
    }

    for (const playbook of response.data.playbooks) {
      const detail = await this.loadPlaybookDetail(playbook.id, teamId);
      const playIndex =
        detail.plays?.findIndex((play) => {
          const playDiagramAssetId = play.diagramAssetId?.trim();
          if (playDiagramAssetId === diagram.id) {
            return true;
          }

          const playDiagramUrl = play.diagramUrl?.trim();
          if (playDiagramUrl && playDiagramUrl === diagramImageUrl) {
            return true;
          }

          const playName = (play.name ?? play.title ?? '').trim().toLowerCase();
          return Boolean(diagramTitle && playName && playName === diagramTitle);
        }) ?? -1;
      if (playIndex >= 0 && detail.plays) {
        return {
          playbookId: detail.id,
          playIndex,
          play: detail.plays[playIndex],
          playbook: detail,
        };
      }
    }

    return null;
  }

  private async loadPlaybookDetail(
    playbookId: string,
    teamId: string
  ): Promise<
    PlaybookSummary & {
      readonly plays?: readonly PlaybookPlay[];
    }
  > {
    const response = await firstValueFrom(
      this.http.get<PlaybookDetailResponse>(`${this.baseUrl}/playbooks/${playbookId}`, {
        params: { teamId },
      })
    );

    if (!response.success || !response.data?.playbook || response.data.playbook.teamId !== teamId) {
      throw new Error(response.error ?? 'Unable to load linked playbook detail.');
    }

    return response.data.playbook;
  }

  private async saveLinkedPlayContext(
    linkedPlayContext: LinkedPlayContext,
    values: Record<string, string>,
    diagramAssetId: string
  ): Promise<boolean> {
    const playName = values['name']?.trim() ?? '';
    if (!playName) {
      this.toast.error('Add a play name before saving');
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${linkedPlayContext.playbookId}/plays/${linkedPlayContext.playIndex}`,
          {
            name: toTitleCase(playName),
            series: values['series']?.trim() || undefined,
            category: values['category']?.trim() || undefined,
            formation: values['formation']?.trim() || undefined,
            personnel: values['personnel']?.trim() || undefined,
            objective: values['objective']?.trim() || undefined,
            playBreakdown: values['playBreakdown']?.trim() || undefined,
            installNotes: values['installNotes']?.trim() || undefined,
            conceptTags: parseTags(values['conceptTags'] ?? ''),
            installStage: values['installStage']?.trim() || undefined,
            coachingPoints: this.parseLineList(values['coachingPoints'] ?? ''),
            commonBusts: this.parseLineList(values['commonBusts'] ?? ''),
            correctionCues: this.parseLineList(values['correctionCues'] ?? ''),
            drillProgression: this.parseLineList(values['drillProgression'] ?? ''),
            situations: this.parseCommaList(values['situations'] ?? ''),
            diagramAssetId,
          }
        )
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Unable to update linked play.');
      }

      return true;
    } catch {
      this.toast.error('Could not update linked play details.');
      return false;
    }
  }

  private parseLineList(value: string): string[] {
    return value
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private parseCommaList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private buildLinkedPlayBreakdown(play: PlaybookPlay): MediaViewerBreakdown {
    const subtitle = [play.series, play.category ? toTitleCase(play.category) : '', play.formation]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' • ');

    const metaChips: string[] = [];
    if (play.formation?.trim()) metaChips.push(play.formation.trim());
    if (play.personnel?.trim()) metaChips.push(play.personnel.trim());
    if (play.downDistance?.trim()) metaChips.push(play.downDistance.trim());
    if (play.installStage) metaChips.push(getStageDisplayNameValue(play.installStage));

    const sections: MediaViewerBreakdownSection[] = [];
    if (play.objective?.trim()) {
      sections.push({ title: 'Objective', paragraphs: [play.objective.trim()] });
    }
    if (play.playBreakdown?.trim()) {
      sections.push({ title: 'Play Breakdown', paragraphs: [play.playBreakdown.trim()] });
    }
    if (play.installNotes?.trim()) {
      sections.push({ title: 'Install Notes', bullets: this.parseLineList(play.installNotes) });
    }
    if (play.coachingPoints?.length) {
      sections.push({ title: 'Coaching Points', bullets: [...play.coachingPoints] });
    }
    if (play.commonBusts?.length) {
      sections.push({ title: 'Common Busts', bullets: [...play.commonBusts] });
    }
    if (play.correctionCues?.length) {
      sections.push({ title: 'Correction Cues', bullets: [...play.correctionCues] });
    }
    if (play.drillProgression?.length) {
      sections.push({ title: 'Drill Progression', bullets: [...play.drillProgression] });
    }
    if (play.situations?.length) {
      sections.push({ title: 'Situations', chips: [...play.situations] });
    }

    return {
      title: play.title || play.name,
      ...(subtitle ? { subtitle } : {}),
      metaChips,
      sections,
    };
  }

  private buildDiagramModalBreakdown(
    diagram: DiagramAssetDetail | DiagramAssetSummary
  ): MediaViewerBreakdown {
    const metaChips = [diagram.sport, this.getKindLabel(diagram.kind)]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return {
      title: diagram.title,
      subtitle: metaChips.join(' • '),
      metaChips,
      sections: diagram.description?.trim()
        ? [{ title: 'Notes', paragraphs: [diagram.description.trim()] }]
        : [],
    };
  }

  private handleModalSvgPointerDown(
    event: PointerEvent,
    target: MediaViewerDiagramSvgTarget
  ): void {
    if (this.pendingPlacement()) {
      this.handleBuilderCanvasPointerDown(event);
      this.suppressNextModalSvgClick = true;
      return;
    }

    if (target.type === 'canvas' || !target.id) {
      this.handleBuilderCanvasPointerDown(event);
      return;
    }

    if (target.type === 'player') {
      const previous = this.lastPlayerTap;
      if (previous?.id === target.id && event.timeStamp - previous.time <= 360) {
        event.preventDefault();
        event.stopPropagation();
        this.builderDrag.set(null);
        this.editModalPlayerLabel(target.id);
        return;
      }
    }

    this.startBuilderDrag(event, target.type, target.id);
  }

  private handleModalSvgClick(event: MouseEvent, target: MediaViewerDiagramSvgTarget): void {
    if (this.suppressNextModalSvgClick) {
      this.suppressNextModalSvgClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (target.type === 'canvas' || !target.id) return;
    this.selectBuilderEntity(event, target.type, target.id);
  }

  private handleModalSvgDoubleClick(event: MouseEvent, target: MediaViewerDiagramSvgTarget): void {
    if (!target.id) return;
    event.preventDefault();
    event.stopPropagation();

    if (target.type === 'player') {
      this.editModalPlayerLabel(target.id);
      return;
    }

    if (target.type === 'zone') {
      this.editModalZoneLabel(target.id);
    }
  }

  private editModalPlayerLabel(id: string): void {
    const player = getPlayerById(this.builderLayout(), id);
    if (!player || typeof window === 'undefined') return;

    const label = window.prompt('Player label', player.label)?.trim().toUpperCase();
    if (label) {
      this.builderSelection.set({ type: 'player', id });
      this.updatePlayerLabelById(id, label);
    }
  }

  private editModalZoneLabel(id: string): void {
    const zone = getZoneById(this.builderLayout(), id);
    if (!zone || typeof window === 'undefined') return;

    const label = window.prompt('Label', zone.label)?.trim();
    if (label) {
      this.builderSelection.set({ type: 'zone', id });
      this.updateSelectedZoneLabel(label);
    }
  }

  private addModalPlayer(shape: DiagramPlayerShape): void {
    this.addPlayer(shape);
  }

  private addModalRoute(type: DiagramRouteType): void {
    this.addRoute(type);
  }

  private addModalTextLabel(): void {
    this.addTextLabel();
  }

  private addModalZone(): void {
    this.addZone();
  }

  private cycleModalFieldStyle(): void {
    const layout = this.builderLayout();
    if (!layout) return;

    const currentIndex = this.fieldStyleOptions.findIndex(
      (option) => option.id === (layout.fieldStyle ?? 'classic')
    );
    const next = this.fieldStyleOptions[(currentIndex + 1) % this.fieldStyleOptions.length];
    if (next) this.updateFieldStyle(next.id);
  }

  private cycleModalDefensiveShell(): void {
    const layout = this.builderLayout();
    if (!layout || !this.supportsDefensiveShells(layout)) return;

    const optionIndex = layout.zones?.some((zone) => zone.team === 'defense') ? 1 : 0;
    const next = this.defensiveShellOptions[optionIndex % this.defensiveShellOptions.length];
    if (next) this.applyDefensiveShell(next.id);
  }

  private getModalBuilderPreviewDataUrl(): string | null {
    const layout = this.builderLayout();
    if (!layout) return null;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      this.buildModalBuilderPreviewSvg(layout)
    )}`;
  }

  private getModalBuilderPreviewSvg(): string | null {
    const layout = this.builderLayout();
    return layout ? this.buildModalBuilderPreviewSvg(layout) : null;
  }

  private buildModalBuilderPreviewSvg(layout: DiagramLayout): string {
    const totalHeight = this.getTotalSvgHeight(layout);
    const styles = this.buildModalBuilderPreviewStyles();
    const defs = this.buildModalBuilderPreviewDefs();
    const stripes = this.getFieldStripes(layout)
      .map(
        (stripe) =>
          `<rect x="${stripe.x}" y="${stripe.y}" width="${stripe.width}" height="${stripe.height}" fill="${stripe.fill}" opacity="${stripe.opacity}"/>`
      )
      .join('');
    const fieldLines = this.getFieldLines(layout)
      .map(
        (line) =>
          `<line class="diagrams-panel__field-line" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${line.stroke}"/>`
      )
      .join('');
    const hashMarks = this.getFootballHashMarks(layout)
      .map(
        (hash) =>
          `<line class="diagrams-panel__hash-mark" x1="${hash.x1}" y1="${hash.y1}" x2="${hash.x2}" y2="${hash.y2}" stroke="${hash.stroke}"/>`
      )
      .join('');
    const yardNumbers = this.getFootballYardNumbers(layout)
      .flatMap((marker) => [
        `<text class="diagrams-panel__yard-number" x="${marker.leftX}" y="${marker.y}" fill="${marker.fill}"${marker.leftTransform ? ` transform="${marker.leftTransform}"` : ''}>${this.escapeSvgText(marker.label)}</text>`,
        `<text class="diagrams-panel__yard-number" x="${marker.rightX}" y="${marker.y}" fill="${marker.fill}"${marker.rightTransform ? ` transform="${marker.rightTransform}"` : ''}>${this.escapeSvgText(marker.label)}</text>`,
      ])
      .join('');
    const zones = (layout.zones ?? [])
      .map((zone) => {
        const label = this.escapeSvgText(zone.label);
        const id = this.escapeSvgText(zone.id);
        const teamClass = zone.team === 'defense' ? ' diagrams-panel__zone-node--defense' : '';
        if (zone.shape === 'text') {
          return `<g class="diagrams-panel__zone-node${teamClass}" data-diagram-node-type="zone" data-diagram-node-id="${id}"><text class="diagrams-panel__text-node-label" x="${zone.x}" y="${zone.y + 18}">${label}</text></g>`;
        }
        const shape =
          zone.shape === 'ellipse'
            ? `<ellipse cx="${zone.x + zone.width / 2}" cy="${zone.y + zone.height / 2}" rx="${zone.width / 2}" ry="${zone.height / 2}"></ellipse>`
            : `<rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" rx="10"></rect>`;
        return `<g class="diagrams-panel__zone-node${teamClass}" data-diagram-node-type="zone" data-diagram-node-id="${id}">${shape}<text x="${zone.x + 10}" y="${zone.y + 20}">${label}</text></g>`;
      })
      .join('');
    const routes = layout.routes
      .map((route, index) => {
        const dash = this.getRouteDasharray(route);
        const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
        const id = this.escapeSvgText(this.getRouteId(route, index));
        return `<g class="diagrams-panel__route-node" data-route-id="${id}" data-diagram-node-type="route" data-diagram-node-id="${id}"><path d="${this.getRoutePath(route)}" stroke="${this.getRouteColor(route)}" stroke-width="${this.getRouteStrokeWidth(route)}"${dashAttr} opacity="${this.getRouteOpacity(route)}" marker-end="${this.getRouteMarker(route)}"></path></g>`;
      })
      .join('');
    const players = layout.players
      .map((player) => {
        const label = this.escapeSvgText(this.getPlayerLabel(player));
        const id = this.escapeSvgText(player.id);
        const teamClass = player.team === 'defense' ? ' diagrams-panel__player-node--defense' : '';
        const shape =
          player.shape === 'square'
            ? `<rect x="${player.x - this.playerSquareHalfSize}" y="${player.y - this.playerSquareHalfSize}" width="${this.playerSquareHalfSize * 2}" height="${this.playerSquareHalfSize * 2}" rx="4.5"></rect>`
            : player.shape === 'triangle'
              ? `<polygon points="${this.getTrianglePoints(player)}"></polygon>`
              : player.shape === 'diamond'
                ? `<polygon points="${this.getDiamondPoints(player)}"></polygon>`
                : `<circle cx="${player.x}" cy="${player.y}" r="${this.playerCircleRadius}"></circle>`;
        return `<g class="diagrams-panel__player-node${teamClass}" data-diagram-node-type="player" data-diagram-node-id="${id}">${shape}<text x="${player.x}" y="${player.y + this.playerLabelYOffset}">${label}</text></g>`;
      })
      .join('');
    const placementPreview = this.buildModalPlacementPreviewSvg(layout);

    return `<svg xmlns="http://www.w3.org/2000/svg" class="diagrams-panel__builder-svg" width="${layout.fieldWidth}" height="${totalHeight}" viewBox="0 0 ${layout.fieldWidth} ${totalHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${this.escapeSvgText(layout.title)}" data-diagram-node-type="canvas">
      <style>${styles}</style>
      <defs>${defs}</defs>
      <rect class="diagrams-panel__field-bg diagrams-panel__field-bg--${layout.fieldStyle ?? 'classic'}" x="0" y="0" width="${layout.fieldWidth}" height="${layout.fieldHeight}" fill="${this.getFieldFill(layout)}"></rect>
      ${stripes}${fieldLines}${hashMarks}
      <line class="diagrams-panel__los-line" x1="10" y1="${layout.losY}" x2="${layout.fieldWidth - 10}" y2="${layout.losY}" stroke="${this.getLosStroke(layout)}"></line>
      ${layout.sport === 'football' ? `<text class="diagrams-panel__los-text" x="16" y="${layout.losY - 6}" fill="${this.getLosTextFill(layout)}">LOS</text>${yardNumbers}` : ''}
      ${zones}${routes}${players}${placementPreview}
      <rect class="diagrams-panel__title-bar" x="0" y="0" width="${layout.fieldWidth}" height="30"></rect>
      <text class="diagrams-panel__title-text" x="${layout.fieldWidth / 2}" y="20">${this.escapeSvgText(layout.title)}</text>
    </svg>`;
  }

  private buildModalPlacementPreviewSvg(layout: DiagramLayout): string {
    const placement = this.pendingPlacement();
    const point = this.placementPreviewPoint();
    if (!placement || !point) return '';

    if (placement.kind === 'player') {
      const label = this.escapeSvgText(this.getDefaultPlayerLabel(placement.shape));
      const shape =
        placement.shape === 'square'
          ? `<rect x="${point.x - this.playerSquareHalfSize}" y="${point.y - this.playerSquareHalfSize}" width="${this.playerSquareHalfSize * 2}" height="${this.playerSquareHalfSize * 2}" rx="4.5"></rect>`
          : placement.shape === 'diamond'
            ? `<polygon points="${this.getPlacementDiamondPoints(point)}"></polygon>`
            : placement.shape === 'triangle'
              ? `<polygon points="${this.getPlacementTrianglePoints(point)}"></polygon>`
              : `<circle cx="${point.x}" cy="${point.y}" r="${this.playerCircleRadius}"></circle>`;

      return `<g class="diagrams-panel__placement-preview" aria-hidden="true">${shape}<text x="${point.x}" y="${point.y + this.playerLabelYOffset}">${label}</text></g>`;
    }

    if (placement.kind === 'route') {
      const dash = this.getPlacementRouteDasharray(placement.type);
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
      return `<g class="diagrams-panel__placement-preview" aria-hidden="true"><path d="${this.getPlacementRoutePath(placement.type, point, layout)}" stroke="${this.getPlacementRouteColor(placement.type)}"${dashAttr} marker-end="${this.getPlacementRouteMarker(placement.type)}"></path></g>`;
    }

    if (placement.shape === 'text') {
      return `<g class="diagrams-panel__placement-preview" aria-hidden="true"><text x="${point.x}" y="${point.y}">Text</text></g>`;
    }

    return `<g class="diagrams-panel__placement-preview" aria-hidden="true"><rect x="${point.x - 60}" y="${point.y - 36}" width="120" height="72" rx="10"></rect><text x="${point.x - 50}" y="${point.y - 16}">New Zone</text></g>`;
  }

  private buildModalBuilderPreviewDefs(): string {
    return `
      <marker id="builder-arr-go" markerWidth="11" markerHeight="11" refX="9.4" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L11,5.5 L0,11 L2.5,5.5 z" fill="context-stroke"></path></marker>
      <marker id="builder-arr-block" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M7,1.8 L7,12.2 M2,6.2 L12,6.2" fill="none" stroke="context-stroke" stroke-width="2.6" stroke-linecap="round"></path></marker>
      <marker id="builder-arr-screen" markerWidth="12" markerHeight="12" refX="10.6" refY="6" orient="auto" markerUnits="userSpaceOnUse"><rect x="1.3" y="1.3" width="9.4" height="9.4" fill="none" stroke="context-stroke" stroke-width="1.9" rx="1.4" ry="1.4"></rect></marker>
      <marker id="builder-arr-pick" markerWidth="13" markerHeight="13" refX="9.3" refY="6.5" orient="auto" markerUnits="strokeWidth"><circle cx="6.5" cy="6.5" r="5.2" fill="none" stroke="context-stroke" stroke-width="2.2"></circle></marker>
      <marker id="builder-arr-cut" markerWidth="11" markerHeight="11" refX="9.5" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L11,5.5 L0,11 Z" fill="context-stroke"></path></marker>
      <marker id="builder-arr-drag" markerWidth="11" markerHeight="11" refX="9.1" refY="5.5" orient="auto" markerUnits="strokeWidth"><path d="M0,1 L9.2,5.5 L0,10 L2,5.5 z" fill="context-stroke"></path></marker>
      <marker id="builder-arr-space" markerWidth="10" markerHeight="10" refX="6.2" refY="5" orient="auto" markerUnits="strokeWidth"><circle cx="5" cy="5" r="2.9" fill="context-stroke"></circle></marker>
      <marker id="builder-arr-fade" markerWidth="11" markerHeight="11" refX="6.8" refY="5.5" orient="auto" markerUnits="strokeWidth"><path d="M0,5.5 L6.8,2.2 L8.8,5.5 L6.8,8.8 Z" fill="context-stroke" opacity="0.68"></path></marker>
    `;
  }

  private buildModalBuilderPreviewStyles(): string {
    return `
      .diagrams-panel__builder-svg{display:block;width:auto;height:auto;max-width:980px;max-height:100%;border-radius:4px;box-shadow:0 18px 40px rgba(0,0,0,.28);font-family:Arial,sans-serif;user-select:none;}
      .diagrams-panel__field-line{stroke-width:1.35;}.diagrams-panel__hash-mark{stroke-linecap:round;stroke-width:1.9;}.diagrams-panel__los-line{stroke-dasharray:12 4;stroke-width:3.4;}.diagrams-panel__los-text{font-size:11px;font-weight:700;letter-spacing:.12em;}.diagrams-panel__yard-number{font-size:20px;font-style:italic;font-weight:800;opacity:.14;pointer-events:none;text-anchor:middle;}
      .diagrams-panel__route-node path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.6;}.diagrams-panel__route-node path:not(.diagrams-panel__route-hit-area){filter:drop-shadow(0 0 2px rgba(0,0,0,.32));}
      .diagrams-panel__route-node text,.diagrams-panel__zone-node text{fill:#f8fafc;font-size:11px;font-weight:800;paint-order:stroke;stroke:rgba(0,0,0,.5);stroke-width:3.5px;}.diagrams-panel__zone-node .diagrams-panel__text-node-label{fill:#f8fafc;font-size:15px;letter-spacing:0;paint-order:stroke;stroke:rgba(0,0,0,.72);stroke-width:4px;}
      .diagrams-panel__zone-node rect,.diagrams-panel__zone-node ellipse{fill:rgba(0,120,255,.13);stroke:rgba(0,120,255,.55);stroke-dasharray:5 3;stroke-width:1.2;}.diagrams-panel__zone-node--defense rect,.diagrams-panel__zone-node--defense ellipse{fill:rgba(255,77,79,.12);stroke:rgba(255,77,79,.55);}
      .diagrams-panel__player-node circle,.diagrams-panel__player-node rect,.diagrams-panel__player-node polygon{fill:rgba(255,255,255,.97);stroke:rgba(16,42,67,.46);stroke-width:1.9;}.diagrams-panel__player-node--defense circle,.diagrams-panel__player-node--defense rect,.diagrams-panel__player-node--defense polygon{fill:rgba(255,255,255,.97);stroke:rgba(16,42,67,.46);}.diagrams-panel__player-node text{fill:#102a43;font-size:9px;font-weight:900;pointer-events:none;text-anchor:middle;}
      .diagrams-panel__placement-preview{opacity:.64;pointer-events:none;}.diagrams-panel__placement-preview circle,.diagrams-panel__placement-preview rect,.diagrams-panel__placement-preview polygon{fill:rgba(255,255,255,.86);stroke:#39ff88;stroke-dasharray:4 3;stroke-width:1.8;}.diagrams-panel__placement-preview path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.6;}.diagrams-panel__placement-preview text{fill:#102a43;font-size:10px;font-weight:900;paint-order:stroke;stroke:rgba(255,255,255,.72);stroke-width:3px;text-anchor:middle;}
      .diagrams-panel__title-bar{fill:rgba(9,15,11,.72);}.diagrams-panel__title-text{fill:#fff;font-size:13px;font-weight:700;text-anchor:middle;}
    `;
  }

  private escapeSvgText(value: string): string {
    return value.replace(/[&<>'"]/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&apos;',
        '"': '&quot;',
      };
      return entities[char] ?? char;
    });
  }

  protected setSearchQuery(query: string): void {
    this.filters.update((filters) => ({ ...filters, query }));
  }

  protected getKindLabel(kind: DiagramAssetKind): string {
    return getDiagramKindLabel(kind);
  }

  protected getViewerInlineSvg(diagram: DiagramAssetSummary | DiagramAssetDetail): SafeHtml | null {
    const svgContent = 'svgContent' in diagram ? diagram.svgContent?.trim() : '';
    if (svgContent) {
      return this.sanitizer.bypassSecurityTrustHtml(svgContent);
    }

    return null;
  }

  protected getViewerSvgSrc(
    diagram: DiagramAssetSummary | DiagramAssetDetail
  ): SafeResourceUrl | null {
    const svgUrl = diagram.svgUrl?.trim();
    if (!svgUrl) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(svgUrl);
  }

  protected getRenderableLayout(
    diagram: DiagramAssetSummary | DiagramAssetDetail
  ): DiagramLayout | null {
    if (this.editMode()) {
      return this.builderLayout();
    }

    if ('sourceLayout' in diagram && diagram.sourceLayout) {
      return diagram.sourceLayout;
    }

    return null;
  }

  protected toggleEditMode(diagram: DiagramAssetSummary | DiagramAssetDetail): void {
    if (this.editMode()) {
      this.resetBuilder();
      return;
    }

    if (!('sourceLayout' in diagram) || !diagram.sourceLayout) {
      this.toast.error('This diagram is image-only and cannot be edited yet');
      return;
    }

    const nextLayout = cloneDiagramLayout(diagram.sourceLayout);
    this.builderLayout.set(nextLayout);
    this.builderBaselineLayout.set(cloneDiagramLayout(nextLayout));
    this.builderSelection.set(null);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.cancelInlinePlayerLabelEdit();
    this.resetBuilderHistory();
    this.builderDirty.set(false);
    this.activeTool.set('select');
    this.editMode.set(true);
  }

  protected setActiveTool(tool: DiagramBuilderTool): void {
    this.activeTool.set(tool);
    if (tool === 'select') {
      this.pendingPlacement.set(null);
      this.placementPreviewPoint.set(null);
      this.routeDraw.set(null);
    }
  }

  protected hasPendingPlacement(): boolean {
    return this.pendingPlacement() !== null;
  }

  protected isPendingPlayerPlacement(shape: DiagramPlayerShape): boolean {
    const pending = this.pendingPlacement();
    return pending?.kind === 'player' && pending.shape === shape;
  }

  protected isPendingRoutePlacement(type: DiagramRouteType): boolean {
    const pending = this.pendingPlacement();
    return pending?.kind === 'route' && pending.type === type;
  }

  protected isPendingZonePlacement(shape: 'rect' | 'text'): boolean {
    const pending = this.pendingPlacement();
    return pending?.kind === 'zone' && pending.shape === shape;
  }

  protected handleBuilderCanvasPointerDown(event: PointerEvent): void {
    if (!this.editMode()) return;
    const pending = this.pendingPlacement();
    if (!pending) {
      this.builderSelection.set(null);
      this.cancelInlinePlayerLabelEdit();
      return;
    }

    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    if (pending.kind === 'route') {
      this.startRouteDraw(event, pending.type, point);
      return;
    }

    this.placePendingTool(point, pending);
  }

  protected handleBuilderPointerMove(event: PointerEvent): void {
    if (this.routeDraw()) {
      this.continueRouteDraw(event);
      return;
    }

    if (this.builderDrag()) {
      this.continueBuilderDrag(event);
      return;
    }

    const pending = this.pendingPlacement();
    if (!this.editMode() || !pending) return;
    if (pending.kind === 'route') {
      this.placementPreviewPoint.set(null);
      return;
    }

    const point = this.getSvgPoint(event);
    this.placementPreviewPoint.set(point ? this.clampPointToField(point) : null);
  }

  protected handleBuilderPointerLeave(event: PointerEvent): void {
    if (this.routeDraw()) return;
    this.finishBuilderDrag(event);
    this.placementPreviewPoint.set(null);
  }

  protected selectBuilderEntity(
    event: Event,
    type: DiagramBuilderSelection['type'],
    id: string
  ): void {
    if (!this.editMode()) return;
    event.stopPropagation();
    this.builderSelection.set({ type, id });
    this.activeTool.set('select');
  }

  protected isEditingPlayerLabel(id: string): boolean {
    return this.editingPlayerLabelId() === id;
  }

  protected startInlinePlayerLabelEdit(event: Event, player: DiagramPlayer): void {
    if (!this.editMode()) return;

    event.preventDefault();
    event.stopPropagation();
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.builderDrag.set(null);
    this.builderSelection.set({ type: 'player', id: player.id });
    this.activeTool.set('select');
    this.editingPlayerLabelId.set(player.id);
    this.inlinePlayerLabelDraft.set(player.label);
    this.focusInlinePlayerLabelInput(player.id);
  }

  protected handleInlinePlayerLabelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitInlinePlayerLabel();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelInlinePlayerLabelEdit();
    }
  }

  protected commitInlinePlayerLabel(): void {
    const id = this.editingPlayerLabelId();
    if (!id) return;

    const label = this.inlinePlayerLabelDraft().trim().toUpperCase();
    if (label) {
      this.updatePlayerLabelById(id, label);
    }

    this.editingPlayerLabelId.set(null);
    this.inlinePlayerLabelDraft.set('');
  }

  protected cancelInlinePlayerLabelEdit(): void {
    this.editingPlayerLabelId.set(null);
    this.inlinePlayerLabelDraft.set('');
  }

  protected isSelected(type: DiagramBuilderSelection['type'], id: string): boolean {
    const selection = this.builderSelection();
    return selection?.type === type && selection.id === id;
  }

  protected startBuilderDrag(
    event: PointerEvent,
    type: DiagramBuilderSelection['type'],
    id: string
  ): void {
    if (!this.editMode()) return;
    const layout = this.builderLayout();
    if (type === 'player' && layout && this.isDoubleTapPlayer(id, event.timeStamp)) {
      const player = getPlayerById(layout, id);
      if (player) {
        this.startInlinePlayerLabelEdit(event, player);
        return;
      }
    }

    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    const svg = this.getEventSvg(event);
    svg?.setPointerCapture?.(event.pointerId);
    this.cancelInlinePlayerLabelEdit();
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.builderSelection.set({ type, id });
    this.activeTool.set('select');
    this.builderDrag.set({
      type,
      id,
      lastX: point.x,
      lastY: point.y,
      pointerId: event.pointerId,
      historyCaptured: false,
    });
  }

  protected continueBuilderDrag(event: PointerEvent): void {
    if (!this.editMode()) return;
    const drag = this.builderDrag();
    if (!drag) return;

    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    const dx = point.x - drag.lastX;
    const dy = point.y - drag.lastY;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;

    if (!drag.historyCaptured) {
      this.captureHistorySnapshot();
    }

    this.moveBuilderEntity(drag.type, drag.id, dx, dy);
    this.builderDrag.set({ ...drag, lastX: point.x, lastY: point.y, historyCaptured: true });
  }

  protected finishBuilderDrag(event: PointerEvent): void {
    if (!this.editMode()) return;
    if (this.routeDraw()) {
      this.finishRouteDraw(event);
      return;
    }

    const drag = this.builderDrag();
    if (!drag) return;

    event.preventDefault();
    this.getEventSvg(event)?.releasePointerCapture?.(drag.pointerId);
    this.builderDrag.set(null);
  }

  protected getLayoutViewBox(layout: DiagramLayout): string {
    return `0 0 ${layout.fieldWidth} ${this.getTotalSvgHeight(layout)}`;
  }

  protected getFieldClass(layout: DiagramLayout): string {
    return `diagrams-panel__field-bg diagrams-panel__field-bg--${layout.fieldStyle ?? 'classic'}`;
  }

  protected getFieldFill(layout: DiagramLayout): string {
    return getFieldPalette(layout.fieldStyle, layout.sport).background;
  }

  protected getFieldStripes(layout: DiagramLayout): ReadonlyArray<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    opacity: number;
  }> {
    const palette = getFieldPalette(layout.fieldStyle, layout.sport);
    if (layout.sport === 'basketball') {
      return [
        {
          id: 'basketball-lane',
          x: layout.fieldWidth / 2 - 60,
          y: 30,
          width: 120,
          height: 140,
          fill: palette.stripe,
          opacity: 1,
        },
      ];
    }

    const stripes: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      opacity: number;
    }> = [];
    for (let y = 0; y < layout.fieldHeight; y += 80) {
      stripes.push({
        id: `stripe-${y}`,
        x: 0,
        y,
        width: layout.fieldWidth,
        height: 40,
        fill: palette.stripe,
        opacity: 0.55,
      });
    }
    return stripes;
  }

  protected getFieldLines(
    layout: DiagramLayout
  ): ReadonlyArray<{ id: string; x1: number; y1: number; x2: number; y2: number; stroke: string }> {
    const palette = getFieldPalette(layout.fieldStyle, layout.sport);
    const lines: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
    }> = [];
    if (layout.sport === 'basketball') {
      const centerX = layout.fieldWidth / 2;
      lines.push(
        {
          id: 'court-top',
          x1: 10,
          y1: 10,
          x2: layout.fieldWidth - 10,
          y2: 10,
          stroke: palette.line,
        },
        {
          id: 'court-right',
          x1: layout.fieldWidth - 10,
          y1: 10,
          x2: layout.fieldWidth - 10,
          y2: layout.fieldHeight - 10,
          stroke: palette.line,
        },
        {
          id: 'court-bottom',
          x1: 10,
          y1: layout.fieldHeight - 10,
          x2: layout.fieldWidth - 10,
          y2: layout.fieldHeight - 10,
          stroke: palette.line,
        },
        {
          id: 'court-left',
          x1: 10,
          y1: 10,
          x2: 10,
          y2: layout.fieldHeight - 10,
          stroke: palette.line,
        },
        {
          id: 'basket-rim',
          x1: centerX - 30,
          y1: 34,
          x2: centerX + 30,
          y2: 34,
          stroke: palette.line,
        }
      );
      return lines;
    }

    for (let y = 40; y < layout.fieldHeight; y += 40) {
      lines.push({
        id: `h-${y}`,
        x1: 0,
        y1: y,
        x2: layout.fieldWidth,
        y2: y,
        stroke: palette.line,
      });
    }

    if (layout.sport === 'football') {
      const leftBoundaryX = 8;
      const rightBoundaryX = layout.fieldWidth - 8;
      lines.push(
        {
          id: 'football-left-boundary',
          x1: leftBoundaryX,
          y1: 30,
          x2: leftBoundaryX,
          y2: layout.fieldHeight,
          stroke: palette.line,
        },
        {
          id: 'football-right-boundary',
          x1: rightBoundaryX,
          y1: 30,
          x2: rightBoundaryX,
          y2: layout.fieldHeight,
          stroke: palette.line,
        },
        {
          id: 'football-bottom-boundary',
          x1: leftBoundaryX,
          y1: layout.fieldHeight,
          x2: rightBoundaryX,
          y2: layout.fieldHeight,
          stroke: palette.line,
        }
      );
    }

    return lines;
  }

  protected getFootballHashMarks(
    layout: DiagramLayout
  ): ReadonlyArray<{ id: string; x1: number; y1: number; x2: number; y2: number; stroke: string }> {
    if (layout.sport !== 'football') return [];
    const palette = this.getFootballPalette(layout);
    const marks: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
    }> = [];
    const leftBoundaryX = 8;
    const rightBoundaryX = layout.fieldWidth - 8;
    const playableWidth = rightBoundaryX - leftBoundaryX;
    const leftHashX = leftBoundaryX + playableWidth / 3;
    const rightHashX = rightBoundaryX - playableWidth / 3;
    for (let y = 20; y < layout.fieldHeight; y += 40) {
      marks.push(
        {
          id: `left-hash-${y}`,
          x1: leftHashX,
          y1: y - 6,
          x2: leftHashX,
          y2: y + 6,
          stroke: palette.hashMark,
        },
        {
          id: `right-hash-${y}`,
          x1: rightHashX,
          y1: y - 6,
          x2: rightHashX,
          y2: y + 6,
          stroke: palette.hashMark,
        }
      );
    }
    return marks;
  }

  protected getFootballYardNumbers(layout: DiagramLayout): ReadonlyArray<{
    id: string;
    leftX: number;
    rightX: number;
    y: number;
    label: string;
    fill: string;
    leftTransform: string | null;
    rightTransform: string | null;
  }> {
    if (layout.sport !== 'football') return [];

    const palette = this.getFootballPalette(layout);
    const rows = Math.max(1, Math.floor((layout.fieldHeight - 80) / 80));
    return Array.from({ length: rows }, (_, index) => {
      const y = 74 + index * 80;
      const leftX = 32;
      const rightX = layout.fieldWidth - 32;
      return {
        id: `yard-${index + 1}`,
        leftX,
        rightX,
        y,
        label: String((rows - index) * 10),
        fill: palette.losText,
        leftTransform: null,
        rightTransform: null,
      };
    });
  }

  protected getLosStroke(layout: DiagramLayout): string {
    return layout.sport === 'football'
      ? this.getFootballPalette(layout).los
      : getFieldPalette(layout.fieldStyle, layout.sport).line;
  }

  protected getLosTextFill(layout: DiagramLayout): string {
    return this.getFootballPalette(layout).losText;
  }

  protected getRouteTrackId(route: DiagramRoute, index: number): string {
    return this.getRouteId(route, index);
  }

  protected getRouteId(route: DiagramRoute, index: number): string {
    return route.id ?? createRouteId(index + 1);
  }

  protected getRoutePath(route: DiagramRoute): string {
    if (route.curve === true && route.points.length >= 2) {
      return this.buildCurvedRoutePath(route.points);
    }

    return buildSvgPath(route.points);
  }

  protected getRouteColor(route: DiagramRoute): string {
    return resolveRouteColor(route.type, route.color);
  }

  protected getRouteMarker(route: DiagramRoute): string {
    switch (route.type) {
      case 'block':
        return 'url(#builder-arr-block)';
      case 'screen':
        return 'url(#builder-arr-screen)';
      case 'pick':
        return 'url(#builder-arr-pick)';
      case 'cut':
        return 'url(#builder-arr-cut)';
      case 'drag':
        return 'url(#builder-arr-drag)';
      case 'space':
        return 'url(#builder-arr-space)';
      case 'fade':
        return 'url(#builder-arr-fade)';
      default:
        return 'url(#builder-arr-go)';
    }
  }

  protected getRouteStrokeWidth(route: DiagramRoute): string {
    if (route.type === 'block') return '2.4';
    if (route.type === 'pick') return '2.6';
    if (route.type === 'screen') return '2.2';
    if (route.type === 'fade') return '2.3';
    return '2.4';
  }

  protected getRouteDasharray(route: DiagramRoute): string | null {
    if (route.strokeDasharray) return route.strokeDasharray;
    if (route.type === 'screen') return '7,4';
    if (route.type === 'space') return '4,5';
    return null;
  }

  protected getRouteOpacity(route: DiagramRoute): number | string {
    if (route.opacity !== undefined) return route.opacity;
    if (route.type === 'screen') return '0.88';
    if (route.type === 'block') return '0.90';
    return '0.95';
  }

  protected getPlacementRoutePath(
    type: DiagramRouteType,
    _point: DiagramPoint,
    layout: DiagramLayout
  ): string {
    const draw = this.routeDraw();
    if (draw?.type === type) {
      return this.getRoutePath({
        from: '__preview__',
        type,
        curve: type === 'drag',
        points: this.buildDrawnRoutePoints(type, draw.start, draw.current, layout),
      });
    }

    return '';
  }

  protected getPlacementRouteColor(type: DiagramRouteType): string {
    return resolveRouteColor(type);
  }

  protected getPlacementRouteDasharray(type: DiagramRouteType): string | null {
    return this.getRouteDasharray({ from: '__preview__', type, points: [] });
  }

  protected getPlacementRouteMarker(type: DiagramRouteType): string {
    return this.getRouteMarker({ from: '__preview__', type, points: [] });
  }

  protected getPlayerLabel(player: DiagramPlayer): string {
    return this.compactLabel(this.normalizePositionToken(player.label), 9) || player.label;
  }

  protected readonly playerCircleRadius = 11.5;
  protected readonly playerSquareHalfSize = 11.5;
  protected readonly playerDiamondRadius = 13;
  protected readonly playerLabelYOffset = 3.5;

  protected getDiamondPoints(player: DiagramPlayer): string {
    return `${player.x},${player.y - this.playerDiamondRadius} ${player.x + this.playerDiamondRadius},${player.y} ${player.x},${player.y + this.playerDiamondRadius} ${player.x - this.playerDiamondRadius},${player.y}`;
  }

  protected getTrianglePoints(player: DiagramPlayer): string {
    const radius = this.playerDiamondRadius;
    return `${player.x},${player.y - radius} ${player.x + radius},${player.y + radius} ${player.x - radius},${player.y + radius}`;
  }

  protected getPlacementDiamondPoints(point: DiagramPoint): string {
    return `${point.x},${point.y - this.playerDiamondRadius} ${point.x + this.playerDiamondRadius},${point.y} ${point.x},${point.y + this.playerDiamondRadius} ${point.x - this.playerDiamondRadius},${point.y}`;
  }

  protected getPlacementTrianglePoints(point: DiagramPoint): string {
    const radius = this.playerDiamondRadius;
    return `${point.x},${point.y - radius} ${point.x + radius},${point.y + radius} ${point.x - radius},${point.y + radius}`;
  }

  protected updateFieldStyle(style: DiagramFieldStyle): void {
    this.updateLayout((layout) => ({ ...layout, fieldStyle: style }));
  }

  protected supportsDefensiveShells(layout: DiagramLayout): boolean {
    return layout.sport === 'football';
  }

  protected applyDefensiveShell(shell: DiagramDefensiveShell): void {
    this.updateSpatialLayout((layout) => applyFootballDefensiveShell(layout, shell));
    this.builderSelection.set(null);
    this.activeTool.set('select');
  }

  protected clearDefensiveShell(): void {
    this.updateSpatialLayout((layout) => removeFootballDefensiveShell(layout));
    this.builderSelection.set(null);
    this.activeTool.set('select');
  }

  protected addPlayer(shape: DiagramPlayerShape): void {
    this.armPlacement({ kind: 'player', shape }, 'select');
  }

  protected addRoute(type: DiagramRouteType = 'go'): void {
    this.armPlacement({ kind: 'route', type }, 'route');
  }

  protected addTextLabel(): void {
    this.armPlacement({ kind: 'zone', shape: 'text' }, 'zone');
  }

  protected addZone(): void {
    this.armPlacement({ kind: 'zone', shape: 'rect' }, 'zone');
  }

  private armPlacement(pending: DiagramPendingPlacement, activeTool: DiagramBuilderTool): void {
    const layout = this.builderLayout();
    if (!layout) return;

    this.pendingPlacement.set(pending);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.builderSelection.set(null);
    this.activeTool.set(activeTool);
  }

  private placePendingTool(point: DiagramPoint, pending: DiagramPendingPlacement): void {
    const layout = this.builderLayout();
    if (!layout) return;

    const placementPoint = this.clampPointToField(point);

    if (pending.kind === 'player') {
      this.placePlayerAt(pending.shape, placementPoint, layout);
    } else if (pending.kind === 'zone') {
      this.placeZoneAt(pending.shape, placementPoint, layout);
    }

    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.activeTool.set('select');
  }

  private placePlayerAt(
    shape: DiagramPlayerShape,
    point: DiagramPoint,
    layout: DiagramLayout
  ): void {
    const playerId = this.createUniquePlayerId(layout, shape);
    const player: DiagramPlayer = {
      id: playerId,
      label: this.getDefaultPlayerLabel(shape),
      x: this.clamp(point.x, 18, layout.fieldWidth - 18),
      y: this.clamp(point.y, 18, layout.fieldHeight - 18),
      team: shape === 'triangle' ? 'defense' : 'offense',
      shape,
    };

    this.updateLayout((current) => ({ ...current, players: [...current.players, player] }));
    this.builderSelection.set({ type: 'player', id: playerId });
  }

  private startRouteDraw(event: PointerEvent, type: DiagramRouteType, point: DiagramPoint): void {
    const start = this.clampPointToField(point, 8);
    const svg = this.getEventSvg(event);
    svg?.setPointerCapture?.(event.pointerId);
    this.cancelInlinePlayerLabelEdit();
    this.builderSelection.set(null);
    this.activeTool.set('route');
    this.routeDraw.set({ type, start, current: start, pointerId: event.pointerId });
    this.placementPreviewPoint.set(start);
  }

  private continueRouteDraw(event: PointerEvent): void {
    const draw = this.routeDraw();
    if (!draw) return;

    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    const current = this.clampPointToField(point, 8);
    this.routeDraw.set({ ...draw, current });
    this.placementPreviewPoint.set(current);
  }

  private finishRouteDraw(event: PointerEvent): void {
    const draw = this.routeDraw();
    if (!draw) return;

    event.preventDefault();
    this.getEventSvg(event)?.releasePointerCapture?.(draw.pointerId);
    this.routeDraw.set(null);

    const distance = Math.hypot(draw.current.x - draw.start.x, draw.current.y - draw.start.y);
    if (distance < 6) {
      this.placementPreviewPoint.set(draw.start);
      this.activeTool.set('route');
      return;
    }

    const layout = this.builderLayout();
    if (!layout) return;

    this.placeRouteAt(draw.type, draw.start, draw.current, layout);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.activeTool.set('select');
  }

  private placeRouteAt(
    type: DiagramRouteType,
    startPoint: DiagramPoint,
    endPoint: DiagramPoint,
    layout: DiagramLayout
  ): void {
    const routeId = createRouteId(layout.routes.length + 1);
    const isMotion = type === 'drag';
    const anchorPoint = {
      x: this.clamp(startPoint.x, 18, layout.fieldWidth - 18),
      y: this.clamp(startPoint.y, 18, layout.fieldHeight - 18),
    };
    const routeEndPoint = this.clampPointToField(endPoint, 8);
    const sourcePlayer = this.getNearestPlayer(layout, anchorPoint);
    const routeFromId = sourcePlayer?.id ?? this.createUniquePlayerId(layout, 'circle');
    const nextRoute: DiagramRoute = {
      id: routeId,
      from: routeFromId,
      label: this.getDefaultRouteLabel(type),
      type,
      color: resolveRouteColor(type),
      ...(isMotion ? { curve: true, strokeDasharray: '8,5', opacity: 0.9 } : {}),
      points: this.buildDrawnRoutePoints(type, anchorPoint, routeEndPoint, layout),
    };

    this.updateLayout((current) => {
      if (sourcePlayer) {
        return { ...current, routes: [...current.routes, nextRoute] };
      }

      const anchorPlayer: DiagramPlayer = {
        id: routeFromId,
        label: this.getDefaultPlayerLabel('circle'),
        x: anchorPoint.x,
        y: anchorPoint.y,
        team: 'offense',
        shape: 'circle',
      };

      return {
        ...current,
        players: [...current.players, anchorPlayer],
        routes: [...current.routes, nextRoute],
      };
    });
    this.builderSelection.set({ type: 'route', id: routeId });
  }

  private placeZoneAt(shape: 'rect' | 'text', point: DiagramPoint, layout: DiagramLayout): void {
    const zoneId = createZoneId((layout.zones?.length ?? 0) + 1);
    const width = shape === 'text' ? 92 : 120;
    const height = shape === 'text' ? 28 : 72;
    const zone: DiagramZone = {
      id: zoneId,
      label: shape === 'text' ? 'Text' : 'New Zone',
      x: this.clamp(point.x - width / 2, 0, layout.fieldWidth - width),
      y: this.clamp(point.y - height / 2, 0, layout.fieldHeight - height),
      width,
      height,
      shape,
      team: shape === 'text' ? 'offense' : 'defense',
    };

    this.updateLayout((current) => ({ ...current, zones: [...(current.zones ?? []), zone] }));
    this.builderSelection.set({ type: 'zone', id: zoneId });
  }

  protected updateSelectedPlayerLabel(label: string): void {
    const selected = this.selectedPlayer();
    if (!selected) return;
    this.updatePlayerLabelById(selected.id, label);
  }

  private updatePlayerLabelById(id: string, label: string): void {
    this.updateLayout((layout) => ({
      ...layout,
      players: layout.players.map((player) =>
        player.id === id ? { ...player, label: label.trim() || player.label } : player
      ),
    }));
  }

  protected updateSelectedRouteLabel(label: string): void {
    this.updateSelectedRoute((route) => ({ ...route, label: label.trim() || undefined }));
  }

  protected updateSelectedRouteType(type: DiagramRouteType): void {
    this.updateSelectedRoute((route) => ({ ...route, type, color: resolveRouteColor(type) }));
  }

  protected updateSelectedRouteColor(color: string): void {
    this.updateSelectedRoute((route) => ({ ...route, color }));
  }

  protected updateSelectedRouteCurve(curve: boolean): void {
    this.updateSelectedRoute((route) => ({ ...route, curve }));
  }

  protected updateSelectedZoneLabel(label: string): void {
    const selected = this.selectedZone();
    if (!selected) return;
    this.updateLayout((layout) => ({
      ...layout,
      zones: (layout.zones ?? []).map((zone) =>
        zone.id === selected.id ? { ...zone, label: label.trim() || zone.label } : zone
      ),
    }));
  }

  private moveBuilderEntity(
    type: DiagramBuilderSelection['type'],
    id: string,
    dx: number,
    dy: number
  ): void {
    if (type === 'player') {
      this.movePlayerById(id, dx, dy);
      return;
    }

    if (type === 'zone') {
      this.moveZoneById(id, dx, dy);
      return;
    }

    this.moveRouteById(id, dx, dy);
  }

  private movePlayerById(id: string, dx: number, dy: number): void {
    this.updateSpatialLayout(
      (layout) => ({
        ...layout,
        players: layout.players.map((player) =>
          player.id === id
            ? {
                ...player,
                x: this.clamp(player.x + dx, 10, layout.fieldWidth - 10),
                y: this.clamp(player.y + dy, 10, layout.fieldHeight - 10),
              }
            : player
        ),
        routes: layout.routes.map((route) =>
          route.from === id
            ? {
                ...route,
                points: route.points.map((point, index) =>
                  index === 0
                    ? [
                        this.clamp(point[0] + dx, 5, layout.fieldWidth - 5),
                        this.clamp(point[1] + dy, 5, layout.fieldHeight - 5),
                      ]
                    : point
                ),
              }
            : route
        ),
      }),
      { checkpoint: false }
    );
  }

  private moveZoneById(id: string, dx: number, dy: number): void {
    this.updateSpatialLayout(
      (layout) => ({
        ...layout,
        zones: (layout.zones ?? []).map((zone) =>
          zone.id === id
            ? {
                ...zone,
                x: this.clamp(zone.x + dx, 0, layout.fieldWidth - zone.width),
                y: this.clamp(zone.y + dy, 0, layout.fieldHeight - zone.height),
              }
            : zone
        ),
      }),
      { checkpoint: false }
    );
  }

  private moveRouteById(id: string, dx: number, dy: number): void {
    this.updateSpatialLayout(
      (layout) => ({
        ...layout,
        routes: layout.routes.map((route, index) =>
          this.getRouteId(route, index) === id
            ? {
                ...route,
                points: route.points.map(
                  (point) =>
                    [
                      this.clamp(point[0] + dx, 5, layout.fieldWidth - 5),
                      this.clamp(point[1] + dy, 5, layout.fieldHeight - 5),
                    ] as const
                ),
              }
            : route
        ),
      }),
      { checkpoint: false }
    );
  }

  protected discardBuilderDraft(): void {
    const baseline = this.builderBaselineLayout();
    if (baseline) {
      this.builderLayout.set(cloneDiagramLayout(baseline));
      this.builderSelection.set(null);
      this.pendingPlacement.set(null);
      this.placementPreviewPoint.set(null);
      this.routeDraw.set(null);
      this.cancelInlinePlayerLabelEdit();
      this.builderDrag.set(null);
      this.activeTool.set('select');
      this.resetBuilderHistory();
      this.syncBuilderDirty();
      return;
    }

    this.resetBuilder();
  }

  protected undoBuilderChange(): void {
    const layout = this.builderLayout();
    const undoStack = this.builderUndoStack();
    if (!layout || undoStack.length === 0) return;

    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;

    this.builderUndoStack.set(undoStack.slice(0, -1));
    this.builderRedoStack.update((stack) => this.appendHistorySnapshot(stack, layout));
    this.builderLayout.set(cloneDiagramLayout(previous));
    this.builderSelection.set(null);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.cancelInlinePlayerLabelEdit();
    this.builderDrag.set(null);
    this.activeTool.set('select');
    this.syncBuilderDirty();
  }

  protected redoBuilderChange(): void {
    const layout = this.builderLayout();
    const redoStack = this.builderRedoStack();
    if (!layout || redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    if (!next) return;

    this.builderRedoStack.set(redoStack.slice(0, -1));
    this.builderUndoStack.update((stack) => this.appendHistorySnapshot(stack, layout));
    this.builderLayout.set(cloneDiagramLayout(next));
    this.builderSelection.set(null);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.cancelInlinePlayerLabelEdit();
    this.builderDrag.set(null);
    this.activeTool.set('select');
    this.syncBuilderDirty();
  }

  protected async saveBuilderDraft(
    diagram: DiagramAssetSummary | DiagramAssetDetail
  ): Promise<void> {
    const layout = this.builderLayout();
    if (!layout) return;

    const preparedLayout = this.finalizeSpatialLayout(layout);
    this.builderLayout.set(preparedLayout);

    try {
      const updated = await this.service.update(diagram.id, {
        title: preparedLayout.title,
        description: diagram.description,
        sourceLayout: preparedLayout,
      });
      const nextLayout = updated.sourceLayout
        ? cloneDiagramLayout(updated.sourceLayout)
        : cloneDiagramLayout(preparedLayout);
      this.builderLayout.set(nextLayout);
      this.builderBaselineLayout.set(cloneDiagramLayout(nextLayout));
      this.resetBuilderHistory();
      this.syncBuilderDirty();
      this.toast.success('Diagram saved');
    } catch {
      this.toast.error('Could not save diagram');
    }
  }

  protected buildContext(diagram: DiagramAssetSummary) {
    return buildDiagramDragContext(diagram);
  }

  protected getDownloadName(diagram: DiagramAssetSummary): string {
    const slug = diagram.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug || 'diagram'}.png`;
  }

  protected openEditor(url: string): void {
    if (typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  protected async deleteDiagram(diagram: DiagramAssetSummary): Promise<void> {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete ${diagram.title}?`);
      if (!confirmed) return;
    }

    try {
      await this.service.delete(diagram.id);
      this.toast.success('Diagram deleted');
    } catch {
      this.toast.error('Could not delete diagram');
    }
  }

  private resetBuilder(): void {
    this.editMode.set(false);
    this.activeTool.set('select');
    this.builderLayout.set(null);
    this.builderBaselineLayout.set(null);
    this.builderSelection.set(null);
    this.pendingPlacement.set(null);
    this.placementPreviewPoint.set(null);
    this.routeDraw.set(null);
    this.cancelInlinePlayerLabelEdit();
    this.resetBuilderHistory();
    this.builderDirty.set(false);
    this.builderDrag.set(null);
  }

  private isDoubleTapPlayer(id: string, time: number): boolean {
    const previous = this.lastPlayerTap;
    this.lastPlayerTap = { id, time };
    return previous?.id === id && time - previous.time <= 360;
  }

  private focusInlinePlayerLabelInput(id: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-inline-player-label-input="${id}"]`
      );
      input?.focus();
      input?.select();
    });
  }

  private updateLayout(
    mutator: (layout: DiagramLayout) => DiagramLayout,
    options?: { checkpoint?: boolean }
  ): void {
    const layout = this.builderLayout();
    if (!layout) return;
    const nextLayout = mutator(layout);
    if (this.areLayoutsEqual(layout, nextLayout)) return;

    if (options?.checkpoint !== false) {
      this.captureHistorySnapshot(layout);
    }

    this.builderLayout.set(nextLayout);
    this.syncBuilderDirty();
  }

  private updateSpatialLayout(
    mutator: (layout: DiagramLayout) => DiagramLayout,
    options?: { checkpoint?: boolean }
  ): void {
    this.updateLayout((layout) => this.finalizeSpatialLayout(mutator(layout)), options);
  }

  private finalizeSpatialLayout(layout: DiagramLayout): DiagramLayout {
    return relievePlayerOverlap(snapDiagramLayoutToGrid(layout));
  }

  private captureHistorySnapshot(layout = this.builderLayout()): void {
    if (!layout) return;
    this.builderUndoStack.update((stack) => this.appendHistorySnapshot(stack, layout));
    this.builderRedoStack.set([]);
  }

  private appendHistorySnapshot(
    stack: readonly DiagramLayout[],
    layout: DiagramLayout
  ): readonly DiagramLayout[] {
    const nextStack = [...stack, cloneDiagramLayout(layout)];
    return nextStack.length > MAX_BUILDER_HISTORY_STEPS
      ? nextStack.slice(nextStack.length - MAX_BUILDER_HISTORY_STEPS)
      : nextStack;
  }

  private resetBuilderHistory(): void {
    this.builderUndoStack.set([]);
    this.builderRedoStack.set([]);
  }

  private syncBuilderDirty(): void {
    const layout = this.builderLayout();
    const baseline = this.builderBaselineLayout();
    this.builderDirty.set(Boolean(layout && baseline && !this.areLayoutsEqual(layout, baseline)));
  }

  private areLayoutsEqual(left: DiagramLayout, right: DiagramLayout): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private updateSelectedRoute(mutator: (route: DiagramRoute) => DiagramRoute): void {
    const selection = this.builderSelection();
    if (selection?.type !== 'route') return;

    this.updateLayout((layout) => ({
      ...layout,
      routes: layout.routes.map((route, index) =>
        this.getRouteId(route, index) === selection.id ? mutator(route) : route
      ),
    }));
  }

  private createUniquePlayerId(layout: DiagramLayout, shape: DiagramPlayerShape): string {
    const prefix =
      shape === 'triangle' ? 'defender' : shape === 'square' ? 'player-square' : 'player';
    const existing = new Set(layout.players.map((player) => player.id));
    let index = layout.players.length + 1;
    let id = `${prefix}-${index}`;

    while (existing.has(id)) {
      index += 1;
      id = `${prefix}-${index}`;
    }

    return id;
  }

  protected getDefaultPlayerLabel(shape: DiagramPlayerShape): string {
    if (shape === 'triangle') return 'D';
    if (shape === 'square') return 'OL';
    if (shape === 'diamond') return 'S';
    return 'WR';
  }

  private getDefaultRouteLabel(type: DiagramRouteType): string {
    if (type === 'block') return 'Block';
    if (type === 'drag') return 'Motion';
    if (type === 'screen') return 'Screen';
    if (type === 'space') return 'Zone Drop';
    if (type === 'cut') return 'Break';
    return 'Route';
  }

  private getNearestPlayer(layout: DiagramLayout, point: DiagramPoint): DiagramPlayer | null {
    const selected = this.selectedPlayer();
    if (selected) return selected;

    return layout.players.reduce<DiagramPlayer | null>((nearest, player) => {
      if (!nearest) return player;

      const nearestDistance = Math.hypot(nearest.x - point.x, nearest.y - point.y);
      const playerDistance = Math.hypot(player.x - point.x, player.y - point.y);
      return playerDistance < nearestDistance ? player : nearest;
    }, null);
  }

  private buildDrawnRoutePoints(
    _type: DiagramRouteType,
    startPoint: DiagramPoint,
    endPoint: DiagramPoint,
    layout: DiagramLayout
  ): ReadonlyArray<readonly [number, number]> {
    const start = {
      x: this.clamp(startPoint.x, 8, layout.fieldWidth - 8),
      y: this.clamp(startPoint.y, 8, layout.fieldHeight - 8),
    };
    const end = {
      x: this.clamp(endPoint.x, 8, layout.fieldWidth - 8),
      y: this.clamp(endPoint.y, 8, layout.fieldHeight - 8),
    };

    return [
      [start.x, start.y],
      [end.x, end.y],
    ];
  }

  private clampPointToField(point: DiagramPoint, inset = 0): DiagramPoint {
    const layout = this.builderLayout();
    if (!layout) return point;

    return {
      x: this.clamp(point.x, inset, layout.fieldWidth - inset),
      y: this.clamp(point.y, inset, layout.fieldHeight - inset),
    };
  }

  private buildCurvedRoutePath(points: ReadonlyArray<readonly [number, number]>): string {
    const [start, ...rest] = points;
    if (!start || rest.length === 0) return buildSvgPath(points);

    if (rest.length === 1) {
      const end = rest[0];
      const controlX = (start[0] + end[0]) / 2;
      const controlY = Math.min(start[1], end[1]) - 38;
      return `M ${start[0]},${start[1]} Q ${controlX},${controlY} ${end[0]},${end[1]}`;
    }

    return rest.reduce((path, point, index) => {
      const previous = index === 0 ? start : rest[index - 1];
      const controlX = (previous[0] + point[0]) / 2;
      const controlY = Math.min(previous[1], point[1]) - 22;
      return `${path} Q ${controlX},${controlY} ${point[0]},${point[1]}`;
    }, `M ${start[0]},${start[1]}`);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  private getSvgPoint(event: PointerEvent): { readonly x: number; readonly y: number } | null {
    const svg = this.getEventSvg(event);
    if (!svg) return null;

    const matrix = svg.getScreenCTM();
    if (!matrix) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(matrix.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  private getEventSvg(event: PointerEvent): SVGSVGElement | null {
    const currentTarget = event.currentTarget as
      | Element
      | SVGGraphicsElement
      | SVGSVGElement
      | null;
    if (currentTarget instanceof SVGSVGElement) return currentTarget;

    if (currentTarget instanceof SVGGraphicsElement) {
      return currentTarget.ownerSVGElement ?? null;
    }

    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<SVGSVGElement>('svg') ?? currentTarget?.querySelector?.('svg') ?? null;
  }

  private getTotalSvgHeight(layout: DiagramLayout): number {
    return layout.fieldHeight;
  }

  private getFootballPalette(layout: DiagramLayout): {
    readonly hashMark: string;
    readonly los: string;
    readonly losText: string;
  } {
    switch (layout.fieldStyle) {
      case 'modern':
        return {
          hashMark: 'rgba(255,255,255,0.35)',
          los: '#ffffff',
          losText: 'rgba(255,255,255,0.75)',
        };
      case 'night':
        return {
          hashMark: 'rgba(255,255,255,0.34)',
          los: '#f8fafc',
          losText: 'rgba(248,250,252,0.84)',
        };
      case 'blueprint':
        return {
          hashMark: 'rgba(125, 211, 252, 0.55)',
          los: '#e0f2fe',
          losText: 'rgba(224,242,254,0.88)',
        };
      case 'chalk':
        return {
          hashMark: 'rgba(255,255,255,0.28)',
          los: '#ffffff',
          losText: 'rgba(255,255,255,0.82)',
        };
      default:
        return {
          hashMark: 'rgba(107, 114, 128, 0.22)',
          los: '#111827',
          losText: 'rgba(55, 65, 81, 0.42)',
        };
    }
  }

  private compactLabel(raw: string | undefined, maxChars: number): string {
    if (!raw) return '';
    const replacements: ReadonlyArray<[RegExp, string]> = [
      [/\bRight\b/gi, 'Rt'],
      [/\bLeft\b/gi, 'Lt'],
      [/\bVertical\b/gi, 'Vert'],
      [/\bOutside\b/gi, 'Out'],
      [/\bInside\b/gi, 'In'],
      [/\bRelease\b/gi, 'Rel'],
      [/\bAnticipate\b/gi, 'Ant'],
      [/\bProtect\b/gi, 'Prot'],
      [/\bQuick\b/gi, 'Qk'],
      [/\bCorner\b/gi, 'Cor'],
      [/\bComeback\b/gi, 'Cmbk'],
    ];
    let normalized = raw.replace(/\s+/g, ' ').trim();
    for (const [pattern, replacement] of replacements) {
      normalized = normalized.replace(pattern, replacement);
    }
    return normalized.length <= maxChars
      ? normalized
      : `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
  }

  private normalizePositionToken(raw: string | undefined): string {
    const token = (raw ?? '').trim();
    if (!token) return '';

    const compact = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const slotMatch = compact.match(/^(SL|SLOTL|SR|SLOTR)(\d+)$/);
    if (slotMatch) {
      const base = slotMatch[1];
      const index = Number(slotMatch[2]);
      if (base === 'SL' || base === 'SLOTL') return index === 1 ? 'H' : index === 2 ? 'Y' : 'SLOT';
      return index === 1 ? 'Y' : index === 2 ? 'H' : 'SLOT';
    }

    const upper = /^(1B|2B|3B)$/.test(compact) ? compact : compact.replace(/\d+$/, '');
    const aliases: Record<string, string> = {
      SL: 'H',
      SLOTL: 'H',
      SR: 'Y',
      SLOTR: 'Y',
    };

    return aliases[upper] ?? upper;
  }
}
