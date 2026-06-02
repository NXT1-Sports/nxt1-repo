import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, type SafeHtml, type SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import type {
  DiagramAssetDetail,
  DiagramAssetKind,
  DiagramAssetSummary,
  DiagramFieldStyle,
  DiagramLayout,
  DiagramPlayer,
  DiagramRoute,
  DiagramRouteType,
  DiagramZone,
} from '@nxt1/core/ai';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXDiagramService } from '../../services/agent-x-diagram.service';
import {
  DIAGRAM_FIELD_STYLE_OPTIONS,
  DIAGRAM_ROUTE_TYPE_OPTIONS,
  EMPTY_DIAGRAM_FILTERS,
  type DiagramBuilderSelection,
  type DiagramBuilderTool,
} from './agent-x-diagrams-panel.types';
import {
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
} from './agent-x-diagrams-panel.utils';

interface DiagramBuilderDragState {
  readonly type: DiagramBuilderSelection['type'];
  readonly id: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly pointerId: number;
}

@Component({
  selector: 'nxt1-agent-x-diagrams-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NxtIconComponent, AgentXContextDragDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="diagrams-panel" [attr.data-testid]="testIds.PANEL_CONTAINER">
      <aside class="diagrams-panel__rail" aria-label="Diagram library">
        <div class="diagrams-panel__toolbar">
          <div class="diagrams-panel__search-wrap">
            <nxt1-icon name="search" [size]="14" aria-hidden="true"></nxt1-icon>
            <input
              type="search"
              class="diagrams-panel__search"
              placeholder="Search diagrams"
              [ngModel]="filters().query"
              [attr.data-testid]="testIds.SEARCH_INPUT"
              (ngModelChange)="setSearchQuery($event)"
            />
          </div>
        </div>

        @if (service.loading()) {
          <div class="diagrams-panel__skeleton-list" [attr.data-testid]="testIds.LOADING_SKELETON">
            @for (item of skeletonItems; track item) {
              <div class="diagrams-panel__skeleton-item">
                <span></span>
                <strong></strong>
                <small></small>
              </div>
            }
          </div>
        } @else if (service.error()) {
          <div class="diagrams-panel__state" [attr.data-testid]="testIds.ERROR_STATE">
            <nxt1-icon name="image" [size]="24"></nxt1-icon>
            <h3>Unable to Load Diagrams</h3>
            <p>{{ service.error() }}</p>
            <button type="button" class="diagrams-panel__primary-btn" (click)="refresh()">
              Try Again
            </button>
          </div>
        } @else if (filteredDiagrams().length === 0) {
          <div class="diagrams-panel__state" [attr.data-testid]="testIds.EMPTY_STATE">
            <nxt1-icon name="image" [size]="24"></nxt1-icon>
            <h3>No Diagrams Yet</h3>
            <p>Generated plays, formations, and drill boards will appear here.</p>
          </div>
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
                </span>
              </button>
            }
          </div>
        }
      </aside>

      <section class="diagrams-panel__viewer" [attr.data-testid]="testIds.VIEWER">
        @if (selectedDiagram(); as diagram) {
          <div class="diagrams-panel__workspace">
            <div
              class="diagrams-panel__builder-toolbar"
              [attr.data-testid]="testIds.BUILDER_TOOLBAR"
            >
              <div class="diagrams-panel__tool-group" aria-label="Builder tools">
                <button
                  type="button"
                  class="diagrams-panel__tool-btn"
                  [class.diagrams-panel__tool-btn--active]="editMode()"
                  [attr.data-testid]="testIds.BUILDER_EDIT_BUTTON"
                  (click)="toggleEditMode(diagram)"
                >
                  <nxt1-icon name="edit" [size]="14"></nxt1-icon>
                  Builder
                </button>

                @if (editMode()) {
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [class.diagrams-panel__tool-btn--active]="activeTool() === 'select'"
                    (click)="setActiveTool('select')"
                  >
                    <nxt1-icon name="mouse-pointer" [size]="14"></nxt1-icon>
                    Select
                  </button>
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [class.diagrams-panel__tool-btn--active]="activeTool() === 'route'"
                    [attr.data-testid]="testIds.BUILDER_ADD_ROUTE_BUTTON"
                    (click)="addRoute()"
                  >
                    <nxt1-icon name="arrow-up-right" [size]="14"></nxt1-icon>
                    Add Line
                  </button>
                  <button
                    type="button"
                    class="diagrams-panel__tool-btn"
                    [class.diagrams-panel__tool-btn--active]="activeTool() === 'zone'"
                    [attr.data-testid]="testIds.BUILDER_ADD_ZONE_BUTTON"
                    (click)="addZone()"
                  >
                    <nxt1-icon name="square" [size]="14"></nxt1-icon>
                    Add Zone
                  </button>
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
                @if (editMode() && builderLayout(); as layout) {
                  <svg
                    class="diagrams-panel__builder-svg"
                    [attr.viewBox]="getLayoutViewBox(layout)"
                    [attr.aria-label]="layout.title"
                    (pointermove)="continueBuilderDrag($event)"
                    (pointerup)="finishBuilderDrag($event)"
                    (pointercancel)="finishBuilderDrag($event)"
                    (pointerleave)="finishBuilderDrag($event)"
                    role="img"
                  >
                    <defs>
                      <marker
                        id="builder-arr-go"
                        markerWidth="6"
                        markerHeight="6"
                        refX="5.3"
                        refY="3"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M0,0 L6,3 L0,6 L1.3,3 z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-block"
                        markerWidth="9"
                        markerHeight="9"
                        refX="4.5"
                        refY="4.5"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path
                          d="M4.5,1.2 L4.5,7.8 M1.4,3.5 L7.6,3.5"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="1.6"
                          stroke-linecap="round"
                        ></path>
                      </marker>
                      <marker
                        id="builder-arr-screen"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6.4"
                        refY="3.5"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <rect
                          x="0.8"
                          y="0.8"
                          width="5.4"
                          height="5.4"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="1.1"
                          rx="0.9"
                          ry="0.9"
                        ></rect>
                      </marker>
                      <marker
                        id="builder-arr-pick"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <circle
                          cx="4"
                          cy="4"
                          r="4"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="1.5"
                        ></circle>
                      </marker>
                      <marker
                        id="builder-arr-cut"
                        markerWidth="6"
                        markerHeight="6"
                        refX="5.3"
                        refY="3"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-drag"
                        markerWidth="6"
                        markerHeight="6"
                        refX="5.1"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,0.5 L5.2,3 L0,5.5 L1.1,3 z" fill="context-stroke"></path>
                      </marker>
                      <marker
                        id="builder-arr-space"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <circle cx="3" cy="3" r="1.5" fill="context-stroke"></circle>
                      </marker>
                      <marker
                        id="builder-arr-fade"
                        markerWidth="6"
                        markerHeight="6"
                        refX="4"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0,3 L4,1 L5,3 L4,5 Z" fill="context-stroke" opacity="0.6"></path>
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
                    }

                    @for (zone of layout.zones ?? []; track zone.id) {
                      <g
                        class="diagrams-panel__zone-node"
                        [class.diagrams-panel__node--selected]="isSelected('zone', zone.id)"
                        [attr.data-testid]="testIds.BUILDER_ZONE_NODE"
                        (pointerdown)="startBuilderDrag($event, 'zone', zone.id)"
                        (click)="selectBuilderEntity($event, 'zone', zone.id)"
                      >
                        @if (zone.shape === 'ellipse') {
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
                        <text [attr.x]="zone.x + 10" [attr.y]="zone.y + 20">{{ zone.label }}</text>
                      </g>
                    }

                    @for (route of layout.routes; track getRouteTrackId(route, $index)) {
                      <g
                        class="diagrams-panel__route-node"
                        [class.diagrams-panel__node--selected]="
                          isSelected('route', getRouteId(route, $index))
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
                        [class.diagrams-panel__node--selected]="isSelected('player', player.id)"
                        [attr.data-testid]="testIds.BUILDER_PLAYER_NODE"
                        (pointerdown)="startBuilderDrag($event, 'player', player.id)"
                        (click)="selectBuilderEntity($event, 'player', player.id)"
                      >
                        @if (player.shape === 'square') {
                          <rect
                            [attr.x]="player.x - 13"
                            [attr.y]="player.y - 13"
                            width="26"
                            height="26"
                            rx="5"
                          ></rect>
                        } @else if (player.shape === 'diamond') {
                          <polygon [attr.points]="getDiamondPoints(player)"></polygon>
                        } @else {
                          <circle [attr.cx]="player.x" [attr.cy]="player.y" r="13"></circle>
                        }
                        <text [attr.x]="player.x" [attr.y]="player.y + 4">
                          {{ getPlayerLabel(player) }}
                        </text>
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
                    @if (getLegendItems(layout).length > 0) {
                      <rect
                        class="diagrams-panel__legend-bar"
                        x="0"
                        [attr.y]="layout.fieldHeight - 24"
                        [attr.width]="layout.fieldWidth"
                        height="24"
                      ></rect>
                      @for (item of getLegendItems(layout); track item.type) {
                        <line
                          [attr.x1]="item.x"
                          [attr.y1]="layout.fieldHeight - 11"
                          [attr.x2]="item.x + 16"
                          [attr.y2]="layout.fieldHeight - 11"
                          [attr.stroke]="item.color"
                          stroke-width="2"
                          [attr.marker-end]="item.marker"
                          [attr.stroke-dasharray]="item.dasharray || null"
                          [attr.opacity]="item.opacity"
                        ></line>
                        <text
                          class="diagrams-panel__legend-text"
                          [attr.x]="item.x + 20"
                          [attr.y]="layout.fieldHeight - 7.5"
                        >
                          {{ item.label }}
                        </text>
                      }
                    }
                    @if (getAnnotationItems(layout).length > 0) {
                      <rect
                        class="diagrams-panel__annotation-strip"
                        x="0"
                        [attr.y]="layout.fieldHeight"
                        [attr.width]="layout.fieldWidth"
                        [attr.height]="getAnnotationHeight(layout)"
                      ></rect>
                      @for (item of getAnnotationItems(layout); track item.id) {
                        <circle
                          [attr.cx]="item.dotX"
                          [attr.cy]="item.y"
                          r="4"
                          [attr.fill]="item.color"
                          opacity="0.9"
                        ></circle>
                        <text
                          class="diagrams-panel__annotation-text"
                          [attr.x]="item.textX"
                          [attr.y]="item.y"
                        >
                          {{ item.text }}
                        </text>
                      }
                    }
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

              @if (editMode()) {
                <aside
                  class="diagrams-panel__inspector"
                  [attr.data-testid]="testIds.BUILDER_INSPECTOR"
                >
                  @if (builderLayout(); as layout) {
                    <section class="diagrams-panel__inspector-section">
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

                    @if (selectedPlayer(); as player) {
                      <section class="diagrams-panel__inspector-section">
                        <h3>Player</h3>
                        <label>
                          Label
                          <input
                            [ngModel]="player.label"
                            (ngModelChange)="updateSelectedPlayerLabel($event)"
                          />
                        </label>
                        <div class="diagrams-panel__step-grid">
                          <button type="button" (click)="moveSelectedPlayer(0, -8)">Up</button>
                          <button type="button" (click)="moveSelectedPlayer(-8, 0)">Left</button>
                          <button type="button" (click)="moveSelectedPlayer(8, 0)">Right</button>
                          <button type="button" (click)="moveSelectedPlayer(0, 8)">Down</button>
                        </div>
                      </section>
                    } @else if (selectedRoute(); as route) {
                      <section class="diagrams-panel__inspector-section">
                        <h3>Line</h3>
                        <label>
                          Label
                          <input
                            [ngModel]="route.label ?? ''"
                            (ngModelChange)="updateSelectedRouteLabel($event)"
                          />
                        </label>
                        <label>
                          Type
                          <select
                            [ngModel]="route.type ?? 'go'"
                            (ngModelChange)="updateSelectedRouteType($event)"
                          >
                            @for (option of routeTypeOptions; track option.id) {
                              <option [ngValue]="option.id">{{ option.label }}</option>
                            }
                          </select>
                        </label>
                        <label>
                          Color
                          <input
                            type="color"
                            [ngModel]="getRouteColor(route)"
                            (ngModelChange)="updateSelectedRouteColor($event)"
                          />
                        </label>
                        <label class="diagrams-panel__check-row">
                          <input
                            type="checkbox"
                            [ngModel]="route.curve === true"
                            (ngModelChange)="updateSelectedRouteCurve($event)"
                          />
                          Curve line
                        </label>
                      </section>
                    } @else if (selectedZone(); as zone) {
                      <section class="diagrams-panel__inspector-section">
                        <h3>Zone</h3>
                        <label>
                          Label
                          <input
                            [ngModel]="zone.label"
                            (ngModelChange)="updateSelectedZoneLabel($event)"
                          />
                        </label>
                        <div class="diagrams-panel__step-grid">
                          <button type="button" (click)="moveSelectedZone(0, -8)">Up</button>
                          <button type="button" (click)="moveSelectedZone(-8, 0)">Left</button>
                          <button type="button" (click)="moveSelectedZone(8, 0)">Right</button>
                          <button type="button" (click)="moveSelectedZone(0, 8)">Down</button>
                        </div>
                      </section>
                    } @else {
                      <section
                        class="diagrams-panel__inspector-section diagrams-panel__inspector-empty"
                      >
                        <h3>Select Something</h3>
                        <p>Choose a player, line, or zone on the board to edit its details.</p>
                      </section>
                    }
                  }
                </aside>
              }
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
        grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
        gap: 14px;
        height: 100%;
        min-height: 0;
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-4, 16px);
        color: var(--agent-text-primary, var(--nxt1-color-text-primary));
      }

      .diagrams-panel__rail,
      .diagrams-panel__viewer {
        min-height: 0;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        background: var(--agent-surface, var(--nxt1-color-surface-100));
      }

      .diagrams-panel__rail {
        grid-column: 2;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 8px;
      }

      .diagrams-panel__toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        padding: 12px 12px 8px;
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
      .diagrams-panel__skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 12px 12px;
      }

      .diagrams-panel__list-item {
        display: grid;
        grid-template-rows: 92px auto;
        gap: 7px;
        min-height: 134px;
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
        height: 92px;
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
        justify-content: center;
        gap: 0;
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
        grid-column: 1;
        grid-row: 1;
        display: flex;
        overflow: hidden;
        border-radius: 8px;
      }

      .diagrams-panel__workspace {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      .diagrams-panel__builder-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-width: 0;
        border-bottom: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        padding: 9px 10px;
        background: var(--agent-surface, var(--nxt1-color-surface-100));
      }

      .diagrams-panel__tool-group {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .diagrams-panel__tool-group--save {
        margin-left: auto;
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
        grid-template-columns: minmax(0, 1fr) minmax(190px, 240px);
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

      .diagrams-panel__field-bg {
        fill: #3d6b4a;
      }

      .diagrams-panel__field-bg--night {
        fill: #203f2d;
      }

      .diagrams-panel__field-bg--blueprint {
        fill: #123b67;
      }

      .diagrams-panel__field-bg--chalk {
        fill: #2a2a2a;
      }

      .diagrams-panel__field-line {
        stroke-width: 1;
      }

      .diagrams-panel__hash-mark {
        stroke-width: 1.5;
      }

      .diagrams-panel__los-line {
        stroke-dasharray: 10 5;
        stroke-width: 2.4;
      }

      .diagrams-panel__los-text {
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: 700;
      }

      .diagrams-panel__route-node path {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 4;
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
        font-size: 12px;
        font-weight: 800;
        paint-order: stroke;
        stroke: rgba(0, 0, 0, 0.45);
        stroke-width: 3px;
      }

      .diagrams-panel__zone-node,
      .diagrams-panel__player-node {
        cursor: grab;
      }

      .diagrams-panel__route-node {
        cursor: grab;
      }

      .diagrams-panel__zone-node rect,
      .diagrams-panel__zone-node ellipse {
        fill: rgba(0, 120, 255, 0.13);
        stroke: rgba(0, 120, 255, 0.55);
        stroke-dasharray: 5 3;
        stroke-width: 1.2;
      }

      .diagrams-panel__player-node circle,
      .diagrams-panel__player-node rect,
      .diagrams-panel__player-node polygon {
        fill: #d2e3fc;
        stroke: #1a73e8;
        stroke-width: 2;
      }

      .diagrams-panel__player-node--defense circle,
      .diagrams-panel__player-node--defense rect,
      .diagrams-panel__player-node--defense polygon {
        fill: #fce8e6;
        stroke: #d93025;
      }

      .diagrams-panel__player-node text {
        fill: #102a43;
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: 900;
        pointer-events: none;
        text-anchor: middle;
      }

      .diagrams-panel__node--selected circle,
      .diagrams-panel__node--selected rect,
      .diagrams-panel__node--selected polygon,
      .diagrams-panel__node--selected ellipse,
      .diagrams-panel__node--selected path {
        filter: drop-shadow(0 0 8px var(--agent-primary, var(--nxt1-color-primary)));
        stroke: var(--agent-primary, var(--nxt1-color-primary));
      }

      .diagrams-panel__title-bar {
        fill: rgba(0, 0, 0, 0.6);
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
        fill: rgba(0, 0, 0, 0.6);
      }

      .diagrams-panel__annotation-strip {
        fill: rgba(0, 0, 0, 0.55);
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

      .diagrams-panel__inspector {
        min-width: 0;
        overflow-y: auto;
        border-left: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        background: var(--agent-surface, var(--nxt1-color-surface-100));
        padding: 12px;
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

      .diagrams-panel__segmented,
      .diagrams-panel__step-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .diagrams-panel__segmented button,
      .diagrams-panel__step-grid button {
        min-height: 30px;
        border: 1px solid var(--agent-border, var(--nxt1-color-border-subtle));
        border-radius: 8px;
        background: var(--agent-bg, var(--nxt1-color-bg-primary));
        color: var(--agent-text-secondary, var(--nxt1-color-text-secondary));
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
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

      .diagrams-panel__skeleton-item {
        display: grid;
        gap: 8px;
        min-height: 86px;
        border-radius: 8px;
        padding: 10px;
        background: var(--agent-surface-hover, var(--nxt1-color-surface-200));
      }

      .diagrams-panel__skeleton-item span,
      .diagrams-panel__skeleton-item strong,
      .diagrams-panel__skeleton-item small {
        display: block;
        height: 12px;
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          var(--agent-surface, var(--nxt1-color-surface-100)),
          var(--agent-primary-glow, var(--nxt1-color-alpha-primary10)),
          var(--agent-surface, var(--nxt1-color-surface-100))
        );
        background-size: 220% 100%;
        animation: diagrams-shimmer 1.4s ease-in-out infinite;
      }

      .diagrams-panel__skeleton-item span {
        width: 46%;
      }

      .diagrams-panel__skeleton-item strong {
        width: 78%;
      }

      .diagrams-panel__skeleton-item small {
        width: 62%;
      }

      @keyframes diagrams-shimmer {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }

      @media (max-width: 760px) {
        .diagrams-panel {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(360px, 1fr) minmax(240px, 40%);
        }

        .diagrams-panel__viewer {
          grid-column: 1;
          grid-row: 1;
        }

        .diagrams-panel__builder-body--editing {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 1fr) auto;
        }

        .diagrams-panel__rail {
          grid-column: 1;
          grid-row: 2;
        }
      }
    `,
  ],
})
export class AgentXDiagramsPanelComponent implements OnChanges {
  @Input() sport: string | null = null;
  @Input() teamId: string | null = null;

  protected readonly service = inject(AgentXDiagramService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(NxtToastService);
  protected readonly testIds = TEST_IDS.DIAGRAMS_LAB;
  protected readonly skeletonItems = [1, 2, 3, 4] as const;
  protected readonly fieldStyleOptions = DIAGRAM_FIELD_STYLE_OPTIONS;
  protected readonly routeTypeOptions = DIAGRAM_ROUTE_TYPE_OPTIONS;
  protected readonly filters = signal(EMPTY_DIAGRAM_FILTERS);
  protected readonly imageFailed = signal(false);
  protected readonly editMode = signal(false);
  protected readonly activeTool = signal<DiagramBuilderTool>('select');
  protected readonly builderLayout = signal<DiagramLayout | null>(null);
  protected readonly builderSelection = signal<DiagramBuilderSelection | null>(null);
  protected readonly builderDirty = signal(false);
  private readonly builderDrag = signal<DiagramBuilderDragState | null>(null);

  protected readonly filteredDiagrams = computed(() => {
    const filters = this.filters();
    return this.service
      .diagrams()
      .filter((diagram) => diagram.kind === 'sport_play')
      .filter((diagram) => matchesDiagramQuery(diagram, filters.query));
  });

  protected readonly selectedDiagram = computed(() => this.service.selectedDiagram());
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

  protected async refresh(): Promise<void> {
    await this.service.load({ sport: this.sport, kind: 'sport_play', limit: 75 });
    this.imageFailed.set(false);
  }

  protected async selectDiagram(id: string): Promise<void> {
    this.imageFailed.set(false);
    this.resetBuilder();
    await this.service.select(id);
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

  protected toggleEditMode(diagram: DiagramAssetSummary | DiagramAssetDetail): void {
    if (this.editMode()) {
      this.resetBuilder();
      return;
    }

    if (!('sourceLayout' in diagram) || !diagram.sourceLayout) {
      this.toast.error('This diagram is image-only and cannot be edited yet');
      return;
    }

    this.builderLayout.set(cloneDiagramLayout(diagram.sourceLayout));
    this.builderSelection.set(null);
    this.builderDirty.set(false);
    this.activeTool.set('select');
    this.editMode.set(true);
  }

  protected setActiveTool(tool: DiagramBuilderTool): void {
    this.activeTool.set(tool);
  }

  protected selectBuilderEntity(
    event: Event,
    type: DiagramBuilderSelection['type'],
    id: string
  ): void {
    event.stopPropagation();
    this.builderSelection.set({ type, id });
    this.activeTool.set('select');
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
    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    const svg = this.getEventSvg(event);
    svg?.setPointerCapture?.(event.pointerId);
    this.builderSelection.set({ type, id });
    this.activeTool.set('select');
    this.builderDrag.set({ type, id, lastX: point.x, lastY: point.y, pointerId: event.pointerId });
  }

  protected continueBuilderDrag(event: PointerEvent): void {
    const drag = this.builderDrag();
    if (!drag) return;

    const point = this.getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    const dx = point.x - drag.lastX;
    const dy = point.y - drag.lastY;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;

    this.moveBuilderEntity(drag.type, drag.id, dx, dy);
    this.builderDrag.set({ ...drag, lastX: point.x, lastY: point.y });
  }

  protected finishBuilderDrag(event: PointerEvent): void {
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
    for (let y = 20; y < layout.fieldHeight; y += 40) {
      marks.push(
        { id: `left-hash-${y}`, x1: 182, y1: y - 6, x2: 182, y2: y + 6, stroke: palette.hashMark },
        { id: `right-hash-${y}`, x1: 418, y1: y - 6, x2: 418, y2: y + 6, stroke: palette.hashMark }
      );
    }
    return marks;
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
    if (route.type === 'block') return '3.0';
    if (route.type === 'pick') return '3.2';
    if (route.type === 'screen') return '2.4';
    return '2.5';
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

  protected getPlayerLabel(player: DiagramPlayer): string {
    return this.compactLabel(this.normalizePositionToken(player.label), 9) || player.label;
  }

  protected getLegendItems(layout: DiagramLayout): ReadonlyArray<{
    type: DiagramRouteType;
    x: number;
    label: string;
    color: string;
    marker: string;
    dasharray: string | null;
    opacity: string;
  }> {
    const order: DiagramRouteType[] = [
      'go',
      'cut',
      'drag',
      'screen',
      'block',
      'pick',
      'fade',
      'space',
    ];
    const labels: Record<DiagramRouteType, string> = {
      go: 'Go',
      cut: 'Cut',
      drag: 'Drag',
      screen: 'Screen',
      block: 'Block',
      pick: 'Pick',
      fade: 'Fade',
      space: 'Run',
    };
    const used = new Set(
      layout.routes.map((route) => route.type).filter(Boolean) as DiagramRouteType[]
    );
    const types = order.filter((type) => used.has(type));
    const itemWidth = 64;
    const startX = Math.max(8, (layout.fieldWidth - types.length * itemWidth) / 2);
    return types.map((type, index) => {
      const route: DiagramRoute = { from: '', points: [], type };
      return {
        type,
        x: startX + index * itemWidth,
        label: labels[type],
        color: resolveRouteColor(type),
        marker: this.getRouteMarker(route),
        dasharray: this.getRouteDasharray(route),
        opacity: type === 'screen' ? '0.88' : type === 'block' ? '0.90' : '0.95',
      };
    });
  }

  protected getAnnotationItems(layout: DiagramLayout): ReadonlyArray<{
    id: string;
    dotX: number;
    textX: number;
    y: number;
    text: string;
    color: string;
  }> {
    const labeled = layout.routes
      .map((route, index) => ({
        id: this.getRouteId(route, index),
        from: this.normalizePositionToken(route.from),
        label: this.compactLabel(route.label, 18),
        color: this.getRouteColor(route),
      }))
      .filter((route) => route.label.length > 0);
    if (labeled.length === 0) return [];

    const rowHeight = 18;
    const padY = 10;
    const columns = labeled.length > 5 ? 2 : 1;
    const perColumn = Math.ceil(labeled.length / columns);
    const columnWidth = layout.fieldWidth / columns;

    return labeled.map((item, index) => {
      const column = Math.floor(index / perColumn);
      const row = index % perColumn;
      const x = column * columnWidth + 12;
      const y = layout.fieldHeight + padY + row * rowHeight + rowHeight / 2;
      return {
        id: item.id,
        dotX: x + 4,
        textX: x + 12,
        y,
        text: item.from ? `${item.from}: ${item.label}` : item.label,
        color: item.color,
      };
    });
  }

  protected getAnnotationHeight(layout: DiagramLayout): number {
    const labeledCount = layout.routes.filter(
      (route) => this.compactLabel(route.label, 18).length > 0
    ).length;
    if (labeledCount === 0) return 0;
    const columns = labeledCount > 5 ? 2 : 1;
    return Math.ceil(labeledCount / columns) * 18 + 20;
  }

  protected getDiamondPoints(player: DiagramPlayer): string {
    return `${player.x},${player.y - 15} ${player.x + 15},${player.y} ${player.x},${player.y + 15} ${player.x - 15},${player.y}`;
  }

  protected updateFieldStyle(style: DiagramFieldStyle): void {
    this.updateLayout((layout) => ({ ...layout, fieldStyle: style }));
  }

  protected addRoute(): void {
    const layout = this.builderLayout();
    if (!layout) return;

    const sourcePlayer = this.selectedPlayer() ?? layout.players[0];
    if (!sourcePlayer) return;

    const routeId = createRouteId(layout.routes.length + 1);
    const nextRoute: DiagramRoute = {
      id: routeId,
      from: sourcePlayer.id,
      label: 'New Line',
      type: 'go',
      color: resolveRouteColor('go'),
      points: [
        [sourcePlayer.x, sourcePlayer.y],
        [sourcePlayer.x, Math.max(20, sourcePlayer.y - 110)],
      ],
    };

    this.updateLayout((current) => ({ ...current, routes: [...current.routes, nextRoute] }));
    this.builderSelection.set({ type: 'route', id: routeId });
    this.activeTool.set('route');
  }

  protected addZone(): void {
    const layout = this.builderLayout();
    if (!layout) return;

    const zoneId = createZoneId((layout.zones?.length ?? 0) + 1);
    const zone: DiagramZone = {
      id: zoneId,
      label: 'New Zone',
      x: Math.round(layout.fieldWidth * 0.58),
      y: Math.round(layout.fieldHeight * 0.2),
      width: 120,
      height: 72,
      shape: 'rect',
      team: 'defense',
    };

    this.updateLayout((current) => ({ ...current, zones: [...(current.zones ?? []), zone] }));
    this.builderSelection.set({ type: 'zone', id: zoneId });
    this.activeTool.set('zone');
  }

  protected moveSelectedPlayer(dx: number, dy: number): void {
    const selected = this.selectedPlayer();
    if (!selected) return;
    this.updateLayout((layout) => ({
      ...layout,
      players: layout.players.map((player) =>
        player.id === selected.id
          ? {
              ...player,
              x: this.clamp(player.x + dx, 10, layout.fieldWidth - 10),
              y: this.clamp(player.y + dy, 10, layout.fieldHeight - 10),
            }
          : player
      ),
      routes: layout.routes.map((route) =>
        route.from === selected.id
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
    }));
  }

  protected updateSelectedPlayerLabel(label: string): void {
    const selected = this.selectedPlayer();
    if (!selected) return;
    this.updateLayout((layout) => ({
      ...layout,
      players: layout.players.map((player) =>
        player.id === selected.id ? { ...player, label: label.trim() || player.label } : player
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

  protected moveSelectedZone(dx: number, dy: number): void {
    const selected = this.selectedZone();
    if (!selected) return;
    this.updateLayout((layout) => ({
      ...layout,
      zones: (layout.zones ?? []).map((zone) =>
        zone.id === selected.id
          ? {
              ...zone,
              x: this.clamp(zone.x + dx, 0, layout.fieldWidth - zone.width),
              y: this.clamp(zone.y + dy, 0, layout.fieldHeight - zone.height),
            }
          : zone
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
    this.updateLayout((layout) => ({
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
    }));
  }

  private moveZoneById(id: string, dx: number, dy: number): void {
    this.updateLayout((layout) => ({
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
    }));
  }

  private moveRouteById(id: string, dx: number, dy: number): void {
    this.updateLayout((layout) => ({
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
    }));
  }

  protected discardBuilderDraft(): void {
    const diagram = this.selectedDiagram();
    if (diagram && 'sourceLayout' in diagram && diagram.sourceLayout) {
      this.builderLayout.set(cloneDiagramLayout(diagram.sourceLayout));
      this.builderSelection.set(null);
      this.builderDirty.set(false);
      return;
    }

    this.resetBuilder();
  }

  protected async saveBuilderDraft(
    diagram: DiagramAssetSummary | DiagramAssetDetail
  ): Promise<void> {
    const layout = this.builderLayout();
    if (!layout) return;

    try {
      const updated = await this.service.update(diagram.id, {
        title: layout.title,
        description: diagram.description,
        sourceLayout: layout,
      });
      this.builderLayout.set(
        updated.sourceLayout ? cloneDiagramLayout(updated.sourceLayout) : layout
      );
      this.builderDirty.set(false);
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
    this.builderSelection.set(null);
    this.builderDirty.set(false);
    this.builderDrag.set(null);
  }

  private updateLayout(mutator: (layout: DiagramLayout) => DiagramLayout): void {
    const layout = this.builderLayout();
    if (!layout) return;
    this.builderLayout.set(mutator(layout));
    this.builderDirty.set(true);
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
    const currentTarget = event.currentTarget as SVGGraphicsElement | SVGSVGElement | null;
    if (currentTarget instanceof SVGSVGElement) return currentTarget;
    return currentTarget?.ownerSVGElement ?? null;
  }

  private getTotalSvgHeight(layout: DiagramLayout): number {
    return layout.fieldHeight + this.getAnnotationHeight(layout);
  }

  private getFootballPalette(layout: DiagramLayout): {
    readonly hashMark: string;
    readonly los: string;
    readonly losText: string;
  } {
    switch (layout.fieldStyle) {
      case 'night':
        return {
          hashMark: 'rgba(255,255,255,0.26)',
          los: '#f8fafc',
          losText: 'rgba(248,250,252,0.78)',
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
          hashMark: 'rgba(255,255,255,0.35)',
          los: '#ffffff',
          losText: 'rgba(255,255,255,0.75)',
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
