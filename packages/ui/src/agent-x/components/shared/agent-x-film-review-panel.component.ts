import { Auth } from '@angular/fire/auth';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import {
  type AgentXAttachment,
  buildTeamFilmReviewSourceAngleMetadata,
  type TeamFilmReviewCameraAngle,
  type TeamFilmReviewSourceAngleMetadata,
  getTeamFilmReviewSportTagDefinitions,
  type TeamFilmReviewDownloadExport,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewSourceVideo,
  USER_ROLES,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewPlayTagValue,
  type TeamFilmReviewSportTagColumnWidth,
  type TeamFilmReviewSportTagDefinition,
  type TeamFilmReviewTimelineState,
} from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  type AgentXSelectedContext,
  type AgentXSelectedContextMetadataValue,
} from '@nxt1/core/ai';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import {
  commitMediaSeek,
  isCloudflarePlaybackSource,
  isHlsSourceUrl,
  playMediaWhenReady,
  resolveCloudflareBaseEmbedUrl as resolveSharedCloudflareBaseEmbedUrl,
  resolvePlayableVideoUrl,
} from '../../../components/video-playback';
import { NxtVideoControlsComponent } from '../../../components/video-controls';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtPlatformService } from '../../../services/platform';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtArchiveService, type ArchiveDownloadEntry } from '../../../services/archive';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXLibraryLoadingStateComponent } from './agent-x-library-loading-state.component';
import { AgentXViewerSurfaceComponent } from './agent-x-viewer-surface.component';
import { AGENT_X_AUTH_TOKEN_FACTORY } from '../../services/agent-x-job.service';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import {
  AgentXVideoUploadService,
  VIDEO_UPLOAD_CANCELLED_MESSAGE,
  type VideoUploadHandle,
  type VideoUploadProgress,
} from '../../services/agent-x-video-upload.service';
import { AgentXService } from '../../services/agent-x.service';
import { getAgentXReleaseLabel } from '../../utils/agent-x-release-stage.utils';

type FilmListReview = {
  id: string;
  teamId?: string;
  organizationId?: string;
  createdBy?: string;
  title?: string;
  playlistName?: string | null;
  opponentName?: string | null;
  playlistId?: string | null;
  sport?: string;
  gameDate?: string;
  videoUrl?: string;
  storagePath?: string;
  cloudflareVideoId?: string;
  cloudflareStatus?: string;
  readyToStream?: boolean;
  thumbnailUrl?: string;
  durationSec?: number;
  uploadMode?: 'single_video' | 'batch_clips' | 'full_footage';
  sources?: readonly TeamFilmReviewSourceVideo[];
  downloadPrewarm?: {
    readonly status?: string;
    readonly mp4Url?: string;
  };
  downloadExport?: TeamFilmReviewDownloadExport;
  readAccessKeys?: readonly string[];
  writeAccessKeys?: readonly string[];
};

const FILM_REVIEW_DOWNLOAD_EXPORT_POLL_INTERVAL_MS = 4000;
const FILM_REVIEW_DOWNLOAD_EXPORT_MAX_POLLS = 30;

type FilmReviewPlaybackSource = Pick<
  TeamFilmReviewSourceVideo,
  | 'id'
  | 'title'
  | 'videoUrl'
  | 'downloadUrl'
  | 'storagePath'
  | 'cloudflareVideoId'
  | 'cloudflareStatus'
  | 'readyToStream'
  | 'thumbnailUrl'
  | 'durationSec'
  | 'cameraAngle'
  | 'angleGroupId'
  | 'angleDetectionSource'
>;

type FilmReviewCameraAngleOption = {
  readonly value: TeamFilmReviewCameraAngle;
  readonly label: string;
  readonly sourceCount: number;
};

type PersistedDrawPlayAnnotation = Exclude<TeamFilmReviewPlayAnnotation, { kind: 'text' }>;
type PersistedTextPlayAnnotation = Extract<TeamFilmReviewPlayAnnotation, { kind: 'text' }>;

type FilmTimelinePlay = TeamFilmReviewPlaySegment;

type FilmReviewDragSource = FilmListReview & {
  readonly teamId?: string;
  readonly timelineState?: TeamFilmReviewTimelineState;
  readonly timeline?: readonly FilmTimelinePlay[];
  readonly aiSummary?: string;
  readonly keyInsights?: readonly string[];
  readonly breakdownSource?: {
    readonly provider: 'hudl' | 'csv' | 'manual_import';
    readonly fileName: string;
    readonly sheetName?: string;
    readonly rowCount: number;
    readonly playCount: number;
  };
};

type FilmReviewPlaylistFolder = {
  readonly id: string;
  readonly name: string;
  readonly reviews: readonly FilmListReview[];
  readonly isUnassigned?: boolean;
  readonly createdBy?: string;
  readonly teamId?: string;
  readonly writeAccessKeys?: readonly string[];
  readonly parentId?: string | null;
  readonly depth: number;
};

type FilmReviewPlaylistFolderTreeNode = FilmReviewPlaylistFolder & {
  readonly children: readonly FilmReviewPlaylistFolderTreeNode[];
};

type BatchClipDownloadItem = {
  readonly playIds: readonly string[];
  readonly label: string;
  readonly downloadUrl: string;
  readonly fileName: string;
};

type FilmReviewOrderByFolder = Record<string, readonly string[]>;

type LocalFilmReviewPlaylistFolder = {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
};

type FilmReviewUploadMenuAnchor = 'empty-new' | 'empty-import' | 'library-header';
type FilmReviewUploadSelectionMode = 'batch' | 'full';

type FilmReviewAskAgentPromptId =
  | 'update-breakdown'
  | 'top-fixes'
  | 'situational-scenarios'
  | 'scout-report'
  | 'suggest-plays'
  | 'player-stats'
  | 'coaching-points'
  | 'analyze-breakdown'
  | 'variations'
  | 'callsheet'
  | 'game-plan'
  | 'tag-every-play'
  | 'find-explosive-plays'
  | 'find-turnovers'
  | 'find-red-zone-plays'
  | 'find-third-down-plays'
  | 'keys-to-win'
  | 'matchups'
  | 'opponent-tendencies'
  | 'adjustment-plan';

type FilmReviewLibraryAskAgentPromptId =
  | 'create-cutup-folder'
  | 'create-game-highlight'
  | 'compare-film'
  | 'full-report'
  | 'self-scout-cutup';

type FilmReviewAskAgentPromptOption = {
  readonly id: FilmReviewAskAgentPromptId;
  readonly label: string;
  readonly hint: string;
};

type FilmReviewAskAgentPromptSection = {
  readonly title: string;
  readonly options: readonly FilmReviewAskAgentPromptOption[];
};

type FilmReviewLibraryAskAgentPromptOption = {
  readonly id: FilmReviewLibraryAskAgentPromptId;
  readonly label: string;
  readonly hint: string;
};

const FILM_REVIEW_UNASSIGNED_PLAYLIST_ID = 'unassigned-film';
const FILM_REVIEW_PLAYLIST_DRAG_MIME = 'application/x-nxt1-film-review-id';
const FILM_REVIEW_PLAYLIST_FOLDER_DRAG_MIME = 'application/x-nxt1-film-playlist-folder-id';
const FILM_REVIEW_TIMELINE_DRAG_MIME = 'application/x-nxt1-film-timeline-index';
const FILM_REVIEW_TIMELINE_COLUMN_DRAG_MIME = 'application/x-nxt1-film-timeline-column-id';
const FILM_REVIEW_STARTER_PLAYLIST_NAMES = ['Self Scout Folder', 'Opponent Folder'] as const;
const FILM_REVIEW_PLAYLIST_STORAGE_PREFIX = 'agent-x-film-playlists';
const FILM_REVIEW_VIDEO_ORDER_STORAGE_PREFIX = 'agent-x-film-video-order';
const FILM_REVIEW_COLUMN_ORDER_STORAGE_PREFIX = 'agent-x-film-timeline-columns';
const FILM_REVIEW_POPOUT_STORAGE_PREFIX = 'nxt1-film-review-popout:';
const FILM_REVIEW_LIST_INITIAL_LIMIT = 20;
const FILM_REVIEW_LIST_LIMIT_STEP = 20;
const FILM_REVIEW_ASK_AGENT_PROMPT_SECTIONS_COACH: readonly FilmReviewAskAgentPromptSection[] = [
  {
    title: 'Breakdown',
    options: [
      {
        id: 'update-breakdown',
        label: 'Generate Breakdown',
        hint: 'Break down this film and tag every play.',
      },
      {
        id: 'analyze-breakdown',
        label: 'Analyze Breakdown',
        hint: 'Analyze this breakdown and identify the biggest trends and tendencies.',
      },
      {
        id: 'situational-scenarios',
        label: 'Situation & Scenario',
        hint: 'Organize these plays by game situation and scenario.',
      },
      {
        id: 'tag-every-play',
        label: 'Tag Every Play',
        hint: 'Automatically tag every play in this film.',
      },
      {
        id: 'find-explosive-plays',
        label: 'Find Explosive Plays',
        hint: 'Find every explosive or game-changing play.',
      },
      {
        id: 'find-turnovers',
        label: 'Find Turnovers',
        hint: 'Pull every turnover and major mistake.',
      },
      {
        id: 'find-red-zone-plays',
        label: 'Find Red Zone Plays',
        hint: 'Show every red zone play.',
      },
      {
        id: 'find-third-down-plays',
        label: 'Find Third Down Plays',
        hint: 'Pull every third-down situation.',
      },
    ],
  },
  {
    title: 'Game Planning',
    options: [
      {
        id: 'scout-report',
        label: 'Full Scout Report',
        hint: 'Build a complete scouting report from this film.',
      },
      {
        id: 'game-plan',
        label: 'Game Plan',
        hint: "Create a game plan based on this opponent's tendencies.",
      },
      {
        id: 'keys-to-win',
        label: 'Keys to Win',
        hint: 'Identify the biggest keys to winning this matchup.',
      },
      {
        id: 'matchups',
        label: 'Matchups',
        hint: 'Identify our best and worst matchups.',
      },
      {
        id: 'opponent-tendencies',
        label: 'Opponent Tendencies',
        hint: "Identify this opponent's tendencies by situation.",
      },
      {
        id: 'adjustment-plan',
        label: 'Adjustment Plan',
        hint: 'Recommend adjustments based on what this film shows.',
      },
    ],
  },
  {
    title: 'Calls',
    options: [
      {
        id: 'suggest-plays',
        label: 'Suggest Plays',
        hint: 'Recommend the best plays to attack what you see.',
      },
      {
        id: 'callsheet',
        label: 'Callsheet',
        hint: 'Build a situational callsheet from this film.',
      },
      {
        id: 'variations',
        label: 'Variations',
        hint: 'Suggest complementary plays and counters off our base concepts.',
      },
    ],
  },
  {
    title: 'Coaching',
    options: [
      {
        id: 'player-stats',
        label: 'Pull Player Stats',
        hint: 'Generate player performance stats from this film.',
      },
      {
        id: 'top-fixes',
        label: 'Top Fixes',
        hint: 'Identify the biggest mistakes we need to fix.',
      },
      {
        id: 'coaching-points',
        label: 'Coaching Points',
        hint: 'Generate coaching points for players and position groups.',
      },
    ],
  },
] as const;

const FILM_REVIEW_ASK_AGENT_PROMPT_SECTIONS_ATHLETE: readonly FilmReviewAskAgentPromptSection[] = [
  {
    title: 'Breakdown Analysis',
    options: [
      {
        id: 'analyze-breakdown',
        label: 'Analyze Breakdown',
        hint: 'Spot your trends, strengths, and recurring issues quickly.',
      },
      {
        id: 'situational-scenarios',
        label: 'Situation and Scenario',
        hint: 'Break reps into scenarios and what your best response should be.',
      },
    ],
  },
  {
    title: 'Performance Review',
    options: [
      {
        id: 'player-stats',
        label: 'Pull Player Stats',
        hint: 'Generate personal impact and consistency stats from selected clips.',
      },
      {
        id: 'top-fixes',
        label: 'Top Fixes',
        hint: 'Prioritize the most important corrections for next session.',
      },
      {
        id: 'coaching-points',
        label: 'Coaching Points',
        hint: 'Get concise coaching points and correction cues you can execute now.',
      },
    ],
  },
  {
    title: 'Opponent Analysis',
    options: [
      {
        id: 'scout-report',
        label: 'Full Scout Report',
        hint: 'Summarize opponent tendencies and where you can win reps.',
      },
    ],
  },
] as const;

const FILM_REVIEW_LIBRARY_ASK_AGENT_PROMPTS: readonly FilmReviewLibraryAskAgentPromptOption[] = [
  {
    id: 'create-cutup-folder',
    label: 'Create Cutup Folder',
    hint: 'Group selected items into coach-ready cutups.',
  },
  {
    id: 'create-game-highlight',
    label: 'Create Game Highlight',
    hint: 'Build a highlight sequence from selected items.',
  },
  {
    id: 'compare-film',
    label: 'Compare Film',
    hint: 'Compare groups and identify what changed.',
  },
  {
    id: 'full-report',
    label: 'Full Report',
    hint: 'Generate a complete film report with priorities.',
  },
  {
    id: 'self-scout-cutup',
    label: 'Self Scout Cutup',
    hint: 'Build self-scout tendencies and corrections cutup.',
  },
] as const;

type TimelinePlayDropPlacement = 'before' | 'after';
type TimelineColumnDropPlacement = 'before' | 'after';

type TimelinePlayDropIndicator = {
  readonly index: number;
  readonly placement: TimelinePlayDropPlacement;
};

type TimelineColumnKind = 'number' | 'label' | 'tag' | 'startSec' | 'endSec' | 'durationSec';

type TimelineGridColumn = {
  readonly id: string;
  readonly kind: TimelineColumnKind;
  readonly label: string;
  readonly fieldKey: string;
  readonly width: TeamFilmReviewSportTagColumnWidth;
  readonly tagDefinition?: TeamFilmReviewSportTagDefinition;
};

type TimelineColumnFilterMode = 'include' | 'exclude';

type TimelineColumnFilter = {
  readonly mode: TimelineColumnFilterMode;
  readonly value: string;
};

type TimelineFilteredPlayRow = {
  readonly play: FilmTimelinePlay;
  readonly originalIndex: number;
};

type TimelineColumnFilterChip = {
  readonly columnId: string;
  readonly columnLabel: string;
  readonly mode: TimelineColumnFilterMode;
  readonly value: string;
};

type TimelineColumnDropIndicator = {
  readonly columnId: string;
  readonly placement: TimelineColumnDropPlacement;
};

type DrawEffectMarker = {
  readonly id: string;
  readonly atSec: number;
  readonly durationSec: number;
};

type DrawAnnotationPoint = {
  x: number;
  y: number;
};

type DrawAnnotationBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type DrawAnnotationKind = 'freehand' | 'square' | 'circle' | 'text';

type EditableDrawAnnotation =
  | {
      kind: 'freehand';
      bounds: DrawAnnotationBounds;
      strokes: Array<Array<DrawAnnotationPoint>>;
    }
  | {
      kind: 'square' | 'circle';
      bounds: DrawAnnotationBounds;
    }
  | {
      kind: 'text';
      bounds: DrawAnnotationBounds;
      text: string;
    };

type DrawResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

type DrawHitTarget =
  | { kind: 'none' }
  | { kind: 'body' }
  | { kind: 'handle'; handle: DrawResizeHandle };

type DrawInteractionState =
  | { mode: 'draw-freehand'; pointerId: number }
  | {
      mode: 'draw-shape';
      pointerId: number;
      anchor: DrawAnnotationPoint;
      kind: 'square' | 'circle';
    }
  | {
      mode: 'move';
      pointerId: number;
      startPoint: DrawAnnotationPoint;
      origin: EditableDrawAnnotation;
    }
  | {
      mode: 'resize';
      pointerId: number;
      startPoint: DrawAnnotationPoint;
      origin: EditableDrawAnnotation;
      handle: DrawResizeHandle;
    };

@Component({
  selector: 'nxt1-agent-x-film-review-panel',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    OverlayModule,
    FormsModule,
    NxtIconComponent,
    NxtStateViewComponent,
    NxtVideoControlsComponent,
    AgentXContextDragDirective,
    AgentXLibraryLoadingStateComponent,
    AgentXViewerSurfaceComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="film-review-panel"
      [class.film-review-panel--video-view]="detailOnly || isVideoView()"
      [attr.data-testid]="testIds.PANEL_CONTAINER"
    >
      <input
        #videoUploadInput
        type="file"
        class="film-library-file-input"
        [accept]="acceptedLibraryUploadTypes"
        [attr.data-testid]="testIds.UPLOAD_INPUT"
        (change)="onVideoFilesSelected($event)"
      />
      <input
        #breakdownUploadInput
        type="file"
        class="film-library-file-input"
        [accept]="acceptedBreakdownTypes"
        (change)="onBreakdownFileSelected($event)"
      />

      @if (!teamId?.trim() && !detailOnly) {
        <div class="film-state" [attr.data-testid]="testIds.EMPTY_STATE">
          @if (isAthleteWithoutTeamContext()) {
            <h3>Your athlete film review lives in chat threads</h3>
            <p>
              Upload film in the Agent X chat composer to review your own clips. This side panel is
              the team film board, so it only loads when a team context is connected.
            </p>
          } @else {
            <h3>Film Review requires a team context</h3>
            <p>Connect a team in Agent X to load game film and AI breakdowns.</p>
          }
        </div>
      } @else if (loading()) {
        <nxt1-agent-x-library-loading-state [testId]="testIds.LOADING_SKELETON" />
      } @else if (error()) {
        <nxt1-state-view
          variant="error"
          title="Could not load film reviews"
          [message]="error() ?? 'Unable to load film reviews'"
          actionLabel="Try Again"
          actionIcon="refresh"
          [attr.data-testid]="testIds.ERROR_STATE"
          (action)="retryLoad()"
        />
      } @else {
        @if (selectedReview(); as review) {
          @let canWriteSelectedReview = hasReviewWriteAccess(review);
          <nxt1-agent-x-viewer-surface class="film-detail">
            <div
              viewer-stage
              class="film-player-wrapper"
              #playerContainer
              [nxtAgentXContextDrag]="buildFilmReviewDragContextsForLibrary(review)"
              [nxtAgentXContextDragDisabled]="drawModeEnabled() || isSeekDragLockActive()"
              tabindex="0"
              role="group"
              aria-label="Film review video player"
              aria-keyshortcuts="Space K ArrowLeft ArrowRight Home End F"
              (keydown)="onPlayerWrapperKeydown($event)"
            >
              @if (isCloudflareReviewProcessing(review)) {
                <div class="film-player film-player--processing" aria-live="polite">
                  <div class="film-player-processing-card">
                    <span class="film-player-processing-card__eyebrow">Processing film</span>
                    <h3>Cloudflare is preparing playback</h3>
                    <p>{{ getCloudflareProcessingMessage(review) }}</p>
                  </div>
                </div>
              } @else if (resolveNativeVideoUrl(review); as nativeVideoUrl) {
                <video
                  #filmPlayer
                  class="film-player"
                  [attr.data-testid]="testIds.VIDEO_PLAYER"
                  [attr.data-video-src]="nativeVideoUrl"
                  crossorigin="anonymous"
                  playsinline
                  preload="auto"
                  (loadedmetadata)="onPlayerLoadedMetadata()"
                  (timeupdate)="onPlayerTimeUpdate()"
                  (play)="onPlayerPlay()"
                  (pause)="onPlayerPause()"
                  (ended)="onPlayerEnded()"
                  (seeking)="onPlayerSeeking()"
                  (seeked)="onPlayerSeeked()"
                  (error)="onPlayerError()"
                ></video>

                @if (nativePlayerLoading()) {
                  <div class="film-player-native-loading" aria-live="polite">
                    <span class="film-player-native-loading__label">Loading video...</span>
                  </div>
                }

                <canvas
                  #drawCanvas
                  class="film-draw-canvas"
                  [class.film-draw-canvas--active]="drawModeEnabled()"
                  (pointerdown)="onDrawPointerDown($event)"
                  (pointermove)="onDrawPointerMove($event)"
                  (pointerup)="onDrawPointerUp($event)"
                  (pointercancel)="onDrawPointerUp($event)"
                  aria-label="Coach drawing overlay"
                ></canvas>

                <div class="film-top-tools">
                  <div
                    class="film-top-tools__left"
                    [class.film-controls__cluster]="currentInlinePlayOverlayItems().length > 0"
                    [class.film-top-tools__left--collapsed]="!isInlinePlayOverlayExpanded()"
                    aria-label="Selected play details"
                  >
                    @if (currentInlinePlayOverlayItems().length) {
                      @if (isInlinePlayOverlayExpanded()) {
                        <div class="film-top-meta">
                          @if (currentInlinePlayOverlayCounter(); as counter) {
                            <div class="film-top-meta__counter">{{ counter }}</div>
                          }

                          <div class="film-top-meta__scroll">
                            @for (item of currentInlinePlayOverlayItems(); track item.label) {
                              <div class="film-top-meta__item">
                                <span class="film-top-meta__label">{{ item.label }}</span>
                                <span class="film-top-meta__value">{{ item.value }}</span>
                              </div>
                            }
                          </div>

                          <button
                            type="button"
                            class="film-top-meta__toggle"
                            (click)="toggleInlinePlayOverlay()"
                            [attr.aria-label]="
                              isInlinePlayOverlayExpanded()
                                ? 'Collapse selected play details'
                                : 'Expand selected play details'
                            "
                            [attr.aria-expanded]="isInlinePlayOverlayExpanded()"
                            [attr.title]="
                              isInlinePlayOverlayExpanded()
                                ? 'Collapse selected play details'
                                : 'Expand selected play details'
                            "
                          >
                            <svg
                              class="film-top-meta__toggle-icon"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                [attr.d]="
                                  isInlinePlayOverlayExpanded()
                                    ? inlinePlayOverlayCollapseIconPath
                                    : inlinePlayOverlayExpandIconPath
                                "
                              />
                            </svg>
                          </button>
                        </div>
                      } @else {
                        <button
                          type="button"
                          class="film-top-meta__toggle film-top-meta__toggle--collapsed"
                          (click)="toggleInlinePlayOverlay()"
                          aria-label="Expand selected play details"
                          aria-expanded="false"
                          title="Expand selected play details"
                        >
                          <svg
                            class="film-top-meta__toggle-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path [attr.d]="inlinePlayOverlayExpandIconPath" />
                          </svg>
                        </button>
                      }
                    }
                  </div>

                  @if (enableDrawTool) {
                    <div class="film-top-tools__right">
                      <div
                        class="film-draw-tools film-controls__cluster"
                        role="group"
                        aria-label="Video overlay tools"
                      >
                        <button
                          type="button"
                          class="film-icon-btn video-controls__tooltip-host"
                          [class.film-icon-btn--primary]="isDrawToolActive('freehand')"
                          (click)="onDrawToolToggle('freehand')"
                          [attr.title]="
                            isDrawToolActive('freehand') ? 'Turn off free draw' : 'Enable free draw'
                          "
                          [attr.data-tooltip]="
                            isDrawToolActive('freehand') ? 'Turn off free draw' : 'Enable free draw'
                          "
                          [attr.aria-label]="
                            isDrawToolActive('freehand') ? 'Disable free draw' : 'Enable free draw'
                          "
                        >
                          <nxt1-icon name="pencil" [size]="11"></nxt1-icon>
                        </button>
                        <button
                          type="button"
                          class="film-icon-btn video-controls__tooltip-host"
                          [class.film-icon-btn--primary]="isDrawToolActive('circle')"
                          (click)="onDrawToolToggle('circle')"
                          [attr.title]="
                            isDrawToolActive('circle')
                              ? 'Turn off circle tool'
                              : 'Enable circle tool'
                          "
                          [attr.data-tooltip]="
                            isDrawToolActive('circle')
                              ? 'Turn off circle tool'
                              : 'Enable circle tool'
                          "
                          [attr.aria-label]="
                            isDrawToolActive('circle')
                              ? 'Disable circle tool'
                              : 'Enable circle tool'
                          "
                        >
                          <svg
                            class="film-draw-tool-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          class="film-icon-btn video-controls__tooltip-host"
                          [class.film-icon-btn--primary]="isDrawToolActive('text')"
                          (click)="onDrawToolToggle('text')"
                          [attr.title]="
                            isDrawToolActive('text') ? 'Turn off text tool' : 'Enable text tool'
                          "
                          [attr.data-tooltip]="
                            isDrawToolActive('text') ? 'Turn off text tool' : 'Enable text tool'
                          "
                          [attr.aria-label]="
                            isDrawToolActive('text') ? 'Disable text tool' : 'Enable text tool'
                          "
                        >
                          <span class="film-draw-tool-label" aria-hidden="true">T</span>
                        </button>
                        @if (drawModeEnabled()) {
                          <button
                            type="button"
                            class="film-icon-btn film-top-tool-btn film-top-tool-btn--danger video-controls__tooltip-host"
                            [disabled]="!hasClearableDrawOverlay()"
                            (click)="clearDrawOverlay()"
                            title="Clear overlay effect"
                            data-tooltip="Clear overlay effect"
                            aria-label="Clear overlay effect"
                          >
                            <nxt1-icon name="trash" [size]="11" />
                          </button>
                        }
                      </div>
                    </div>
                  }
                  <!-- end @if (enableDrawTool) -->
                </div>

                <div class="film-controls-overlay" aria-label="Coach video controls">
                  <nxt1-video-controls
                    [isPlaying]="isPlaying()"
                    [currentTime]="playerCurrentTime()"
                    [duration]="playerDuration()"
                    [drawEffectMarkers]="drawEffectMarkers()"
                    [playbackRate]="playbackRate()"
                    [playbackRates]="playbackRates"
                    [showSpeedControls]="true"
                    [showFullscreen]="true"
                    [showOpenInNewWindow]="showOpenInNewWindow && !platform.isNative()"
                    [showPlayNavigation]="true"
                    [showAdvancedPlaybackControls]="true"
                    [showDurationBadge]="true"
                    [allowTransportCollapse]="true"
                    [frameStepSeconds]="filmFrameStepSeconds"
                    [disablePreviousNav]="currentFilteredPlayPosition() <= 1"
                    [disableNextNav]="
                      filteredTimelineCount() <= 1 ||
                      currentFilteredPlayPosition() >= filteredTimelineCount()
                    "
                    (previousNav)="goToPreviousPlay()"
                    (seekRelative)="seekRelative($event)"
                    (playPause)="togglePlayPause()"
                    (nextNav)="goToNextPlay()"
                    (seekStart)="onSeekPointerDown()"
                    (seekEnd)="onSeekPointerUp()"
                    (seekChange)="onSeekTime($event)"
                    (drawEffectDurationChange)="onDrawEffectDurationChange($event)"
                    (deleteDrawEffectMarker)="onDeleteDrawEffectMarker($event)"
                    (playbackRateChange)="setPlaybackRate($event)"
                    (openInNewWindow)="openVideoInNewWindow()"
                    (fullscreenToggle)="toggleFullscreen()"
                  >
                    <div
                      nxtVideoControlsBeforeSpeed
                      class="film-angle-menu"
                      role="group"
                      aria-label="Camera angle"
                    >
                      <button
                        type="button"
                        class="film-angle-trigger video-controls__tooltip-host"
                        [class.film-angle-trigger--open]="cameraAngleMenuOpen()"
                        [attr.aria-expanded]="cameraAngleMenuOpen()"
                        aria-haspopup="menu"
                        aria-label="Camera angle"
                        title="Camera angle"
                        data-tooltip="Camera angle"
                        (click)="toggleCameraAngleMenu($event)"
                      >
                        <span class="film-angle-trigger__label">{{
                          selectedCameraAngleLabel()
                        }}</span>
                        <nxt1-icon name="chevronDown" [size]="10"></nxt1-icon>
                      </button>

                      @if (cameraAngleMenuOpen()) {
                        <div
                          class="film-angle-popover"
                          role="menu"
                          aria-label="Camera angle options"
                        >
                          @for (option of availableCameraAngleOptions(); track option.value) {
                            <button
                              type="button"
                              class="film-angle-option"
                              [class.film-angle-option--active]="
                                isCameraAngleOptionActive(option.value)
                              "
                              role="menuitemradio"
                              [attr.aria-checked]="isCameraAngleOptionActive(option.value)"
                              (click)="onSelectCameraAngle(option.value)"
                            >
                              <span>{{ option.label }}</span>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  </nxt1-video-controls>
                </div>
              } @else if (resolveCloudflareEmbedUrl(review); as cloudflareEmbedUrl) {
                <div
                  class="film-player film-player--cloudflare-shell"
                  [class.film-player--cloudflare-loading]="cloudflareIframeLoading()"
                >
                  <iframe
                    class="film-player__iframe"
                    [src]="getSafeIframeUrl(cloudflareEmbedUrl)"
                    title="Film review video playback"
                    loading="lazy"
                    frameborder="0"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen
                    (load)="onCloudflareIframeLoaded()"
                  ></iframe>
                  @if (cloudflareIframeLoading()) {
                    <div class="film-player-iframe-loading" aria-hidden="true"></div>
                  }
                </div>
              } @else {
                <div class="film-player film-player--processing" aria-live="polite">
                  <div class="film-player-processing-card">
                    <span class="film-player-processing-card__eyebrow">Video unavailable</span>
                    <h3>This film source cannot be played yet</h3>
                    <p>Try again once the upload finishes processing.</p>
                  </div>
                </div>
              }
            </div>

            @if (isTextEffectPanelVisible()) {
              <textarea
                viewer-context
                #textEffectInput
                class="film-text-effect-input"
                [ngModel]="currentTextEffectText()"
                (ngModelChange)="onTextEffectTextChange($event)"
                placeholder="Type text here"
                spellcheck="false"
                rows="1"
                aria-label="Text effect"
                aria-live="polite"
              ></textarea>
            }

            <div viewer-context class="film-playbook">
              @if (currentTimeline().length > 0) {
                <div class="film-playbook-toolbar">
                  <div class="film-playbook-ask-agent">
                    <button
                      type="button"
                      class="film-playbook-nav-btn film-playbook-nav-btn--attach"
                      cdkOverlayOrigin
                      #askAgentMenuOrigin="cdkOverlayOrigin"
                      [attr.data-testid]="attachBreakdownContextTestId"
                      [attr.aria-expanded]="isAskAgentMenuOpen(review.id)"
                      [attr.aria-label]="askAgentButtonAriaLabel()"
                      aria-haspopup="menu"
                      (click)="onToggleAskAgentMenu(review, $event)"
                    >
                      <svg
                        class="film-playbook-ask-agent__logo"
                        viewBox="0 0 612 792"
                        fill="currentColor"
                        stroke="currentColor"
                        stroke-width="10"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path [attr.d]="agentXLogoPath" />
                        <polygon [attr.points]="agentXLogoPolygon" />
                      </svg>
                      <span>Ask Agent</span>
                      @if (selectedFilteredTimelineRowCount() > 0) {
                        <span class="film-playbook-ask-agent__count">
                          {{ selectedFilteredTimelineRowCount() }}
                        </span>
                      }
                      <svg
                        class="film-playbook-ask-agent__caret"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 4.5 6 7.5l3-3" />
                      </svg>
                    </button>

                    @if (isAskAgentMenuOpen(review.id)) {
                      <ng-template
                        cdkConnectedOverlay
                        [cdkConnectedOverlayOrigin]="askAgentMenuOrigin"
                        [cdkConnectedOverlayOpen]="true"
                        [cdkConnectedOverlayHasBackdrop]="true"
                        cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                        [cdkConnectedOverlayPositions]="timelineColumnMenuPositions"
                        [cdkConnectedOverlayPush]="true"
                        [cdkConnectedOverlayViewportMargin]="8"
                        (backdropClick)="onCloseAskAgentMenu($event)"
                        (detach)="onCloseAskAgentMenu()"
                      >
                        <div
                          class="film-playbook-ask-agent-menu film-playbook-ask-agent-menu--prompts"
                          role="menu"
                          [attr.data-testid]="askAgentPromptMenuTestId"
                        >
                          @if (selectedFilteredTimelineRowCount() <= 0) {
                            <p class="film-playbook-ask-agent-menu__empty">
                              Select one or more clips to ask Agent.
                            </p>
                          }
                          @for (section of askAgentPromptSections(); track section.title) {
                            <div class="film-playbook-ask-agent-menu__section">
                              <p class="film-playbook-ask-agent-menu__section-title">
                                {{ section.title }}
                              </p>
                              <div class="film-playbook-ask-agent-menu__section-options">
                                @for (option of section.options; track option.id) {
                                  <button
                                    type="button"
                                    class="film-playbook-ask-agent-menu__option"
                                    role="menuitem"
                                    [disabled]="selectedFilteredTimelineRowCount() <= 0"
                                    [attr.data-testid]="
                                      askAgentPromptOptionTestIdPrefix + option.id
                                    "
                                    (click)="onAskAgentPromptSelect(review, option.id, $event)"
                                  >
                                    <span class="film-playbook-ask-agent-menu__label">
                                      {{ option.label }}
                                    </span>
                                    <span class="film-playbook-ask-agent-menu__hint">
                                      {{ option.hint }}
                                    </span>
                                  </button>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      </ng-template>
                    }
                  </div>

                  <div class="film-playbook-ask-agent">
                    <button
                      type="button"
                      class="film-playbook-nav-btn"
                      cdkOverlayOrigin
                      #downloadMenuOrigin="cdkOverlayOrigin"
                      [attr.data-testid]="downloadMenuButtonTestId"
                      [attr.aria-expanded]="isDownloadMenuOpen(review.id)"
                      aria-label="Download film review assets"
                      aria-haspopup="menu"
                      (click)="onToggleDownloadMenu(review, $event)"
                    >
                      <svg
                        class="film-playbook-ask-agent__caret film-playbook-download__icon"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 1.75v5.5" />
                        <path d="M3.75 5.5 6 7.75 8.25 5.5" />
                        <path d="M2 9.75h8" />
                      </svg>
                      <span>Options</span>
                      <svg
                        class="film-playbook-ask-agent__caret"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 4.5 6 7.5l3-3" />
                      </svg>
                    </button>

                    @if (isDownloadMenuOpen(review.id)) {
                      <ng-template
                        cdkConnectedOverlay
                        [cdkConnectedOverlayOrigin]="downloadMenuOrigin"
                        [cdkConnectedOverlayOpen]="true"
                        [cdkConnectedOverlayHasBackdrop]="true"
                        cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                        [cdkConnectedOverlayPositions]="timelineColumnMenuPositions"
                        [cdkConnectedOverlayPush]="true"
                        [cdkConnectedOverlayViewportMargin]="8"
                        (backdropClick)="onCloseDownloadMenu($event)"
                        (detach)="onCloseDownloadMenu()"
                      >
                        <div
                          class="film-playbook-ask-agent-menu"
                          role="menu"
                          [attr.data-testid]="downloadMenuTestId"
                        >
                          <button
                            type="button"
                            class="film-playbook-ask-agent-menu__option"
                            role="menuitem"
                            [disabled]="
                              saving() || isImportingBreakdown() || !canWriteSelectedReview
                            "
                            [attr.data-testid]="testIds.BREAKDOWN_IMPORT_BUTTON"
                            (click)="onChooseBreakdownClick()"
                          >
                            <span class="film-playbook-ask-agent-menu__label">
                              @if (isImportingBreakdown()) {
                                Importing Breakdown...
                              } @else {
                                Import Breakdown
                              }
                            </span>
                            <span class="film-playbook-ask-agent-menu__hint">
                              Upload CSV, Excel, or Hudl spreadsheet
                            </span>
                          </button>
                          <button
                            type="button"
                            class="film-playbook-ask-agent-menu__option"
                            role="menuitem"
                            [disabled]="!canDownloadReviewVideo(review)"
                            [attr.data-testid]="downloadVideoOptionTestId"
                            (click)="onDownloadVideo(review, $event)"
                          >
                            <span class="film-playbook-ask-agent-menu__label">
                              {{ getDownloadVideoOptionLabel(review) }}
                            </span>
                            <span class="film-playbook-ask-agent-menu__hint">
                              {{ getDownloadVideoOptionHint(review) }}
                            </span>
                          </button>
                          <button
                            type="button"
                            class="film-playbook-ask-agent-menu__option"
                            role="menuitem"
                            [attr.data-testid]="downloadBreakdownOptionTestId"
                            (click)="onDownloadBreakdownCsv(review, $event)"
                          >
                            <span class="film-playbook-ask-agent-menu__label">
                              {{ getCsvDownloadOptionLabel(review) }}
                            </span>
                            <span class="film-playbook-ask-agent-menu__hint">
                              {{ getCsvDownloadOptionHint(review) }}
                            </span>
                          </button>
                        </div>
                      </ng-template>
                    }
                  </div>

                  <button
                    type="button"
                    class="film-playbook-nav-btn"
                    [disabled]="currentFilteredPlayPosition() <= 1"
                    [attr.data-testid]="testIds.TIMELINE_PLAY_NAV_PREV"
                    (click)="goToPreviousPlay()"
                  >
                    ← Prev
                  </button>

                  <div class="film-playbook-current" aria-live="polite">
                    <span class="film-playbook-summary">
                      Play {{ currentFilteredPlayPosition() }} of {{ filteredTimelineCount() }}
                    </span>
                    @if (currentPlay(); as play) {
                      <span class="film-playbook-active-play">
                        {{ play.label }} ({{ formatTime(play.startSec) }} -
                        {{ formatTime(play.endSec) }})
                      </span>
                    }
                  </div>

                  <button
                    type="button"
                    class="film-playbook-nav-btn"
                    [disabled]="
                      filteredTimelineRows().length < 2 ||
                      currentPlayIndex() ===
                        filteredTimelineRows()[filteredTimelineRows().length - 1]?.originalIndex
                    "
                    [attr.data-testid]="testIds.TIMELINE_PLAY_NAV_NEXT"
                    (click)="goToNextPlay()"
                  >
                    Next →
                  </button>
                </div>

                @if (activeTimelineFilterChips().length > 0) {
                  <div
                    class="film-playbook-filter-chips"
                    [attr.data-testid]="testIds.TIMELINE_FILTER_CHIPS"
                  >
                    @for (chip of activeTimelineFilterChips(); track chip.columnId) {
                      <button
                        type="button"
                        class="film-playbook-filter-chip"
                        [class.film-playbook-filter-chip--exclude]="chip.mode === 'exclude'"
                        [attr.data-testid]="testIds.TIMELINE_FILTER_CHIP"
                        [attr.aria-label]="'Clear ' + chip.columnLabel + ' filter'"
                        (click)="onRemoveTimelineColumnFilter(chip.columnId, $event)"
                      >
                        <span class="film-playbook-filter-chip__label">{{ chip.columnLabel }}</span>
                        <span class="film-playbook-filter-chip__operator">
                          {{ chip.mode === 'include' ? '=' : '≠' }}
                        </span>
                        <span class="film-playbook-filter-chip__value">{{ chip.value }}</span>
                        <span class="film-playbook-filter-chip__close" aria-hidden="true">✕</span>
                      </button>
                    }
                    <button
                      type="button"
                      class="film-playbook-filter-clear"
                      [attr.data-testid]="testIds.TIMELINE_FILTER_CLEAR_ALL"
                      (click)="onClearAllTimelineColumnFilters($event)"
                    >
                      Clear filters
                    </button>
                  </div>
                }

                <div
                  class="film-playbook-table"
                  role="table"
                  aria-label="Tagged plays"
                  [style.--film-playbook-grid-columns]="currentTimelineGridTemplate()"
                >
                  <div class="film-playbook-scroll">
                    <div
                      class="film-playbook-head"
                      role="row"
                      cdkDropList
                      cdkDropListOrientation="horizontal"
                      [cdkDropListData]="currentTimelineColumns()"
                      [cdkDropListDisabled]="
                        saving() || hasActiveTimelineFilters() || !canWriteSelectedReview
                      "
                      (cdkDropListDropped)="onTimelineColumnDropSmooth($event)"
                    >
                      <span class="film-playbook-head__selection">
                        <input
                          type="checkbox"
                          class="film-playbook-checkbox"
                          [checked]="areAllFilteredTimelineRowsSelected()"
                          [indeterminate]="isSomeFilteredTimelineRowsSelected()"
                          [disabled]="filteredTimelineRows().length === 0"
                          [attr.data-testid]="timelineSelectAllCheckboxTestId"
                          aria-label="Select all visible clips"
                          (click)="$event.stopPropagation()"
                          (keydown)="$event.stopPropagation()"
                          (change)="onToggleAllTimelinePlaySelections($event)"
                        />
                      </span>
                      @for (column of currentTimelineColumns(); track column.id) {
                        <div
                          class="film-playbook-column-header-wrap"
                          cdkDrag
                          [cdkDragData]="column.id"
                          cdkDragPreviewContainer="parent"
                          [cdkDragDisabled]="
                            saving() || hasActiveTimelineFilters() || !canWriteSelectedReview
                          "
                          [class.film-playbook-column-header-wrap--dragging]="
                            column.id === draggingTimelineColumnId()
                          "
                          (cdkDragStarted)="onTimelineColumnDragStartSmooth(column.id)"
                          (cdkDragEnded)="onTimelineColumnDragEndSmooth()"
                        >
                          <button
                            type="button"
                            class="film-playbook-column-header"
                            cdkDragHandle
                            [class.film-playbook-column-header--dragging]="
                              column.id === draggingTimelineColumnId()
                            "
                            [class.film-playbook-column-header--drop-before]="
                              isTimelineColumnDropIndicator(column.id, 'before')
                            "
                            [class.film-playbook-column-header--drop-after]="
                              isTimelineColumnDropIndicator(column.id, 'after')
                            "
                            [attr.data-testid]="
                              column.kind === 'tag'
                                ? testIds.TIMELINE_TAG_COLUMN
                                : testIds.TIMELINE_COLUMN_REORDER_HANDLE
                            "
                            [attr.aria-label]="'Move ' + column.label + ' column'"
                            (click)="$event.stopPropagation()"
                            (keydown)="$event.stopPropagation()"
                          >
                            <span>{{ column.label }}</span>
                          </button>

                          <button
                            type="button"
                            class="film-playbook-column-menu-btn"
                            cdkOverlayOrigin
                            #columnMenuOrigin="cdkOverlayOrigin"
                            [class.film-playbook-column-menu-btn--active]="
                              hasTimelineColumnFilter(column.id)
                            "
                            [attr.data-testid]="testIds.TIMELINE_COLUMN_FILTER_MENU"
                            [attr.aria-expanded]="isTimelineColumnMenuOpen(column.id)"
                            [attr.aria-label]="'Filter ' + column.label"
                            (click)="onOpenTimelineColumnMenu(column.id, $event)"
                          >
                            <nxt1-icon name="moreHorizontal" [size]="12"></nxt1-icon>
                          </button>

                          @if (isTimelineColumnMenuOpen(column.id)) {
                            <ng-template
                              cdkConnectedOverlay
                              [cdkConnectedOverlayOrigin]="columnMenuOrigin"
                              [cdkConnectedOverlayOpen]="true"
                              [cdkConnectedOverlayHasBackdrop]="true"
                              cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                              [cdkConnectedOverlayPositions]="timelineColumnMenuPositions"
                              [cdkConnectedOverlayPush]="true"
                              [cdkConnectedOverlayViewportMargin]="8"
                              (backdropClick)="onCloseTimelineColumnMenu($event)"
                              (detach)="onCloseTimelineColumnMenu()"
                            >
                              <div
                                class="film-playbook-column-menu"
                                role="menu"
                                [attr.data-testid]="testIds.TIMELINE_COLUMN_FILTER_OPTIONS"
                              >
                                @if (getTimelineColumnFilterOptions(column); as options) {
                                  @if (options.length > 0) {
                                    @for (option of options; track option.normalizedValue) {
                                      <div class="film-playbook-column-menu__option-row">
                                        <button
                                          type="button"
                                          class="film-playbook-column-menu__option"
                                          [attr.data-testid]="
                                            testIds.TIMELINE_COLUMN_FILTER_INCLUDE
                                          "
                                          (click)="
                                            onApplyTimelineColumnFilter(
                                              column,
                                              'include',
                                              option.value,
                                              $event
                                            )
                                          "
                                        >
                                          {{ option.value }}
                                          <span class="film-playbook-column-menu__count"
                                            >({{ option.count }})</span
                                          >
                                        </button>
                                      </div>
                                    }
                                  } @else {
                                    <div class="film-playbook-column-menu__empty">
                                      No options available
                                    </div>
                                  }
                                }

                                @if (
                                  hasTimelineColumnFilter(column.id) || hasActiveTimelineFilters()
                                ) {
                                  <div class="film-playbook-column-menu__actions">
                                    @if (hasTimelineColumnFilter(column.id)) {
                                      <button
                                        type="button"
                                        class="film-playbook-column-menu__clear"
                                        [attr.data-testid]="testIds.TIMELINE_COLUMN_FILTER_CLEAR"
                                        (click)="onClearTimelineColumnFilter(column.id, $event)"
                                      >
                                        Clear {{ column.label }}
                                      </button>
                                    }
                                    @if (hasActiveTimelineFilters()) {
                                      <button
                                        type="button"
                                        class="film-playbook-column-menu__clear"
                                        (click)="onClearAllTimelineColumnFilters($event)"
                                      >
                                        Clear all
                                      </button>
                                    }
                                  </div>
                                }
                              </div>
                            </ng-template>
                          }
                        </div>
                      }
                    </div>

                    <div class="film-playbook-body">
                      @if (filteredTimelineRows().length === 0) {
                        <div
                          class="film-playbook-empty-filtered"
                          [attr.data-testid]="testIds.TIMELINE_FILTER_EMPTY_STATE"
                        >
                          <p>No plays match the active filters.</p>
                          <button type="button" (click)="onClearAllTimelineColumnFilters($event)">
                            Clear filters
                          </button>
                        </div>
                      }
                      @for (row of filteredTimelineRows(); track row.play.id; let idx = $index) {
                        <div
                          class="film-playbook-row"
                          role="row"
                          [class.film-playbook-row--active]="
                            row.originalIndex === currentPlayIndex()
                          "
                          [class.film-playbook-row--selected]="
                            isTimelinePlaySelected(row.play, row.originalIndex)
                          "
                          [class.film-playbook-row--editing]="
                            isEditingTimelinePlay(row.play, row.originalIndex)
                          "
                          [class.film-playbook-row--dragging]="
                            row.originalIndex === draggingTimelinePlayIndex()
                          "
                          [class.film-playbook-row--drop-before]="
                            isTimelinePlayDropIndicator(row.originalIndex, 'before')
                          "
                          [class.film-playbook-row--drop-after]="
                            isTimelinePlayDropIndicator(row.originalIndex, 'after')
                          "
                          [nxtAgentXContextDrag]="
                            isEditingTimelinePlay(row.play, row.originalIndex)
                              ? null
                              : buildTimelinePlayRowDragContext(review, row.play, row.originalIndex)
                          "
                          [nxtAgentXContextDragDisabled]="isTimelinePlayReorderActive()"
                          [attr.tabindex]="
                            isEditingTimelinePlay(row.play, row.originalIndex) ? -1 : 0
                          "
                          (click)="onSelectTimelinePlay(row.play, row.originalIndex)"
                          (keydown.enter)="
                            onTimelinePlayRowKeydown($event, row.play, row.originalIndex)
                          "
                          (keydown.space)="
                            onTimelinePlayRowKeydown($event, row.play, row.originalIndex)
                          "
                          (dragover)="
                            canWriteSelectedReview &&
                              onTimelinePlayDragOver($event, row.originalIndex)
                          "
                          (dragleave)="
                            canWriteSelectedReview &&
                              onTimelinePlayDragLeave($event, row.originalIndex)
                          "
                          (drop)="
                            canWriteSelectedReview &&
                              onTimelinePlayDrop($event, review.id, row.originalIndex)
                          "
                          [attr.aria-label]="'Jump to ' + row.play.label"
                        >
                          <span class="film-playbook-cell film-playbook-cell--selection">
                            <input
                              type="checkbox"
                              class="film-playbook-checkbox"
                              [checked]="isTimelinePlaySelected(row.play, row.originalIndex)"
                              [attr.data-testid]="timelinePlaySelectCheckboxTestId"
                              [attr.aria-label]="'Select ' + row.play.label"
                              (click)="$event.stopPropagation()"
                              (keydown)="$event.stopPropagation()"
                              (change)="
                                onToggleTimelinePlaySelection(row.play, row.originalIndex, $event)
                              "
                            />
                            @if (isTimelinePlayDownloadPending(row.play, row.originalIndex)) {
                              <span class="film-playbook-download-indicator">Downloading</span>
                            }
                          </span>
                          @for (column of currentTimelineColumns(); track column.id) {
                            <span
                              class="film-playbook-cell film-playbook-cell--editable"
                              [class.film-playbook-cell--number]="column.kind === 'number'"
                              [class.film-playbook-cell--label]="column.kind === 'label'"
                              [attr.data-testid]="getTimelineColumnTestId(column)"
                              (dblclick)="
                                canWriteSelectedReview &&
                                  onStartTimelinePlayFieldEdit(
                                    row.play,
                                    row.originalIndex,
                                    column.fieldKey,
                                    $event
                                  )
                              "
                              (touchend)="
                                canWriteSelectedReview &&
                                  onTimelinePlayFieldTouchEnd(
                                    row.play,
                                    row.originalIndex,
                                    column.fieldKey,
                                    $event
                                  )
                              "
                            >
                              @if (
                                isEditingTimelinePlayField(
                                  row.play,
                                  row.originalIndex,
                                  column.fieldKey
                                )
                              ) {
                                <input
                                  class="film-playbook-edit__input film-playbook-edit__input--cell"
                                  type="text"
                                  autofocus
                                  [value]="timelinePlayEditDraft()"
                                  [disabled]="saving() || !canWriteSelectedReview"
                                  [attr.data-testid]="
                                    column.kind === 'label'
                                      ? testIds.TIMELINE_PLAY_EDIT_INPUT
                                      : null
                                  "
                                  (click)="$event.stopPropagation()"
                                  (keydown)="$event.stopPropagation()"
                                  (input)="onTimelinePlayEditInput($any($event.target).value)"
                                  (blur)="
                                    onSaveTimelinePlayFieldEdit(
                                      review.id,
                                      row.play,
                                      row.originalIndex,
                                      column.fieldKey,
                                      $event,
                                      column.tagDefinition
                                    )
                                  "
                                  (keydown.enter)="
                                    onSaveTimelinePlayFieldEdit(
                                      review.id,
                                      row.play,
                                      row.originalIndex,
                                      column.fieldKey,
                                      $event,
                                      column.tagDefinition
                                    )
                                  "
                                  (keydown.escape)="onCancelTimelinePlayEdit($event)"
                                />
                              } @else if (column.kind === 'label') {
                                <span class="film-playbook-label-text">
                                  {{ getTimelineColumnDisplayValue(row.play, column) }}
                                </span>
                              } @else if (column.kind === 'number') {
                                <span class="film-playbook-number-with-indicator">
                                  <span>{{ getTimelineColumnDisplayValue(row.play, column) }}</span>
                                  @if (row.play.annotation || row.play.annotations?.length) {
                                    <span
                                      class="film-playbook-draw-indicator"
                                      title="Has drawing annotation"
                                      aria-label="Has drawing annotation"
                                    >
                                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                        <path
                                          d="M1.5 12.5C3 10 4.6 9 6 9.5C7.4 10 8.2 12.3 9.7 12.5C11.2 12.7 12.4 9.4 14 9.2C15.8 9 17 10.7 18.5 13"
                                        />
                                      </svg>
                                    </span>
                                  }
                                </span>
                              } @else {
                                {{ getTimelineColumnDisplayValue(row.play, column) }}
                              }
                            </span>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              } @else {
                <div class="film-state">
                  <h3>No breakdown yet</h3>
                  <p>
                    Generate a breakdown for this clip with Agent X or import a spreadsheet to build
                    the table below the video.
                  </p>
                </div>

                <div class="film-empty-timeline-actions">
                  <button
                    type="button"
                    class="film-generate-btn"
                    [class.film-generate-btn--loading]="review.timelineState === 'generating'"
                    [disabled]="
                      saving() ||
                      isImportingBreakdown() ||
                      review.timelineState === 'generating' ||
                      !canWriteSelectedReview
                    "
                    [attr.data-testid]="testIds.GENERATE_TIMELINE_BUTTON"
                    (click)="onGenerateTimeline(review.id)"
                  >
                    <span class="film-generate-btn__content">
                      @if (review.timelineState === 'generating') {
                        <span
                          class="film-generate-btn__spinner"
                          [attr.data-testid]="testIds.TIMELINE_GENERATING_SPINNER"
                          aria-hidden="true"
                        ></span>
                      }
                      <span class="film-generate-btn__text">
                        @if (review.timelineState === 'generating') {
                          Generating Breakdown...
                        } @else {
                          Generate Breakdown
                        }
                      </span>
                    </span>
                    <span class="film-generate-btn__hint">
                      Ask Agent X to analyze this clip and build the breakdown table.
                    </span>
                  </button>

                  <button
                    type="button"
                    class="film-generate-btn film-generate-btn--secondary"
                    [disabled]="saving() || isImportingBreakdown() || !canWriteSelectedReview"
                    [attr.data-testid]="testIds.BREAKDOWN_IMPORT_BUTTON"
                    (click)="onChooseBreakdownClick()"
                  >
                    <span class="film-generate-btn__content">
                      <span class="film-generate-btn__text">
                        @if (isImportingBreakdown()) {
                          Importing Breakdown...
                        } @else {
                          Import Breakdown
                        }
                      </span>
                    </span>
                    <span class="film-generate-btn__hint">
                      Upload CSV, Excel, or Hudl breakdown data for this clip.
                    </span>
                  </button>
                </div>
              }
            </div>

            @if (review.timelineState === 'error') {
              <p class="film-error-message">
                {{ review.timelineError ?? 'Failed to generate timeline' }}
              </p>
            }

            @if (libraryUploadError(); as uploadError) {
              <p viewer-context class="film-error-message">{{ uploadError }}</p>
            }
          </nxt1-agent-x-viewer-surface>
        } @else if (detailOnly && openingSelection) {
          <nxt1-agent-x-library-loading-state [testId]="testIds.LOADING_SKELETON" />
        } @else if (detailOnly) {
          <div class="film-state">
            <h3>No film selected</h3>
            <p>Open a video from Files to load it into the main film review viewer.</p>
          </div>
        } @else {
          <div class="film-state" [attr.data-testid]="testIds.EMPTY_STATE">
            <h3>No film selected</h3>
            <p>Pick a video from the library to begin film review.</p>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 0;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-review-panel {
        --film-review-stage-max-height: min(62vh, 620px);
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        min-width: 0;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: 12px;
        background: transparent;
      }

      .film-review-panel--video-view {
        --film-review-stage-max-height: min(72vh, 720px);
        gap: 10px;
        padding: 8px;
      }

      .agent-x-context-drag-source:not(.agent-x-context-drag-source--disabled) {
        cursor: grab;
      }

      .agent-x-context-drag-source--dragging {
        cursor: grabbing;
        opacity: 0.62;
      }

      .film-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        justify-items: center;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-library {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-library--empty {
        align-content: start;
      }

      .playbooks-list-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }

      .playbooks-list-header h3 {
        margin: 0;
        font-size: 0.95rem;
        letter-spacing: 0.01em;
        color: var(--nxt1-color-text-primary);
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .release-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .playbooks-list-header p {
        margin: 4px 0 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 0.76rem;
      }

      .playbooks-list-header-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn-new {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .btn-new:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-alpha-primary10) 82%, transparent);
      }

      .btn-new:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .btn-new--secondary {
        border-color: var(--nxt1-color-border-default);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
      }

      .btn-new--secondary:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      .playbooks-empty-state {
        display: grid;
        justify-items: center;
        gap: 14px;
      }

      .playbooks-empty-actions {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .film-upload-menu-anchor {
        position: relative;
        display: inline-flex;
      }

      .btn-empty-action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 0 14px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--nxt1-color-border-default);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 0.79rem;
        font-weight: 700;
        cursor: pointer;
        transition:
          border-color 120ms ease,
          background-color 120ms ease,
          color 120ms ease,
          transform 120ms ease;
      }

      .btn-empty-action:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        transform: translateY(-1px);
      }

      .btn-empty-action:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
      }

      .btn-empty-action--primary {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
      }

      .btn-empty-action__icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }

      .film-library--drag-active .film-library-dropzone {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-library-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .film-library-file-input {
        display: none;
      }

      .film-library-dropzone {
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        background: var(--nxt1-color-surface-100);
        transition: all 0.18s ease;
      }

      .film-library-dropzone--active {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-library-dropzone__title {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .film-library-dropzone__meta {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-upload-status {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        padding: 8px 10px;
        background: var(--nxt1-color-surface-100);
      }

      .film-library-upload-status--empty {
        margin-top: 2px;
        width: 100%;
        max-width: 460px;
      }

      .film-library-upload-status__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .film-library-upload-status__actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .film-library-upload-status__label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-upload-status__pct {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .film-library-upload-status__cancel {
        border: 0;
        border-radius: 999px;
        padding: 4px 10px;
        background: rgba(239, 68, 68, 0.14);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      .film-library-upload-status__cancel:hover {
        background: rgba(239, 68, 68, 0.22);
      }

      .film-library-upload-status__track {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--nxt1-color-border-subtle);
      }

      .film-library-upload-status__hint {
        margin: 8px 0 0;
        font-size: 11px;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-upload-status__fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        transition: width 0.16s ease;
      }

      .film-library-list {
        display: grid;
        gap: 8px;
        padding-left: 0;
        padding-bottom: 16px;
      }

      .film-library-header__actions-primary,
      .film-library-header__actions-secondary {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .film-library-header__actions-primary {
        flex: 1 1 34rem;
        flex-wrap: wrap;
      }

      .film-library-header__actions-secondary {
        flex-wrap: wrap;
        justify-content: flex-end;
        margin-left: auto;
      }

      .film-library-search-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 21rem;
        min-width: 0;
      }

      .film-library-search-wrap nxt1-search-bar {
        flex: 1 1 auto;
        min-width: 0;
      }

      .film-library-search-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-primary) 22%, var(--nxt1-color-border-subtle));
        background: color-mix(
          in srgb,
          var(--nxt1-color-alpha-primary10) 84%,
          var(--nxt1-color-surface-200)
        );
        color: color-mix(in srgb, var(--nxt1-color-primary) 78%, var(--nxt1-color-text-primary));
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
      }

      .film-library-search-empty {
        display: grid;
        gap: 0.65rem;
        justify-items: start;
        padding: 1.1rem 1.15rem;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 92%, transparent);
        border-radius: 1rem;
        background:
          radial-gradient(
            circle at top left,
            color-mix(in srgb, var(--nxt1-color-alpha-primary10) 90%, transparent),
            transparent 48%
          ),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--nxt1-color-surface-100) 96%, white) 0%,
            var(--nxt1-color-surface-100) 100%
          );
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
      }

      .film-library-search-empty__eyebrow {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--nxt1-color-primary);
      }

      .film-library-search-empty h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        color: var(--nxt1-color-text-primary);
      }

      .film-library-search-empty p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-search-empty__action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.25rem;
        padding: 0 0.9rem;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 25%, white);
        border-radius: 999px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, white);
        color: var(--nxt1-color-primary);
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
      }

      @media (max-width: 900px) {
        .film-library-header__actions-primary {
          flex-basis: 100%;
        }

        .film-library-search-wrap {
          min-width: 100%;
        }
      }

      .film-library-header__actions-secondary .film-playbook-nav-btn[aria-expanded='true'] {
        border-color: var(--nxt1-color-border-primary);
        background: color-mix(in srgb, var(--nxt1-color-alpha-primary10) 82%, transparent);
      }

      .film-upload-menu {
        min-width: min(22rem, calc(100vw - 2rem));
        display: grid;
        gap: 0.5rem;
        padding: 0.5rem;
        right: 0;
      }

      .film-upload-menu--centered {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
      }

      .film-upload-menu__action {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: flex-start;
        justify-content: stretch;
        gap: 0.8rem;
        padding: 0.8rem 0.9rem;
        border-radius: var(--nxt1-ui-radius-md, 10px);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--nxt1-color-surface-200) 40%, transparent),
          var(--nxt1-color-surface-100)
        );
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .film-upload-menu__action:hover,
      .film-upload-menu__action:focus-visible {
        border-color: var(--nxt1-color-border-default);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--nxt1-color-surface-200) 80%, transparent),
          var(--nxt1-color-surface-100)
        );
        box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
        cursor: pointer;
      }

      .film-upload-menu__action--recommended {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 30%,
          var(--nxt1-color-border-default)
        );
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--nxt1-color-primary) 12%, var(--nxt1-color-surface-100)),
          var(--nxt1-color-surface-100)
        );
      }

      .film-upload-menu__content {
        min-width: 0;
        display: grid;
        gap: 0.3rem;
        flex: 1;
      }

      .film-upload-menu__row {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        min-width: 0;
      }

      .film-upload-menu__text {
        min-width: 0;
        font-weight: 700;
        font-size: 0.84rem;
        color: var(--nxt1-color-text-primary);
      }

      .film-upload-menu__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 0.14rem 0.42rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
      }

      .film-upload-menu__hint {
        font-size: 0.72rem;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.42;
      }

      .film-upload-menu__meta {
        align-self: flex-start;
        margin-top: 0.08rem;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
      }

      @media (max-width: 36rem) {
        .film-upload-menu__action {
          grid-template-columns: minmax(0, 1fr);
          gap: 0.55rem;
        }

        .film-upload-menu__meta {
          margin-top: 0;
        }
      }

      .film-playlist-create {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
      }

      .film-playlist-create__input {
        min-width: 0;
        height: 34px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
        font: inherit;
        font-size: 13px;
        padding: 0 10px;
      }

      .film-playlist-create__input:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 1px;
      }

      .film-playlist-create__btn {
        min-height: 34px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        font-weight: 700;
        padding: 0 10px;
        cursor: pointer;
      }

      .film-playlist-create__btn--primary {
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-primary);
      }

      .film-playlist-folder {
        display: grid;
        gap: 6px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 92%, transparent);
        overflow: visible;
        position: relative;
        transition:
          border-color 0.18s ease,
          background 0.18s ease;
      }

      .film-playlist-folder--drop-target {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-playlist-folder--menu-open {
        z-index: 80;
      }

      .film-playlist-folder--nested {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 72%, transparent);
      }

      .film-playlist-folder__header {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) 32px;
        align-items: center;
        gap: 4px;
        width: 100%;
        min-height: 38px;
        padding: 0 6px 0 30px;
        position: relative;
        z-index: 6;
        overflow: visible;
      }

      .film-playlist-folder__selection,
      .film-list-item__selection {
        width: 28px;
        min-width: 28px;
        min-height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .film-playlist-folder__menu-anchor {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        min-height: 38px;
      }

      .film-playlist-folder__toggle {
        display: grid;
        grid-template-columns: 18px 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
        min-height: 38px;
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        text-align: left;
        padding: 7px 8px 7px 10px;
        cursor: pointer;
      }

      .film-playlist-folder__reorder-handle {
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        left: 4px;
        top: 19px;
        transform: translateY(-50%);
        z-index: 7;
        cursor: grab;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-playlist-folder__reorder-handle:hover,
      .film-playlist-folder__reorder-handle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-text-primary) 8%, transparent);
        color: var(--nxt1-color-primary);
        outline: none;
      }

      .film-playlist-folder__reorder-handle:active {
        cursor: grabbing;
      }

      .film-reorder-grip {
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-auto-rows: 3px;
        gap: 2px;
      }

      .film-reorder-grip span {
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.72;
      }

      .film-playlist-folder__toggle:hover {
        background: var(--nxt1-color-surface-200);
      }

      .film-playlist-folder__chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playlist-folder__icon {
        color: color-mix(in srgb, var(--nxt1-color-primary) 80%, var(--nxt1-color-text-primary));
      }

      .film-playlist-folder .film-playlist-folder__menu-btn {
        position: static;
        top: auto;
        right: auto;
        transform: none;
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        z-index: 6;
      }

      .film-playlist-folder__menu {
        top: calc(100% + 2px);
        right: 0;
        z-index: 140;
      }

      .film-playlist-folder__menu-slot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .film-playlist-folder__name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 700;
      }

      .film-playlist-folder__count {
        min-width: 24px;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 700;
        text-align: center;
      }

      .film-playlist-folder__dropzone {
        display: grid;
        gap: 8px;
        padding: 0 8px 8px 12px;
        position: relative;
        z-index: 1;
      }

      .film-playlist-folder__children {
        display: grid;
        gap: 8px;
        margin-left: 12px;
        padding-left: 12px;
        border-left: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
      }

      .film-playlist-folder__review-list,
      .film-playlist-folder-list {
        display: grid;
        gap: 8px;
      }

      .film-playlist-folder__empty {
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: 8px;
        padding: 10px;
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        text-align: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 70%, transparent);
      }

      .film-detail {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-player {
        width: 100%;
        max-width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
        margin: 0;
        border-radius: var(--nxt1-border-radius-md, 10px);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-bg-primary, var(--nxt1-color-surface-100));
        object-fit: contain;
      }

      .film-player--cloudflare-shell {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        height: auto;
        min-height: 0;
      }

      .film-player__iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        border: 0;
        background: var(--nxt1-color-bg-primary, var(--nxt1-color-surface-100));
        opacity: 1;
        transition: opacity 0.16s ease;
      }

      .film-player--cloudflare-loading .film-player__iframe {
        opacity: 0;
      }

      .film-player-iframe-loading {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        place-items: center;
        background: var(--nxt1-color-bg-primary, var(--nxt1-color-surface-100));
      }

      .film-player-iframe-loading::after {
        content: '';
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-top-color: rgba(255, 255, 255, 0.84);
        animation: film-cloudflare-loading-spin 0.8s linear infinite;
      }

      .film-player-native-loading {
        position: absolute;
        inset: 0;
        z-index: 12;
        display: grid;
        place-items: center;
        border-radius: var(--nxt1-border-radius-md, 10px);
        background: color-mix(
          in srgb,
          var(--nxt1-color-bg-primary, var(--nxt1-color-surface-100)) 90%,
          transparent
        );
      }

      .film-player-native-loading__label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 86%, transparent);
      }

      .film-player-native-loading__label::before {
        content: '';
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--nxt1-color-text-secondary) 45%, transparent);
        border-top-color: var(--nxt1-color-text-primary);
        animation: film-cloudflare-loading-spin 0.8s linear infinite;
      }

      @keyframes film-cloudflare-loading-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .film-player__iframe {
          transition: none;
        }

        .film-player-iframe-loading::after {
          animation: none;
        }
      }

      .film-player--processing {
        min-height: 0;
        display: grid;
        place-items: center;
        padding: clamp(18px, 4vw, 32px);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-surface-200) 94%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-100) 88%, var(--nxt1-color-primary) 12%)
        );
        color: var(--nxt1-color-text-primary);
      }

      .film-player-processing-card {
        display: grid;
        gap: 8px;
        width: min(460px, 100%);
        text-align: center;
      }

      .film-player-processing-card__eyebrow {
        font-size: 0.76rem;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .film-player-processing-card h3 {
        margin: 0;
        font-size: clamp(1rem, 3vw, 1.35rem);
        line-height: 1.2;
      }

      .film-player-processing-card p {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 0.9rem;
        line-height: 1.45;
      }

      .film-player-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        width: min(100%, calc(var(--film-review-stage-max-height) * 16 / 9));
        max-width: 100%;
        max-height: var(--film-review-stage-max-height);
        height: auto;
        margin: 0 auto;
        aspect-ratio: 16 / 9;
      }

      .film-player-wrapper:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
        border-radius: var(--nxt1-border-radius-md, 10px);
      }

      .film-player-wrapper:fullscreen,
      .film-player-wrapper:-webkit-full-screen {
        width: 100vw;
        height: 100vh;
        padding: 0;
        background: var(--nxt1-color-bg-primary);
        align-items: center;
        justify-content: center;
      }

      .film-player-wrapper:fullscreen .film-player,
      .film-player-wrapper:-webkit-full-screen .film-player {
        width: 100%;
        height: 100%;
        aspect-ratio: auto;
        object-fit: contain;
        border-radius: 0;
        border: 0;
      }

      .film-player-wrapper:fullscreen .film-draw-canvas,
      .film-player-wrapper:-webkit-full-screen .film-draw-canvas {
        border-radius: 0;
      }

      .film-top-tools {
        position: absolute;
        top: var(--nxt1-spacing-2, 8px);
        left: var(--nxt1-spacing-2, 8px);
        right: var(--nxt1-spacing-2, 8px);
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-top-tools__left,
      .film-top-tools__right {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-top-tools__left {
        min-width: 0;
        flex: 0 1 min(760px, calc(100% - 128px));
      }

      .film-top-tools__left--collapsed {
        flex: 0 0 auto;
        gap: 0;
        padding: 2px;
      }

      .film-top-meta {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
      }

      .film-top-meta__counter {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        min-width: 48px;
        padding: 0 6px;
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
      }

      .film-top-meta__scroll {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
        gap: 2px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
      }

      .film-top-meta__scroll::-webkit-scrollbar {
        display: none;
      }

      .film-top-meta__item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
        min-width: 0;
        padding: 0 6px;
        white-space: nowrap;
      }

      .film-top-meta__label {
        color: var(--nxt1-color-text-secondary);
        font-size: 9px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .film-top-meta__value {
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

      .film-top-meta__toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 24px;
        min-height: 24px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-top-meta__toggle--collapsed {
        width: 26px;
      }

      .film-top-meta__toggle:hover,
      .film-top-meta__toggle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 72%, transparent);
        color: var(--nxt1-color-text-primary);
        outline: none;
      }

      .film-top-meta__toggle-icon {
        width: 12px;
        height: 12px;
        display: block;
      }

      .film-top-meta__toggle-icon path {
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .film-time-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 var(--nxt1-spacing-1, 4px);
        color: var(--nxt1-color-text-primary);
        font-size: 12px;
        font-weight: 600;
      }

      .film-time-badge__time {
        font-variant-numeric: tabular-nums;
      }

      .film-draw-tools {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .film-angle-menu {
        position: relative;
        display: inline-flex;
        z-index: 4;
      }

      .film-angle-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 28px;
        min-width: 58px;
        padding: 0 8px;
        border: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-angle-trigger:hover,
      .film-angle-trigger--open {
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
      }

      .film-angle-trigger:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-angle-trigger__label {
        min-width: 24px;
        text-align: center;
      }

      .film-angle-popover {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        z-index: 40;
        display: grid;
        min-width: 94px;
        padding: 4px;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, #000 8%);
        box-shadow: 0 18px 38px color-mix(in srgb, #000 44%, transparent);
        backdrop-filter: blur(12px);
      }

      .film-angle-option {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 26px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 800;
        cursor: pointer;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-angle-option:hover,
      .film-angle-option--active {
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
      }

      .film-angle-option:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-draw-tool-icon {
        width: 0.85rem;
        height: 0.85rem;
        stroke: currentColor;
        stroke-width: 1.85;
      }

      .film-draw-tool-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0.85rem;
        font-size: 0.72rem;
        font-weight: 800;
        line-height: 1;
      }

      .film-icon-btn.film-top-tool-btn--danger {
        color: var(--nxt1-color-danger);
      }

      .film-icon-btn.film-top-tool-btn--danger:hover:not(:disabled) {
        color: var(--nxt1-color-danger);
      }

      .film-draw-canvas {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 15;
        width: 100%;
        height: 100%;
        border-radius: var(--nxt1-border-radius-md, 10px);
        pointer-events: none;
        touch-action: none;
      }

      .film-draw-canvas--active {
        pointer-events: auto;
        cursor: crosshair;
      }

      .film-text-effect-input {
        display: block;
        min-width: 0;
        width: min(100%, 1040px, 82vh, 693px);
        max-width: 100%;
        margin: 0 auto 16px;
        width: 100%;
        min-height: 48px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        outline: 0;
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 88%, transparent);
        color: var(--nxt1-color-text-primary);
        font: inherit;
        font-size: clamp(14px, 1.5vw, 18px);
        font-weight: 700;
        line-height: 1.45;
        letter-spacing: 0.01em;
        padding: 10px 14px;
        overflow: auto;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        box-sizing: border-box;
      }

      .film-review-panel--video-view .film-text-effect-input {
        width: min(100%, 1120px, calc(70dvh * 16 / 9));
        max-width: 100%;
      }

      .film-text-effect-input {
        resize: vertical;
        caret-color: var(--nxt1-color-primary);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 8%, transparent);
      }

      .film-text-effect-input::placeholder {
        color: color-mix(in srgb, var(--nxt1-color-text-secondary) 78%, transparent);
      }

      .film-text-effect-input:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 42%, transparent);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 20%, transparent),
          0 0 0 3px color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
      }

      .film-controls-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        z-index: 20;
      }

      .film-hud {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 78%, transparent) 0%,
          color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent) 100%
        );
        backdrop-filter: blur(8px);
      }

      .film-hud--bottom {
        display: none;
      }

      .film-hud-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        min-height: 28px;
        padding: 0 var(--nxt1-spacing-2, 8px);
        border-radius: 999px;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 600;
      }

      .film-hud-chip--accent {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .film-controls__progress {
        display: flex;
        align-items: center;
      }

      .film-controls__seek {
        width: 100%;
        height: 3px;
        -webkit-appearance: none;
        appearance: none;
        border-radius: 999px;
        border: none;
        outline: none;
        cursor: pointer;
        background: linear-gradient(
          to right,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-primary) var(--seek-progress, 0%),
          var(--nxt1-color-border-strong) var(--seek-progress, 0%),
          var(--nxt1-color-border-strong) 100%
        );
      }

      .film-controls__seek::-webkit-slider-runnable-track {
        height: 3px;
        background: transparent;
        border-radius: 999px;
      }

      .film-controls__seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 10px;
        height: 10px;
        margin-top: -3.5px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .film-controls__seek::-moz-range-track {
        height: 3px;
        background: transparent;
        border-radius: 999px;
      }

      .film-controls__seek::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .film-controls__dock {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
        flex-wrap: wrap;
      }

      .film-controls__cluster {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
        backdrop-filter: blur(6px);
      }

      .film-controls__cluster--right {
        margin-left: auto;
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 68%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-border-radius-sm, 6px);
        backdrop-filter: blur(6px);
      }

      .film-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        min-height: 24px;
        min-width: 24px;
        padding: 0;
        border-radius: var(--nxt1-border-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .film-icon-btn:hover:not(:disabled) {
        color: var(--nxt1-color-primary);
      }

      .film-icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .film-icon-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-icon-btn__label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        line-height: 1;
      }

      .film-icon-btn--primary {
        color: var(--nxt1-color-primary);
      }

      .film-icon-btn--primary:hover {
        color: var(--nxt1-color-primary);
      }

      .film-speed-pills {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0;
        border-radius: 0;
        background: transparent;
        border: 0;
      }

      .film-speed-pill {
        min-height: 24px;
        min-width: 24px;
        padding: 0 2px;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 9px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.18s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .film-speed-pill:hover {
        color: var(--nxt1-color-text-primary);
      }

      .film-speed-pill:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-speed-pill--active {
        background: transparent;
        color: var(--nxt1-color-primary);
        font-weight: 800;
      }

      .film-state {
        border: 2px dashed var(--nxt1-color-border-default);
        border-radius: 16px;
        padding: 20px;
        text-align: center;
        background: var(--nxt1-color-surface-100);
      }

      .film-state h3 {
        font-size: 18px;
        font-weight: bold;
        margin: 0 0 8px;
        color: var(--nxt1-color-primary);
      }

      .film-state p {
        font-size: 14px;
        margin: 0;
        color: var(--nxt1-color-text-secondary);
      }

      .film-state--error h3 {
        color: var(--nxt1-color-error);
      }

      .film-generate-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 12px 16px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
      }

      .film-generate-btn__content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .film-generate-btn__text {
        line-height: 1.2;
      }

      .film-generate-btn__hint {
        font-size: 11px;
        font-weight: 500;
        line-height: 1.2;
        color: var(--nxt1-color-text-secondary);
      }

      .film-generate-btn__spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--nxt1-color-primary) 28%, transparent);
        border-top-color: var(--nxt1-color-primary);
        animation: film-generate-spin 0.8s linear infinite;
      }

      .film-generate-btn--loading {
        background: color-mix(in srgb, var(--nxt1-color-primary) 8%, var(--nxt1-color-surface-100));
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 45%,
          var(--nxt1-color-border-default)
        );
      }

      .film-generate-btn:hover:not(:disabled) {
        background: var(--nxt1-color-alpha-primary20);
        border-color: var(--nxt1-color-border-primary);
      }

      .film-generate-btn:disabled {
        opacity: 0.85;
        cursor: not-allowed;
      }

      .film-empty-timeline-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: stretch;
        gap: 10px;
      }

      .film-empty-timeline-actions--loading {
        align-items: center;
        justify-content: center;
        min-height: 52px;
        padding: 12px 14px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
      }

      .film-empty-timeline-actions__loading-text {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .film-empty-timeline-actions .film-generate-btn {
        min-width: 0;
      }

      @media (max-width: 479px) {
        .film-empty-timeline-actions {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .film-generate-btn--secondary {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
      }

      .film-generate-btn--secondary:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-primary);
      }

      .film-empty-timeline-hint {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
      }

      @keyframes film-generate-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .film-error-message {
        font-size: 13px;
        color: var(--nxt1-color-error);
        margin: 0;
        padding: 8px;
        background: var(--nxt1-color-errorBg);
        border-radius: 6px;
        border-left: 3px solid var(--nxt1-color-error);
      }

      .film-error-message--empty {
        margin-top: 2px;
      }

      .film-playbook {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-playbook-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
      }

      .film-playbook-nav-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        padding: 8px 10px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: var(--nxt1-color-surface-100);
        color: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .film-playbook-nav-btn:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-primary);
      }

      .film-playbook-nav-btn--attach {
        background: var(--nxt1-color-alpha-primary10);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-nav-btn--danger {
        border-color: var(--nxt1-color-error, #ef4444);
        color: var(--nxt1-color-error, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-error, #ef4444) 12%, transparent);
      }

      .film-playbook-nav-btn--danger:hover:not(:disabled) {
        border-color: var(--nxt1-color-error, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-error, #ef4444) 20%, transparent);
      }

      .film-playbook-ask-agent {
        position: relative;
        flex-shrink: 0;
      }

      .film-playbook-ask-agent__caret {
        width: 12px;
        height: 12px;
        opacity: 0.72;
      }

      .film-playbook-download__icon {
        width: 14px;
        height: 14px;
        opacity: 0.9;
      }

      .film-playbook-ask-agent__logo {
        display: block;
        width: 18px;
        height: 18px;
      }

      .film-playbook-ask-agent__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.15rem;
        height: 1.15rem;
        padding: 0 0.32rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-text-primary) 82%, black);
        background: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-surface-100);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0.01em;
      }

      .film-playbook-ask-agent-menu {
        min-width: 240px;
        display: grid;
        gap: 4px;
        padding: 6px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
      }

      .film-playbook-ask-agent-menu--prompts {
        width: min(700px, 86vw);
        max-width: min(700px, 86vw);
        max-height: min(58vh, 460px);
        overflow-y: auto;
        overflow-x: hidden;
        align-content: start;
        gap: 6px;
        padding: 5px;
        grid-template-columns: repeat(2, minmax(220px, 1fr));
      }

      .film-playbook-ask-agent-menu__empty {
        margin: 0;
        padding: 12px 16px 10px;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.4;
        text-align: center;
        color: var(--nxt1-color-text-primary);
        grid-column: 1 / -1;
      }

      .film-playbook-ask-agent-menu__section {
        display: grid;
        gap: 6px;
        align-content: start;
        padding: 6px;
        border-radius: 10px;
        background: var(--nxt1-color-surface-050, rgba(255, 255, 255, 0.02));
      }

      .film-playbook-ask-agent-menu__section-title {
        margin: 0;
        padding: 0 4px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        line-height: 1.2;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playbook-ask-agent-menu__section-options {
        display: grid;
        gap: 4px;
      }

      .film-playbook-ask-agent-menu__option {
        display: grid;
        gap: 3px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        text-align: left;
        padding: 8px 10px;
        cursor: pointer;
      }

      .film-playbook-ask-agent-menu__option:hover,
      .film-playbook-ask-agent-menu__option:focus-visible {
        background: var(--nxt1-color-surface-200);
        outline: none;
      }

      .film-playbook-ask-agent-menu__label {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
      }

      .film-playbook-ask-agent-menu__hint {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.3;
      }

      @media (max-width: 920px) {
        .film-playbook-ask-agent-menu--prompts {
          width: min(520px, 92vw);
          max-width: min(520px, 92vw);
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .film-playbook-nav-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .film-playbook-current {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .film-playbook-summary {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--nxt1-color-text-tertiary);
      }

      .film-playbook-active-play {
        min-width: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-playbook-table {
        min-width: 0;
        width: 100%;
        max-width: 100%;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        overflow: visible;
        background: linear-gradient(
          180deg,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .film-playbook-scroll {
        min-width: 0;
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        overscroll-behavior-x: contain;
      }

      .film-playbook-head,
      .film-playbook-row {
        display: grid;
        grid-template-columns: var(--film-playbook-grid-columns, 34px 52px 220px 78px 78px 72px);
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        min-width: 100%;
        width: max-content;
      }

      .film-playbook-head {
        border-bottom: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
      }

      .film-playbook-head span {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nxt1-color-text-tertiary);
      }

      .film-playbook-head__selection {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .film-playbook-column-header {
        position: relative;
        min-width: 0;
        width: 100%;
        height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0 6px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--nxt1-color-text-tertiary);
        cursor: grab;
        font: inherit;
        text-align: left;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease,
          opacity 0.15s ease;
      }

      .film-playbook-column-header-wrap {
        position: relative;
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 22px;
        align-items: center;
        gap: 2px;
      }

      .film-playbook-head.cdk-drop-list-dragging .film-playbook-column-header-wrap {
        transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
      }

      .film-playbook-column-header-wrap.cdk-drag-placeholder {
        opacity: 0;
      }

      .film-playbook-column-header-wrap--dragging,
      .film-playbook-column-header-wrap.cdk-drag-dragging {
        opacity: 0.72;
      }

      .film-playbook-column-header span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-playbook-column-header:hover,
      .film-playbook-column-header:focus-visible {
        background: var(--nxt1-color-surface-100);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-column-header:active {
        cursor: grabbing;
      }

      .film-playbook-column-header--dragging {
        opacity: 0.58;
      }

      .film-playbook-column-header--drop-before::before,
      .film-playbook-column-header--drop-after::after {
        content: '';
        position: absolute;
        top: 3px;
        bottom: 3px;
        width: 2px;
        border-radius: 999px;
        background: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary10);
        pointer-events: none;
      }

      .film-playbook-column-header--drop-before::before {
        left: -5px;
      }

      .film-playbook-column-header--drop-after::after {
        right: -5px;
      }

      .film-playbook-column-menu-btn {
        width: 20px;
        min-width: 20px;
        height: 20px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--nxt1-color-text-tertiary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .film-playbook-column-menu-btn:hover,
      .film-playbook-column-menu-btn:focus-visible,
      .film-playbook-column-menu-btn--active {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-primary);
        outline: none;
      }

      .film-playbook-column-menu {
        min-width: 220px;
        max-width: 280px;
        max-height: 260px;
        overflow: auto;
        display: grid;
        gap: 4px;
        padding: 6px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
      }

      .film-playbook-column-menu__option-row {
        display: block;
      }

      .film-playbook-column-menu__empty {
        padding: 8px;
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playbook-column-menu__option,
      .film-playbook-column-menu__clear {
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 12px;
        text-align: left;
        padding: 6px 8px;
        cursor: pointer;
      }

      .film-playbook-column-menu__option:hover,
      .film-playbook-column-menu__clear:hover,
      .film-playbook-column-menu__option:focus-visible,
      .film-playbook-column-menu__clear:focus-visible {
        background: var(--nxt1-color-surface-200);
        outline: none;
      }

      .film-playbook-column-menu__actions {
        display: grid;
        gap: 2px;
        padding-top: 4px;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .film-playbook-column-menu__count {
        color: var(--nxt1-color-text-tertiary);
        margin-left: 4px;
      }

      .film-playbook-filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .film-playbook-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        border: 1px solid var(--nxt1-color-border-primary);
        border-radius: 999px;
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 700;
        padding: 0 10px;
        cursor: pointer;
      }

      .film-playbook-filter-chip--exclude {
        border-color: var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
      }

      .film-playbook-filter-chip__label {
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playbook-filter-chip__close {
        color: var(--nxt1-color-text-tertiary);
      }

      .film-playbook-filter-clear {
        min-height: 28px;
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: 999px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 700;
        padding: 0 10px;
        cursor: pointer;
      }

      .film-playbook-empty-filtered {
        display: grid;
        place-items: center;
        gap: 8px;
        padding: 14px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .film-playbook-empty-filtered p {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playbook-empty-filtered button {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 999px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        cursor: pointer;
      }

      .film-playbook-body {
        width: max-content;
        min-width: 100%;
        max-height: 220px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .film-playbook-row {
        position: relative;
        width: max-content;
        min-width: 100%;
        border: 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: transparent;
        text-align: left;
        color: inherit;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .film-playbook-row--dragging {
        opacity: 0.58;
        background: var(--nxt1-color-surface-200);
      }

      .film-playbook-row--drop-before::before,
      .film-playbook-row--drop-after::after {
        content: '';
        position: absolute;
        left: 8px;
        right: 8px;
        height: 2px;
        border-radius: 999px;
        background: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary10);
        pointer-events: none;
      }

      .film-playbook-row--drop-before::before {
        top: -1px;
      }

      .film-playbook-row--drop-after::after {
        bottom: -1px;
      }

      .film-playbook-row:last-child {
        border-bottom: 0;
      }

      .film-playbook-row:hover {
        background: var(--nxt1-color-surface-200);
      }

      .film-playbook-row--editing,
      .film-playbook-row--editing:hover {
        background: var(--nxt1-color-surface-200);
        cursor: default;
      }

      .film-playbook-row--active {
        background: var(--nxt1-color-alpha-primary10);
        box-shadow: inset 2px 0 0 0 var(--nxt1-color-primary);
      }

      .film-playbook-row--selected:not(.film-playbook-row--active) {
        background: linear-gradient(90deg, var(--nxt1-color-alpha-primary10), transparent 48%);
      }

      .film-playbook-row:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: -2px;
      }

      .film-playbook-cell {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-playbook-cell--selection {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        overflow: visible;
      }

      .film-playbook-download-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 74px;
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .film-playbook-checkbox {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--nxt1-color-primary);
        cursor: pointer;
      }

      .film-playbook-checkbox:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .film-playbook-cell--editable {
        cursor: text;
      }

      .film-playbook-cell--editable:hover {
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-cell--number {
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-number-with-indicator {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .film-playbook-draw-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
        margin-left: 2px;
        transform: translateY(-1px) rotate(-10deg);
      }

      .film-playbook-draw-indicator svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .film-playbook-cell--label {
        display: flex;
        align-items: center;
        font-weight: 600;
      }

      .film-playbook-label-text {
        min-width: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-playbook-edit-trigger,
      .film-playbook-edit__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-height: 26px;
        padding: 0 8px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 999px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          color 0.15s ease;
      }

      .film-playbook-edit-trigger:hover:not(:disabled),
      .film-playbook-edit__btn:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-edit-trigger:disabled,
      .film-playbook-edit__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .film-playbook-edit {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        width: 100%;
      }

      .film-playbook-edit__input {
        min-width: 0;
        flex: 1;
        height: 32px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font: inherit;
        padding: 0 10px;
      }

      .film-playbook-edit__input--cell {
        width: 100%;
      }

      .film-playbook-edit__input:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 1px;
      }

      .film-playbook-edit__btn--save {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 45%, transparent);
        color: var(--nxt1-color-primary);
      }

      .film-list-item {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        transition:
          background 0.18s ease,
          border-color 0.18s ease;
        cursor: pointer;
        text-align: left;
      }

      .film-list-item:hover {
        background: var(--nxt1-color-surface-200);
      }

      .film-list-item--active {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-list-item__thumbnail {
        position: relative;
        width: 64px;
        height: 38px;
        background: var(--nxt1-color-bg-primary);
        overflow: hidden;
        border-radius: 6px;
        flex-shrink: 0;
      }

      .film-list-item__thumbnail-loader {
        position: absolute;
        inset: 0;
        display: block;
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        z-index: 1;
      }

      .film-list-item__thumbnail-shimmer {
        display: block;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 50%,
          var(--nxt1-color-surface-100) 100%
        );
        background-size: 200% 100%;
        animation: film-thumbnail-shimmer 1.2s ease-in-out infinite;
      }

      @keyframes film-thumbnail-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      .film-list-item__video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        opacity: 0;
        transition: opacity 0.16s ease;
      }

      .film-list-item__video--ready {
        opacity: 1;
      }

      .film-list-item__thumb-image {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .film-list-item__thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-secondary);
        background: linear-gradient(
          140deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 100%
        );
      }

      .film-list-item__content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .film-list-item__title {
        display: inline-block;
        padding: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-list-item__meta {
        display: inline-block;
        padding: 0;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-load-more-wrap {
        display: flex;
        padding: 6px 0 0;
      }

      .film-library-load-more-wrap--collapsed {
        padding: 0 8px 8px;
      }

      .film-library-load-more {
        width: 100%;
        min-height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--nxt1-color-border-default);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        border-radius: 8px;
        padding: 7px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.16s ease,
          border-color 0.16s ease;
      }

      .film-library-load-more:hover {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-library-load-more:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      @media (max-width: 1024px) {
        .film-layout {
          grid-template-columns: 1fr;
        }

        .film-playbook-toolbar {
          flex-wrap: wrap;
        }

        .film-playbook-current {
          order: 3;
          flex: 1 0 100%;
        }

        .film-library-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .film-library-header__actions-primary,
        .film-library-header__actions-secondary {
          width: 100%;
        }

        .film-playlist-create {
          grid-template-columns: 1fr;
        }

        .film-playlist-folder__menu {
          right: 4px;
        }

        .film-playlist-folder__dropzone {
          padding-left: 12px;
        }

        .film-library-header__actions-secondary .film-playbook-nav-btn {
          justify-content: center;
          width: 100%;
        }

        .film-playbook-head,
        .film-playbook-row {
          gap: 6px;
          padding: 8px;
        }

        .film-playbook-edit {
          flex-wrap: wrap;
        }

        .film-playbook-edit__input {
          flex-basis: 100%;
        }

        .film-playbook-body {
          max-height: 180px;
        }

        .film-playbook-cell,
        .film-playbook-head span {
          font-size: 12px;
        }

        .film-hud {
          left: 8px;
          right: 8px;
        }
      }
    `,
    `
      @media (hover: hover) and (pointer: fine) {
        .video-controls__tooltip-host[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          left: 50%;
          bottom: calc(100% + 8px);
          z-index: 40;
          max-width: min(180px, calc(100vw - 24px));
          padding: 5px 7px;
          border-radius: var(--nxt1-border-radius-sm, 6px);
          background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, transparent);
          border: 1px solid var(--nxt1-color-border-default);
          color: var(--nxt1-color-text-primary);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          font-size: 10px;
          font-weight: 700;
          line-height: 1.1;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
          text-overflow: ellipsis;
          transform: translate(calc(-50% + var(--video-tooltip-offset-x, 0px)), 4px);
          transition:
            opacity 0.14s ease,
            transform 0.14s ease;
          white-space: nowrap;
        }

        .video-controls__tooltip-host[data-tooltip]:hover::after,
        .video-controls__tooltip-host[data-tooltip]:focus-visible::after {
          opacity: 1;
          transform: translate(calc(-50% + var(--video-tooltip-offset-x, 0px)), 0);
        }
      }
    `,
    `
      .film-list-item-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 30px;
        z-index: 1;
      }

      .film-list-item__reorder-handle {
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        cursor: grab;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-list-item__reorder-handle:hover,
      .film-list-item__reorder-handle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-text-primary) 8%, transparent);
        color: var(--nxt1-color-primary);
        outline: none;
      }

      .film-list-item__reorder-handle:active {
        cursor: grabbing;
      }

      .film-list-item-row--menu-open {
        z-index: 260;
      }
      .film-list-item__menu-btn {
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        border-radius: 50%;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        z-index: 5;
      }
      .film-list-item {
        padding-right: 48px;
        flex: 1 1 auto;
        min-width: 0;
      }

      .cdk-drag-preview.film-list-item-row,
      .cdk-drag-preview.film-playlist-folder {
        box-sizing: border-box;
        border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .cdk-drag-placeholder {
        opacity: 0.24;
      }

      .film-playlist-folder-list.cdk-drop-list-dragging
        .film-playlist-folder:not(.cdk-drag-placeholder),
      .film-playlist-folder__review-list.cdk-drop-list-dragging
        .film-list-item-row:not(.cdk-drag-placeholder) {
        transition: transform 180ms ease;
      }
      .film-list-item__menu-btn:active {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 10%,
          transparent
        );
      }
      .film-list-item__menu-btn[aria-expanded='true'] {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
      }
      .film-list-item__menu-btn:hover,
      .film-list-item__menu-btn:focus-visible {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
        outline: none;
      }
      .film-list-item__menu-backdrop {
        position: fixed;
        inset: 0;
        background: transparent;
        border: 0;
        margin: 0;
        padding: 0;
        z-index: 2;
      }
      .film-list-item__menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: var(--nxt1-spacing-52, 13rem);
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
        z-index: 320;
        overflow: hidden;
      }

      .film-list-item__menu-section {
        display: grid;
        gap: 2px;
        padding: 4px 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }
      .film-list-item__menu-action {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--nxt1-nav-text);
        text-align: left;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.25;
        cursor: pointer;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
      }
      .film-list-item__menu-action:hover,
      .film-list-item__menu-action:focus-visible {
        background: var(--nxt1-nav-hover-bg);
        outline: none;
      }
      .film-list-item__menu-action:active {
        background: var(--nxt1-nav-hover-bg);
      }
      .film-list-item__menu-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .film-list-item__menu-action--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }
      .film-list-item__menu-action--primary {
        color: var(--log-primary, var(--nxt1-color-primary));
      }
      .film-list-item__menu-rename,
      .film-list-item__menu-confirm {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .film-list-item__menu-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        display: block;
        padding: 2px 4px 0;
      }
      .film-list-item__menu-input {
        width: 100%;
        border-radius: var(--nxt1-radius-md, 10px);
        border: 1px solid var(--log-border, var(--nxt1-color-border-default));
        background: var(--log-surface, var(--nxt1-color-surface-100));
        color: var(--log-text-primary, var(--nxt1-color-text-primary));
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        outline: none;
      }
      .film-list-item__menu-input:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }
      .film-list-item__menu-row {
        display: flex;
        gap: 4px;
      }
      .film-list-item__menu-row .film-list-item__menu-action {
        justify-content: center;
      }
      .film-list-item__menu-confirm-text {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--nxt1-nav-text);
        padding: 2px 4px;
      }
    `,
  ],
})
export class AgentXFilmReviewPanelComponent implements OnChanges, OnDestroy {
  private readonly logger = inject(NxtLoggingService).child('AgentXFilmReviewPanel');
  private readonly service = inject(AgentXFilmReviewService);
  private readonly agentXService = inject(AgentXService);
  protected readonly platform = inject(NxtPlatformService);
  private readonly toast = inject(NxtToastService);
  private readonly archive = inject(NxtArchiveService);
  private readonly uploadService = inject(AgentXVideoUploadService);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly sanitizer = inject(DomSanitizer);
  private readonly safeIframeUrlCache = new Map<string, SafeResourceUrl>();
  private hls: Hls | null = null;
  private hlsConstructor: typeof Hls | null = null;
  private hlsLoadPromise: Promise<typeof Hls | null> | null = null;
  private nativeVideoSourceUrl: string | null = null;
  private nativeVideoSourceIdentity: string | null = null;
  private videoSourceSyncToken = 0;
  private rafId: number | null = null;
  private drawOverlayResizeRafId: number | null = null;
  private drawOverlayResizeObserver: ResizeObserver | null = null;
  private observedOverlayContainer: HTMLElement | null = null;
  private observedOverlayPlayer: HTMLVideoElement | null = null;
  private lastSignalUpdateMs = 0;
  private lastDrawOverlayRenderMs = 0;
  private lastDrawOverlayVisible = false;
  private readonly drawOverlayPlaybackRenderIntervalMs = 100;
  private isScrubbing = false;

  private activeStroke: Array<DrawAnnotationPoint> = [];
  private drawAnnotation: EditableDrawAnnotation | null = null;
  private drawInteraction: DrawInteractionState | null = null;
  private readonly drawHandleSizePx = 11;
  private readonly drawHandleHitPaddingPx = 7;
  private readonly minimumDrawSelectionSize = 0.008;
  private readonly defaultTextEffectWidth = 0.84;
  private readonly defaultTextEffectHeight = 0.18;
  private readonly maxContextAnnotationPoints = 80;
  private readonly maxPersistedAnnotationPoints = 600;
  private readonly drawEffectDurationSec = 1;
  private lastDrawOutsideFrameToastAtMs = 0;
  private lastTimelineFieldTouch: { key: string; atMs: number } | null = null;
  private playAnnotationPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private playAnnotationPersistInFlight: Promise<void> | null = null;
  private playAnnotationPersistQueued = false;
  private currentDrawEffectWindow: { startSec: number; endSec: number } | null = null;
  private currentDrawAnnotationIndex: number | null = null;
  private lastDrawEffectPauseCheckSec: number | null = null;
  private readonly auth = inject(Auth, { optional: true });
  private readonly nativePlaybackSourcePlayIndex = signal<number | null>(null);
  protected readonly selectedCameraAngle = signal<TeamFilmReviewCameraAngle>('wide');
  protected readonly cameraAngleMenuOpen = signal(false);
  private shouldResumeAfterCameraAngleSwitch = false;
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() detailOnly = false;
  @Input() openingSelection = false;
  @Input() showOpenInNewWindow = true;
  /** Feature flag: show draw tools in the video player toolbar. Off by default. */
  @Input() enableDrawTool = false;
  /**
   * When true, the panel skips its own auto-load when `teamId` changes and defers all
   * data-loading to the parent component (e.g. the popout window).  This prevents a
   * race where the panel's limited list fetch (limit 20) overwrites the service state
   * that the parent already set up with a full load + review selection, which would
   * cause `selectedReview()` to return null and silently drop draw-annotation saves.
   *
   * @default false
   */
  @Input() parentManagedLoad = false;

  private filmPlayer?: ElementRef<HTMLVideoElement>;
  private pendingTimestampSeekSec: number | null = null;

  @ViewChild('filmPlayer')
  set filmPlayerRef(player: ElementRef<HTMLVideoElement> | undefined) {
    this.filmPlayer = player;
    if (player) {
      this.scheduleNativeVideoSourceSync();
    }
  }

  @ViewChild('playerContainer') private playerContainer?: ElementRef<HTMLElement>;
  @ViewChild('videoUploadInput') private videoUploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('breakdownUploadInput') private breakdownUploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('drawCanvas') private drawCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('textEffectInput') private textEffectInput?: ElementRef<HTMLTextAreaElement>;

  protected readonly testIds = TEST_IDS.FILM_REVIEW;
  protected readonly filmLibrarySearchInputTestId = 'film-review-search-input';
  protected readonly attachBreakdownContextTestId = 'film-review-attach-breakdown-context-button';
  protected readonly libraryAskAgentButtonTestId = 'film-review-library-ask-agent-button';
  protected readonly libraryAskAgentMenuTestId = 'film-review-library-ask-agent-menu';
  protected readonly libraryAskAgentPromptOptionTestIdPrefix =
    'film-review-library-ask-agent-option-';
  protected readonly askAgentPromptMenuTestId = 'film-review-ask-agent-menu';
  protected readonly askAgentPromptOptionTestIdPrefix = 'film-review-ask-agent-option-';
  protected readonly downloadMenuButtonTestId = 'film-review-download-button';
  protected readonly downloadMenuTestId = 'film-review-download-menu';
  protected readonly downloadVideoOptionTestId = 'film-review-download-video-option';
  protected readonly downloadBreakdownOptionTestId = 'film-review-download-breakdown-option';
  protected readonly availableCameraAngleOptions = computed<readonly FilmReviewCameraAngleOption[]>(
    () => {
      const counts = new Map<TeamFilmReviewCameraAngle, number>();
      const review = this.selectedReview();
      const sources = this.resolvePlaybackSourcesForPlay(review, this.currentPlay());
      for (const source of sources) {
        const cameraAngle = this.resolveSourceAngleMetadata(sources, source).cameraAngle;
        if (!this.isSelectableCameraAngle(cameraAngle)) continue;
        counts.set(cameraAngle, (counts.get(cameraAngle) ?? 0) + 1);
      }

      const selectableOptions = (['wide', 'tight'] as const)
        .filter((cameraAngle) => counts.has(cameraAngle))
        .map((cameraAngle) => ({
          value: cameraAngle,
          label: this.getCameraAngleLabel(cameraAngle),
          sourceCount: counts.get(cameraAngle) ?? 0,
        }));

      if (selectableOptions.length > 0) {
        return selectableOptions;
      }

      return [{ value: 'unknown', label: 'View', sourceCount: sources.length }];
    }
  );
  protected readonly askAgentPromptSections = computed(() =>
    this.isAthleteRole()
      ? FILM_REVIEW_ASK_AGENT_PROMPT_SECTIONS_ATHLETE
      : FILM_REVIEW_ASK_AGENT_PROMPT_SECTIONS_COACH
  );
  protected readonly libraryAskAgentPromptOptions = FILM_REVIEW_LIBRARY_ASK_AGENT_PROMPTS;
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  readonly askAgentPromptRequested = output<string>();
  readonly inlineVideoViewChange = output<boolean>();
  protected readonly timelineSelectAllCheckboxTestId = 'film-review-timeline-select-all-checkbox';
  protected readonly timelinePlaySelectCheckboxTestId = 'film-review-timeline-play-select-checkbox';
  protected readonly filmReviewReleaseLabel = getAgentXReleaseLabel('filmReview');
  protected readonly reviews = this.service.reviews;
  public readonly selectedId = this.service.selectedId;
  protected readonly selectedReview = this.service.selectedReview;
  protected readonly loading = this.service.loading;
  protected readonly saving = this.service.saving;
  protected readonly error = this.service.error;
  protected readonly isEmpty = this.service.isEmpty;
  protected readonly isAthleteRole = computed(() => {
    const role = this.role?.trim().toLowerCase();
    if (role) {
      return role === USER_ROLES.ATHLETE;
    }

    return this.agentXService.hasRole(USER_ROLES.ATHLETE);
  });
  protected readonly isAthleteWithoutTeamContext = computed(
    () => !this.teamId?.trim() && this.isAthleteRole()
  );
  protected readonly currentUserId = computed(
    () => this.agentXService.userContext()?.userId?.trim() ?? ''
  );
  protected readonly effectiveCurrentUserId = computed(
    () => this.currentUserId() || this.auth?.currentUser?.uid?.trim() || ''
  );
  protected readonly inlinePlayOverlayCollapseIconPath = 'M15 6L9 12L15 18';
  protected readonly inlinePlayOverlayExpandIconPath = 'M9 6L15 12L9 18';
  protected readonly filmFrameStepSeconds = 1 / 30;
  protected readonly isVideoView = signal(false);
  protected readonly isPlaying = signal(false);
  protected readonly playerCurrentTime = signal(0);
  protected readonly playerDuration = signal(0);
  protected readonly playbackRate = signal(1);
  protected readonly nativePlayerLoading = signal(false);
  protected readonly cloudflareIframeLoading = signal(false);
  protected readonly cloudflareNativePlaybackFailed = signal(false);
  protected readonly isInlinePlayOverlayExpanded = signal(true);
  private readonly cloudflareStartTimeSec = signal(0);
  private readonly cloudflareAutoplayRequested = signal(false);
  protected readonly isSeekDragLockActive = signal(false);
  protected readonly drawModeEnabled = signal(false);
  protected readonly selectedDrawTool = signal<DrawAnnotationKind>('freehand');
  protected readonly hasDrawing = signal(false);
  protected readonly isRootPlaylistFolderDropActive = signal(false);
  protected readonly openMenuReviewId = signal<string | null>(null);
  protected readonly openPlaylistFolderMenuId = signal<string | null>(null);
  protected readonly isCreatingPlaylistFolder = signal(false);
  protected readonly playlistFolderNameDraft = signal('');
  protected readonly creatingSubfolderParentId = signal<string | null>(null);
  protected readonly editingPlaylistFolderId = signal<string | null>(null);
  protected readonly deletePlaylistFolderConfirmId = signal<string | null>(null);
  protected readonly playlistFolderRenameDraft = signal('');
  protected readonly localPlaylistFolders = signal<readonly LocalFilmReviewPlaylistFolder[]>([]);
  protected readonly localReviewOrderByFolder = signal<FilmReviewOrderByFolder>({});
  protected readonly collapsedPlaylistFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly draggingReviewId = signal<string | null>(null);
  protected readonly draggingPlaylistFolderId = signal<string | null>(null);
  protected readonly isPlaylistFolderReorderDragActive = signal(false);
  protected readonly isPlaylistReviewReorderDragActive = signal(false);
  protected readonly isPlaylistLibraryReorderDragActive = computed(
    () => this.isPlaylistFolderReorderDragActive() || this.isPlaylistReviewReorderDragActive()
  );
  protected readonly activePlaylistDropTargetId = signal<string | null>(null);
  protected readonly activePlaylistFolderDropTargetId = signal<string | null>(null);
  protected readonly renamingReviewId = signal<string | null>(null);
  protected readonly playlistEditingReviewId = signal<string | null>(null);
  protected readonly deleteConfirmReviewId = signal<string | null>(null);
  protected readonly deletingReviewIds = signal<ReadonlySet<string>>(new Set());
  protected readonly renameDraft = signal('');
  protected readonly playlistDraft = signal('');
  protected readonly selectedLibraryReviewIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedLibraryPlaylistIds = signal<ReadonlySet<string>>(new Set());
  protected readonly librarySearchQuery = signal('');
  protected readonly draggingTimelinePlayIndex = signal<number | null>(null);
  protected readonly timelinePlayDropIndicator = signal<TimelinePlayDropIndicator | null>(null);
  protected readonly selectedTimelinePlayIds = signal<ReadonlySet<string>>(new Set());
  protected readonly activeTimelinePlayDownloadIds = signal<ReadonlySet<string>>(new Set());
  protected readonly timelineColumnOrder = signal<readonly string[]>([]);
  protected readonly draggingTimelineColumnId = signal<string | null>(null);
  protected readonly timelineColumnDropIndicator = signal<TimelineColumnDropIndicator | null>(null);
  protected readonly openTimelineColumnMenuId = signal<string | null>(null);
  protected readonly timelineColumnFilters = signal<Record<string, TimelineColumnFilter>>({});
  protected timelineColumnMenuPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -6,
    },
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -6,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 6,
    },
  ];
  protected readonly editingTimelinePlayKey = signal<string | null>(null);
  protected readonly timelinePlayEditDraft = signal('');
  protected readonly isLibraryDragActive = signal(false);
  protected readonly isUploadingLibraryVideo = signal(false);
  protected readonly isImportingBreakdown = signal(false);
  protected readonly openUploadMenuAnchor = signal<FilmReviewUploadMenuAnchor | null>(null);
  protected readonly isLibraryAskAgentMenuVisible = signal(false);
  protected readonly openAskAgentMenuReviewId = signal<string | null>(null);
  protected readonly openDownloadMenuReviewId = signal<string | null>(null);
  protected readonly activeDownloadExportReviewIds = signal<ReadonlySet<string>>(new Set());
  protected readonly pendingUploadSelectionMode = signal<FilmReviewUploadSelectionMode>('batch');
  protected readonly filmListLimit = signal(FILM_REVIEW_LIST_INITIAL_LIMIT);
  protected readonly libraryVideoUploadPercent = signal<number | null>(null);
  protected readonly libraryUploadCurrentFile = signal(0);
  protected readonly libraryUploadTotalFiles = signal(0);
  protected readonly libraryUploadError = signal<string | null>(null);
  protected readonly panelSport = signal('');
  protected readonly playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  protected readonly acceptedVideoUploadTypes = AGENT_X_ALLOWED_MIME_TYPES.filter((type) =>
    type.startsWith('video/')
  ).join(',');
  protected readonly acceptedBreakdownTypes = [
    'text/csv',
    'text/plain',
    'text/tab-separated-values',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv',
    '.tsv',
    '.txt',
    '.xls',
    '.xlsx',
  ].join(',');
  protected readonly acceptedLibraryUploadTypes = [
    this.acceptedVideoUploadTypes,
    this.acceptedBreakdownTypes,
  ].join(',');
  private activeLibraryUploadHandle: VideoUploadHandle | null = null;
  protected readonly effectiveSportContext = computed(() => {
    const reviewSport = this.selectedReview()?.sport?.trim().toLowerCase();
    return this.panelSport() || reviewSport || '';
  });
  protected readonly currentTimelineTagColumns = computed(() =>
    getTeamFilmReviewSportTagDefinitions(this.effectiveSportContext())
  );
  protected readonly defaultTimelineColumns = computed(() =>
    this.buildDefaultTimelineColumns(this.currentTimelineTagColumns())
  );
  protected readonly currentTimelineColumns = computed(() =>
    this.applyTimelineColumnOrder(this.defaultTimelineColumns(), this.timelineColumnOrder())
  );
  protected readonly currentTimeline = computed<readonly FilmTimelinePlay[]>(() =>
    this.resolveEffectiveTimeline(this.selectedReview())
  );
  protected readonly hasActiveTimelineFilters = computed(
    () => Object.keys(this.timelineColumnFilters()).length > 0
  );
  protected readonly filteredTimelineRows = computed<readonly TimelineFilteredPlayRow[]>(() => {
    const timeline = this.currentTimeline();
    const filters = this.timelineColumnFilters();
    const filterEntries = Object.entries(filters);
    if (filterEntries.length === 0) {
      return timeline.map((play, originalIndex) => ({ play, originalIndex }));
    }

    return timeline
      .map((play, originalIndex) => ({ play, originalIndex }))
      .filter(({ play }) =>
        filterEntries.every(([columnId, filterState]) => {
          const column = this.currentTimelineColumns().find((item) => item.id === columnId);
          if (!column) return true;

          const value = this.normalizeTimelineFilterValue(
            this.getTimelineColumnDisplayValue(play, column)
          );
          const expected = this.normalizeTimelineFilterValue(filterState.value);
          const isMatch = value === expected;
          return filterState.mode === 'include' ? isMatch : !isMatch;
        })
      );
  });
  protected readonly activeTimelineFilterChips = computed<readonly TimelineColumnFilterChip[]>(() =>
    Object.entries(this.timelineColumnFilters())
      .map(([columnId, filterState]) => {
        const column = this.currentTimelineColumns().find((item) => item.id === columnId);
        if (!column) return null;

        return {
          columnId,
          columnLabel: column.label,
          mode: filterState.mode,
          value: filterState.value,
        };
      })
      .filter((chip): chip is TimelineColumnFilterChip => chip !== null)
  );
  protected readonly filteredTimelineCount = computed(() => this.filteredTimelineRows().length);
  protected readonly selectedFilteredTimelineRowCount = computed(() => {
    const selectedIds = this.selectedTimelinePlayIds();
    if (selectedIds.size === 0) return 0;

    return this.filteredTimelineRows().reduce((count, row) => {
      const playId = this.resolveTimelinePlaySelectionId(row.play, row.originalIndex);
      return selectedIds.has(playId) ? count + 1 : count;
    }, 0);
  });
  protected readonly areAllFilteredTimelineRowsSelected = computed(() => {
    const rows = this.filteredTimelineRows();
    return rows.length > 0 && this.selectedFilteredTimelineRowCount() === rows.length;
  });
  protected readonly isSomeFilteredTimelineRowsSelected = computed(() => {
    const selectedCount = this.selectedFilteredTimelineRowCount();
    const totalCount = this.filteredTimelineRows().length;
    return selectedCount > 0 && selectedCount < totalCount;
  });
  protected readonly selectedLibraryReviewCount = computed(() => {
    const selectedIds = this.selectedLibraryReviewIds();
    if (selectedIds.size === 0) return 0;

    return this.reviews().reduce(
      (count, review) => (selectedIds.has(review.id) ? count + 1 : count),
      0
    );
  });
  protected readonly selectedLibraryAskAgentSelectionCount = computed(() => {
    const { selectedPlaylistFolders, selectedReviewsOutsidePlaylists } =
      this.resolveEffectiveLibraryAskAgentSelection();
    return selectedPlaylistFolders.length + selectedReviewsOutsidePlaylists.length;
  });
  protected readonly selectedLibraryReviews = computed<readonly FilmReviewDragSource[]>(() => {
    const selectedIds = this.selectedLibraryReviewIds();
    if (selectedIds.size === 0) return [];

    return this.reviews().filter((review) => selectedIds.has(review.id));
  });
  protected readonly canDownloadSelectedLibraryReviews = computed(() =>
    this.selectedLibraryReviews().some(
      (review) => this.resolveReviewArchiveEntries(review).length > 0
    )
  );
  protected readonly canLoadMoreReviews = computed(
    () => !this.loading() && this.service.totalReviewCount() > this.reviews().length
  );
  protected readonly currentFilteredPlayPosition = computed(() => {
    const rows = this.filteredTimelineRows();
    const index = rows.findIndex((row) => row.originalIndex === this.currentPlayIndex());
    return index >= 0 ? index + 1 : 0;
  });
  protected readonly currentTimelineGridTemplate = computed(() =>
    this.buildTimelineGridTemplate(this.currentTimelineColumns())
  );
  protected readonly isTimelinePlayReorderActive = computed(
    () => this.draggingTimelinePlayIndex() !== null
  );
  protected readonly playlistFolders = computed<readonly FilmReviewPlaylistFolder[]>(() => {
    const localFolders = this.localPlaylistFolders();
    const reviewOrderByFolder = this.localReviewOrderByFolder();
    const folderSortOrder = new Map<string, number>();
    let nextFolderSortOrder = 0;
    for (const folder of localFolders) {
      folderSortOrder.set(folder.id, nextFolderSortOrder);
      nextFolderSortOrder += 1;
    }

    const ensureFolderSortOrder = (folderId: string): number => {
      const existingOrder = folderSortOrder.get(folderId);
      if (typeof existingOrder === 'number') {
        return existingOrder;
      }

      const fallbackOrder = nextFolderSortOrder;
      folderSortOrder.set(folderId, fallbackOrder);
      nextFolderSortOrder += 1;
      return fallbackOrder;
    };

    const folders = new Map<
      string,
      {
        name: string;
        reviews: FilmListReview[];
        isUnassigned?: boolean;
        parentId?: string | null;
        sortOrder: number;
      }
    >();
    folders.set(FILM_REVIEW_UNASSIGNED_PLAYLIST_ID, {
      name: 'Unassigned Film',
      reviews: [],
      isUnassigned: true,
      parentId: null,
      sortOrder: Number.MAX_SAFE_INTEGER,
    });

    for (const folder of localFolders) {
      folders.set(folder.id, {
        name: folder.name,
        reviews: [],
        parentId: folder.parentId?.trim() || null,
        sortOrder: ensureFolderSortOrder(folder.id),
      });
    }

    for (const review of this.reviews()) {
      const playlist = this.resolveReviewPlaylist(review);
      const folderId = playlist?.id ?? FILM_REVIEW_UNASSIGNED_PLAYLIST_ID;
      const folderName = playlist?.name ?? 'Unassigned Film';
      const current = folders.get(folderId) ?? {
        name: folderName,
        reviews: [],
        isUnassigned: folderId === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID,
        parentId: null,
        sortOrder: ensureFolderSortOrder(folderId),
      };
      current.reviews.push(review);
      folders.set(folderId, current);
    }

    const orderFolderReviews = (
      folderId: string,
      folderReviews: readonly FilmListReview[]
    ): readonly FilmListReview[] => {
      if (folderReviews.length <= 1) {
        return folderReviews;
      }

      const persistedOrder = reviewOrderByFolder[folderId] ?? [];
      if (persistedOrder.length === 0) {
        return folderReviews;
      }

      const reviewById = new Map(folderReviews.map((review) => [review.id, review] as const));
      const orderedReviews: FilmListReview[] = [];
      for (const reviewId of persistedOrder) {
        const review = reviewById.get(reviewId);
        if (review) {
          orderedReviews.push(review);
          reviewById.delete(reviewId);
        }
      }

      for (const review of folderReviews) {
        if (reviewById.has(review.id)) {
          orderedReviews.push(review);
          reviewById.delete(review.id);
        }
      }

      return orderedReviews;
    };

    const resolvedFolders: FilmReviewPlaylistFolder[] = [];
    const visited = new Set<string>();

    const appendFolder = (folderId: string, depth: number): void => {
      if (visited.has(folderId)) return;
      const folder = folders.get(folderId);
      if (!folder) return;

      visited.add(folderId);
      resolvedFolders.push({
        id: folderId,
        name: folder.name,
        reviews: orderFolderReviews(folderId, folder.reviews),
        isUnassigned: folder.isUnassigned,
        parentId: folder.parentId ?? null,
        depth,
      });

      const childFolders = [...folders.entries()]
        .filter(
          ([id, item]) =>
            id !== FILM_REVIEW_UNASSIGNED_PLAYLIST_ID &&
            (item.parentId?.trim() ?? null) === folderId
        )
        .sort(
          (left, right) =>
            left[1].sortOrder - right[1].sortOrder || left[1].name.localeCompare(right[1].name)
        );

      for (const [childId] of childFolders) {
        appendFolder(childId, depth + 1);
      }
    };

    const rootFolders = [...folders.entries()]
      .filter(
        ([id, folder]) =>
          id !== FILM_REVIEW_UNASSIGNED_PLAYLIST_ID &&
          (!folder.parentId?.trim() || !folders.has(folder.parentId.trim()))
      )
      .sort(
        (left, right) =>
          left[1].sortOrder - right[1].sortOrder || left[1].name.localeCompare(right[1].name)
      );

    for (const [folderId] of rootFolders) {
      appendFolder(folderId, 0);
    }

    const unassignedFolder = folders.get(FILM_REVIEW_UNASSIGNED_PLAYLIST_ID);
    if (unassignedFolder && (unassignedFolder.reviews.length > 0 || folders.size === 1)) {
      resolvedFolders.push({
        id: FILM_REVIEW_UNASSIGNED_PLAYLIST_ID,
        name: unassignedFolder.name,
        reviews: orderFolderReviews(FILM_REVIEW_UNASSIGNED_PLAYLIST_ID, unassignedFolder.reviews),
        isUnassigned: true,
        parentId: null,
        depth: 0,
      });
    }

    return resolvedFolders;
  });

  protected readonly playlistFolderTree = computed<readonly FilmReviewPlaylistFolderTreeNode[]>(
    () => {
      const flatFolders = this.playlistFolders();
      const nodeMap = new Map<
        string,
        FilmReviewPlaylistFolder & { children: FilmReviewPlaylistFolderTreeNode[] }
      >();

      for (const folder of flatFolders) {
        nodeMap.set(folder.id, {
          ...folder,
          children: [],
        });
      }

      const roots: FilmReviewPlaylistFolderTreeNode[] = [];
      for (const folder of flatFolders) {
        const node = nodeMap.get(folder.id);
        if (!node) {
          continue;
        }

        if (folder.parentId && nodeMap.has(folder.parentId) && !folder.isUnassigned) {
          nodeMap.get(folder.parentId)?.children.push(node);
          continue;
        }

        roots.push(node);
      }

      return roots;
    }
  );
  protected readonly normalizedLibrarySearchQuery = computed(() =>
    this.normalizeLibrarySearchQuery(this.librarySearchQuery())
  );
  protected readonly hasLibrarySearchQuery = computed(
    () => this.normalizedLibrarySearchQuery().length > 0
  );
  protected readonly filteredPlaylistFolderTree = computed<
    readonly FilmReviewPlaylistFolderTreeNode[]
  >(() => {
    const query = this.normalizedLibrarySearchQuery();
    const tree = this.playlistFolderTree();
    if (!query) {
      return tree;
    }

    return tree
      .map((folder) => this.filterPlaylistFolderTreeNode(folder, query))
      .filter((folder): folder is FilmReviewPlaylistFolderTreeNode => folder !== null);
  });
  protected readonly filteredLibraryReviewCount = computed(() =>
    this.countPlaylistFolderTreeReviews(this.filteredPlaylistFolderTree())
  );

  // Timeline play navigation state - using inline type for portability
  protected readonly currentPlayIndex = signal(0);

  // Video tab management state
  protected readonly openVideoTabIds = signal<readonly string[]>([]);
  private readonly openVideoTabReviewCache = signal<Record<string, FilmListReview>>({});
  public readonly visibleOpenTabs = computed(() => {
    const reviews = this.reviews();
    const tabIds = this.openVideoTabIds();
    const cachedById = this.openVideoTabReviewCache();
    const reviewsById = new Map(reviews.map((review) => [review.id, review] as const));

    if (tabIds.length === 0) {
      return [];
    }

    return tabIds
      .map((id) => reviewsById.get(id) ?? cachedById[id])
      .filter((review): review is Exclude<(typeof reviews)[0], undefined> => review !== undefined);
  });

  public isInlineVideoView(): boolean {
    return this.isVideoView();
  }

  public getInlineHeaderTitle(): string {
    const review = this.selectedReview();
    return review ? this.getReviewDisplayTitle(review) : 'Film Review';
  }

  public getActivePlaybackSelectedContext(): AgentXSelectedContext | null {
    const review = this.selectedReview();
    if (!review || !this.isVideoView()) return null;

    const currentPlay = this.currentPlay();
    if (currentPlay) {
      return this.buildFilmPlayDragContext(review, currentPlay, this.currentPlayIndex());
    }

    const playbackSource = this.currentPlaybackSource();
    if (!playbackSource) {
      return this.buildFilmReviewDragContext(review);
    }

    return this.buildFilmReviewSourceContext(review, playbackSource);
  }

  public backToLibrary(): void {
    void this.onBackToLibrary();
  }

  protected onLibrarySearchInput(value: string): void {
    this.librarySearchQuery.set(value);
  }

  protected onClearLibrarySearch(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.librarySearchQuery.set('');
  }

  public async refreshData(options?: { readonly background?: boolean }): Promise<void> {
    const teamId = this.teamId?.trim() || null;

    await this.service.load(teamId, this.panelSport() || undefined, this.filmListLimit(), options);
    this.timelineColumnOrder.set(this.loadPersistedTimelineColumnOrder());
  }

  public async seekToTimestampMs(
    timeMs: number,
    options: { readonly filmReviewId?: string | null; readonly sourceId?: string | null } = {}
  ): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < 0) return;

    const requestedReviewId = options.filmReviewId?.trim() || null;
    const requestedSourceId = options.sourceId?.trim() || null;
    let review = this.selectedReview();
    if (requestedReviewId && review?.id !== requestedReviewId) {
      await this.onSelectReview(requestedReviewId);
      review = this.selectedReview();
    }

    if (!review) {
      const teamId = this.teamId?.trim();
      if (teamId) {
        await this.loadFilmReviews(teamId);
        review = this.selectedReview();
      }
    }

    if (!review) return;

    const seconds = Math.max(0, timeMs / 1000);
    if (!this.isVideoView()) {
      await this.onSelectReview(review.id);
      review = this.selectedReview() ?? review;
    }

    const timeline = this.resolveEffectiveTimeline(review);
    const activeSourceId =
      requestedSourceId || this.getNativePlaybackSourcePlay()?.sourceId?.trim() || null;
    const matchingPlayIndex = timeline.findIndex((play) => {
      if (activeSourceId && play.sourceId?.trim() !== activeSourceId) {
        return false;
      }

      return seconds >= play.startSec && seconds <= play.endSec;
    });
    const sourceFallbackIndex =
      matchingPlayIndex >= 0 || !requestedSourceId
        ? -1
        : timeline.findIndex((play) => play.sourceId?.trim() === requestedSourceId);
    const targetPlayIndex = matchingPlayIndex >= 0 ? matchingPlayIndex : sourceFallbackIndex;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    if (targetPlayIndex >= 0) {
      this.currentPlayIndex.set(targetPlayIndex);
      if (requestedSourceId) {
        this.nativePlaybackSourcePlayIndex.set(targetPlayIndex);
      }
      this.restoreDrawOverlayForPlay(timeline[targetPlayIndex] ?? null);
    } else {
      this.restoreDrawOverlayForPlay(null);
    }

    if (this.jumpCloudflareIframeTo(seconds)) {
      this.pendingTimestampSeekSec = null;
      return;
    }

    const nextVideoUrl = this.resolveNativeVideoUrl(review, this.getNativePlaybackSourcePlay());
    if (nextVideoUrl && this.nativeVideoSourceUrl !== nextVideoUrl) {
      this.pendingTimestampSeekSec = seconds;
      this.updatePlayerTimeSignal(seconds, true);
      this.syncSeekUi(seconds);
      this.scheduleNativeVideoSourceSync();
      return;
    }

    const player = this.filmPlayer?.nativeElement;
    if (!player || player.readyState < 1) {
      this.pendingTimestampSeekSec = seconds;
      this.updatePlayerTimeSignal(seconds, true);
      this.syncSeekUi(seconds);
      this.scheduleNativeVideoSourceSync();
      return;
    }

    this.pendingTimestampSeekSec = null;
    this.jumpTo(seconds);
  }

  protected readonly currentPlay = computed<FilmTimelinePlay | null>(() => {
    const timeline = this.currentTimeline();
    const idx = this.currentPlayIndex();
    if (idx < 0 || idx >= timeline.length) return null;
    return timeline[idx] ?? null;
  });
  protected readonly currentPlaybackSource = computed<FilmReviewPlaybackSource | null>(() =>
    this.resolvePlaybackSource(this.selectedReview(), this.getNativePlaybackSourcePlay())
  );

  constructor() {
    effect(() => {
      this.isVideoView();
      this.inlineVideoViewChange.emit(this.isInlineVideoView());
    });

    effect(() => {
      const rows = this.filteredTimelineRows();
      const currentIndex = this.currentPlayIndex();
      const hasActive = rows.some((row) => row.originalIndex === currentIndex);

      if (rows.length > 0 && !hasActive) {
        this.currentPlayIndex.set(rows[0]!.originalIndex);
      }
    });

    effect(() => {
      const visibleReviewIds = new Set(this.reviews().map((review) => review.id));
      const currentSelection = this.selectedLibraryReviewIds();

      if (currentSelection.size === 0) return;

      let didChange = false;
      const nextSelection = new Set<string>();

      for (const reviewId of currentSelection) {
        if (visibleReviewIds.has(reviewId)) {
          nextSelection.add(reviewId);
        } else {
          didChange = true;
        }
      }

      if (didChange) {
        this.selectedLibraryReviewIds.set(nextSelection);
      }

      this.pruneSelectedLibraryPlaylistSelections();
    });

    effect(() => {
      this.playlistFolderTree();
      this.selectedLibraryReviewIds();
      this.pruneSelectedLibraryPlaylistSelections();
    });

    effect(() => {
      const visibleIds = new Set(
        this.filteredTimelineRows().map((row) =>
          this.resolveTimelinePlaySelectionId(row.play, row.originalIndex)
        )
      );
      const currentSelection = this.selectedTimelinePlayIds();

      if (currentSelection.size === 0) return;

      let didChange = false;
      const nextSelection = new Set<string>();

      for (const playId of currentSelection) {
        if (visibleIds.has(playId)) {
          nextSelection.add(playId);
        } else {
          didChange = true;
        }
      }

      if (didChange) {
        this.selectedTimelinePlayIds.set(nextSelection);
      }
    });

    effect(() => {
      if (!this.isVideoView()) return;

      const review = this.selectedReview();
      if (!review) return;

      this.playerDuration.set(
        this.resolveReviewDurationSec(review, this.getNativePlaybackSourcePlay())
      );
      this.scheduleNativeVideoSourceSync();
    });
  }

  protected readonly currentInlinePlayOverlayCounter = computed(() => {
    const play = this.currentPlay();
    const timeline = this.currentTimeline();
    if (timeline.length === 0 || !play) return null;
    return `${this.currentPlayIndex() + 1}/${timeline.length}`;
  });
  private pendingTimelinePlayFieldSaveKey: string | null = null;
  protected readonly currentInlinePlayOverlayItems = computed(() => {
    const play = this.currentPlay();
    if (!play) return [] as Array<{ label: string; value: string }>;

    return this.currentTimelineColumns().map((column) => ({
      label: column.label,
      value: this.getTimelineColumnDisplayValue(play, column),
    }));
  });
  protected readonly drawEffectMarkers = computed<readonly DrawEffectMarker[]>(() => {
    const play = this.currentPlay();
    if (!play) return [];

    return this.resolveStoredPlayAnnotations(play)
      .map((annotation, annotationIndex) => {
        const window = this.resolveDrawEffectWindowForPlay(play, annotation);
        if (!window) return null;

        return {
          id: this.buildDrawEffectMarkerId(this.currentPlayIndex(), annotationIndex),
          atSec: this.roundPlaybackSecond(window.startSec),
          durationSec: this.roundPlaybackSecond(window.endSec - window.startSec),
        };
      })
      .filter((marker): marker is DrawEffectMarker => marker !== null);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['detailOnly']) {
      this.inlineVideoViewChange.emit(this.isInlineVideoView());
    }

    if (!changes['teamId'] && !changes['sport']) return;

    this.panelSport.set(this.normalizeSport(this.sport) ?? '');

    // When the parent owns the data-loading lifecycle, skip auto-loading to avoid
    // race conditions where this panel's limited list fetch (default limit 20) could
    // overwrite service state already set up by the parent (e.g. a 200-item load +
    // review selection), causing `selectedReview()` to return null and silently
    // dropping draw-annotation saves.
    if (this.parentManagedLoad) return;

    const teamId = this.teamId?.trim();
    if (!teamId) return;

    const teamChanged = !!changes['teamId'];
    const isInitialTeamBinding = teamChanged && changes['teamId']?.firstChange;

    if (teamChanged && !isInitialTeamBinding) {
      this.localPlaylistFolders.set([]);
      this.timelineColumnOrder.set(this.loadPersistedTimelineColumnOrder());
      this.filmListLimit.set(FILM_REVIEW_LIST_INITIAL_LIMIT);

      this.isVideoView.set(false);
      this.currentPlayIndex.set(0);
      this.nativePlaybackSourcePlayIndex.set(null);
      this.timelineColumnFilters.set({});
      this.openTimelineColumnMenuId.set(null);
      this.destroyHls();
      this.nativeVideoSourceUrl = null;
      this.nativeVideoSourceIdentity = null;
      this.cloudflareNativePlaybackFailed.set(false);
      this.resetTimelinePlayEditing();
    }

    void this.loadFilmReviews(teamId);
  }

  protected readonly retryLoad = (): void => {
    const teamId = this.teamId?.trim();
    if (!teamId) return;

    this.isVideoView.set(false);
    this.currentPlayIndex.set(0);
    this.nativePlaybackSourcePlayIndex.set(null);
    this.timelineColumnFilters.set({});
    this.openTimelineColumnMenuId.set(null);
    this.filmListLimit.set(FILM_REVIEW_LIST_INITIAL_LIMIT);
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.nativeVideoSourceIdentity = null;
    this.cloudflareNativePlaybackFailed.set(false);
    this.resetTimelinePlayEditing();
    void this.loadFilmReviews(teamId);
  };

  protected onPlaylistCreateToggle(): void {
    this.isCreatingPlaylistFolder.update((current) => !current);
    this.creatingSubfolderParentId.set(null);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistFolderNameInput(value: string): void {
    this.playlistFolderNameDraft.set(value);
  }

  protected onPlaylistCreateCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.isCreatingPlaylistFolder.set(false);
    this.creatingSubfolderParentId.set(null);
    this.playlistFolderNameDraft.set('');
  }

  protected async onPlaylistCreateConfirm(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    const name = this.playlistFolderNameDraft().trim();
    if (!name) {
      this.toast.error('Name the folder first.');
      return;
    }

    const parentId = this.creatingSubfolderParentId()?.trim() || null;
    const id = this.buildPlaylistFolderId(name, parentId);
    const existingFolder = this.playlistFolders().find((folder) => folder.id === id) ?? null;

    try {
      if (!existingFolder) {
        await this.ensurePersistedPlaylistFolder(name, parentId, id);
      } else if (!existingFolder.isUnassigned) {
        await this.ensurePersistedPlaylistFolderForExisting(existingFolder);
      }
      this.syncLocalPlaylistFoldersFromService();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      this.toast.error(message);
      return;
    }

    if (parentId) {
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }

    this.collapsedPlaylistFolderIds.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    this.isCreatingPlaylistFolder.set(false);
    this.creatingSubfolderParentId.set(null);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistCreateFromMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.resetMenuState();
    this.isCreatingPlaylistFolder.set(true);
    this.creatingSubfolderParentId.set(null);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistCreateSubfolderStart(folder: FilmReviewPlaylistFolder, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.resetMenuState();
    this.isCreatingPlaylistFolder.set(true);
    this.creatingSubfolderParentId.set(folder.id);
    this.playlistFolderNameDraft.set('');
  }

  protected isEditingPlaylistFolder(folderId: string): boolean {
    return this.editingPlaylistFolderId() === folderId;
  }

  protected isPlaylistFolderMenuOpen(folderId: string): boolean {
    return this.openPlaylistFolderMenuId() === folderId;
  }

  protected isDeletingPlaylistFolder(folderId: string): boolean {
    return this.deletePlaylistFolderConfirmId() === folderId;
  }

  protected onOpenPlaylistFolderMenu(folderEvent: Event, folder: FilmReviewPlaylistFolder): void {
    folderEvent.preventDefault();
    folderEvent.stopPropagation();

    if (this.openPlaylistFolderMenuId() === folder.id) {
      this.resetMenuState();
      return;
    }

    this.resetMenuState();
    this.openPlaylistFolderMenuId.set(folder.id);
    this.playlistFolderRenameDraft.set(folder.name);
  }

  protected onPlaylistFolderRenameStart(folder: FilmReviewPlaylistFolder, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.openPlaylistFolderMenuId.set(folder.id);
    this.editingPlaylistFolderId.set(folder.id);
    this.deletePlaylistFolderConfirmId.set(null);
    this.playlistFolderRenameDraft.set(folder.name);
  }

  protected onPlaylistFolderRenameInput(value: string): void {
    this.playlistFolderRenameDraft.set(value);
  }

  protected onPlaylistFolderRenameCancel(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingPlaylistFolderId.set(null);
    this.playlistFolderRenameDraft.set('');
  }

  protected async onPlaylistFolderRenameConfirm(
    folder: FilmReviewPlaylistFolder,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    const nextName = this.playlistFolderRenameDraft().trim();
    if (!nextName) {
      this.toast.error('Name the folder first.');
      return;
    }

    if (nextName === folder.name) {
      this.resetMenuState();
      return;
    }

    try {
      const persistedFolder = this.hasPersistedPlaylistFolder(folder.id);
      const targetFolder = persistedFolder
        ? await this.service.updatePlaylistFolder(folder.id, { name: nextName })
        : await this.ensurePersistedPlaylistFolder(nextName, folder.parentId ?? null);

      if (!persistedFolder) {
        await Promise.all(
          folder.reviews.map((review) =>
            this.service.updateReviewPlaylist(review.id, targetFolder.id, targetFolder.name)
          )
        );
      }

      this.syncLocalPlaylistFoldersFromService();
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        next.delete(targetFolder.id);
        return next;
      });
      this.resetMenuState();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename folder';
      this.toast.error(message);
    }
  }

  protected onPlaylistFolderDeleteStart(folder: FilmReviewPlaylistFolder, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.openPlaylistFolderMenuId.set(folder.id);
    this.editingPlaylistFolderId.set(null);
    this.deletePlaylistFolderConfirmId.set(folder.id);
  }

  protected onPlaylistFolderDeleteCancel(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.deletePlaylistFolderConfirmId.set(null);
  }

  protected async onPlaylistFolderDeleteConfirm(
    folder: FilmReviewPlaylistFolder,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    try {
      if (this.hasPersistedPlaylistFolder(folder.id)) {
        await this.service.deletePlaylistFolder(folder.id);
      } else {
        await Promise.all(
          folder.reviews.map((review) => this.service.updateReviewPlaylist(review.id, null, null))
        );
      }
      this.syncLocalPlaylistFoldersFromService();
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      this.resetMenuState();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete folder';
      this.toast.error(message);
    }
  }

  protected isPlaylistFolderExpanded(folderId: string): boolean {
    return !this.collapsedPlaylistFolderIds().has(folderId);
  }

  protected togglePlaylistFolder(folderId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.collapsedPlaylistFolderIds.update((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  protected onPlaylistFolderReorderDragStart(): void {
    this.isPlaylistFolderReorderDragActive.set(true);
    this.clearPlaylistLibraryDropState();
  }

  protected onPlaylistFolderReorderDragEnd(): void {
    this.isPlaylistFolderReorderDragActive.set(false);
  }

  protected onPlaylistReviewReorderDragStart(): void {
    this.isPlaylistReviewReorderDragActive.set(true);
    this.clearPlaylistLibraryDropState();
  }

  protected onPlaylistReviewReorderDragEnd(): void {
    this.isPlaylistReviewReorderDragActive.set(false);
  }

  protected onReviewPlaylistDragStart(review: FilmListReview, event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      event.preventDefault();
      return;
    }

    if (!this.hasReviewWriteAccess(review)) {
      event.preventDefault();
      this.notifyWriteAccessDenied();
      return;
    }

    this.draggingReviewId.set(review.id);
    event.dataTransfer?.setData(FILM_REVIEW_PLAYLIST_DRAG_MIME, review.id);
  }

  protected onReviewPlaylistDragEnd(): void {
    this.draggingReviewId.set(null);
    this.activePlaylistDropTargetId.set(null);
  }

  protected onPlaylistFolderDragStart(folder: FilmReviewPlaylistFolder, event: DragEvent): void {
    if (folder.isUnassigned || this.isPlaylistLibraryReorderDragActive()) {
      event.preventDefault();
      return;
    }

    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      event.preventDefault();
      this.notifyWriteAccessDenied();
      return;
    }

    this.draggingPlaylistFolderId.set(folder.id);
    event.dataTransfer?.setData(FILM_REVIEW_PLAYLIST_FOLDER_DRAG_MIME, folder.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
    }
  }

  protected onPlaylistFolderDragEnd(): void {
    this.draggingPlaylistFolderId.set(null);
    this.activePlaylistFolderDropTargetId.set(null);
    this.isRootPlaylistFolderDropActive.set(false);
  }

  protected canReorderPlaylistFolders(
    folders: readonly FilmReviewPlaylistFolderTreeNode[]
  ): boolean {
    return folders.filter((folder) => !folder.isUnassigned).length > 1;
  }

  protected async onPlaylistFolderReorder(
    event: CdkDragDrop<readonly FilmReviewPlaylistFolderTreeNode[]>,
    parentId: string | null
  ): Promise<void> {
    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const nextFolders = [...event.container.data].filter((folder) => !folder.isUnassigned);
    if (nextFolders.length <= 1) {
      return;
    }

    moveItemInArray(nextFolders, event.previousIndex, event.currentIndex);
    const normalizedParentId = parentId?.trim() || null;

    try {
      await Promise.all(
        nextFolders.map(async (folder, index) => {
          const ensured = await this.ensurePersistedPlaylistFolderForExisting(folder);
          await this.service.updatePlaylistFolder(ensured.id, {
            parentId: normalizedParentId,
            sortOrder: index,
          });
        })
      );
      this.syncLocalPlaylistFoldersFromService();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder folders';
      this.toast.error(message);
    }
  }

  protected onPlaylistFolderDragOver(folderId: string, event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    const draggingReviewId =
      this.draggingReviewId() ?? event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_DRAG_MIME) ?? '';
    const draggingFolderId =
      this.draggingPlaylistFolderId() ??
      event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_FOLDER_DRAG_MIME) ??
      '';

    if (!draggingReviewId && !draggingFolderId) return;

    if (draggingFolderId && !this.canMovePlaylistFolderInto(draggingFolderId, folderId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (draggingReviewId) {
      this.activePlaylistDropTargetId.set(folderId);
    }
    if (draggingFolderId) {
      this.activePlaylistFolderDropTargetId.set(folderId);
    }
  }

  protected onPlaylistFolderDragLeave(folderId: string, event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (
      currentTarget instanceof HTMLElement &&
      relatedTarget instanceof Node &&
      currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    if (this.activePlaylistDropTargetId() === folderId) {
      this.activePlaylistDropTargetId.set(null);
    }
    if (this.activePlaylistFolderDropTargetId() === folderId) {
      this.activePlaylistFolderDropTargetId.set(null);
    }
  }

  protected async onPlaylistFolderDrop(
    folder: FilmReviewPlaylistFolder,
    event: DragEvent
  ): Promise<void> {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const reviewId =
      this.draggingReviewId() ?? event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_DRAG_MIME) ?? '';
    const draggingFolderId =
      this.draggingPlaylistFolderId() ??
      event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_FOLDER_DRAG_MIME) ??
      '';
    this.draggingReviewId.set(null);
    this.draggingPlaylistFolderId.set(null);
    this.activePlaylistDropTargetId.set(null);
    this.activePlaylistFolderDropTargetId.set(null);

    if (draggingFolderId) {
      if (!this.hasPlaylistFolderWriteAccess(folder)) {
        this.notifyWriteAccessDenied();
        return;
      }

      if (!this.canMovePlaylistFolderInto(draggingFolderId, folder.id)) {
        return;
      }

      const draggedFolder =
        this.playlistFolders().find((item) => item.id === draggingFolderId) ?? null;
      if (!draggedFolder) {
        return;
      }

      try {
        const parentFolder = await this.ensurePersistedPlaylistFolderForExisting(folder);
        const ensuredDraggedFolder =
          await this.ensurePersistedPlaylistFolderForExisting(draggedFolder);
        const siblingCount = this.localPlaylistFolders().filter(
          (item) =>
            (item.parentId?.trim() || null) === parentFolder.id &&
            item.id !== ensuredDraggedFolder.id
        ).length;

        await this.service.updatePlaylistFolder(ensuredDraggedFolder.id, {
          parentId: parentFolder.id,
          sortOrder: siblingCount,
        });
        this.syncLocalPlaylistFoldersFromService();
        this.collapsedPlaylistFolderIds.update((current) => {
          const next = new Set(current);
          next.delete(folder.id);
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to move folder';
        this.toast.error(message);
      }
      return;
    }

    if (!reviewId) return;

    const draggingReview = this.reviews().find((item) => item.id === reviewId) ?? null;
    if (!draggingReview || !this.hasReviewWriteAccess(draggingReview)) {
      this.notifyWriteAccessDenied();
      return;
    }

    try {
      const targetFolder = folder.isUnassigned
        ? null
        : await this.ensurePersistedPlaylistFolderForExisting(folder);
      await this.service.updateReviewPlaylist(
        reviewId,
        targetFolder?.id ?? null,
        targetFolder?.name ?? null
      );
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move video';
      this.toast.error(message);
    }
  }

  protected async onMoveReviewToPlaylist(
    review: FilmListReview,
    folder: FilmReviewPlaylistFolder,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (!this.hasReviewWriteAccess(review) || !this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    try {
      const targetFolder = folder.isUnassigned
        ? null
        : await this.ensurePersistedPlaylistFolderForExisting(folder);
      await this.service.updateReviewPlaylist(
        review.id,
        targetFolder?.id ?? null,
        targetFolder?.name ?? null
      );
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      this.resetMenuState();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move video';
      this.toast.error(message);
    }
  }

  protected canReorderFolderReviews(reviews: readonly FilmListReview[]): boolean {
    return reviews.length > 1;
  }

  protected onFolderReviewReorder(
    folder: FilmReviewPlaylistFolder,
    event: CdkDragDrop<readonly FilmListReview[]>
  ): void {
    if (!this.hasPlaylistFolderWriteAccess(folder)) {
      this.notifyWriteAccessDenied();
      return;
    }

    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const nextReviews = [...event.container.data];
    moveItemInArray(nextReviews, event.previousIndex, event.currentIndex);
    this.persistLocalReviewOrder(
      folder.id,
      nextReviews.map((review) => review.id)
    );
  }

  private canMovePlaylistFolderInto(draggingFolderId: string, targetFolderId: string): boolean {
    if (!draggingFolderId || !targetFolderId) {
      return false;
    }
    if (
      draggingFolderId === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID ||
      targetFolderId === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID
    ) {
      return false;
    }
    if (draggingFolderId === targetFolderId) {
      return false;
    }

    return !this.isPlaylistFolderDescendant(targetFolderId, draggingFolderId);
  }

  private isPlaylistFolderDescendant(folderId: string, ancestorId: string): boolean {
    const parentById = new Map<string, string | null>();
    for (const folder of this.localPlaylistFolders()) {
      parentById.set(folder.id, folder.parentId?.trim() || null);
    }

    let current = parentById.get(folderId) ?? null;
    while (current) {
      if (current === ancestorId) {
        return true;
      }
      current = parentById.get(current) ?? null;
    }

    return false;
  }

  protected async onOpenReviewMenu(event: Event, review: FilmListReview): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (this.openMenuReviewId() === review.id) {
      this.resetMenuState();
      return;
    }

    this.resetMenuState();
    this.openMenuReviewId.set(review.id);
    this.renamingReviewId.set(null);
    this.playlistEditingReviewId.set(null);
    this.deleteConfirmReviewId.set(null);
    this.renameDraft.set(this.getReviewDisplayTitle(review));
    this.playlistDraft.set(this.getEditablePlaylistName(review));
  }

  protected isMenuOpen(reviewId: string): boolean {
    return this.openMenuReviewId() === reviewId;
  }

  protected isReviewMenuOpenInFolder(folder: FilmReviewPlaylistFolder): boolean {
    const openReviewId = this.openMenuReviewId();
    return !!openReviewId && folder.reviews.some((review) => review.id === openReviewId);
  }

  protected isRenaming(reviewId: string): boolean {
    return this.renamingReviewId() === reviewId;
  }

  protected isEditingPlaylist(reviewId: string): boolean {
    return this.playlistEditingReviewId() === reviewId;
  }

  protected isDeleteConfirming(reviewId: string): boolean {
    return this.deleteConfirmReviewId() === reviewId;
  }

  protected isDeletingReview(reviewId: string): boolean {
    return this.deletingReviewIds().has(reviewId);
  }

  protected onMenuBackdropTap(): void {
    this.resetMenuState();
  }

  protected isAskAgentMenuOpen(reviewId: string): boolean {
    return this.openAskAgentMenuReviewId() === reviewId;
  }

  protected isLibraryAskAgentMenuOpen(): boolean {
    return this.isLibraryAskAgentMenuVisible();
  }

  protected isDownloadMenuOpen(reviewId: string): boolean {
    return this.openDownloadMenuReviewId() === reviewId;
  }

  protected askAgentButtonAriaLabel(): string {
    const selectedCount = this.selectedFilteredTimelineRowCount();
    if (selectedCount <= 0) {
      return 'Ask Agent X about selected clips';
    }

    return selectedCount === 1
      ? 'Ask Agent X about the selected clip'
      : `Ask Agent X about ${selectedCount} selected clips`;
  }

  protected downloadSelectedLibraryButtonAriaLabel(): string {
    const selectedCount = this.selectedLibraryReviewCount();
    return selectedCount === 1
      ? 'Download selected video'
      : `Download ${selectedCount} selected videos`;
  }

  protected deleteSelectedLibraryButtonAriaLabel(): string {
    const selectedCount = this.selectedLibraryReviewCount();
    return selectedCount === 1
      ? 'Delete selected video'
      : `Delete ${selectedCount} selected videos`;
  }

  protected async onDownloadSelectedLibraryReviews(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    const selectedReviews = await this.resolveSelectedLibraryReviewsForArchiveExport();
    if (selectedReviews.length === 0) {
      this.toast.info('Select videos to download.');
      return;
    }

    const archiveEntries: ArchiveDownloadEntry[] = [];
    let skippedCount = 0;
    for (const review of selectedReviews) {
      const reviewEntries = this.resolveReviewArchiveEntries(review, {
        prefixSegments: this.resolveReviewArchiveFolderSegments(review),
      });
      if (reviewEntries.length === 0) {
        skippedCount += 1;
        continue;
      }

      archiveEntries.push(...reviewEntries);
    }

    if (archiveEntries.length === 0) {
      this.toast.info('No selected videos are ready to download yet.');
      return;
    }

    this.logger.info('Preparing selected film review ZIP export', {
      selectedCount: selectedReviews.length,
      exportFileCount: archiveEntries.length,
      skippedCount,
    });

    const downloadEntries = await this.attachAgentXAuthToArchiveEntries(archiveEntries);

    const result = await this.archive.downloadZip({
      fileName: this.buildSelectedLibraryArchiveFileName(selectedReviews),
      rootFolderName: 'NXT1 Film Review Library',
      entries: downloadEntries,
    });

    if (!result.success) {
      this.toast.error(result.error ?? 'Failed to prepare the selected video ZIP export.');
      return;
    }

    if (skippedCount > 0) {
      this.toast.info(
        `Prepared ZIP export for ${archiveEntries.length} of ${selectedReviews.length} selected videos.`
      );
      return;
    }

    this.toast.success(
      archiveEntries.length === 1
        ? 'Prepared ZIP export for 1 selected video.'
        : `Prepared ZIP export for ${archiveEntries.length} selected videos.`
    );
  }

  protected async onDeleteSelectedLibraryReviews(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    const selectedReviews = this.selectedLibraryReviews();
    if (selectedReviews.length === 0) {
      this.toast.info('Select videos to delete.');
      return;
    }

    const writableReviews = selectedReviews.filter((review) => this.hasReviewWriteAccess(review));
    if (writableReviews.length === 0) {
      this.notifyWriteAccessDenied();
      return;
    }

    let deletedCount = 0;
    for (const review of writableReviews) {
      try {
        await this.service.deleteReview(review.id);
        deletedCount += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete one or more videos';
        this.toast.error(message);
      }
    }

    if (deletedCount > 0 && selectedReviews.some((review) => review.id === this.selectedId())) {
      this.onBackToLibrary();
    }

    if (deletedCount <= 0) {
      return;
    }

    this.toast.success(
      deletedCount === 1 ? 'Deleted 1 selected video.' : `Deleted ${deletedCount} selected videos.`
    );
  }

  protected onRenameStart(review: FilmListReview, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.renamingReviewId.set(review.id);
    this.playlistEditingReviewId.set(null);
    this.deleteConfirmReviewId.set(null);
    this.renameDraft.set(this.getReviewDisplayTitle(review));
  }

  protected onRenameInput(value: string): void {
    this.renameDraft.set(value);
  }

  protected onRenameCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.renamingReviewId.set(null);
  }

  protected onPlaylistEditStart(review: FilmListReview, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.playlistEditingReviewId.set(review.id);
    this.renamingReviewId.set(null);
    this.deleteConfirmReviewId.set(null);
    this.playlistDraft.set(this.getEditablePlaylistName(review));
  }

  protected onPlaylistInput(value: string): void {
    this.playlistDraft.set(value);
  }

  protected onPlaylistCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.playlistEditingReviewId.set(null);
  }

  protected async onPlaylistConfirm(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    const currentPlaylist = this.getEditablePlaylistName(review);
    const nextPlaylist = this.playlistDraft().trim();
    if (nextPlaylist === currentPlaylist) {
      this.resetMenuState();
      return;
    }

    const targetFolder =
      nextPlaylist.length > 0 ? await this.ensurePersistedPlaylistFolder(nextPlaylist, null) : null;
    await this.service.updateReviewPlaylist(
      review.id,
      targetFolder?.id ?? null,
      targetFolder?.name ?? null
    );
    this.resetMenuState();
  }

  protected async onPlaylistClear(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    await this.service.updateReviewPlaylist(review.id, null, null);
    this.resetMenuState();
  }

  protected async onRenameConfirm(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    const currentTitle = this.getReviewDisplayTitle(review);
    const nextTitle = this.renameDraft().trim();
    if (!nextTitle || nextTitle === currentTitle) {
      this.renamingReviewId.set(null);
      return;
    }

    await this.service.renameReview(review.id, nextTitle);
    this.resetMenuState();
  }

  protected onDeleteStart(review: FilmListReview, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.deleteConfirmReviewId.set(review.id);
    this.playlistEditingReviewId.set(null);
    this.renamingReviewId.set(null);
  }

  protected onDeleteCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.deleteConfirmReviewId.set(null);
  }

  protected isUploadMenuOpen(anchor: FilmReviewUploadMenuAnchor): boolean {
    return this.openUploadMenuAnchor() === anchor;
  }

  protected onToggleAskAgentMenu(review: FilmReviewDragSource, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.openAskAgentMenuReviewId() === review.id) {
      this.openAskAgentMenuReviewId.set(null);
      return;
    }

    this.resetMenuState();
    this.openAskAgentMenuReviewId.set(review.id);
  }

  protected onToggleLibraryAskAgentMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.isLibraryAskAgentMenuVisible()) {
      this.isLibraryAskAgentMenuVisible.set(false);
      return;
    }

    this.resetMenuState();
    this.isLibraryAskAgentMenuVisible.set(true);
  }

  protected onToggleDownloadMenu(review: FilmReviewDragSource, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.openDownloadMenuReviewId() === review.id) {
      this.openDownloadMenuReviewId.set(null);
      return;
    }

    this.resetMenuState();
    this.openDownloadMenuReviewId.set(review.id);
  }

  protected onCloseAskAgentMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.openAskAgentMenuReviewId.set(null);
  }

  protected onCloseLibraryAskAgentMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.isLibraryAskAgentMenuVisible.set(false);
  }

  protected onLibraryAskAgentPromptSelect(
    promptId: FilmReviewLibraryAskAgentPromptId,
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();

    const { selectedPlaylistFolders, selectedReviewsOutsidePlaylists } =
      this.resolveEffectiveLibraryAskAgentSelection();
    const selectedItemCount =
      selectedPlaylistFolders.length + selectedReviewsOutsidePlaylists.length;

    if (selectedItemCount <= 0) {
      return;
    }

    const selectedReviewContexts = selectedReviewsOutsidePlaylists.map((review) =>
      this.buildFilmReviewDragContext(review)
    );
    const selectedPlaylistContexts = selectedPlaylistFolders.flatMap((folder) =>
      this.buildPlaylistFolderDragContexts(folder)
    );
    const selectedContexts = [...selectedReviewContexts, ...selectedPlaylistContexts];
    if (selectedContexts.length <= 0) {
      return;
    }

    this.agentXService.queueSelectedContexts(selectedContexts);

    const prompt = this.buildLibraryAskAgentPrompt(promptId, selectedItemCount);
    this.askAgentPromptRequested.emit(prompt);

    this.isLibraryAskAgentMenuVisible.set(false);
  }

  protected isLibraryReviewSelected(reviewId: string): boolean {
    return this.selectedLibraryReviewIds().has(reviewId);
  }

  protected getLibraryFolderSelectableReviewCount(
    folder: FilmReviewPlaylistFolderTreeNode
  ): number {
    return this.collectLibraryFolderReviewIds(folder).length;
  }

  protected areAllLibraryFolderReviewsSelected(folder: FilmReviewPlaylistFolderTreeNode): boolean {
    const reviewIds = this.collectLibraryFolderReviewIds(folder);
    if (reviewIds.length === 0) {
      return this.selectedLibraryPlaylistIds().has(folder.id);
    }

    const selectedIds = this.selectedLibraryReviewIds();
    return reviewIds.every((reviewId) => selectedIds.has(reviewId));
  }

  protected isSomeLibraryFolderReviewsSelected(folder: FilmReviewPlaylistFolderTreeNode): boolean {
    const reviewIds = this.collectLibraryFolderReviewIds(folder);
    if (reviewIds.length === 0) return false;

    const selectedIds = this.selectedLibraryReviewIds();
    let selectedCount = 0;

    for (const reviewId of reviewIds) {
      if (selectedIds.has(reviewId)) {
        selectedCount += 1;
      }
    }

    return selectedCount > 0 && selectedCount < reviewIds.length;
  }

  protected onToggleLibraryReviewSelection(reviewId: string, event: Event): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement | null;
    const isChecked = !!input?.checked;

    this.selectedLibraryReviewIds.update((current) => {
      const next = new Set(current);
      if (isChecked) {
        next.add(reviewId);
      } else {
        next.delete(reviewId);
      }
      return next;
    });

    this.pruneSelectedLibraryPlaylistSelections();
  }

  protected onToggleLibraryFolderSelection(
    folder: FilmReviewPlaylistFolderTreeNode,
    event: Event
  ): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement | null;
    const isChecked = !!input?.checked;
    const reviewIds = this.collectLibraryFolderReviewIds(folder);

    if (reviewIds.length === 0) {
      this.selectedLibraryReviewIds.update((current) => new Set(current));
      this.selectedLibraryPlaylistIds.update((current) => {
        const next = new Set(current);
        if (isChecked) {
          next.add(folder.id);
        } else {
          next.delete(folder.id);
        }
        return next;
      });
      return;
    }

    this.selectedLibraryReviewIds.update((current) => {
      const next = new Set(current);

      for (const reviewId of reviewIds) {
        if (isChecked) {
          next.add(reviewId);
        } else {
          next.delete(reviewId);
        }
      }

      return next;
    });

    this.selectedLibraryPlaylistIds.update((current) => {
      const next = new Set(current);
      if (isChecked) {
        next.add(folder.id);
      } else {
        next.delete(folder.id);
      }
      return next;
    });

    this.pruneSelectedLibraryPlaylistSelections();
  }

  protected onCloseDownloadMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.openDownloadMenuReviewId.set(null);
  }

  protected canDownloadReviewVideo(review: FilmReviewDragSource): boolean {
    if (this.shouldUseServerSideDownloadExport(review)) {
      return this.canPrepareServerSideDownloadExport(review);
    }

    if (this.shouldDownloadSelectedBatchClips(review)) {
      return this.resolveSelectedBatchClipDownloads(review).items.length > 0;
    }

    return this.resolveReviewArchiveEntries(review).length > 0;
  }

  protected getDownloadVideoOptionLabel(review: FilmReviewDragSource): string {
    if (this.shouldUseServerSideDownloadExport(review)) {
      const exportState = review.downloadExport;
      if (exportState?.status === 'ready') {
        return 'Download prepared full game';
      }
      if (exportState?.status === 'error') {
        return 'Retry full-game export';
      }
      if (exportState?.status === 'queued' || exportState?.status === 'processing') {
        return exportState.percentComplete !== undefined
          ? `Preparing full-game export (${exportState.percentComplete}%)`
          : 'Preparing full-game export';
      }
      return 'Prepare full-game download';
    }

    if (!this.shouldDownloadSelectedBatchClips(review)) {
      const exportCount = this.resolveReviewArchiveEntries(review).length;
      return exportCount > 1 ? `Download ${exportCount} source clips` : 'Download video';
    }

    const selectedCount = this.resolveSelectedBatchClipDownloads(review).selectedCount;
    return selectedCount === 1
      ? 'Download selected clip'
      : `Download ${selectedCount} selected clips`;
  }

  protected getDownloadVideoOptionHint(review: FilmReviewDragSource): string {
    if (this.shouldUseServerSideDownloadExport(review)) {
      const exportState = review.downloadExport;
      if (exportState?.status === 'ready') {
        return 'The full-game export is staged on the backend and ready to download.';
      }
      if (exportState?.status === 'error') {
        return (
          exportState.lastError?.trim() || 'The previous full-game export failed. Tap to retry.'
        );
      }
      if (exportState?.status === 'queued' || exportState?.status === 'processing') {
        const progressLabel =
          exportState.percentComplete !== undefined
            ? `${exportState.percentComplete}% complete`
            : 'preparing in the background';
        return `Large full-game footage is exported server-side so the download does not stall in the browser. ${progressLabel}.`;
      }
      return 'Prepare a backend export for large full-game footage, then download the ready file.';
    }

    if (!this.shouldDownloadSelectedBatchClips(review)) {
      const exportCount = this.resolveReviewArchiveEntries(review).length;
      return exportCount > 1
        ? 'Save all prepared source clips together in a ZIP export.'
        : 'Save the prepared MP4 when it is ready.';
    }

    const { items, selectedCount } = this.resolveSelectedBatchClipDownloads(review);
    if (items.length === selectedCount) {
      return 'Download each selected batch clip as its own MP4 file.';
    }

    if (items.length === 0) {
      return 'Selected clips are not ready for MP4 download yet.';
    }

    return `${items.length} of ${selectedCount} selected clips are ready to download.`;
  }

  protected getCsvDownloadOptionLabel(_review: FilmReviewDragSource): string {
    const selectedCount = this.selectedTimelinePlayIds().size;
    if (selectedCount === 0) {
      return 'Download breakdown CSV';
    }

    return selectedCount === 1
      ? 'Export selected row as CSV'
      : `Export ${selectedCount} selected rows as CSV`;
  }

  protected getCsvDownloadOptionHint(_review: FilmReviewDragSource): string {
    const selectedCount = this.selectedTimelinePlayIds().size;
    if (selectedCount === 0) {
      return 'Export the current game breakdown table.';
    }

    return 'Export only the selected rows in CSV format.';
  }

  protected isTimelinePlayDownloadPending(play: FilmTimelinePlay, originalIndex: number): boolean {
    return this.activeTimelinePlayDownloadIds().has(
      this.resolveTimelinePlaySelectionId(play, originalIndex)
    );
  }

  protected async onDownloadVideo(review: FilmReviewDragSource, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (this.shouldUseServerSideDownloadExport(review)) {
      await this.requestServerSideDownloadExport(review);
      return;
    }

    if (this.shouldDownloadSelectedBatchClips(review)) {
      await this.downloadSelectedBatchClips(review);
      return;
    }

    const exportReview = await this.resolveReviewForArchiveExport(review);
    const archiveEntries = this.resolveReviewArchiveEntries(exportReview);
    if (archiveEntries.length === 0) {
      const prewarmStatus = exportReview.downloadPrewarm?.status?.trim().toLowerCase();
      this.toast.info(
        prewarmStatus === 'processing'
          ? 'Video download is still being prepared. Try again in a moment.'
          : 'Video download is not ready for this film review yet.'
      );
      return;
    }

    this.openDownloadMenuReviewId.set(null);

    const downloadEntries = await this.attachAgentXAuthToArchiveEntries(archiveEntries);

    if (downloadEntries.length === 1) {
      const [entry] = downloadEntries;
      if (entry?.source.kind === 'url') {
        const blob = await this.fetchDownloadBlob(entry.source.url, entry.source.fetchInit);
        this.triggerBlobDownload(blob, entry.path.split('/').pop() ?? 'film-review.mp4');
        return;
      }
    }

    const result = await this.archive.downloadZip({
      fileName: `${this.buildFilmReviewFileStem(exportReview)}-sources`,
      entries: downloadEntries,
    });

    if (!result.success) {
      this.toast.error(result.error ?? 'Failed to prepare the film review ZIP export.');
      return;
    }

    this.toast.success(`Prepared ZIP export for ${archiveEntries.length} files.`);
  }

  protected onDownloadBreakdownCsv(review: FilmReviewDragSource, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    const csvContent = this.buildTimelineBreakdownCsv();
    if (!csvContent) {
      this.toast.info('No breakdown rows are available to export yet.');
      return;
    }

    this.openDownloadMenuReviewId.set(null);
    this.triggerBlobDownload(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8' }),
      this.buildFilmReviewBreakdownFileName(review)
    );
  }

  protected onChooseVideosClick(event: Event, anchor: FilmReviewUploadMenuAnchor): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    if (this.isUploadingLibraryVideo()) {
      return;
    }

    if (this.openUploadMenuAnchor() === anchor) {
      this.openUploadMenuAnchor.set(null);
      return;
    }

    this.resetMenuState();
    this.openUploadMenuAnchor.set(anchor);
  }

  protected onChooseBatchClipsClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.openUploadMenuAnchor.set(null);
    this.pendingUploadSelectionMode.set('batch');
    this.openVideoUploadPicker();
  }

  protected onChooseFullFootageClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.openUploadMenuAnchor.set(null);
    this.pendingUploadSelectionMode.set('full');
    this.openVideoUploadPicker();
  }

  protected onChooseBreakdownClick(): void {
    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.breakdownUploadInput?.nativeElement.click();
  }

  private openVideoUploadPicker(): void {
    const input = this.videoUploadInput?.nativeElement;
    if (!input) {
      return;
    }

    input.value = '';
    input.multiple = true;
    input.click();
  }

  protected async onVideoFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    const selectionMode = this.pendingUploadSelectionMode();
    if (input) {
      input.value = '';
    }

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    await this.uploadLibraryFiles(files, selectionMode);
  }

  protected async onBreakdownFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (input) {
      input.value = '';
    }

    if (!file) {
      return;
    }

    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    await this.importBreakdownForSelectedReview(file);
  }

  protected onLibraryDragEnter(event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    if (this.getDraggingPlaylistFolderId(event)) {
      this.isRootPlaylistFolderDropActive.set(true);
      return;
    }
    this.isLibraryDragActive.set(true);
  }

  protected onLibraryDragOver(event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    if (this.getDraggingPlaylistFolderId(event)) {
      this.isRootPlaylistFolderDropActive.set(true);
      return;
    }
    this.isLibraryDragActive.set(true);
  }

  protected onLibraryDragLeave(event: DragEvent): void {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    const currentTarget = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (
      currentTarget instanceof HTMLElement &&
      relatedTarget instanceof Node &&
      currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    this.isLibraryDragActive.set(false);
  }

  protected async onLibraryDrop(event: DragEvent): Promise<void> {
    if (this.isPlaylistLibraryReorderDragActive()) {
      return;
    }
    event.preventDefault();
    this.isLibraryDragActive.set(false);
    const draggingFolderId = this.getDraggingPlaylistFolderId(event);
    if (draggingFolderId) {
      this.draggingPlaylistFolderId.set(null);
      this.activePlaylistFolderDropTargetId.set(null);
      this.isRootPlaylistFolderDropActive.set(false);

      const draggedFolder =
        this.playlistFolders().find((item) => item.id === draggingFolderId) ?? null;
      if (!draggedFolder) {
        return;
      }

      if (!this.hasPlaylistFolderWriteAccess(draggedFolder)) {
        this.notifyWriteAccessDenied();
        return;
      }

      try {
        const ensuredDraggedFolder =
          await this.ensurePersistedPlaylistFolderForExisting(draggedFolder);
        const rootCount = this.localPlaylistFolders().filter(
          (item) => !(item.parentId?.trim() || null) && item.id !== ensuredDraggedFolder.id
        ).length;

        await this.service.updatePlaylistFolder(ensuredDraggedFolder.id, {
          parentId: null,
          sortOrder: rootCount,
        });
        this.syncLocalPlaylistFoldersFromService();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to move folder';
        this.toast.error(message);
      }
      return;
    }

    this.isRootPlaylistFolderDropActive.set(false);
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    const droppedVideoCount = files.filter((file) => file.type.startsWith('video/')).length;

    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    await this.uploadLibraryFiles(files, droppedVideoCount > 1 ? 'batch' : 'full', {
      suppressSuccessToast: true,
    });
  }

  private getDraggingPlaylistFolderId(event: DragEvent): string {
    return (
      this.draggingPlaylistFolderId() ??
      event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_FOLDER_DRAG_MIME) ??
      ''
    );
  }

  private clearPlaylistLibraryDropState(): void {
    this.draggingReviewId.set(null);
    this.draggingPlaylistFolderId.set(null);
    this.activePlaylistDropTargetId.set(null);
    this.activePlaylistFolderDropTargetId.set(null);
    this.isRootPlaylistFolderDropActive.set(false);
    this.isLibraryDragActive.set(false);
  }

  private async uploadLibraryFiles(
    files: readonly File[],
    selectionMode: FilmReviewUploadSelectionMode,
    options?: {
      readonly suppressSuccessToast?: boolean;
    }
  ): Promise<void> {
    if (!this.canMutateFilmReviewLibrary()) {
      this.notifyWriteAccessDenied();
      return;
    }

    if (!files.length || this.isUploadingLibraryVideo()) {
      return;
    }

    const authTokenFactory = this.getAuthToken;
    if (!authTokenFactory) {
      this.toast.error('Upload is unavailable right now.');
      return;
    }

    const validVideos: File[] = [];
    const validBreakdowns: File[] = [];
    for (const file of files) {
      if (file.type.startsWith('video/')) {
        if (file.size > AGENT_X_MAX_VIDEO_FILE_SIZE) {
          this.toast.error(`File too large: ${file.name}`);
          continue;
        }
        validVideos.push(file);
        continue;
      }

      if (this.isBreakdownSheetFile(file)) {
        validBreakdowns.push(file);
        continue;
      }

      if (!file.type.startsWith('video/')) {
        this.toast.error(`Unsupported file type: ${file.name}`);
        continue;
      }
    }

    if (validBreakdowns.length > 1) {
      this.toast.error('Import one breakdown sheet at a time.');
      return;
    }

    if (!validVideos.length && !validBreakdowns.length) {
      return;
    }

    const inferredSelectionMode: FilmReviewUploadSelectionMode =
      validVideos.length > 1 ? 'batch' : selectionMode;

    if (this.isAthleteRole()) {
      if (validBreakdowns.length > 0) {
        this.toast.error('Breakdown sheet import is available only in team film review.');
      }

      if (validVideos.length > 0) {
        this.agentXService.addFiles(validVideos);
        if (!options?.suppressSuccessToast) {
          this.toast.success(
            validVideos.length === 1
              ? 'Added video to Agent X chat for personal film review.'
              : `Added ${validVideos.length} videos to Agent X chat for personal film review.`
          );
        }
      }

      this.libraryUploadError.set(null);
      return;
    }

    const teamId = this.teamId?.trim() ?? '';
    if (!teamId) {
      this.toast.error('Select a team before uploading videos.');
      return;
    }

    const authToken = await authTokenFactory();
    if (!authToken) {
      this.toast.error('Please sign in again to upload videos.');
      return;
    }

    if (validVideos.length > 0) {
      await this.ensureStarterPlaylistFolders();
    }

    this.libraryUploadError.set(null);
    this.isUploadingLibraryVideo.set(true);
    this.libraryVideoUploadPercent.set(0);
    this.libraryUploadCurrentFile.set(1);
    this.libraryUploadTotalFiles.set(validVideos.length + validBreakdowns.length);

    try {
      let targetReviewId = this.selectedId() ?? this.reviews()[0]?.id ?? null;
      const uploadedSources: TeamFilmReviewSourceVideo[] = [];
      const sourceAngleMetadata = buildTeamFilmReviewSourceAngleMetadata(
        validVideos.map((file) => file.name)
      );
      for (let index = 0; index < validVideos.length; index += 1) {
        this.libraryUploadCurrentFile.set(index + 1);
        const file = validVideos[index] as File;
        const angleMetadata = sourceAngleMetadata[index];
        const uploaded = await this.uploadSingleLibraryVideo(
          file,
          authToken,
          index,
          validVideos.length
        );
        uploadedSources.push({
          id: `source-${index + 1}`,
          order: index,
          title: this.deriveFilmReviewTitleFromFile(file.name),
          videoUrl: uploaded.streamUrl,
          ...(angleMetadata?.cameraAngle ? { cameraAngle: angleMetadata.cameraAngle } : {}),
          ...(angleMetadata?.angleGroupId ? { angleGroupId: angleMetadata.angleGroupId } : {}),
          ...(angleMetadata?.angleDetectionSource
            ? { angleDetectionSource: angleMetadata.angleDetectionSource }
            : {}),
          ...(uploaded.downloadUrl ? { downloadUrl: uploaded.downloadUrl } : {}),
          ...(uploaded.storagePath ? { storagePath: uploaded.storagePath } : {}),
          ...(uploaded.cloudflareVideoId ? { cloudflareVideoId: uploaded.cloudflareVideoId } : {}),
          ...(uploaded.cloudflareStatus ? { cloudflareStatus: uploaded.cloudflareStatus } : {}),
          ...(uploaded.readyToStream !== undefined
            ? { readyToStream: uploaded.readyToStream }
            : {}),
          ...(uploaded.thumbnailUrl ? { thumbnailUrl: uploaded.thumbnailUrl } : {}),
          ...(uploaded.durationSec !== undefined ? { durationSec: uploaded.durationSec } : {}),
        });
      }

      if (uploadedSources.length > 0) {
        const reviewSport = this.panelSport() || 'football';
        const primarySource = uploadedSources[0] as TeamFilmReviewSourceVideo;
        const primaryVideoFile = validVideos[0] as File | undefined;
        const created = await this.service.createFromVideo({
          teamId,
          sport: reviewSport,
          title: this.buildFilmReviewSessionTitle(validVideos, inferredSelectionMode),
          ...(primaryVideoFile
            ? {
                attachment: this.buildFilmReviewUploadAttachment(
                  primaryVideoFile,
                  primarySource,
                  0
                ),
              }
            : {}),
          uploadMode: inferredSelectionMode === 'batch' ? 'batch_clips' : 'full_footage',
          videoUrl: primarySource.videoUrl,
          sources: uploadedSources,
          ...(primarySource.storagePath ? { storagePath: primarySource.storagePath } : {}),
          ...(primarySource.cloudflareVideoId
            ? { cloudflareVideoId: primarySource.cloudflareVideoId }
            : {}),
          ...(primarySource.cloudflareStatus
            ? { cloudflareStatus: primarySource.cloudflareStatus }
            : {}),
          ...(primarySource.readyToStream !== undefined
            ? { readyToStream: primarySource.readyToStream }
            : {}),
          ...(primarySource.thumbnailUrl ? { thumbnailUrl: primarySource.thumbnailUrl } : {}),
          source: 'manual_upload',
        });

        targetReviewId = created.id;
      }

      let importedPlayCount: number | null = null;
      const breakdownFile = validBreakdowns[0];
      if (breakdownFile) {
        const progressIndex = validVideos.length + 1;
        this.libraryUploadCurrentFile.set(progressIndex);
        this.libraryVideoUploadPercent.set(
          Math.round((validVideos.length / (validVideos.length + 1)) * 100)
        );

        if (!targetReviewId) {
          throw new Error('Upload a video before importing a breakdown sheet.');
        }

        const imported = await this.service.importBreakdown(targetReviewId, breakdownFile);
        importedPlayCount = imported.playCount;
        this.libraryVideoUploadPercent.set(100);
      }

      if (!options?.suppressSuccessToast) {
        this.toast.success(this.buildUploadSuccessMessage(validVideos.length, importedPlayCount));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload film files';
      if (message === VIDEO_UPLOAD_CANCELLED_MESSAGE) {
        this.libraryUploadError.set(null);
        this.toast.info('Upload cancelled.');
      } else {
        this.libraryUploadError.set(message);
        this.toast.error(message);
      }
    } finally {
      this.activeLibraryUploadHandle = null;
      this.isUploadingLibraryVideo.set(false);
      this.libraryVideoUploadPercent.set(null);
      this.libraryUploadCurrentFile.set(0);
      this.libraryUploadTotalFiles.set(0);
    }
  }

  protected cancelLibraryUpload(): void {
    this.activeLibraryUploadHandle?.cancel();
  }

  private async importBreakdownForSelectedReview(file: File): Promise<void> {
    const selected = this.selectedReview();
    if (!selected || !this.hasReviewWriteAccess(selected)) {
      this.notifyWriteAccessDenied();
      return;
    }

    const reviewId = this.selectedId();
    if (!reviewId) {
      this.toast.error('Select a film review before importing a breakdown.');
      return;
    }

    if (!this.isBreakdownSheetFile(file)) {
      this.toast.error(`Unsupported breakdown file: ${file.name}`);
      return;
    }

    this.libraryUploadError.set(null);
    this.isImportingBreakdown.set(true);

    try {
      const imported = await this.service.importBreakdown(reviewId, file);
      this.toast.success(`Breakdown imported (${imported.playCount} plays)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import breakdown';
      this.libraryUploadError.set(message);
      this.toast.error(message);
    } finally {
      this.isImportingBreakdown.set(false);
    }
  }

  private uploadSingleLibraryVideo(
    file: File,
    authToken: string,
    index: number,
    total: number
  ): Promise<{
    streamUrl: string;
    downloadUrl?: string;
    storagePath?: string;
    cloudflareVideoId?: string;
    cloudflareStatus?: string;
    readyToStream?: boolean;
    thumbnailUrl?: string;
    durationSec?: number;
  }> {
    const localDurationPromise = this.readVideoDurationSec(file);

    return new Promise((resolve, reject) => {
      const uploadHandle = this.uploadService.uploadVideo(file, authToken);
      this.activeLibraryUploadHandle = uploadHandle;
      const subscription = uploadHandle.progress$.subscribe((progress: VideoUploadProgress) => {
        if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
          const fileProgress = Math.max(0, Math.min(100, progress.percent));
          const overall = ((index + fileProgress / 100) / total) * 100;
          this.libraryVideoUploadPercent.set(Math.round(overall));
          return;
        }

        if (progress.phase === 'complete' && progress.streamUrl) {
          if (this.activeLibraryUploadHandle === uploadHandle) {
            this.activeLibraryUploadHandle = null;
          }
          subscription.unsubscribe();
          const streamUrl = progress.streamUrl;
          void localDurationPromise
            .then((localDurationSec) => {
              resolve({
                streamUrl,
                downloadUrl: progress.downloadUrl,
                storagePath: progress.storagePath,
                cloudflareVideoId: progress.cloudflareVideoId,
                cloudflareStatus: progress.cloudflareStatus,
                readyToStream: progress.readyToStream,
                thumbnailUrl: progress.thumbnailUrl,
                durationSec: progress.durationSec ?? localDurationSec,
              });
            })
            .catch((error) => {
              reject(error instanceof Error ? error : new Error(String(error)));
            });
          return;
        }

        if (progress.phase === 'cancelled') {
          if (this.activeLibraryUploadHandle === uploadHandle) {
            this.activeLibraryUploadHandle = null;
          }
          subscription.unsubscribe();
          reject(new Error(VIDEO_UPLOAD_CANCELLED_MESSAGE));
          return;
        }

        if (progress.phase === 'error') {
          if (this.activeLibraryUploadHandle === uploadHandle) {
            this.activeLibraryUploadHandle = null;
          }
          subscription.unsubscribe();
          reject(new Error(progress.errorMessage ?? `Failed to upload ${file.name}`));
        }
      });
    });
  }

  private readVideoDurationSec(file: File): Promise<number | undefined> {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return Promise.resolve(undefined);
    }

    if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        URL.revokeObjectURL(objectUrl);
      };

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        cleanup();
        resolve(duration > 0 ? Math.round(duration * 100) / 100 : undefined);
      };
      video.onerror = () => {
        cleanup();
        resolve(undefined);
      };

      video.src = objectUrl;
    });
  }

  private deriveFilmReviewTitleFromFile(fileName: string): string {
    const withoutExt = fileName.replace(/\.[^.]+$/, '').trim();
    return withoutExt.length > 0 ? withoutExt : 'Game Film';
  }

  private buildFilmReviewUploadAttachment(
    file: File,
    source: TeamFilmReviewSourceVideo,
    fallbackIndex: number
  ): AgentXAttachment {
    return {
      id:
        source.fileId?.trim() ||
        source.id?.trim() ||
        source.storagePath?.trim() ||
        `film-review-upload-${fallbackIndex + 1}`,
      url: source.videoUrl,
      ...(source.storagePath ? { storagePath: source.storagePath } : {}),
      name: file.name,
      mimeType: file.type,
      type: 'video',
      sizeBytes: file.size,
      ...(source.cloudflareVideoId ? { cloudflareVideoId: source.cloudflareVideoId } : {}),
      ...(source.cloudflareStatus ? { cloudflareStatus: source.cloudflareStatus } : {}),
      ...(source.readyToStream !== undefined ? { readyToStream: source.readyToStream } : {}),
      ...(source.thumbnailUrl ? { thumbnailUrl: source.thumbnailUrl } : {}),
    };
  }

  private buildFilmReviewSessionTitle(
    files: readonly File[],
    selectionMode: FilmReviewUploadSelectionMode
  ): string {
    const firstTitle = this.deriveFilmReviewTitleFromFile(files[0]?.name ?? 'Game Film');

    if (selectionMode === 'full') {
      return firstTitle;
    }

    const normalizedTitles = files
      .map((file) => this.deriveFilmReviewTitleFromFile(file.name))
      .filter((title) => title.length > 0);
    const commonPrefix = this.findFilmReviewTitlePrefix(normalizedTitles);

    if (commonPrefix) {
      return `${commonPrefix} (${files.length} clips)`;
    }

    return files.length > 1 ? `${firstTitle} +${files.length - 1} clips` : firstTitle;
  }

  private findFilmReviewTitlePrefix(titles: readonly string[]): string | null {
    if (titles.length < 2) {
      return null;
    }

    const normalizedTitles = titles
      .map((title) => title.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((title) => title.length > 0);

    const firstTitle = normalizedTitles[0];
    if (!firstTitle) {
      return null;
    }

    let prefixLength = firstTitle.length;
    for (let index = 1; index < normalizedTitles.length; index += 1) {
      const currentTitle = normalizedTitles[index] as string;
      let characterIndex = 0;
      while (
        characterIndex < prefixLength &&
        characterIndex < currentTitle.length &&
        firstTitle[characterIndex]?.toLowerCase() === currentTitle[characterIndex]?.toLowerCase()
      ) {
        characterIndex += 1;
      }
      prefixLength = characterIndex;
      if (prefixLength === 0) {
        return null;
      }
    }

    const sharedPrefix = firstTitle.slice(0, prefixLength).trim();
    if (sharedPrefix.length < 8) {
      return null;
    }

    const boundaryPrefix = sharedPrefix.replace(/[\s._-]*[^\s._-]*$/, '').trim();
    const candidate = boundaryPrefix.length >= 8 ? boundaryPrefix : sharedPrefix;

    return candidate.length >= 8 ? candidate : null;
  }

  private isBreakdownSheetFile(file: File): boolean {
    const fileName = file.name.toLowerCase();
    return (
      file.type === 'text/csv' ||
      file.type === 'text/plain' ||
      file.type === 'text/tab-separated-values' ||
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileName.endsWith('.csv') ||
      fileName.endsWith('.tsv') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.xlsx')
    );
  }

  private buildUploadSuccessMessage(videoCount: number, importedPlayCount: number | null): string {
    if (videoCount > 0 && importedPlayCount !== null) {
      return `Film added and breakdown imported (${importedPlayCount} plays)`;
    }
    if (importedPlayCount !== null) {
      return `Breakdown imported (${importedPlayCount} plays)`;
    }
    return videoCount === 1
      ? 'Video added to Film Review'
      : `${videoCount} videos added to Film Review`;
  }

  protected async onDeleteConfirm(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.deletingReviewIds.update((s) => {
      const next = new Set(s);
      next.add(review.id);
      return next;
    });

    try {
      await this.service.deleteReview(review.id);
      if (this.selectedId() === review.id) {
        this.onBackToLibrary();
      }
      this.resetMenuState();
    } finally {
      this.deletingReviewIds.update((s) => {
        const next = new Set(s);
        next.delete(review.id);
        return next;
      });
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (
      !this.openAskAgentMenuReviewId() &&
      !this.isLibraryAskAgentMenuVisible() &&
      !this.openDownloadMenuReviewId() &&
      !this.openUploadMenuAnchor() &&
      !this.openMenuReviewId() &&
      !this.openPlaylistFolderMenuId() &&
      !this.openTimelineColumnMenuId() &&
      !this.cameraAngleMenuOpen()
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '.film-list-item__menu-btn, .film-list-item__menu, .film-list-item__menu-backdrop, .film-playbook-column-menu-btn, .film-playbook-column-menu, .film-playbook-column-menu-backdrop, .film-playbook-ask-agent, .film-playbook-ask-agent-menu, .film-upload-menu-anchor, .film-upload-menu, .film-upload-menu-backdrop, .film-angle-menu'
      )
    ) {
      return;
    }
    this.resetMenuState();
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (
      this.openAskAgentMenuReviewId() ||
      this.isLibraryAskAgentMenuVisible() ||
      this.openDownloadMenuReviewId() ||
      this.openUploadMenuAnchor() ||
      this.openMenuReviewId() ||
      this.openPlaylistFolderMenuId() ||
      this.openTimelineColumnMenuId() ||
      this.cameraAngleMenuOpen()
    ) {
      this.resetMenuState();
    }
  }

  private resetMenuState(): void {
    this.openAskAgentMenuReviewId.set(null);
    this.isLibraryAskAgentMenuVisible.set(false);
    this.openDownloadMenuReviewId.set(null);
    this.openUploadMenuAnchor.set(null);
    this.openMenuReviewId.set(null);
    this.openPlaylistFolderMenuId.set(null);
    this.renamingReviewId.set(null);
    this.playlistEditingReviewId.set(null);
    this.deleteConfirmReviewId.set(null);
    this.deletePlaylistFolderConfirmId.set(null);
    this.renameDraft.set('');
    this.playlistDraft.set('');
    this.editingPlaylistFolderId.set(null);
    this.playlistFolderRenameDraft.set('');
    this.openTimelineColumnMenuId.set(null);
    this.cameraAngleMenuOpen.set(false);
  }

  private areSetsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
    if (a.size !== b.size) {
      return false;
    }

    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }

    return true;
  }

  private collectLibraryFolderReviewIds(
    folder: FilmReviewPlaylistFolderTreeNode
  ): readonly string[] {
    const reviewIds: string[] = [];

    const visit = (node: FilmReviewPlaylistFolderTreeNode): void => {
      for (const review of node.reviews) {
        reviewIds.push(review.id);
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(folder);

    return reviewIds;
  }

  private resolveSelectedLibraryPlaylistFolders(): readonly FilmReviewPlaylistFolderTreeNode[] {
    const selectedPlaylistIds = this.selectedLibraryPlaylistIds();
    if (selectedPlaylistIds.size === 0) {
      return [];
    }

    const selectedFolders: FilmReviewPlaylistFolderTreeNode[] = [];
    for (const playlistId of selectedPlaylistIds) {
      const folder = this.findPlaylistFolderNodeById(playlistId);
      if (folder) {
        selectedFolders.push(folder);
      }
    }

    return selectedFolders;
  }

  private resolveEffectiveLibraryAskAgentSelection(): {
    readonly selectedPlaylistFolders: readonly FilmReviewPlaylistFolderTreeNode[];
    readonly selectedReviewsOutsidePlaylists: readonly FilmReviewDragSource[];
  } {
    const selectedReviews = this.selectedLibraryReviews();
    const selectedPlaylistFolders = this.resolveSelectedLibraryPlaylistFolders();

    if (selectedPlaylistFolders.length === 0) {
      return {
        selectedPlaylistFolders,
        selectedReviewsOutsidePlaylists: selectedReviews,
      };
    }

    const coveredReviewIds = new Set<string>();
    for (const folder of selectedPlaylistFolders) {
      for (const reviewId of this.collectLibraryFolderReviewIds(folder)) {
        coveredReviewIds.add(reviewId);
      }
    }

    const selectedReviewsOutsidePlaylists = selectedReviews.filter(
      (review) => !coveredReviewIds.has(review.id)
    );

    return {
      selectedPlaylistFolders,
      selectedReviewsOutsidePlaylists,
    };
  }

  private pruneSelectedLibraryPlaylistSelections(): void {
    const selectedPlaylistIds = this.selectedLibraryPlaylistIds();
    if (selectedPlaylistIds.size === 0) {
      return;
    }

    const selectedReviewIds = this.selectedLibraryReviewIds();
    const nextPlaylistIds = new Set<string>();

    for (const playlistId of selectedPlaylistIds) {
      const folder = this.findPlaylistFolderNodeById(playlistId);
      if (!folder) {
        continue;
      }

      const reviewIds = this.collectLibraryFolderReviewIds(folder);
      if (reviewIds.length === 0) {
        nextPlaylistIds.add(playlistId);
        continue;
      }

      const hasAllReviewsSelected = reviewIds.every((reviewId) => selectedReviewIds.has(reviewId));
      if (hasAllReviewsSelected) {
        nextPlaylistIds.add(playlistId);
      }
    }

    if (!this.areSetsEqual(selectedPlaylistIds, nextPlaylistIds)) {
      this.selectedLibraryPlaylistIds.set(nextPlaylistIds);
    }
  }

  private findPlaylistFolderNodeById(folderId: string): FilmReviewPlaylistFolderTreeNode | null {
    const visit = (
      nodes: readonly FilmReviewPlaylistFolderTreeNode[]
    ): FilmReviewPlaylistFolderTreeNode | null => {
      for (const node of nodes) {
        if (node.id === folderId) {
          return node;
        }

        const found = visit(node.children);
        if (found) {
          return found;
        }
      }

      return null;
    };

    return visit(this.playlistFolderTree());
  }

  private buildAskAgentPrompt(promptId: FilmReviewAskAgentPromptId): string {
    for (const section of this.askAgentPromptSections()) {
      const option = section.options.find((candidate) => candidate.id === promptId);
      if (option) {
        return option.hint;
      }
    }

    return 'Analyze this breakdown and identify the biggest trends and tendencies.';
  }

  private buildLibraryAskAgentPrompt(
    promptId: FilmReviewLibraryAskAgentPromptId,
    selectedItemCount: number
  ): string {
    const subject = this.buildLibraryAskAgentPromptSubject(selectedItemCount);

    switch (promptId) {
      case 'create-cutup-folder':
        return `Create a cutup folder from ${subject}. Group clips by concept and situation with clear coach-ready labels.`;
      case 'create-game-highlight':
        return `Create a game highlight package from ${subject}. Sequence clips for impact and coaching value.`;
      case 'compare-film':
        return `Compare ${subject}. Tell me what improved, what regressed, and what remains consistent.`;
      case 'full-report':
        return `Generate a full report from ${subject} with key findings, evidence, priorities, and next actions.`;
      case 'self-scout-cutup':
        return `Build a self scout cutup from ${subject}. Surface tendencies, strengths, and the highest-priority corrections.`;
    }
  }

  private buildLibraryAskAgentPromptSubject(selectedItemCount: number): string {
    if (selectedItemCount <= 0) {
      return 'these selected items from my video library';
    }

    if (selectedItemCount === 1) {
      return 'this selected item from my video library';
    }

    return `these ${selectedItemCount} selected items from my video library`;
  }

  public getReviewDisplayTitle(review: FilmListReview): string {
    const savedTitle = review.title?.trim();
    if (savedTitle && !this.isRawImportedVideoTitle(savedTitle, review)) {
      return savedTitle;
    }

    if (review.opponentName?.trim()) {
      return `Game Film vs ${review.opponentName.trim()}`;
    }

    return 'Game Film';
  }

  public getVideoThumbnailUrl(review: FilmListReview): string | null {
    const explicit = review.thumbnailUrl?.trim();
    return explicit || null;
  }

  private getEditablePlaylistName(review: FilmListReview): string {
    return review.playlistName?.trim() ?? '';
  }

  private isRawImportedVideoTitle(title: string, review: FilmListReview): boolean {
    const normalizedTitle = this.normalizeTitleToken(title);
    if (!normalizedTitle) return true;

    const storageBaseName = this.extractSourceBaseName(review.storagePath);
    if (storageBaseName && normalizedTitle === this.normalizeTitleToken(storageBaseName)) {
      return true;
    }

    const videoBaseName = this.extractSourceBaseName(review.videoUrl);
    if (videoBaseName && normalizedTitle === this.normalizeTitleToken(videoBaseName)) {
      return true;
    }

    return /^[a-z]{2,6}[_-]?\d{2,}$/i.test(normalizedTitle);
  }

  private extractSourceBaseName(value?: string): string | null {
    if (!value?.trim()) return null;

    const raw = value.trim();
    const withoutQuery = raw.split(/[?#]/, 1)[0] ?? raw;
    const segments = withoutQuery.split('/');
    const lastSegment = segments[segments.length - 1]?.trim();
    if (!lastSegment) return null;

    try {
      return (
        decodeURIComponent(lastSegment)
          .replace(/\.[^.]+$/, '')
          .trim() || null
      );
    } catch {
      return lastSegment.replace(/\.[^.]+$/, '').trim() || null;
    }
  }

  private normalizeTitleToken(value: string): string {
    return value
      .trim()
      .replace(/\.[^.]+$/, '')
      .trim()
      .toLowerCase();
  }

  private normalizeLibrarySearchQuery(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private filterPlaylistFolderTreeNode(
    folder: FilmReviewPlaylistFolderTreeNode,
    query: string
  ): FilmReviewPlaylistFolderTreeNode | null {
    const folderMatches = this.doesPlaylistFolderMatchQuery(folder, query);
    if (folderMatches) {
      return folder;
    }

    const filteredChildren = folder.children
      .map((child) => this.filterPlaylistFolderTreeNode(child, query))
      .filter((child): child is FilmReviewPlaylistFolderTreeNode => child !== null);
    const filteredReviews = folder.reviews.filter((review) =>
      this.doesReviewMatchLibraryQuery(review, query)
    );

    if (filteredChildren.length === 0 && filteredReviews.length === 0) {
      return null;
    }

    return {
      ...folder,
      reviews: filteredReviews,
      children: filteredChildren,
    };
  }

  private doesPlaylistFolderMatchQuery(folder: FilmReviewPlaylistFolder, query: string): boolean {
    return this.normalizeLibrarySearchQuery(folder.name).includes(query);
  }

  private doesReviewMatchLibraryQuery(review: FilmListReview, query: string): boolean {
    const playlist = this.resolveReviewPlaylist(review);
    const searchIndex = [
      this.getReviewDisplayTitle(review),
      review.title,
      review.opponentName,
      review.sport,
      review.gameDate,
      playlist?.name,
      this.extractSourceBaseName(review.storagePath),
      this.extractSourceBaseName(review.videoUrl),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ');

    return this.normalizeLibrarySearchQuery(searchIndex).includes(query);
  }

  private countPlaylistFolderTreeReviews(
    folders: readonly FilmReviewPlaylistFolderTreeNode[]
  ): number {
    return folders.reduce(
      (count, folder) =>
        count + folder.reviews.length + this.countPlaylistFolderTreeReviews(folder.children),
      0
    );
  }

  private resolveReviewPlaylist(review: FilmListReview): { id: string; name: string } | null {
    const playlistName = review.playlistName?.trim();
    const playlistId =
      review.playlistId?.trim() || (playlistName ? this.buildPlaylistFolderId(playlistName) : null);
    if (!playlistId || !playlistName) return null;
    return { id: playlistId, name: playlistName };
  }

  private buildPlaylistFolderId(name: string, parentId?: string | null): string {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    const parentToken = parentId?.trim()
      ? parentId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 36)
      : '';

    const baseId = normalized ? `playlist-${normalized}` : `playlist-${Date.now()}`;
    return parentToken ? `${parentToken}-${baseId}` : baseId;
  }

  private syncLocalPlaylistFoldersFromService(): void {
    this.localPlaylistFolders.set(
      this.normalizeLocalPlaylistFolders(
        this.service.playlists().map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          parentId: playlist.parentId ?? null,
        }))
      )
    );
  }

  private hasPersistedPlaylistFolder(folderId: string): boolean {
    return this.service.playlists().some((playlist) => playlist.id === folderId);
  }

  private async ensurePersistedPlaylistFolder(
    name: string,
    parentId: string | null,
    requestedId?: string
  ): Promise<{ id: string; name: string }> {
    const teamId = this.teamId?.trim();
    if (!teamId) {
      throw new Error('Select a team before editing folders.');
    }

    const normalizedName = name.trim();
    const normalizedParentId = parentId?.trim() || null;
    const normalizedId =
      requestedId?.trim() || this.buildPlaylistFolderId(normalizedName, normalizedParentId);

    if (normalizedParentId) {
      const persistedParent = this.service
        .playlists()
        .find((playlist) => playlist.id === normalizedParentId);

      if (!persistedParent) {
        const parentFolder =
          this.playlistFolders().find(
            (folder) => !folder.isUnassigned && folder.id === normalizedParentId
          ) ??
          this.localPlaylistFolders().find((folder) => folder.id === normalizedParentId) ??
          null;

        if (!parentFolder) {
          throw new Error('Parent folder was not found while saving this folder.');
        }

        await this.ensurePersistedPlaylistFolder(
          parentFolder.name,
          parentFolder.parentId ?? null,
          parentFolder.id
        );
      }
    }

    const existing =
      this.service.playlists().find((playlist) => playlist.id === normalizedId) ??
      this.service
        .playlists()
        .find(
          (playlist) =>
            playlist.name.trim().toLowerCase() === normalizedName.toLowerCase() &&
            (playlist.parentId?.trim() || null) === normalizedParentId
        );

    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    const siblingSortOrder = this.localPlaylistFolders().filter(
      (folder) =>
        (folder.parentId?.trim() || null) === normalizedParentId && folder.id !== normalizedId
    ).length;
    const created = await this.service.createPlaylistFolder({
      id: normalizedId,
      teamId,
      name: normalizedName,
      parentId: normalizedParentId,
      sortOrder: siblingSortOrder,
    });
    this.syncLocalPlaylistFoldersFromService();
    return { id: created.id, name: created.name };
  }

  private async ensurePersistedPlaylistFolderForExisting(
    folder: Pick<FilmReviewPlaylistFolder, 'id' | 'name' | 'parentId'>
  ): Promise<{ id: string; name: string }> {
    return this.ensurePersistedPlaylistFolder(folder.name, folder.parentId ?? null, folder.id);
  }

  private async ensureStarterPlaylistFolders(): Promise<void> {
    const existingFolderIds = new Set(
      this.playlistFolders()
        .filter((folder) => !folder.isUnassigned)
        .map((folder) => folder.id)
    );

    const missingFolders = FILM_REVIEW_STARTER_PLAYLIST_NAMES.flatMap((name) => {
      const id = this.buildPlaylistFolderId(name);
      return existingFolderIds.has(id) ? [] : [{ id, name }];
    });

    if (missingFolders.length === 0) {
      return;
    }

    for (const folder of missingFolders) {
      await this.ensurePersistedPlaylistFolder(folder.name, null, folder.id);
    }

    this.syncLocalPlaylistFoldersFromService();
  }

  private async loadFilmReviews(teamId: string): Promise<void> {
    await this.service.load(teamId, this.panelSport() || undefined, this.filmListLimit());

    const legacyFolders = this.loadPersistedPlaylistFolders(teamId);
    for (const folder of legacyFolders) {
      await this.ensurePersistedPlaylistFolder(folder.name, folder.parentId ?? null, folder.id);
    }
    if (legacyFolders.length > 0 && this.platform.isBrowser()) {
      try {
        localStorage.removeItem(this.getPlaylistStorageKey(teamId));
      } catch {
        // Ignore local cleanup failures after successful migration.
      }
    }

    this.syncLocalPlaylistFoldersFromService();
    this.localReviewOrderByFolder.set(this.loadPersistedReviewOrder(teamId));
    this.timelineColumnOrder.set(this.loadPersistedTimelineColumnOrder());
    this.collapseAllPlaylistFolders();
  }

  protected onLoadMoreReviews(): void {
    const teamId = this.teamId?.trim();
    if (!teamId || this.loading()) return;

    this.filmListLimit.update((current) => current + FILM_REVIEW_LIST_LIMIT_STEP);
    void this.loadFilmReviews(teamId);
  }

  private collapseAllPlaylistFolders(): void {
    const ids = new Set<string>([FILM_REVIEW_UNASSIGNED_PLAYLIST_ID]);
    for (const folder of this.localPlaylistFolders()) {
      ids.add(folder.id);
    }
    this.collapsedPlaylistFolderIds.set(ids);
  }

  private persistLocalReviewOrder(folderId: string, reviewIds: readonly string[]): void {
    const teamId = this.teamId?.trim();
    if (!teamId) {
      return;
    }

    const normalizedIds = reviewIds.map((reviewId) => reviewId.trim()).filter(Boolean);
    const nextOrder = {
      ...this.localReviewOrderByFolder(),
      [folderId]: normalizedIds,
    } satisfies FilmReviewOrderByFolder;

    this.localReviewOrderByFolder.set(nextOrder);
    this.persistReviewOrder(teamId, nextOrder);
  }

  private normalizeLocalPlaylistFolders(
    folders: readonly LocalFilmReviewPlaylistFolder[]
  ): readonly LocalFilmReviewPlaylistFolder[] {
    const unique = new Map<string, LocalFilmReviewPlaylistFolder>();
    for (const folder of folders) {
      const id = folder.id.trim();
      const name = folder.name.trim();
      if (!id || !name || id === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID) {
        continue;
      }
      let parentId = folder.parentId?.trim() || null;
      if (parentId === id || parentId === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID) {
        parentId = null;
      }
      unique.set(id, { id, name, parentId });
    }
    return [...unique.values()];
  }

  private loadPersistedPlaylistFolders(teamId: string): readonly LocalFilmReviewPlaylistFolder[] {
    if (!this.platform.isBrowser()) {
      return [];
    }

    try {
      const raw = localStorage.getItem(this.getPlaylistStorageKey(teamId));
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const parsedFolders: LocalFilmReviewPlaylistFolder[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const id = typeof item.id === 'string' ? item.id : '';
        const name = typeof item.name === 'string' ? item.name : '';
        const parentId =
          typeof (item as { parentId?: unknown }).parentId === 'string'
            ? (item as { parentId: string }).parentId.trim() || null
            : null;
        parsedFolders.push({ id, name, parentId });
      }

      return this.normalizeLocalPlaylistFolders(parsedFolders);
    } catch {
      return [];
    }
  }

  private loadPersistedReviewOrder(teamId: string): FilmReviewOrderByFolder {
    if (!this.platform.isBrowser()) {
      return {};
    }

    try {
      const raw = localStorage.getItem(this.getReviewOrderStorageKey(teamId));
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const normalized: FilmReviewOrderByFolder = {};
      for (const [folderId, reviewIds] of Object.entries(parsed)) {
        if (!folderId.trim() || !Array.isArray(reviewIds)) {
          continue;
        }
        normalized[folderId] = reviewIds.filter(
          (reviewId): reviewId is string =>
            typeof reviewId === 'string' && reviewId.trim().length > 0
        );
      }

      return normalized;
    } catch {
      return {};
    }
  }

  private persistReviewOrder(teamId: string, order: FilmReviewOrderByFolder): void {
    if (!this.platform.isBrowser()) {
      return;
    }

    try {
      const hasEntries = Object.values(order).some((reviewIds) => reviewIds.length > 0);
      if (!hasEntries) {
        localStorage.removeItem(this.getReviewOrderStorageKey(teamId));
        return;
      }

      localStorage.setItem(this.getReviewOrderStorageKey(teamId), JSON.stringify(order));
    } catch {
      // Ignore local preference persistence failures.
    }
  }

  private getPlaylistStorageKey(teamId: string): string {
    return `${FILM_REVIEW_PLAYLIST_STORAGE_PREFIX}:${teamId}`;
  }

  private getReviewOrderStorageKey(teamId: string): string {
    return `${FILM_REVIEW_VIDEO_ORDER_STORAGE_PREFIX}:${teamId}`;
  }

  public async onSelectReview(reviewId: string): Promise<void> {
    await this.flushCurrentPlayAnnotationPersistence();

    this.addVideoTab(reviewId);

    this.stopSmoothProgressTracking();
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.resetTimelinePlayEditing();
    this.resetNativePlayerElement();
    this.cloudflareNativePlaybackFailed.set(false);

    this.service.select(reviewId);
    this.timelineColumnFilters.set({});
    this.openTimelineColumnMenuId.set(null);
    this.currentPlayIndex.set(0); // Reset play index when switching reviews
    this.nativePlaybackSourcePlayIndex.set(0);
    this.service.select(reviewId);

    const selectedReview = this.selectedReview();
    this.cacheOpenVideoTabReview(selectedReview);
    const initialPlay = this.currentTimeline()[0] ?? null;
    const nativeVideoUrl = this.resolveNativeVideoUrlCandidate(selectedReview, initialPlay);
    const cloudflareEmbedUrl = nativeVideoUrl
      ? null
      : this.resolveCloudflareBaseEmbedUrl(selectedReview, initialPlay);
    this.isVideoView.set(true);
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.cloudflareIframeLoading.set(cloudflareEmbedUrl !== null);
    this.nativePlayerLoading.set(nativeVideoUrl !== null);
    this.playerCurrentTime.set(0);
    this.playerDuration.set(this.resolveReviewDurationSec(selectedReview, initialPlay));
    this.syncSeekUi(0);
    this.isPlaying.set(false);
    this.playbackRate.set(1);
    this.resetDrawOverlay();
    this.drawModeEnabled.set(false);
    this.restoreDrawOverlayForPlay(this.currentTimeline()[0] ?? null);
    this.scheduleNativeVideoSourceSync();

    const teamId = this.teamId?.trim() || undefined;
    if (teamId) {
      await this.service.ensureReviewDetails(reviewId, teamId);

      if (this.selectedId() === reviewId) {
        this.scheduleNativeVideoSourceSync();
      }
    }
  }

  protected async onBackToLibrary(): Promise<void> {
    await this.flushCurrentPlayAnnotationPersistence();

    this.isVideoView.set(false);
    this.stopSmoothProgressTracking();
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.nativePlayerLoading.set(false);
    this.cloudflareIframeLoading.set(false);
    this.cloudflareNativePlaybackFailed.set(false);
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.resetTimelinePlayEditing();
    this.timelineColumnFilters.set({});
    this.openTimelineColumnMenuId.set(null);
    this.resetNativePlayerElement();

    this.syncSeekUi(0);
    this.isPlaying.set(false);
    this.drawModeEnabled.set(false);
    this.resetDrawOverlay();
  }

  public addVideoTab(reviewId: string): void {
    const currentTabs = this.openVideoTabIds();
    if (!currentTabs.includes(reviewId)) {
      this.openVideoTabIds.set([...currentTabs, reviewId]);
    }

    const review = this.reviews().find((item) => item.id === reviewId) ?? null;
    this.cacheOpenVideoTabReview(review);
  }

  public closeVideoTab(tabId: string, $event?: Event): void {
    if ($event) {
      $event.stopPropagation();
    }
    const currentTabs = this.openVideoTabIds();
    const newTabs = currentTabs.filter((id) => id !== tabId);
    this.openVideoTabIds.set(newTabs);
    this.openVideoTabReviewCache.update((current) => {
      if (!(tabId in current)) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    // If the closed tab was selected, select the first remaining tab
    if (this.selectedId() === tabId && newTabs.length > 0) {
      void this.onSelectReview(newTabs[0]);
    } else if (newTabs.length === 0) {
      // If no tabs left, go back to library
      void this.onBackToLibrary();
    }
  }

  public reorderVideoTabs(draggedTabId: string, targetTabId: string): void {
    if (!draggedTabId || !targetTabId || draggedTabId === targetTabId) return;

    const currentTabs = [...this.openVideoTabIds()];
    const draggedIndex = currentTabs.indexOf(draggedTabId);
    const targetIndex = currentTabs.indexOf(targetTabId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    currentTabs.splice(draggedIndex, 1);
    currentTabs.splice(targetIndex, 0, draggedTabId);
    this.openVideoTabIds.set(currentTabs);
  }

  public reorderVideoTabsByIndex(previousIndex: number, currentIndex: number): void {
    if (previousIndex === currentIndex || previousIndex < 0 || currentIndex < 0) return;

    const currentTabs = [...this.openVideoTabIds()];
    if (previousIndex >= currentTabs.length || currentIndex >= currentTabs.length) return;

    moveItemInArray(currentTabs, previousIndex, currentIndex);
    this.openVideoTabIds.set(currentTabs);
  }

  public openVideoFromLibrary(): void {
    void this.onBackToLibrary();
  }

  private cacheOpenVideoTabReview(review: FilmListReview | null): void {
    if (!review?.id) return;

    this.openVideoTabReviewCache.update((current) => ({
      ...current,
      [review.id]: review,
    }));
  }

  ngOnDestroy(): void {
    this.activeLibraryUploadHandle?.cancel();
    void this.flushCurrentPlayAnnotationPersistence();
    this.stopSmoothProgressTracking();
    this.destroyHls();
    this.teardownDrawOverlayResizeObserver();
    this.nativeVideoSourceUrl = null;
    this.nativePlayerLoading.set(false);
    this.cloudflareIframeLoading.set(false);
    this.cloudflareNativePlaybackFailed.set(false);
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.safeIframeUrlCache.clear();
    for (const timeoutId of this.downloadExportPollTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    this.downloadExportPollTimeouts.clear();
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.resetNativePlayerElement();
    this.drawModeEnabled.set(false);
    this.resetDrawOverlay();
  }

  private readonly downloadExportPollTimeouts = new Map<string, number>();

  private shouldUseServerSideDownloadExport(review: FilmReviewDragSource): boolean {
    return review.uploadMode === 'full_footage';
  }

  private canPrepareServerSideDownloadExport(review: FilmReviewDragSource): boolean {
    return !!(
      review.storagePath?.trim() ||
      review.cloudflareVideoId?.trim() ||
      review.videoUrl?.trim() ||
      review.downloadPrewarm?.mp4Url?.trim()
    );
  }

  private isDownloadExportPollingActive(reviewId: string): boolean {
    return this.activeDownloadExportReviewIds().has(reviewId);
  }

  private updateDownloadExportPollingState(reviewId: string, isActive: boolean): void {
    this.activeDownloadExportReviewIds.update((current) => {
      const next = new Set(current);
      if (isActive) {
        next.add(reviewId);
      } else {
        next.delete(reviewId);
      }
      return next;
    });
  }

  private clearDownloadExportPoll(reviewId: string): void {
    const timeoutId = this.downloadExportPollTimeouts.get(reviewId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      this.downloadExportPollTimeouts.delete(reviewId);
    }
    this.updateDownloadExportPollingState(reviewId, false);
  }

  private scheduleDownloadExportPoll(
    reviewId: string,
    fallbackFileName: string,
    attempt: number
  ): void {
    this.updateDownloadExportPollingState(reviewId, true);
    const timeoutId = window.setTimeout(() => {
      void this.pollDownloadExport(reviewId, fallbackFileName, attempt + 1);
    }, FILM_REVIEW_DOWNLOAD_EXPORT_POLL_INTERVAL_MS);
    this.downloadExportPollTimeouts.set(reviewId, timeoutId);
  }

  private async requestServerSideDownloadExport(review: FilmReviewDragSource): Promise<void> {
    if (!this.canPrepareServerSideDownloadExport(review)) {
      this.toast.info('This full-game video is not ready to export yet.');
      return;
    }

    if (this.isDownloadExportPollingActive(review.id)) {
      this.toast.info('The full-game export is already in progress.');
      return;
    }

    this.openDownloadMenuReviewId.set(null);

    try {
      const result = await this.service.requestDownloadExport(review.id);
      const exportState = result.exportState;
      const fallbackFileName =
        exportState?.fileName?.trim() || this.buildFilmReviewVideoFileName(review);

      if (exportState?.status === 'ready' && result.downloadUrl) {
        this.triggerFileDownload(result.downloadUrl, fallbackFileName);
        this.toast.success('Full-game export is ready. Download starting.');
        return;
      }

      if (exportState?.status === 'error') {
        this.toast.error(
          exportState.lastError?.trim() || 'Failed to prepare the full-game export.'
        );
        return;
      }

      this.toast.info(
        exportState?.percentComplete !== undefined
          ? `Preparing full-game export in the background (${exportState.percentComplete}%).`
          : 'Preparing full-game export in the background.'
      );
      this.scheduleDownloadExportPoll(review.id, fallbackFileName, 0);
    } catch (err) {
      this.toast.error(
        err instanceof Error ? err.message : 'Failed to prepare the full-game export.'
      );
    }
  }

  private async pollDownloadExport(
    reviewId: string,
    fallbackFileName: string,
    attempt: number
  ): Promise<void> {
    this.downloadExportPollTimeouts.delete(reviewId);

    try {
      const result = await this.service.requestDownloadExport(reviewId);
      const exportState = result.exportState;

      if (exportState?.status === 'ready' && result.downloadUrl) {
        this.clearDownloadExportPoll(reviewId);
        this.triggerFileDownload(
          result.downloadUrl,
          exportState.fileName?.trim() || fallbackFileName
        );
        this.toast.success('Full-game export finished. Download starting.');
        return;
      }

      if (exportState?.status === 'error') {
        this.clearDownloadExportPoll(reviewId);
        this.toast.error(exportState.lastError?.trim() || 'Full-game export failed.');
        return;
      }

      if (attempt >= FILM_REVIEW_DOWNLOAD_EXPORT_MAX_POLLS) {
        this.clearDownloadExportPoll(reviewId);
        this.toast.info(
          'The full-game export is still processing. You can tap download again in a moment to resume.'
        );
        return;
      }

      this.scheduleDownloadExportPoll(reviewId, fallbackFileName, attempt);
    } catch (err) {
      this.clearDownloadExportPoll(reviewId);
      this.toast.error(
        err instanceof Error ? err.message : 'Failed to check full-game export progress.'
      );
    }
  }

  private getTimelinePlayKey(play: FilmTimelinePlay, index: number): string {
    return play.id ?? `${play.number ?? index + 1}:${play.startSec}:${play.endSec}`;
  }

  private getTimelinePlayFieldKey(play: FilmTimelinePlay, index: number, fieldKey: string): string {
    return `${this.getTimelinePlayKey(play, index)}:${fieldKey}`;
  }

  private resetTimelinePlayEditing(): void {
    this.editingTimelinePlayKey.set(null);
    this.timelinePlayEditDraft.set('');
  }

  /**
   * Initiates async timeline generation for the given film review.
   * Calls the service which polls until timeline is ready or timeout.
   * Errors are logged and tracked; user sees error message in template.
   *
   * **Observability:**
   * - Logs: tracked by service via logger.info/error
   * Generate timeline by injecting video into Agent X for analysis.
   * Agent X handles video analysis through agent tools and returns
   * results via chat, replacing the previous polling-based approach.
   */
  protected async onGenerateTimeline(reviewId: string): Promise<void> {
    const review = this.selectedReview();
    if (!review) return;

    if (!this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    if (this.isBatchClipReview(review)) {
      this.toast.error(
        'Timeline generation is not available for batch clip sessions yet. Import a breakdown sheet or upload full footage instead.'
      );
      return;
    }

    const panelSport = this.panelSport();
    if (review && panelSport && this.normalizeSport(review.sport) !== panelSport) {
      try {
        await this.service.syncReviewSport(reviewId, panelSport);
      } catch (err) {
        this.logger.error('Failed to sync review sport', err, { reviewId });
        this.toast.error('Failed to sync sport');
        return;
      }
    }

    // Inject video context into Agent X (similar to Ask Agent button pattern)
    const context = this.buildFilmReviewDragContext(review);
    this.agentXService.queueSelectedContexts([context]);

    // Build prompt asking Agent X to analyze and generate timeline
    const prompt = this.buildTimelineGenerationPrompt(review);

    // Emit event to trigger Agent X chat open and send prompt
    this.askAgentPromptRequested.emit(prompt);

    this.logger.info('Timeline generation requested via Agent X', { reviewId });
  }

  /**
   * Build the prompt asking Agent X to analyze and generate timeline.
   * This prompt is sent to the agent chat interface.
   */
  protected buildTimelineGenerationPrompt(review: FilmListReview): string {
    const sportLabel = review.sport ? ` (${review.sport})` : '';
    const opponentLabel = review.opponentName ? ` vs ${review.opponentName}` : '';

    return (
      `Analyze this film review${sportLabel}${opponentLabel} and generate a complete timeline breakdown of all plays. ` +
      `For each segment, include: ` +
      `(1) startSec and endSec in seconds (numeric values), ` +
      `(2) a clear play label, ` +
      `(3) confidence as a number from 0.0 to 1.0, ` +
      `(4) every field from the current sport's breakdown schema. ` +
      `If a schema field is unknown or not visible, set it to null (leave empty) instead of guessing or hallucinating values. ` +
      `Do not add fields outside the sport schema. ` +
      `Return structured timeline rows ready for import.`
    );
  }

  protected isBatchClipReview(review: FilmListReview | null | undefined): boolean {
    return review?.uploadMode === 'batch_clips';
  }

  /**
   * Navigate to the previous play segment.
   * Updates currentPlayIndex and seeks video player to play start time.
   */
  protected async goToPreviousPlay(): Promise<void> {
    const rows = this.filteredTimelineRows();
    if (rows.length === 0) return;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    const activeRowIndex = rows.findIndex((row) => row.originalIndex === this.currentPlayIndex());
    if (activeRowIndex <= 0) return;

    const nextRow = rows[activeRowIndex - 1];
    if (!nextRow) return;

    this.currentPlayIndex.set(nextRow.originalIndex);
    this.jumpToPlay(nextRow.play);
  }

  /**
   * Navigate to the next play segment.
   * Updates currentPlayIndex and seeks video player to play start time.
   */
  protected async goToNextPlay(): Promise<void> {
    const rows = this.filteredTimelineRows();
    if (rows.length === 0) return;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    const activeRowIndex = rows.findIndex((row) => row.originalIndex === this.currentPlayIndex());
    if (activeRowIndex < 0 || activeRowIndex >= rows.length - 1) return;

    const nextRow = rows[activeRowIndex + 1];
    if (!nextRow) return;

    this.currentPlayIndex.set(nextRow.originalIndex);
    this.jumpToPlay(nextRow.play);
  }

  protected async onSelectTimelinePlay(play: FilmTimelinePlay, index: number): Promise<void> {
    const timeline = this.currentTimeline();
    if (index < 0 || index >= timeline.length) return;
    if (this.isEditingTimelinePlay(timeline[index]!, index)) return;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    this.currentPlayIndex.set(index);
    this.jumpToPlay(play);
  }

  protected isTimelinePlayDropIndicator(
    index: number,
    placement: TimelinePlayDropPlacement
  ): boolean {
    const indicator = this.timelinePlayDropIndicator();
    return indicator?.index === index && indicator.placement === placement;
  }

  protected onTimelinePlayDragStart(event: DragEvent, index: number): void {
    event.stopPropagation();

    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      event.preventDefault();
      this.notifyWriteAccessDenied();
      return;
    }

    const timeline = this.currentTimeline();
    if (this.hasActiveTimelineFilters() || this.saving() || !timeline[index]) {
      event.preventDefault();
      return;
    }

    this.resetTimelinePlayEditing();
    this.draggingTimelinePlayIndex.set(index);
    this.timelinePlayDropIndicator.set(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(FILM_REVIEW_TIMELINE_DRAG_MIME, String(index));
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected onTimelinePlayDragEnd(event: DragEvent): void {
    event.stopPropagation();
    this.resetTimelinePlayDragState();
  }

  protected onTimelinePlayDragOver(event: DragEvent, targetIndex: number): void {
    if (this.hasActiveTimelineFilters()) return;

    const sourceIndex = this.draggingTimelinePlayIndex();
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    event.preventDefault();
    event.stopPropagation();
    const placement = this.resolveTimelinePlayDropPlacement(event);
    this.timelinePlayDropIndicator.set({ index: targetIndex, placement });

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onTimelinePlayDragLeave(event: DragEvent, targetIndex: number): void {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget?.contains(relatedTarget)) return;

    const indicator = this.timelinePlayDropIndicator();
    if (indicator?.index === targetIndex) {
      this.timelinePlayDropIndicator.set(null);
    }
  }

  protected async onTimelinePlayDrop(
    event: DragEvent,
    reviewId: string,
    targetIndex: number
  ): Promise<void> {
    const review = this.reviews().find((item) => item.id === reviewId) ?? this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      event.preventDefault();
      event.stopPropagation();
      this.resetTimelinePlayDragState();
      return;
    }

    if (this.hasActiveTimelineFilters()) {
      event.preventDefault();
      event.stopPropagation();
      this.resetTimelinePlayDragState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sourceIndex = this.resolveTimelineDragSourceIndex(event);
    const timeline = this.currentTimeline();
    const currentIndicator = this.timelinePlayDropIndicator();
    const placement =
      currentIndicator?.index === targetIndex
        ? currentIndicator.placement
        : this.resolveTimelinePlayDropPlacement(event);
    this.resetTimelinePlayDragState();

    if (sourceIndex === null || timeline.length === 0 || sourceIndex === targetIndex) {
      return;
    }

    const nextIndex = this.resolveTimelineReorderIndex(
      sourceIndex,
      targetIndex,
      placement,
      timeline.length
    );
    if (nextIndex === sourceIndex) return;

    const activePlay = this.currentPlay();
    const activePlayId = activePlay?.id ?? null;
    const activePlayFallbackKey = activePlay
      ? `${activePlay.startSec}:${activePlay.endSec}:${activePlay.label}`
      : null;

    try {
      const updated = await this.service.reorderTimelinePlay(reviewId, sourceIndex, nextIndex);
      const nextTimeline = this.resolveEffectiveTimeline(updated ?? this.selectedReview());
      const activeIndex = this.findTimelinePlayIndex(
        nextTimeline,
        activePlayId,
        activePlayFallbackKey
      );
      const fallbackIndex = Math.max(0, Math.min(this.currentPlayIndex(), nextTimeline.length - 1));

      this.currentPlayIndex.set(activeIndex >= 0 ? activeIndex : fallbackIndex);
      this.restoreDrawOverlayForPlay(nextTimeline[this.currentPlayIndex()] ?? null);
    } catch {
      this.toast.error('Unable to reorder plays right now. Please try again.');
    }
  }

  protected isTimelineColumnDropIndicator(
    columnId: string,
    placement: TimelineColumnDropPlacement
  ): boolean {
    const indicator = this.timelineColumnDropIndicator();
    return indicator?.columnId === columnId && indicator.placement === placement;
  }

  protected onTimelineColumnDragStart(event: DragEvent, columnId: string): void {
    event.stopPropagation();

    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      event.preventDefault();
      this.notifyWriteAccessDenied();
      return;
    }

    if (!this.currentTimelineColumns().some((column) => column.id === columnId)) {
      event.preventDefault();
      return;
    }

    this.draggingTimelineColumnId.set(columnId);
    this.timelineColumnDropIndicator.set(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(FILM_REVIEW_TIMELINE_COLUMN_DRAG_MIME, columnId);
      event.dataTransfer.setData('text/plain', columnId);
    }
  }

  protected onTimelineColumnDragEnd(event: DragEvent): void {
    event.stopPropagation();
    this.resetTimelineColumnDragState();
  }

  protected onTimelineColumnDragOver(event: DragEvent, targetColumnId: string): void {
    const sourceColumnId = this.draggingTimelineColumnId();
    if (!sourceColumnId || sourceColumnId === targetColumnId) return;

    event.preventDefault();
    event.stopPropagation();
    const placement = this.resolveTimelineColumnDropPlacement(event);
    this.timelineColumnDropIndicator.set({ columnId: targetColumnId, placement });

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onTimelineColumnDragLeave(event: DragEvent, targetColumnId: string): void {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget?.contains(relatedTarget)) return;

    const indicator = this.timelineColumnDropIndicator();
    if (indicator?.columnId === targetColumnId) {
      this.timelineColumnDropIndicator.set(null);
    }
  }

  protected onTimelineColumnDrop(event: DragEvent, targetColumnId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      this.resetTimelineColumnDragState();
      return;
    }

    const sourceColumnId = this.resolveTimelineColumnDragSourceId(event);
    const currentIndicator = this.timelineColumnDropIndicator();
    const placement =
      currentIndicator?.columnId === targetColumnId
        ? currentIndicator.placement
        : this.resolveTimelineColumnDropPlacement(event);
    this.resetTimelineColumnDragState();

    if (!sourceColumnId || sourceColumnId === targetColumnId) return;

    const nextOrder = this.resolveTimelineColumnReorder(
      this.currentTimelineColumns().map((column) => column.id),
      sourceColumnId,
      targetColumnId,
      placement
    );

    this.timelineColumnOrder.set(nextOrder);
    this.persistTimelineColumnOrder(nextOrder);
  }

  protected onTimelineColumnDragStartSmooth(columnId: string): void {
    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.draggingTimelineColumnId.set(columnId);
    this.timelineColumnDropIndicator.set(null);
  }

  protected onTimelineColumnDragEndSmooth(): void {
    this.resetTimelineColumnDragState();
  }

  protected onTimelineColumnDropSmooth(event: CdkDragDrop<readonly TimelineGridColumn[]>): void {
    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      this.resetTimelineColumnDragState();
      return;
    }

    const nextOrder = [...this.currentTimelineColumns().map((column) => column.id)];
    moveItemInArray(nextOrder, event.previousIndex, event.currentIndex);

    this.timelineColumnOrder.set(nextOrder);
    this.persistTimelineColumnOrder(nextOrder);
    this.resetTimelineColumnDragState();
  }

  protected onTimelinePlayRowKeydown(
    event: Event,
    play: { startSec: number; label: string },
    index: number
  ): void {
    event.preventDefault();
    event.stopPropagation();
    void this.onSelectTimelinePlay(play as FilmTimelinePlay, index);
  }

  protected isEditingTimelinePlay(play: FilmTimelinePlay, index: number): boolean {
    const editKey = this.editingTimelinePlayKey();
    if (!editKey) return false;
    return editKey.startsWith(`${this.getTimelinePlayKey(play, index)}:`);
  }

  protected isEditingTimelinePlayField(
    play: FilmTimelinePlay,
    index: number,
    fieldKey: string
  ): boolean {
    return this.editingTimelinePlayKey() === this.getTimelinePlayFieldKey(play, index, fieldKey);
  }

  protected onStartTimelinePlayFieldEdit(
    play: FilmTimelinePlay,
    index: number,
    fieldKey: string,
    event: Event
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const review = this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    this.editingTimelinePlayKey.set(this.getTimelinePlayFieldKey(play, index, fieldKey));
    this.timelinePlayEditDraft.set(this.getTimelinePlayFieldDraft(play, fieldKey));
  }

  protected onTimelinePlayFieldTouchEnd(
    play: FilmTimelinePlay,
    index: number,
    fieldKey: string,
    event: Event
  ): void {
    if (this.isEditingTimelinePlayField(play, index, fieldKey)) {
      return;
    }

    const now = Date.now();
    const editKey = this.getTimelinePlayFieldKey(play, index, fieldKey);
    if (this.lastTimelineFieldTouch && this.lastTimelineFieldTouch.key === editKey) {
      const elapsedMs = now - this.lastTimelineFieldTouch.atMs;
      if (elapsedMs <= 320) {
        this.lastTimelineFieldTouch = null;
        this.onStartTimelinePlayFieldEdit(play, index, fieldKey, event);
        return;
      }
    }

    this.lastTimelineFieldTouch = { key: editKey, atMs: now };
  }

  protected onTimelinePlayEditInput(value: string): void {
    this.timelinePlayEditDraft.set(value);
  }

  protected onCancelTimelinePlayEdit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetTimelinePlayEditing();
  }

  protected async onSaveTimelinePlayFieldEdit(
    reviewId: string,
    play: FilmTimelinePlay,
    index: number,
    fieldKey: string,
    event: Event,
    column?: TeamFilmReviewSportTagDefinition
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const editKey = this.getTimelinePlayFieldKey(play, index, fieldKey);
    if (
      this.editingTimelinePlayKey() !== editKey ||
      this.pendingTimelinePlayFieldSaveKey === editKey
    ) {
      return;
    }

    const review = this.reviews().find((item) => item.id === reviewId) ?? this.selectedReview();
    if (!review || !this.hasReviewWriteAccess(review)) {
      this.notifyWriteAccessDenied();
      return;
    }

    const nextPlay = this.buildUpdatedTimelinePlayFromDraft(play, fieldKey, column);
    if (!nextPlay) {
      return;
    }

    if (JSON.stringify(nextPlay) === JSON.stringify(play)) {
      this.resetTimelinePlayEditing();
      return;
    }

    this.pendingTimelinePlayFieldSaveKey = editKey;

    try {
      await this.service.updateTimelinePlay(
        reviewId,
        index,
        nextPlay,
        `edit_timeline_${fieldKey.replace(':', '_')}`
      );
      this.resetTimelinePlayEditing();
    } catch {
      // Service already reports the failure state.
    } finally {
      if (this.pendingTimelinePlayFieldSaveKey === editKey) {
        this.pendingTimelinePlayFieldSaveKey = null;
      }
    }
  }

  protected playDuration(play: { startSec: number; endSec: number }): number {
    return Math.max(0, play.endSec - play.startSec);
  }

  protected getTimelineTagValue(
    play: FilmTimelinePlay,
    column: TeamFilmReviewSportTagDefinition
  ): string {
    const value = play.tags?.[column.id];
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Y' : 'N';
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : '-';
  }

  protected getTimelineColumnDisplayValue(
    play: FilmTimelinePlay,
    column: TimelineGridColumn
  ): string {
    const displayedEndSec = this.resolveDisplayedTimelinePlayEndSec(play);

    switch (column.kind) {
      case 'number':
        return String(play.number);
      case 'label':
        return play.label;
      case 'startSec':
        return this.formatTime(play.startSec);
      case 'endSec':
        return this.formatTime(displayedEndSec);
      case 'durationSec':
        return this.formatTime(Math.max(0, displayedEndSec - play.startSec));
      case 'tag':
        return column.tagDefinition ? this.getTimelineTagValue(play, column.tagDefinition) : '-';
    }
  }

  protected hasReviewWriteAccess(review: FilmListReview | null | undefined): boolean {
    if (!review) {
      return false;
    }

    const currentUserId = this.effectiveCurrentUserId();
    if (!currentUserId) {
      return false;
    }

    const createdBy = review.createdBy?.trim();
    if (createdBy && createdBy === currentUserId) {
      return true;
    }

    const writableAccessKeys = new Set(review.writeAccessKeys ?? []);
    if (writableAccessKeys.has(`user:${currentUserId}`)) {
      return true;
    }

    const reviewTeamId = review.teamId?.trim() || this.teamId?.trim() || null;
    if (reviewTeamId && writableAccessKeys.has(`team:${reviewTeamId}`)) {
      return true;
    }

    const organizationId = review.organizationId?.trim() || null;
    return !!(organizationId && writableAccessKeys.has(`organization:${organizationId}`));
  }

  private hasPlaylistFolderWriteAccess(
    folder: FilmReviewPlaylistFolder | null | undefined
  ): boolean {
    if (!folder) {
      return false;
    }

    if (folder.isUnassigned) {
      return this.canMutateFilmReviewLibrary();
    }

    const currentUserId = this.effectiveCurrentUserId();
    if (!currentUserId) {
      return false;
    }

    const createdBy = folder.createdBy?.trim();
    if (createdBy && createdBy === currentUserId) {
      return true;
    }

    const writableAccessKeys = new Set(folder.writeAccessKeys ?? []);
    if (writableAccessKeys.has(`user:${currentUserId}`)) {
      return true;
    }

    const folderTeamId = folder.teamId?.trim() || this.teamId?.trim() || null;
    if (folderTeamId && writableAccessKeys.has(`team:${folderTeamId}`)) {
      return true;
    }

    if (folder.reviews.length > 0) {
      return folder.reviews.some((review) => this.hasReviewWriteAccess(review));
    }

    return this.canMutateFilmReviewLibrary();
  }

  private canMutateFilmReviewLibrary(): boolean {
    if (this.isAthleteRole()) {
      return false;
    }

    const reviews = this.reviews();
    if (reviews.length > 0) {
      return reviews.some((review) => this.hasReviewWriteAccess(review));
    }

    const playlists = this.service.playlists();
    if (playlists.length > 0) {
      return playlists.some((playlist) =>
        this.hasPlaylistFolderWriteAccess({
          id: playlist.id,
          name: playlist.name,
          reviews: [],
          createdBy: playlist.createdBy,
          teamId: playlist.teamId,
          writeAccessKeys: playlist.writeAccessKeys,
          parentId: playlist.parentId ?? null,
          depth: 0,
        })
      );
    }

    return true;
  }

  private notifyWriteAccessDenied(): void {
    this.toast.error('You do not have write access to edit this team film review.');
  }

  protected getTimelineColumnTestId(column: TimelineGridColumn): string | null {
    if (column.kind === 'tag') return this.testIds.TIMELINE_TAG_VALUE;
    if (column.kind === 'label') return this.testIds.TIMELINE_PLAY_EDIT_BUTTON;
    return null;
  }

  protected isTimelineColumnMenuOpen(columnId: string): boolean {
    return this.openTimelineColumnMenuId() === columnId;
  }

  protected hasTimelineColumnFilter(columnId: string): boolean {
    return this.timelineColumnFilters()[columnId] !== undefined;
  }

  protected onOpenTimelineColumnMenu(columnId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.openTimelineColumnMenuId() === columnId) {
      this.openTimelineColumnMenuId.set(null);
      return;
    }

    this.openTimelineColumnMenuId.set(columnId);
  }

  protected onCloseTimelineColumnMenu(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.openTimelineColumnMenuId.set(null);
  }

  protected onApplyTimelineColumnFilter(
    column: TimelineGridColumn,
    mode: TimelineColumnFilterMode,
    value: string,
    event: Event
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.timelineColumnFilters.update((current) => ({
      ...current,
      [column.id]: {
        mode,
        value,
      },
    }));
    this.openTimelineColumnMenuId.set(null);
  }

  protected onClearTimelineColumnFilter(columnId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.timelineColumnFilters.update((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
    this.openTimelineColumnMenuId.set(null);
  }

  protected onRemoveTimelineColumnFilter(columnId: string, event: Event): void {
    this.onClearTimelineColumnFilter(columnId, event);
  }

  protected onClearAllTimelineColumnFilters(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.timelineColumnFilters.set({});
    this.openTimelineColumnMenuId.set(null);
  }

  protected getTimelineColumnFilterOptions(column: TimelineGridColumn): readonly {
    readonly value: string;
    readonly normalizedValue: string;
    readonly count: number;
  }[] {
    const timeline = this.currentTimeline();
    const counts = new Map<string, { value: string; count: number }>();

    for (const play of timeline) {
      const value = this.getTimelineColumnDisplayValue(play, column);
      if (this.isTimelineFilterPlaceholderValue(value)) {
        continue;
      }

      const normalizedValue = this.normalizeTimelineFilterValue(value);
      const existing = counts.get(normalizedValue);
      if (existing) {
        counts.set(normalizedValue, { value: existing.value, count: existing.count + 1 });
      } else {
        counts.set(normalizedValue, { value, count: 1 });
      }
    }

    return [...counts.entries()]
      .map(([normalizedValue, data]) => ({
        normalizedValue,
        value: data.value,
        count: data.count,
      }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.value.localeCompare(right.value);
      });
  }

  private getTimelinePlayFieldDraft(play: FilmTimelinePlay, fieldKey: string): string {
    const displayedEndSec = this.resolveDisplayedTimelinePlayEndSec(play);

    switch (fieldKey) {
      case 'number':
        return String(play.number);
      case 'label':
        return play.label;
      case 'startSec':
        return this.formatTime(play.startSec);
      case 'endSec':
        return this.formatTime(displayedEndSec);
      case 'durationSec':
        return this.formatTime(Math.max(0, displayedEndSec - play.startSec));
      default: {
        const tagId = fieldKey.replace('tag:', '');
        const value = play.tags?.[tagId];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Y' : 'N';
        return String(value);
      }
    }
  }

  private buildUpdatedTimelinePlayFromDraft(
    play: FilmTimelinePlay,
    fieldKey: string,
    column?: TeamFilmReviewSportTagDefinition
  ): FilmTimelinePlay | null {
    const draft = this.timelinePlayEditDraft().trim();

    switch (fieldKey) {
      case 'number': {
        const nextNumber = Number(draft);
        if (!Number.isFinite(nextNumber) || nextNumber < 0) {
          this.toast.error('Play number must be a valid number.');
          return null;
        }
        return { ...play, number: Math.round(nextNumber) };
      }
      case 'label': {
        if (!draft) {
          this.toast.error('Play label cannot be empty.');
          return null;
        }
        return { ...play, label: draft };
      }
      case 'startSec': {
        const nextStartSec = this.parseTimelineEditSeconds(draft);
        if (nextStartSec === null) {
          this.toast.error('Start time must be in seconds or mm:ss format.');
          return null;
        }
        if (nextStartSec > play.endSec) {
          this.toast.error('Start time cannot be after end time.');
          return null;
        }
        return { ...play, startSec: nextStartSec };
      }
      case 'endSec': {
        const nextEndSec = this.parseTimelineEditSeconds(draft);
        if (nextEndSec === null) {
          this.toast.error('End time must be in seconds or mm:ss format.');
          return null;
        }
        if (nextEndSec < play.startSec) {
          this.toast.error('End time cannot be before start time.');
          return null;
        }
        return { ...play, endSec: nextEndSec };
      }
      case 'durationSec': {
        const nextDurationSec = this.parseTimelineEditSeconds(draft);
        if (nextDurationSec === null) {
          this.toast.error('Duration must be in seconds or mm:ss format.');
          return null;
        }
        return { ...play, endSec: play.startSec + nextDurationSec };
      }
      default: {
        if (!column) {
          this.toast.error('Timeline field could not be edited.');
          return null;
        }

        const nextTagValue = this.parseTimelineTagEditValue(draft, column);
        if (nextTagValue === undefined) {
          this.toast.error(`Invalid value for ${column.label}.`);
          return null;
        }

        return {
          ...play,
          tags: {
            ...(play.tags ?? {}),
            [column.id]: nextTagValue,
          },
        };
      }
    }
  }

  private parseTimelineEditSeconds(value: string): number | null {
    if (!value) return null;

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.round(numeric * 1000) / 1000;
    }

    const parts = value.split(':').map((part) => Number(part.trim()));
    if (
      parts.length >= 2 &&
      parts.length <= 3 &&
      parts.every((part) => Number.isFinite(part) && part >= 0)
    ) {
      const seconds =
        parts.length === 3
          ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
          : parts[0]! * 60 + parts[1]!;
      return Math.round(seconds * 1000) / 1000;
    }

    return null;
  }

  private normalizeTimelineFilterValue(value: string): string {
    return value.trim().toLowerCase();
  }

  private buildTimelineBreakdownCsv(): string | null {
    const columns = this.currentTimelineColumns();
    const selectedIds = this.selectedTimelinePlayIds();
    const rows =
      selectedIds.size > 0
        ? this.filteredTimelineRows().filter((row) =>
            selectedIds.has(this.resolveTimelinePlaySelectionId(row.play, row.originalIndex))
          )
        : this.filteredTimelineRows();
    if (columns.length === 0 || rows.length === 0) return null;

    const headerRow = columns.map((column) => this.escapeCsvValue(column.label)).join(',');
    const dataRows = rows.map(({ play }) =>
      columns
        .map((column) => this.escapeCsvValue(this.getTimelineColumnDisplayValue(play, column)))
        .join(',')
    );

    return [headerRow, ...dataRows].join('\r\n');
  }

  private buildTimelineBreakdownCsvForReview(review: FilmReviewDragSource): string | null {
    const timeline = this.resolveEffectiveTimeline(review);
    if (timeline.length === 0) return null;

    const sportContext = this.normalizeSport(review.sport) ?? this.panelSport() ?? '';
    const columns = this.applyTimelineColumnOrder(
      this.buildDefaultTimelineColumns(getTeamFilmReviewSportTagDefinitions(sportContext)),
      this.timelineColumnOrder()
    );
    if (columns.length === 0) return null;

    const headerRow = columns.map((column) => this.escapeCsvValue(column.label)).join(',');
    const dataRows = timeline.map((play) =>
      columns
        .map((column) => this.escapeCsvValue(this.getTimelineColumnDisplayValue(play, column)))
        .join(',')
    );

    return [headerRow, ...dataRows].join('\r\n');
  }

  private escapeCsvValue(value: string): string {
    const normalized = value.replace(/\r?\n/g, ' ').trim();
    const escaped = normalized.replace(/"/g, '""');
    return /[",]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  private resolveDownloadableVideoUrl(review: FilmReviewDragSource): string | null {
    return this.resolveDownloadableVideoUrlForPlay(review);
  }

  private resolveDownloadablePlaybackSourceUrl(
    source: FilmReviewPlaybackSource | null | undefined
  ): string | null {
    const sourceDownloadUrl = source?.downloadUrl?.trim();
    if (sourceDownloadUrl) return sourceDownloadUrl;

    const videoUrl = source?.videoUrl?.trim();
    if (!videoUrl || isHlsSourceUrl(videoUrl)) return null;

    try {
      const parsed = new URL(videoUrl);
      if (
        parsed.hostname === 'watch.cloudflarestream.com' ||
        parsed.hostname === 'iframe.videodelivery.net'
      ) {
        return null;
      }
    } catch {
      return null;
    }

    return videoUrl;
  }

  private isDownloadablePlaybackSource(
    source: FilmReviewPlaybackSource | null | undefined
  ): boolean {
    if (!source) return false;
    if (this.resolveDownloadablePlaybackSourceUrl(source)) return true;
    if (source.storagePath?.trim()) return true;
    if (source.cloudflareVideoId?.trim()) return true;
    return false;
  }

  private buildFilmReviewDownloadProxyUrl(
    _review: FilmListReview | null | undefined,
    _sourceId?: string | null
  ): string | null {
    return null;
  }

  private resolveDownloadableVideoUrlForPlay(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    const source = this.resolvePlaybackSource(review, play);
    const proxyUrl = this.isDownloadablePlaybackSource(source)
      ? this.buildFilmReviewDownloadProxyUrl(review, source?.id ?? play?.sourceId)
      : this.buildFilmReviewDownloadProxyUrl(review);
    if (proxyUrl) return proxyUrl;

    const sourceDownloadUrl = this.resolveDownloadablePlaybackSourceUrl(source);
    if (sourceDownloadUrl) return sourceDownloadUrl;

    const mp4Url = !play ? review?.downloadPrewarm?.mp4Url?.trim() : null;
    if (mp4Url) return mp4Url;

    return null;
  }

  private buildFilmReviewVideoFileName(review: FilmReviewDragSource): string {
    return `${this.buildFilmReviewFileStem(review)}.mp4`;
  }

  private buildSelectedLibraryArchiveFileName(reviews: readonly FilmReviewDragSource[]): string {
    if (reviews.length === 1) {
      return `${this.buildFilmReviewFileStem(reviews[0])}-export`;
    }

    return `film-review-library-export-${new Date().toISOString().slice(0, 10)}`;
  }

  private async resolveSelectedLibraryReviewsForArchiveExport(): Promise<
    readonly FilmReviewDragSource[]
  > {
    const selectedReviews = this.selectedLibraryReviews();
    if (selectedReviews.length === 0) {
      return [];
    }

    return Promise.all(selectedReviews.map((review) => this.resolveReviewForArchiveExport(review)));
  }

  private async resolveReviewForArchiveExport(
    review: FilmReviewDragSource
  ): Promise<FilmReviewDragSource> {
    try {
      await this.service.ensureReviewDetails(review.id, this.teamId?.trim() || undefined);
    } catch {
      // Keep the existing payload when detail hydration fails.
    }

    const refreshed = this.reviews().find((item) => item.id === review.id);
    return (refreshed as FilmReviewDragSource | undefined) ?? review;
  }

  private resolveReviewArchiveFolderSegments(review: FilmListReview): readonly string[] {
    const playlist = this.resolveReviewPlaylist(review);
    if (!playlist) {
      return ['Unassigned Film'];
    }

    const node = this.findPlaylistFolderNodeById(playlist.id);
    if (!node) {
      return [playlist.name];
    }

    const segments: string[] = [];
    const visited = new Set<string>();
    let currentNode: FilmReviewPlaylistFolderTreeNode | null = node;

    while (currentNode && !visited.has(currentNode.id)) {
      visited.add(currentNode.id);
      segments.push(currentNode.name);
      currentNode = currentNode.parentId
        ? this.findPlaylistFolderNodeById(currentNode.parentId)
        : null;
    }

    return segments.reverse();
  }

  private buildReviewArchiveFolderName(review: FilmListReview): string {
    const title = this.getReviewDisplayTitle(review).trim();
    const dateToken = review.gameDate?.trim();
    return [title, dateToken].filter((part): part is string => !!part).join(' ') || 'Film Review';
  }

  private resolveReviewArchiveEntries(
    review: FilmReviewDragSource,
    options?: {
      readonly prefixSegments?: readonly string[];
    }
  ): readonly ArchiveDownloadEntry[] {
    const prefixSegments = options?.prefixSegments ?? [];
    const csvContent = this.buildTimelineBreakdownCsvForReview(review);
    const sourceEntries = this.resolveDownloadableReviewSourceEntries(review);
    const shouldGroupSources = (review.sources?.length ?? 0) > 1;

    if (sourceEntries.length > 0) {
      const pathPrefix = shouldGroupSources
        ? [...prefixSegments, this.buildReviewArchiveFolderName(review)]
        : [...prefixSegments];

      const entries: ArchiveDownloadEntry[] = sourceEntries.map((item) => ({
        path: [...pathPrefix, item.fileName].join('/'),
        source: {
          kind: 'url',
          url: item.downloadUrl,
        },
      }));

      if (csvContent) {
        entries.push({
          path: [...pathPrefix, this.buildFilmReviewBreakdownFileName(review)].join('/'),
          source: {
            kind: 'text',
            text: csvContent,
          },
        });
      }

      return entries;
    }

    const downloadUrl =
      this.buildFilmReviewDownloadProxyUrl(review) || this.resolveDownloadableVideoUrl(review);
    if (!downloadUrl) {
      return csvContent
        ? [
            {
              path: [...prefixSegments, this.buildFilmReviewBreakdownFileName(review)].join('/'),
              source: {
                kind: 'text',
                text: csvContent,
              },
            },
          ]
        : [];
    }

    const entries: ArchiveDownloadEntry[] = [
      {
        path: [...prefixSegments, this.buildFilmReviewVideoFileName(review)].join('/'),
        source: {
          kind: 'url',
          url: downloadUrl,
        },
      },
    ];

    if (csvContent) {
      entries.push({
        path: [...prefixSegments, this.buildFilmReviewBreakdownFileName(review)].join('/'),
        source: {
          kind: 'text',
          text: csvContent,
        },
      });
    }

    return entries;
  }

  private resolveDownloadableReviewSourceEntries(review: FilmReviewDragSource): ReadonlyArray<{
    readonly downloadUrl: string;
    readonly fileName: string;
  }> {
    const sources = review.sources ?? [];
    if (sources.length <= 1) {
      return [];
    }

    return sources
      .map((source, index) => {
        if (!this.isDownloadablePlaybackSource(source)) {
          return null;
        }

        const downloadUrl =
          this.buildFilmReviewDownloadProxyUrl(review, source.id) ||
          this.resolveDownloadablePlaybackSourceUrl(source);
        if (!downloadUrl) {
          return null;
        }

        return {
          downloadUrl,
          fileName: this.buildFilmReviewSourceVideoFileName(source, index),
        };
      })
      .filter(
        (item): item is { readonly downloadUrl: string; readonly fileName: string } => !!item
      );
  }

  private buildFilmReviewSourceVideoFileName(
    source: FilmReviewPlaybackSource,
    fallbackIndex: number
  ): string {
    const sourceTitle =
      source.title?.trim() ||
      this.extractSourceBaseName(source.storagePath) ||
      this.extractSourceBaseName(source.downloadUrl) ||
      this.extractSourceBaseName(source.videoUrl) ||
      `source-${fallbackIndex + 1}`;

    const sourceStem = this.sanitizeFilmReviewFileStem(sourceTitle);
    return `${sourceStem || `source-${fallbackIndex + 1}`}.mp4`;
  }

  private buildFilmReviewBreakdownFileName(review: FilmReviewDragSource): string {
    return `${this.buildFilmReviewFileStem(review)}-breakdown.csv`;
  }

  private buildFilmReviewBatchClipFileName(
    review: FilmReviewDragSource,
    play: FilmTimelinePlay,
    fallbackIndex: number
  ): string {
    const reviewStem = this.buildFilmReviewFileStem(review);
    const clipStem = this.sanitizeFilmReviewFileStem(
      play.label?.trim() || `clip-${play.number ?? fallbackIndex + 1}`
    );
    return `${reviewStem}-${clipStem || `clip-${fallbackIndex + 1}`}.mp4`;
  }

  private buildFilmReviewFileStem(review: FilmReviewDragSource): string {
    const title = this.getReviewDisplayTitle(review).trim();
    const dateToken = review.gameDate?.trim();
    const stem = [title, dateToken].filter((part): part is string => !!part).join('-');

    return this.sanitizeFilmReviewFileStem(stem) || 'film-review';
  }

  private sanitizeFilmReviewFileStem(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private triggerFileDownload(url: string, fileName: string): void {
    if (typeof document === 'undefined') return;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  private triggerBlobDownload(blob: Blob, fileName: string): void {
    if (typeof URL === 'undefined') return;

    const objectUrl = URL.createObjectURL(blob);
    this.triggerFileDownload(objectUrl, fileName);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  private shouldDownloadSelectedBatchClips(review: FilmReviewDragSource): boolean {
    return review.uploadMode === 'batch_clips' && this.selectedTimelinePlayIds().size > 0;
  }

  private resolveSelectedBatchClipDownloads(review: FilmReviewDragSource): {
    readonly items: readonly BatchClipDownloadItem[];
    readonly selectedCount: number;
  } {
    if (review.uploadMode !== 'batch_clips') {
      return { items: [], selectedCount: 0 };
    }

    const selectedIds = this.selectedTimelinePlayIds();
    if (selectedIds.size === 0) {
      return { items: [], selectedCount: 0 };
    }

    const selectedRows = this.filteredTimelineRows().filter((row) =>
      selectedIds.has(this.resolveTimelinePlaySelectionId(row.play, row.originalIndex))
    );

    const groupedItems = new Map<string, BatchClipDownloadItem>();
    for (const row of selectedRows) {
      const playId = this.resolveTimelinePlaySelectionId(row.play, row.originalIndex);
      const downloadUrl = this.resolveDownloadableVideoUrlForPlay(review, row.play);
      if (!downloadUrl) {
        continue;
      }

      const dedupeKey = row.play.sourceId?.trim() || playId;
      const existing = groupedItems.get(dedupeKey);
      if (existing) {
        groupedItems.set(dedupeKey, {
          ...existing,
          playIds: [...existing.playIds, playId],
        });
        continue;
      }

      groupedItems.set(dedupeKey, {
        playIds: [playId],
        label: row.play.label,
        downloadUrl,
        fileName: this.buildFilmReviewBatchClipFileName(review, row.play, row.originalIndex),
      });
    }

    return {
      items: [...groupedItems.values()],
      selectedCount: selectedRows.length,
    };
  }

  private async downloadSelectedBatchClips(review: FilmReviewDragSource): Promise<void> {
    const { items, selectedCount } = this.resolveSelectedBatchClipDownloads(review);
    if (selectedCount === 0) {
      this.toast.info('Select one or more clips to download them individually.');
      return;
    }

    if (items.length === 0) {
      this.toast.info('Selected clips are not ready for MP4 download yet.');
      return;
    }

    this.openDownloadMenuReviewId.set(null);

    for (const item of items) {
      this.updateTimelinePlayDownloadState(item.playIds, true);
    }

    const results = await Promise.allSettled(
      items.map(async (item) => {
        try {
          const blob = await this.fetchDownloadBlob(
            item.downloadUrl,
            await this.resolveAgentXFetchInit(item.downloadUrl)
          );
          this.triggerBlobDownload(blob, item.fileName);
        } finally {
          this.updateTimelinePlayDownloadState(item.playIds, false);
        }
      })
    );

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failedCount = results.length - successCount;
    const skippedCount = Math.max(0, selectedCount - items.length);

    if (successCount > 0 && failedCount === 0 && skippedCount === 0) {
      this.toast.success(
        successCount === 1
          ? 'Selected clip downloaded.'
          : `${successCount} selected clips downloaded.`
      );
      return;
    }

    const statusParts: string[] = [];
    if (successCount > 0) {
      statusParts.push(`${successCount} downloaded`);
    }
    if (failedCount > 0) {
      statusParts.push(`${failedCount} failed`);
    }
    if (skippedCount > 0) {
      statusParts.push(`${skippedCount} not ready`);
    }

    this.toast.error(`Batch clip download finished with issues: ${statusParts.join(', ')}.`);
  }

  private updateTimelinePlayDownloadState(playIds: readonly string[], isActive: boolean): void {
    this.activeTimelinePlayDownloadIds.update((current) => {
      const next = new Set(current);
      for (const playId of playIds) {
        if (isActive) {
          next.add(playId);
        } else {
          next.delete(playId);
        }
      }
      return next;
    });
  }

  private async attachAgentXAuthToArchiveEntries(
    entries: readonly ArchiveDownloadEntry[]
  ): Promise<readonly ArchiveDownloadEntry[]> {
    const authToken = await this.getAuthToken?.();
    if (!authToken) {
      return entries;
    }

    return entries.map((entry) => {
      if (entry.source.kind !== 'url' || !this.isFilmReviewProxyUrl(entry.source.url)) {
        return entry;
      }

      return {
        ...entry,
        source: {
          ...entry.source,
          fetchInit: this.mergeAuthorizationFetchInit(entry.source.fetchInit, authToken),
        },
      } satisfies ArchiveDownloadEntry;
    });
  }

  private isFilmReviewProxyUrl(_url: string): boolean {
    return false;
  }

  private mergeAuthorizationFetchInit(
    fetchInit: RequestInit | undefined,
    authToken: string
  ): RequestInit {
    const headers = new Headers(fetchInit?.headers ?? undefined);
    headers.set('Authorization', `Bearer ${authToken}`);
    return {
      ...fetchInit,
      headers,
    };
  }

  private async resolveAgentXFetchInit(url: string): Promise<RequestInit | undefined> {
    if (!this.isFilmReviewProxyUrl(url)) {
      return undefined;
    }

    const authToken = await this.getAuthToken?.();
    return authToken ? this.mergeAuthorizationFetchInit(undefined, authToken) : undefined;
  }

  private async fetchDownloadBlob(url: string, fetchInit?: RequestInit): Promise<Blob> {
    const response = await fetch(url, fetchInit);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    return response.blob();
  }

  private isTimelineFilterPlaceholderValue(value: string): boolean {
    const normalized = this.normalizeTimelineFilterValue(value);
    return (
      normalized.length === 0 ||
      normalized === '-' ||
      normalized === '—' ||
      normalized === '–' ||
      normalized === 'n/a' ||
      normalized === 'na' ||
      normalized === 'none' ||
      normalized === 'null'
    );
  }

  private parseTimelineTagEditValue(
    value: string,
    column: TeamFilmReviewSportTagDefinition
  ): string | number | boolean | null | undefined {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (column.valueType === 'number') {
      const numeric = Number(normalized);
      return Number.isFinite(numeric) ? numeric : undefined;
    }

    if (column.valueType === 'boolean') {
      const lower = normalized.toLowerCase();
      if (['y', 'yes', 'true', '1'].includes(lower)) return true;
      if (['n', 'no', 'false', '0'].includes(lower)) return false;
      return undefined;
    }

    if (column.valueType === 'enum' && column.options?.length) {
      const matchedOption = column.options.find(
        (option) => option.toLowerCase() === normalized.toLowerCase()
      );
      return matchedOption ?? undefined;
    }

    return normalized;
  }

  protected buildFilmReviewDragContext(review: FilmReviewDragSource): AgentXSelectedContext {
    const title = this.getReviewDisplayTitle(review);
    const breakdownSummary = this.buildFilmReviewContextSummary(review);
    const timelinePreview = this.buildFilmReviewContextTimelinePreview(
      this.resolveEffectiveTimeline(review)
    );
    const breakdownProvider = review.breakdownSource?.provider;
    const timeline = this.resolveEffectiveTimeline(review);

    return {
      id: `film-review:${review.id}`,
      kind: 'film_play',
      title,
      summary: breakdownSummary,
      source: {
        type: 'film_review',
        id: review.id,
        label: title,
      },
      entityRefs: [{ type: 'film_review', id: review.id, label: title }],
      media: {
        ...(review.videoUrl ? { videoUrl: review.videoUrl } : {}),
        ...(review.thumbnailUrl ? { thumbnailUrl: review.thumbnailUrl } : {}),
        ...(review.cloudflareVideoId ? { cloudflareVideoId: review.cloudflareVideoId } : {}),
      },
      metadata: this.compactContextMetadata({
        itemType: 'film_review',
        teamId: review.teamId,
        sport: review.sport,
        opponentName: review.opponentName,
        storagePath: review.storagePath,
        cloudflareVideoId: review.cloudflareVideoId,
        timelineState: review.timelineState,
        playCount: timeline.length || null,
        breakdownProvider,
        breakdownFileName: review.breakdownSource?.fileName,
        breakdownSheetName: review.breakdownSource?.sheetName,
        breakdownRowCount: review.breakdownSource?.rowCount,
        breakdownPlayCount: review.breakdownSource?.playCount,
        timelinePreview,
      }),
    };
  }

  private buildFilmReviewSourceContext(
    review: FilmReviewDragSource,
    playbackSource: FilmReviewPlaybackSource
  ): AgentXSelectedContext {
    const reviewTitle = this.getReviewDisplayTitle(review);
    const sourceId = playbackSource.id?.trim() || review.id;
    const sourceTitle = playbackSource.title?.trim() || reviewTitle;
    const currentTimeSec = Math.max(0, Number(this.playerCurrentTime().toFixed(3)));
    const durationSec =
      typeof playbackSource.durationSec === 'number' && Number.isFinite(playbackSource.durationSec)
        ? Math.max(0, playbackSource.durationSec)
        : null;

    return {
      id: `film-source:${review.id}:${sourceId}`,
      kind: 'film_play',
      title: sourceTitle,
      summary: `Visible source clip from ${reviewTitle}`,
      source: {
        type: 'film_review',
        id: review.id,
        label: reviewTitle,
      },
      ...(durationSec && durationSec > 0
        ? {
            timeRange: {
              startSec: 0,
              endSec: durationSec,
            },
          }
        : {}),
      entityRefs: [
        { type: 'film_review', id: review.id, label: reviewTitle },
        { type: 'film_review_source', id: sourceId, label: sourceTitle },
      ],
      metadata: this.compactContextMetadata({
        itemType: 'film_review_source',
        teamId: review.teamId,
        sport: review.sport,
        opponentName: review.opponentName,
        cloudflareVideoId: playbackSource.cloudflareVideoId ?? review.cloudflareVideoId,
        sourceId,
        sourceTitle,
        sourceStoragePath: playbackSource.storagePath?.trim() || null,
        currentTimeSec,
        durationSec,
      }),
    };
  }

  protected buildFilmReviewDragContextsForLibrary(
    review: FilmReviewDragSource
  ): readonly AgentXSelectedContext[] {
    const selectedIds = this.selectedLibraryReviewIds();
    if (selectedIds.size <= 1 || !selectedIds.has(review.id)) {
      return [this.buildFilmReviewDragContext(review)];
    }

    const contexts = this.reviews()
      .filter((candidate) => selectedIds.has(candidate.id))
      .map((candidate) => this.buildFilmReviewDragContext(candidate));

    return contexts.length > 0 ? contexts : [this.buildFilmReviewDragContext(review)];
  }

  protected onAskAgentPromptSelect(
    review: FilmReviewDragSource,
    promptId: FilmReviewAskAgentPromptId,
    event: Event
  ): void {
    event.stopPropagation();
    event.preventDefault();

    const selectedPlayContexts = this.selectedTimelinePlayDragContexts();
    if (selectedPlayContexts.length <= 0) {
      return;
    }

    this.agentXService.queueSelectedContexts(selectedPlayContexts);

    const prompt = this.buildAskAgentPrompt(promptId);
    this.askAgentPromptRequested.emit(prompt);
    this.openAskAgentMenuReviewId.set(null);
  }

  protected isTimelinePlaySelected(play: FilmTimelinePlay, originalIndex: number): boolean {
    return this.selectedTimelinePlayIds().has(
      this.resolveTimelinePlaySelectionId(play, originalIndex)
    );
  }

  protected onToggleTimelinePlaySelection(
    play: FilmTimelinePlay,
    originalIndex: number,
    event: Event
  ): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement | null;
    const playId = this.resolveTimelinePlaySelectionId(play, originalIndex);
    const isChecked = !!input?.checked;

    this.selectedTimelinePlayIds.update((current) => {
      const next = new Set(current);
      if (isChecked) {
        next.add(playId);
      } else {
        next.delete(playId);
      }
      return next;
    });
  }

  protected onToggleAllTimelinePlaySelections(event: Event): void {
    event.stopPropagation();

    const input = event.target as HTMLInputElement | null;
    const isChecked = !!input?.checked;

    if (!isChecked) {
      this.selectedTimelinePlayIds.set(new Set());
      return;
    }

    const nextSelection = new Set<string>();
    for (const row of this.filteredTimelineRows()) {
      nextSelection.add(this.resolveTimelinePlaySelectionId(row.play, row.originalIndex));
    }
    this.selectedTimelinePlayIds.set(nextSelection);
  }

  protected buildPlaylistFolderDragContexts(
    folder: FilmReviewPlaylistFolderTreeNode
  ): readonly AgentXSelectedContext[] {
    const reviewIds = this.collectLibraryFolderReviewIds(folder);
    const reviewById = new Map(this.reviews().map((review) => [review.id, review] as const));
    const playlistReviews: FilmReviewDragSource[] = [];
    const seen = new Set<string>();

    for (const reviewId of reviewIds) {
      if (seen.has(reviewId)) continue;

      const review = reviewById.get(reviewId);
      if (!review) continue;

      playlistReviews.push(review);
      seen.add(reviewId);
    }

    return [this.buildPlaylistFolderDragContext(folder, playlistReviews)];
  }

  protected buildPlaylistFolderDragContextsForLibrary(
    folder: FilmReviewPlaylistFolderTreeNode
  ): readonly AgentXSelectedContext[] {
    const selectedPlaylistIds = this.selectedLibraryPlaylistIds();
    if (!selectedPlaylistIds.has(folder.id)) {
      return this.buildPlaylistFolderDragContexts(folder);
    }

    const { selectedPlaylistFolders, selectedReviewsOutsidePlaylists } =
      this.resolveEffectiveLibraryAskAgentSelection();
    const selectedItemCount =
      selectedPlaylistFolders.length + selectedReviewsOutsidePlaylists.length;

    if (selectedItemCount <= 1) {
      return this.buildPlaylistFolderDragContexts(folder);
    }

    const selectedPlaylistContexts = selectedPlaylistFolders.flatMap((playlistFolder) =>
      this.buildPlaylistFolderDragContexts(playlistFolder)
    );
    const selectedReviewContexts = selectedReviewsOutsidePlaylists.map((review) =>
      this.buildFilmReviewDragContext(review)
    );
    const selectedContexts = [...selectedPlaylistContexts, ...selectedReviewContexts];

    return selectedContexts.length > 0
      ? selectedContexts
      : this.buildPlaylistFolderDragContexts(folder);
  }

  private buildPlaylistFolderDragContext(
    folder: FilmReviewPlaylistFolderTreeNode,
    reviews: readonly FilmReviewDragSource[]
  ): AgentXSelectedContext {
    const reviewCount = reviews.length;
    const reviewTitlePreview = reviews
      .slice(0, 3)
      .map((review) => this.getReviewDisplayTitle(review))
      .join(' | ');
    const summaryParts: string[] = [];

    if (reviewCount > 0) {
      summaryParts.push(
        reviewCount === 1 ? '1 video in this folder' : `${reviewCount} videos in this folder`
      );
    } else {
      summaryParts.push('Folder is currently empty');
    }

    if (reviewTitlePreview) {
      summaryParts.push(`Includes: ${reviewTitlePreview}`);
    }

    const timelinePlayCount = reviews.reduce((total, review) => {
      return total + this.resolveEffectiveTimeline(review).length;
    }, 0);

    const allReviewIds = reviews.map((review) => review.id);

    return {
      id: `film-playlist:${folder.id}`,
      kind: 'document',
      title: folder.name,
      summary: summaryParts.join(' • ').slice(0, 600),
      source: {
        type: 'agent_x',
        id: folder.id,
        label: folder.name,
      },
      entityRefs: [
        {
          type: 'film_playlist',
          id: folder.id,
          label: folder.name,
        },
        ...reviews.map((review) => ({
          type: 'film_review',
          id: review.id,
          label: this.getReviewDisplayTitle(review),
        })),
      ],
      metadata: this.compactContextMetadata({
        itemType: 'film_review_playlist',
        playlistId: folder.id,
        playlistName: folder.name,
        hasVideos: reviewCount > 0,
        reviewCount,
        timelinePlayCount,
        reviewIdsCsv: allReviewIds.length > 0 ? allReviewIds.join(',') : null,
      }),
    };
  }

  private buildFilmReviewContextSummary(review: FilmReviewDragSource): string {
    const summaryParts: string[] = [];
    const aiSummary = review.aiSummary?.trim();
    if (aiSummary) {
      summaryParts.push(aiSummary);
    }

    const breakdownDetails = this.buildFilmReviewContextBreakdownDetails(review);
    if (breakdownDetails) {
      summaryParts.push(breakdownDetails);
    }

    const timelinePreview = this.buildFilmReviewContextTimelinePreview(
      this.resolveEffectiveTimeline(review)
    );
    if (timelinePreview) {
      summaryParts.push(`Sample plays: ${timelinePreview}`);
    }

    const keyInsight = review.keyInsights?.find(
      (insight) => typeof insight === 'string' && insight.trim().length > 0
    );
    if (keyInsight?.trim()) {
      summaryParts.push(`Key insight: ${keyInsight.trim()}`);
    }

    if (!summaryParts.length) {
      summaryParts.push(
        review.opponentName ? `Film review vs ${review.opponentName}` : 'Film review video'
      );
    }

    return summaryParts.join(' • ').slice(0, 600);
  }

  private buildFilmReviewContextBreakdownDetails(review: FilmReviewDragSource): string | null {
    const playCount =
      this.resolveEffectiveTimeline(review).length || review.breakdownSource?.playCount || 0;
    const providerLabel = this.getFilmReviewBreakdownProviderLabel(
      review.breakdownSource?.provider
    );
    const detailParts: string[] = [];

    if (providerLabel) {
      detailParts.push(providerLabel);
    }

    if (playCount > 0) {
      detailParts.push(`${playCount} tagged plays`);
    }

    if (review.breakdownSource?.fileName?.trim()) {
      detailParts.push(review.breakdownSource.fileName.trim());
    }

    if (!detailParts.length) {
      return null;
    }

    return detailParts.join(' • ');
  }

  private resolveEffectiveTimeline(
    review:
      | Pick<FilmReviewDragSource, 'timeline' | 'uploadMode' | 'sources' | 'durationSec' | 'title'>
      | null
      | undefined
  ): readonly FilmTimelinePlay[] {
    if (!review) return [];

    const timeline = review.timeline ?? [];
    if (timeline.length > 0) {
      return timeline;
    }

    const sources = review.sources ?? [];
    if (review.uploadMode === 'batch_clips' && sources.length > 1) {
      return sources.map((source, index) => ({
        id: `play-${source.id}`,
        number: index + 1,
        label: source.title?.trim() || `Clip ${index + 1}`,
        startSec: 0,
        endSec: Math.max(1, source.durationSec ?? 1),
        sourceId: source.id,
      }));
    }

    const primarySource = sources[0];
    const fallbackDurationSec = primarySource?.durationSec ?? review.durationSec ?? 0;
    if (!primarySource && fallbackDurationSec <= 0) {
      return [];
    }

    return [
      {
        id: `play-${primarySource?.id ?? 'primary'}`,
        number: 1,
        label: primarySource?.title?.trim() || review.title?.trim() || 'Clip 1',
        startSec: 0,
        endSec: Math.max(1, fallbackDurationSec),
        ...(primarySource?.id ? { sourceId: primarySource.id } : {}),
      },
    ];
  }

  private getFilmReviewBreakdownProviderLabel(
    provider: NonNullable<FilmReviewDragSource['breakdownSource']>['provider'] | undefined
  ): string | null {
    switch (provider) {
      case 'hudl':
        return 'Hudl breakdown';
      case 'csv':
        return 'CSV breakdown';
      case 'manual_import':
        return 'Imported breakdown';
      default:
        return null;
    }
  }

  private buildFilmReviewContextTimelinePreview(
    timeline: readonly FilmTimelinePlay[]
  ): string | null {
    const preview = timeline
      .slice(0, 3)
      .map((play) => this.describeFilmTimelinePlayForContext(play))
      .filter((value): value is string => value.length > 0)
      .join(' | ');

    return preview || null;
  }

  private describeFilmTimelinePlayForContext(play: FilmTimelinePlay): string {
    const tagPreview = Object.entries(play.tags ?? {})
      .flatMap(([key, value]) => {
        const normalized = this.formatFilmReviewContextTagValue(value);
        return normalized ? [`${key}:${normalized}`] : [];
      })
      .slice(0, 3)
      .join(', ');

    const base = `${play.label} @ ${this.formatTime(play.startSec)}`;
    return tagPreview ? `${base} (${tagPreview})` : base;
  }

  private formatFilmReviewContextTagValue(value: TeamFilmReviewPlayTagValue): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }

    if (typeof value === 'boolean') {
      return value ? 'yes' : 'no';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return '';
  }

  protected buildFilmPlayDragContext(
    review: FilmReviewDragSource,
    play: FilmTimelinePlay,
    fallbackIndex: number
  ): AgentXSelectedContext {
    const reviewTitle = this.getReviewDisplayTitle(review);
    const playId = this.resolveTimelinePlaySelectionId(play, fallbackIndex);
    const title = `${play.label} @ ${this.formatTime(play.startSec)}`;
    const playbackSource = this.resolveAgentDefaultPlaybackSource(review, play);
    const sourceId = playbackSource?.id?.trim() || play.sourceId?.trim() || null;
    const sourceTitle = playbackSource?.title?.trim() || null;
    const reviewSources = this.resolveReviewCameraAngleSources(review);
    const fullSource = sourceId
      ? reviewSources.find((source) => source.id.trim() === sourceId)
      : undefined;
    const sourceAngle = fullSource
      ? this.resolveSourceAngleMetadata(reviewSources, fullSource).cameraAngle
      : null;

    return {
      id: `film-play:${review.id}:${playId}`,
      kind: 'film_play',
      title,
      summary: `${reviewTitle} clip from ${this.formatTime(play.startSec)} to ${this.formatTime(
        play.endSec
      )}`,
      source: {
        type: 'film_review',
        id: review.id,
        label: reviewTitle,
      },
      timeRange: {
        startSec: play.startSec,
        endSec: play.endSec,
      },
      entityRefs: [
        { type: 'film_review', id: review.id, label: reviewTitle },
        { type: 'film_play', id: playId, label: play.label },
        ...(sourceId
          ? [
              {
                type: 'film_review_source',
                id: sourceId,
                ...(sourceTitle ? { label: sourceTitle } : {}),
              },
            ]
          : []),
      ],
      media: {
        ...(playbackSource?.videoUrl ? { videoUrl: playbackSource.videoUrl } : {}),
        ...(playbackSource?.thumbnailUrl ? { thumbnailUrl: playbackSource.thumbnailUrl } : {}),
        ...(playbackSource?.cloudflareVideoId
          ? { cloudflareVideoId: playbackSource.cloudflareVideoId }
          : {}),
      },
      metadata: this.compactContextMetadata({
        itemType: 'film_timeline_play',
        teamId: review.teamId,
        sport: review.sport,
        opponentName: review.opponentName,
        cloudflareVideoId: playbackSource?.cloudflareVideoId ?? review.cloudflareVideoId,
        sourceId,
        sourceTitle,
        sourceCameraAngle: sourceAngle,
        sourceStoragePath: playbackSource?.storagePath?.trim() || null,
        playNumber: play.number ?? null,
        durationSec: this.playDuration(play),
        ...(play.tags ?? {}),
      }),
    };
  }

  private resolveAgentDefaultPlaybackSource(
    review: FilmReviewDragSource,
    play: FilmTimelinePlay
  ): FilmReviewPlaybackSource | null {
    const playSources = this.resolvePlaybackSourcesForPlay(review, play);
    const wideSource = playSources.find(
      (source) => this.resolveSourceAngleMetadata(playSources, source).cameraAngle === 'wide'
    );

    return wideSource ?? this.resolvePlaybackSource(review, play);
  }

  protected buildTimelinePlayRowDragContext(
    review: FilmReviewDragSource,
    play: FilmTimelinePlay,
    fallbackIndex: number
  ): AgentXSelectedContext | readonly AgentXSelectedContext[] {
    const playId = this.resolveTimelinePlaySelectionId(play, fallbackIndex);
    const selectedPlayIds = this.selectedTimelinePlayIds();

    if (selectedPlayIds.size > 1 && selectedPlayIds.has(playId)) {
      return this.selectedTimelinePlayDragContexts();
    }

    return this.buildFilmPlayDragContext(review, play, fallbackIndex);
  }

  protected readonly selectedTimelinePlayDragContexts = computed<readonly AgentXSelectedContext[]>(
    () => {
      const review = this.selectedReview();
      if (!review) return [];

      const selectedIds = this.selectedTimelinePlayIds();
      if (selectedIds.size === 0) return [];

      return this.filteredTimelineRows()
        .filter((row) =>
          selectedIds.has(this.resolveTimelinePlaySelectionId(row.play, row.originalIndex))
        )
        .map((row) => this.buildFilmPlayDragContext(review, row.play, row.originalIndex));
    }
  );

  private resolveTimelinePlaySelectionId(play: FilmTimelinePlay, fallbackIndex: number): string {
    const explicitId = play.id?.trim();
    if (explicitId) return explicitId;

    const label = play.label.trim().toLowerCase().replace(/\s+/g, '-');
    const playNumber = play.number ?? fallbackIndex + 1;
    return `${playNumber}:${label}:${play.startSec}:${play.endSec}`;
  }

  private buildDefaultTimelineColumns(
    tagColumns: readonly TeamFilmReviewSportTagDefinition[]
  ): readonly TimelineGridColumn[] {
    return [
      {
        id: 'number',
        kind: 'number',
        label: '#',
        fieldKey: 'number',
        width: 'compact',
      },
      {
        id: 'label',
        kind: 'label',
        label: 'Play',
        fieldKey: 'label',
        width: 'wide',
      },
      ...tagColumns.map((column) => ({
        id: `tag:${column.id}`,
        kind: 'tag' as const,
        label: column.label,
        fieldKey: `tag:${column.id}`,
        width: column.width ?? 'regular',
        tagDefinition: column,
      })),
      {
        id: 'startSec',
        kind: 'startSec',
        label: 'Start',
        fieldKey: 'startSec',
        width: 'compact',
      },
      {
        id: 'endSec',
        kind: 'endSec',
        label: 'End',
        fieldKey: 'endSec',
        width: 'compact',
      },
      {
        id: 'durationSec',
        kind: 'durationSec',
        label: 'Dur',
        fieldKey: 'durationSec',
        width: 'compact',
      },
    ];
  }

  private applyTimelineColumnOrder(
    columns: readonly TimelineGridColumn[],
    order: readonly string[]
  ): readonly TimelineGridColumn[] {
    if (order.length === 0) return columns;

    const byId = new Map(columns.map((column) => [column.id, column]));
    const ordered = order.flatMap((columnId) => {
      const column = byId.get(columnId);
      return column ? [column] : [];
    });
    const orderedIds = new Set(ordered.map((column) => column.id));
    const missing = columns.filter((column) => !orderedIds.has(column.id));

    return [...ordered, ...missing];
  }

  private buildTimelineGridTemplate(columns: readonly TimelineGridColumn[]): string {
    const dynamicColumns = columns.map((column) => this.resolveTimelineColumnWidth(column.width));
    return ['34px', ...dynamicColumns].join(' ');
  }

  private resetTimelineColumnDragState(): void {
    this.draggingTimelineColumnId.set(null);
    this.timelineColumnDropIndicator.set(null);
  }

  private resolveTimelineColumnDragSourceId(event: DragEvent): string | null {
    const currentColumnId = this.draggingTimelineColumnId();
    if (currentColumnId) {
      return currentColumnId;
    }

    const rawColumnId =
      event.dataTransfer?.getData(FILM_REVIEW_TIMELINE_COLUMN_DRAG_MIME).trim() ?? '';
    return rawColumnId.length > 0 ? rawColumnId : null;
  }

  private resolveTimelineColumnDropPlacement(event: DragEvent): TimelineColumnDropPlacement {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return 'after';

    const rect = target.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
  }

  private resolveTimelineColumnReorder(
    currentOrder: readonly string[],
    sourceColumnId: string,
    targetColumnId: string,
    placement: TimelineColumnDropPlacement
  ): readonly string[] {
    const nextOrder = [...currentOrder];
    const sourceIndex = nextOrder.indexOf(sourceColumnId);
    if (sourceIndex < 0) return currentOrder;

    const [sourceColumn] = nextOrder.splice(sourceIndex, 1);
    const targetIndex = nextOrder.indexOf(targetColumnId);
    if (!sourceColumn || targetIndex < 0) return currentOrder;

    nextOrder.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, sourceColumn);
    return nextOrder;
  }

  private loadPersistedTimelineColumnOrder(): readonly string[] {
    const storageKey = this.getTimelineColumnOrderStorageKey();
    if (!storageKey) return [];

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is string => typeof item === 'string' && item.trim() !== ''
      );
    } catch {
      return [];
    }
  }

  private persistTimelineColumnOrder(order: readonly string[]): void {
    const storageKey = this.getTimelineColumnOrderStorageKey();
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // Ignore local preference persistence failures.
    }
  }

  private getTimelineColumnOrderStorageKey(): string | null {
    if (!this.platform.isBrowser()) return null;

    const teamId = this.teamId?.trim();
    if (!teamId) return null;

    const sportKey = this.effectiveSportContext() || 'default';
    return `${FILM_REVIEW_COLUMN_ORDER_STORAGE_PREFIX}:${teamId}:${sportKey}`;
  }

  private resetTimelinePlayDragState(): void {
    this.draggingTimelinePlayIndex.set(null);
    this.timelinePlayDropIndicator.set(null);
  }

  private resolveTimelineDragSourceIndex(event: DragEvent): number | null {
    const currentIndex = this.draggingTimelinePlayIndex();
    if (currentIndex !== null) {
      return currentIndex;
    }

    const rawIndex = event.dataTransfer?.getData(FILM_REVIEW_TIMELINE_DRAG_MIME).trim() ?? '';
    const parsedIndex = Number(rawIndex);
    return Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null;
  }

  private resolveTimelinePlayDropPlacement(event: DragEvent): TimelinePlayDropPlacement {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return 'after';

    const rect = target.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  }

  private resolveTimelineReorderIndex(
    sourceIndex: number,
    targetIndex: number,
    placement: TimelinePlayDropPlacement,
    timelineLength: number
  ): number {
    let insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
    if (sourceIndex < insertIndex) {
      insertIndex -= 1;
    }

    return Math.max(0, Math.min(insertIndex, timelineLength - 1));
  }

  private findTimelinePlayIndex(
    timeline: readonly FilmTimelinePlay[],
    playId: string | null,
    fallbackKey: string | null
  ): number {
    if (playId) {
      const idIndex = timeline.findIndex((play) => play.id === playId);
      if (idIndex >= 0) return idIndex;
    }

    if (!fallbackKey) return -1;
    return timeline.findIndex(
      (play) => `${play.startSec}:${play.endSec}:${play.label}` === fallbackKey
    );
  }

  private resolveTimelineColumnWidth(width?: TeamFilmReviewSportTagColumnWidth): string {
    switch (width) {
      case 'compact':
        return '76px';
      case 'wide':
        return '140px';
      case 'regular':
      default:
        return '108px';
    }
  }

  private normalizeSport(value?: string | null): string | undefined {
    const normalized = value?.trim().toLowerCase();
    return normalized && normalized.length > 0 ? normalized : undefined;
  }

  /**
   * Internal: Jump to a specific play segment.
   * Calls service to track analytics + breadcrumb, then seeks video.
   */
  private jumpToPlay(play: FilmTimelinePlay): void {
    const review = this.selectedReview();
    this.nativePlaybackSourcePlayIndex.set(this.currentPlayIndex());
    if (review?.id) {
      this.service.skipToPlay(review.id, play);
    }
    this.restoreDrawOverlayForPlay(play);
    this.playerDuration.set(this.resolveReviewDurationSec(review, play));
    if (this.jumpCloudflareIframeTo(play.startSec)) {
      return;
    }

    const nextVideoUrl = this.resolveNativeVideoUrl(review, play);
    if (nextVideoUrl && this.nativeVideoSourceUrl !== nextVideoUrl) {
      this.pendingTimestampSeekSec = play.startSec;
      this.updatePlayerTimeSignal(play.startSec, true);
      this.syncSeekUi(play.startSec);
      this.scheduleNativeVideoSourceSync();
      return;
    }

    this.jumpTo(play.startSec);
  }

  private jumpCloudflareIframeTo(seconds: number): boolean {
    const review = this.selectedReview();
    const play = this.currentPlay();
    if (this.resolveNativeVideoUrl(review, play)) return false;
    if (!this.resolveCloudflareBaseEmbedUrl(review, play)) return false;

    const nextTime = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.stopSmoothProgressTracking();
    this.isPlaying.set(false);
    this.cloudflareStartTimeSec.set(nextTime);
    this.cloudflareAutoplayRequested.set(true);
    this.cloudflareIframeLoading.set(true);
    this.updatePlayerTimeSignal(nextTime, true);
    this.playerDuration.set(this.resolveReviewDurationSec(review, play));
    this.syncSeekUi(nextTime);
    return true;
  }

  /**
   * Seek video player to specific timestamp (seconds).
   *
   * @param seconds - Playback position in seconds
   */
  private jumpTo(seconds: number): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;
    const shouldResume = !player.paused && !player.ended;

    this.logSeekDebug('jump-to-before', player, {
      requestedTime: seconds,
      shouldResume,
    });

    this.stopSmoothProgressTracking();
    if (!shouldResume) {
      player.pause();
      this.isPlaying.set(false);
    }

    player.currentTime = Math.max(0, seconds);
    this.updatePlayerTimeSignal(player.currentTime, true);
    this.syncSeekUi(player.currentTime);

    this.logSeekDebug('jump-to-after', player, {
      requestedTime: seconds,
      shouldResume,
    });

    if (shouldResume) {
      this.isPlaying.set(true);
      void this.playWhenReady(player).catch(() => {
        this.isPlaying.set(false);
        this.stopSmoothProgressTracking();
      });
      this.startSmoothProgressTracking();
    }
  }

  protected onPlayerLoadedMetadata(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;
    this.nativePlayerLoading.set(false);
    this.playerDuration.set(Number.isFinite(player.duration) ? player.duration : 0);
    this.updatePlayerTimeSignal(player.currentTime || 0, true);
    this.syncSeekUi(player.currentTime || 0);
    this.playbackRate.set(player.playbackRate || 1);
    const pendingSeekSec = this.pendingTimestampSeekSec;
    this.logSeekDebug('loaded-metadata', player, { pendingSeekSec });
    if (pendingSeekSec !== null) {
      this.pendingTimestampSeekSec = null;
      this.jumpTo(pendingSeekSec);
    }
    if (this.shouldResumeAfterCameraAngleSwitch) {
      this.shouldResumeAfterCameraAngleSwitch = false;
      this.isPlaying.set(true);
      void this.playWhenReady(player).catch(() => {
        this.isPlaying.set(false);
        this.stopSmoothProgressTracking();
      });
      this.startSmoothProgressTracking();
    }
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected onPlayerError(): void {
    this.nativePlayerLoading.set(false);
    const review = this.selectedReview();
    const sourcePlay = this.getNativePlaybackSourcePlay();
    if (!this.isCloudflarePlaybackReview(review, sourcePlay)) return;

    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.nativeVideoSourceIdentity = null;
    this.stopSmoothProgressTracking();
    this.isPlaying.set(false);
    this.cloudflareNativePlaybackFailed.set(true);
    this.cloudflareIframeLoading.set(
      this.resolveCloudflareBaseEmbedUrl(review, sourcePlay) !== null
    );
  }

  private resetNativePlayerElement(): void {
    this.nativeVideoSourceUrl = null;
    this.nativeVideoSourceIdentity = null;

    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    player.pause();
    player.removeAttribute('src');
    player.load();
  }

  private scheduleNativeVideoSourceSync(): void {
    const syncToken = ++this.videoSourceSyncToken;
    this.logSeekDebug('source-sync-scheduled', undefined, { syncToken });
    setTimeout(() => {
      if (syncToken !== this.videoSourceSyncToken) return;
      void this.configureNativeVideoSourceForSelectedReview(syncToken);
    }, 0);
  }

  private async configureNativeVideoSourceForSelectedReview(syncToken: number): Promise<void> {
    const player = this.filmPlayer?.nativeElement;
    const review = this.selectedReview();
    const sourcePlay = this.getNativePlaybackSourcePlay();
    const videoUrl = this.resolveNativeVideoUrl(review, sourcePlay);
    const sourceIdentity = this.resolveNativeVideoSourceIdentity(review, sourcePlay, videoUrl);
    const currentVideoUrl = this.nativeVideoSourceUrl;
    const currentSourceManagesViaHls = !!currentVideoUrl && isHlsSourceUrl(currentVideoUrl);
    const managesSourceViaHls =
      !!videoUrl &&
      isHlsSourceUrl(videoUrl) &&
      !player?.canPlayType('application/vnd.apple.mpegurl');
    const hasAttachedPlayerSource =
      !!player &&
      !!videoUrl &&
      (managesSourceViaHls
        ? this.hls !== null
        : this.playerHasAttachedVideoSource(player, videoUrl));
    const hasKnownCurrentSource = this.nativeVideoSourceUrl === videoUrl;
    const hasAttachedReusableSource =
      !!player &&
      !!currentVideoUrl &&
      !!sourceIdentity &&
      sourceIdentity === this.nativeVideoSourceIdentity &&
      (currentSourceManagesViaHls
        ? this.hls !== null
        : this.playerHasAttachedVideoSource(player, currentVideoUrl));
    this.logSeekDebug('source-sync-configure', player ?? undefined, {
      syncToken,
      nextVideoUrl: videoUrl,
      currentVideoUrl: this.nativeVideoSourceUrl,
      nextSourceIdentity: sourceIdentity,
      currentSourceIdentity: this.nativeVideoSourceIdentity,
      playerCurrentSrc: player?.currentSrc ?? null,
      playerSrcAttribute: player ? this.getPlayerSrcAttribute(player) : null,
      managesSourceViaHls,
      hasAttachedPlayerSource,
      hasKnownCurrentSource,
      hasAttachedReusableSource,
    });
    if (!player || !videoUrl) return;
    if (
      (hasKnownCurrentSource || hasAttachedPlayerSource || hasAttachedReusableSource) &&
      (player.readyState >= HTMLMediaElement.HAVE_METADATA ||
        player.networkState === HTMLMediaElement.NETWORK_LOADING)
    ) {
      if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
        this.onPlayerLoadedMetadata();
      }
      return;
    }

    this.destroyHls();
    this.nativeVideoSourceUrl = videoUrl;
    this.nativeVideoSourceIdentity = sourceIdentity;
    this.nativePlayerLoading.set(true);
    player.crossOrigin = 'anonymous';
    player.preload = 'auto';

    if (isHlsSourceUrl(videoUrl) && !player.canPlayType('application/vnd.apple.mpegurl')) {
      const HlsConstructor = await this.loadHlsConstructor();
      if (syncToken !== this.videoSourceSyncToken) return;

      if (HlsConstructor?.isSupported()) {
        const hls = new HlsConstructor({ enableWorker: true });
        this.hls = hls;

        hls.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
          if (this.hls !== hls) return;
          hls.loadSource(videoUrl);
        });

        hls.on(HlsConstructor.Events.ERROR, (_event: string, data: ErrorData) => {
          if (data.fatal) {
            this.onPlayerError();
          }
        });

        hls.attachMedia(player);
        return;
      }
    }

    player.src = videoUrl;
    player.load();
  }

  private playerHasAttachedVideoSource(player: HTMLVideoElement, videoUrl: string): boolean {
    const srcAttribute = this.getPlayerSrcAttribute(player)?.trim();
    if (srcAttribute && this.areVideoSourceUrlsEqual(srcAttribute, videoUrl)) {
      return true;
    }

    const currentSrc = player.currentSrc?.trim();
    if (currentSrc && this.areVideoSourceUrlsEqual(currentSrc, videoUrl)) {
      return true;
    }

    return false;
  }

  private getPlayerSrcAttribute(player: HTMLVideoElement): string | null {
    if (typeof player.getAttribute === 'function') {
      return player.getAttribute('src');
    }

    return (player as HTMLVideoElement & { src?: string }).src ?? null;
  }

  private resolveNativeVideoSourceIdentity(
    review: FilmListReview | null | undefined,
    play: FilmTimelinePlay | null | undefined,
    videoUrl: string | null
  ): string | null {
    const source = this.resolvePlaybackSource(review, play);
    const cloudflareVideoId = source?.cloudflareVideoId?.trim();
    if (cloudflareVideoId) {
      return `cloudflare:${cloudflareVideoId}`;
    }

    const storagePath = source?.storagePath?.trim();
    if (storagePath) {
      return `storage:${storagePath}`;
    }

    const canonicalUrl = this.normalizeVideoSourceUrlForIdentity(videoUrl ?? source?.videoUrl);
    if (!canonicalUrl) {
      return null;
    }

    const sourceId =
      source?.id?.trim() || play?.sourceId?.trim() || review?.id?.trim() || 'primary';
    return `source:${sourceId}:url:${canonicalUrl}`;
  }

  private normalizeVideoSourceUrlForIdentity(url: string | null | undefined): string | null {
    const value = url?.trim();
    if (!value) return null;

    try {
      const parsed = new URL(value);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      const [withoutHash] = value.split('#');
      return (withoutHash ?? value).split('?')[0]?.trim() || value;
    }
  }

  private areVideoSourceUrlsEqual(left: string, right: string): boolean {
    if (left === right) {
      return true;
    }

    try {
      return new URL(left).toString() === new URL(right).toString();
    } catch {
      return false;
    }
  }

  private logSeekDebug(
    event: string,
    player?: HTMLVideoElement,
    extra: Record<string, unknown> = {}
  ): void {
    const activeSourcePlay = this.getNativePlaybackSourcePlay();
    const requestedTime =
      typeof extra['requestedTime'] === 'number' ? (extra['requestedTime'] as number) : null;
    const committedTime =
      typeof extra['committedTime'] === 'number' ? (extra['committedTime'] as number) : null;
    const playerCurrentTime = player?.currentTime ?? null;
    const playerDuration = player?.duration ?? null;
    const summary = [
      `event=${event}`,
      `requested=${requestedTime ?? 'n/a'}`,
      `committed=${committedTime ?? 'n/a'}`,
      `current=${playerCurrentTime ?? 'n/a'}`,
      `duration=${playerDuration ?? 'n/a'}`,
      `scrubbing=${this.isScrubbing}`,
      `paused=${player?.paused ?? 'n/a'}`,
      `seeking=${player?.seeking ?? 'n/a'}`,
      `ended=${player?.ended ?? 'n/a'}`,
      `playIndex=${this.currentPlayIndex() ?? 'n/a'}`,
      `sourceIndex=${this.nativePlaybackSourcePlayIndex() ?? 'n/a'}`,
      `pending=${this.pendingTimestampSeekSec ?? 'n/a'}`,
    ].join(' ');

    this.logger.info(`Film review seek debug ${summary}`, {
      event,
      pendingSeekSec: this.pendingTimestampSeekSec,
      isScrubbing: this.isScrubbing,
      isPlaying: this.isPlaying(),
      currentPlayIndex: this.currentPlayIndex(),
      nativePlaybackSourcePlayIndex: this.nativePlaybackSourcePlayIndex(),
      activeSourceId: activeSourcePlay?.sourceId?.trim() || null,
      activeSourceStartSec: activeSourcePlay?.startSec ?? null,
      activeSourceEndSec: activeSourcePlay?.endSec ?? null,
      nativeVideoSourceUrl: this.nativeVideoSourceUrl,
      playerCurrentTime,
      playerDuration,
      playerSeeking: player?.seeking ?? null,
      playerPaused: player?.paused ?? null,
      playerEnded: player?.ended ?? null,
      playerReadyState: player?.readyState ?? null,
      ...extra,
    });
  }

  private async loadHlsConstructor(): Promise<typeof Hls | null> {
    if (this.hlsConstructor) return this.hlsConstructor;

    this.hlsLoadPromise ??= import('hls.js')
      .then((module) => {
        this.hlsConstructor = module.default;
        return module.default;
      })
      .catch(() => null);

    return this.hlsLoadPromise;
  }

  private destroyHls(): void {
    if (!this.hls) return;
    this.hls.destroy();
    this.hls = null;
  }

  protected onCloudflareIframeLoaded(): void {
    this.cloudflareIframeLoading.set(false);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.openTimelineColumnMenuId.set(null);
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  protected onFullscreenChange(): void {
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected isDrawToolActive(kind: DrawAnnotationKind): boolean {
    return this.drawModeEnabled() && this.selectedDrawTool() === kind;
  }

  protected isTextEffectPanelVisible(): boolean {
    return this.resolveDisplayedTextEffect() !== null;
  }

  protected currentTextEffectPanelText(): string {
    return this.resolveDisplayedTextEffect()?.text ?? '';
  }

  protected currentTextEffectText(): string {
    return this.drawAnnotation?.kind === 'text' ? this.drawAnnotation.text : '';
  }

  protected hasClearableDrawOverlay(): boolean {
    return this.drawAnnotation !== null || this.currentDrawAnnotationIndex !== null;
  }

  protected isTextEffectPanelEditable(): boolean {
    return this.drawModeEnabled() && this.drawAnnotation?.kind === 'text';
  }

  protected currentTextEffectPanelWindowLabel(): string | null {
    const effect = this.resolveDisplayedTextEffect();
    const window = effect?.window;
    if (!window) {
      return null;
    }

    const play = this.currentPlay();
    const offset = play?.startSec ?? 0;
    return `${this.formatTime(Math.max(0, window.startSec - offset))} - ${this.formatTime(
      Math.max(0, window.endSec - offset)
    )}`;
  }

  protected onDrawToolToggle(kind: DrawAnnotationKind): void {
    const enabled = !(this.drawModeEnabled() && this.selectedDrawTool() === kind);
    this.selectedDrawTool.set(kind);
    this.drawModeEnabled.set(enabled);
    this.drawInteraction = null;
    this.activeStroke = [];

    if (enabled && kind === 'text' && this.drawAnnotation?.kind !== 'text') {
      this.currentDrawAnnotationIndex = null;
      this.currentDrawEffectWindow = this.resolveDefaultDrawEffectWindow(
        this.currentPlay(),
        this.playerCurrentTime()
      );
      this.drawAnnotation = {
        kind: 'text',
        bounds: this.buildDefaultTextEffectBounds(),
        text: '',
      };
      this.hasDrawing.set(false);
    }

    this.syncDrawCanvasCursor();
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();

    if (enabled && kind === 'text') {
      this.focusTextEffectInput(this.drawAnnotation?.kind === 'text' && !this.drawAnnotation.text);
    }
  }

  protected clearDrawOverlay(): void {
    this.drawModeEnabled.set(false);
    this.resetDrawOverlay();
    void this.persistCurrentPlayAnnotation();
  }

  protected onDeleteDrawEffectMarker(markerId: string): void {
    void this.deleteDrawEffectMarker(markerId);
  }

  protected onDrawEffectDurationChange(event: { markerId: string; durationSec: number }): void {
    void this.updateDrawEffectDuration(event.markerId, event.durationSec);
  }

  protected onTextEffectTextChange(value: string): void {
    if (this.drawAnnotation?.kind !== 'text') {
      return;
    }

    this.drawAnnotation = {
      ...this.drawAnnotation,
      text: value,
    };
    this.hasDrawing.set(value.trim().length > 0);
    this.renderDrawOverlay();
    this.scheduleCurrentPlayAnnotationPersistence();
  }

  protected onDrawPointerDown(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    event.preventDefault();
    this.ensureDrawCanvasSize();

    const point = this.toNormalizedDrawPoint(event, canvas);
    if (!point) {
      this.maybeToastDrawOutsideFrame();
      return;
    }
    const hitTarget = this.resolveDrawHitTarget(point, canvas);

    if (this.drawAnnotation && hitTarget.kind === 'handle') {
      this.drawInteraction = {
        mode: 'resize',
        pointerId: event.pointerId,
        startPoint: point,
        origin: this.cloneEditableDrawAnnotation(this.drawAnnotation),
        handle: hitTarget.handle,
      };
      canvas.setPointerCapture?.(event.pointerId);
      this.syncDrawCanvasCursor(point);
      return;
    }

    if (this.drawAnnotation && hitTarget.kind === 'body') {
      this.drawInteraction = {
        mode: 'move',
        pointerId: event.pointerId,
        startPoint: point,
        origin: this.cloneEditableDrawAnnotation(this.drawAnnotation),
      };
      canvas.setPointerCapture?.(event.pointerId);
      this.syncDrawCanvasCursor(point);
      return;
    }

    canvas.setPointerCapture?.(event.pointerId);
    this.currentDrawAnnotationIndex = null;
    this.currentDrawEffectWindow = this.resolveDefaultDrawEffectWindow(
      this.currentPlay(),
      this.playerCurrentTime()
    );

    const selectedTool = this.selectedDrawTool();

    if (selectedTool === 'text') {
      this.activeStroke = [];

      if (this.drawAnnotation?.kind !== 'text') {
        this.drawAnnotation = {
          kind: 'text',
          bounds: this.buildDefaultTextEffectBounds(),
          text: '',
        };
        this.hasDrawing.set(false);
      }

      this.drawInteraction = null;
      this.syncDrawCanvasCursor();
      this.focusTextEffectInput(!this.currentTextEffectText());
      return;
    }

    if (selectedTool === 'freehand') {
      this.activeStroke = [point];
      this.drawAnnotation = {
        kind: 'freehand',
        bounds: this.computeBoundsFromPoints(this.activeStroke),
        strokes: [this.activeStroke],
      };
      this.drawInteraction = { mode: 'draw-freehand', pointerId: event.pointerId };
    } else {
      this.activeStroke = [];
      this.drawAnnotation = {
        kind: selectedTool,
        bounds: this.buildShapeBoundsFromAnchor(point, point, selectedTool === 'circle'),
      };
      this.drawInteraction = {
        mode: 'draw-shape',
        pointerId: event.pointerId,
        anchor: point,
        kind: selectedTool,
      };
    }

    this.hasDrawing.set(true);
    this.syncDrawCanvasCursor(point);
    this.renderDrawOverlay();
  }

  protected onDrawPointerMove(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    const point = this.toNormalizedDrawPoint(event, canvas);
    if (!point) {
      this.syncDrawCanvasCursor();
      return;
    }
    if (!this.drawInteraction) {
      this.syncDrawCanvasCursor(point);
      return;
    }

    event.preventDefault();

    switch (this.drawInteraction.mode) {
      case 'draw-freehand': {
        if (this.drawInteraction.pointerId !== event.pointerId || !this.activeStroke.length) {
          return;
        }

        this.activeStroke.push(point);
        if (this.drawAnnotation?.kind === 'freehand') {
          this.drawAnnotation = {
            ...this.drawAnnotation,
            bounds: this.computeBoundsFromPoints(this.drawAnnotation.strokes.flat()),
          };
        }
        break;
      }

      case 'draw-shape': {
        if (this.drawInteraction.pointerId !== event.pointerId) return;
        this.drawAnnotation = {
          kind: this.drawInteraction.kind,
          bounds: this.buildShapeBoundsFromAnchor(
            this.drawInteraction.anchor,
            point,
            this.drawInteraction.kind === 'circle'
          ),
        };
        break;
      }

      case 'move': {
        if (this.drawInteraction.pointerId !== event.pointerId) return;
        const deltaX = point.x - this.drawInteraction.startPoint.x;
        const deltaY = point.y - this.drawInteraction.startPoint.y;
        this.drawAnnotation = this.translateDrawAnnotation(
          this.drawInteraction.origin,
          deltaX,
          deltaY
        );
        break;
      }

      case 'resize': {
        if (this.drawInteraction.pointerId !== event.pointerId) return;
        this.drawAnnotation = this.resizeDrawAnnotation(
          this.drawInteraction.origin,
          this.drawInteraction.handle,
          point
        );
        break;
      }
    }

    this.hasDrawing.set(!!this.drawAnnotation);
    this.syncDrawCanvasCursor(point);
    this.renderDrawOverlay();
  }

  protected onDrawPointerUp(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    canvas.releasePointerCapture?.(event.pointerId);
    if (!this.drawInteraction || this.drawInteraction.pointerId !== event.pointerId) {
      this.syncDrawCanvasCursor();
      return;
    }

    this.drawInteraction = null;
    this.activeStroke = [];
    this.hasDrawing.set(!!this.drawAnnotation);
    this.syncDrawCanvasCursor();
    this.scheduleCurrentPlayAnnotationPersistence();
  }

  public async queueCurrentPlayContextForChat(showToast = true): Promise<boolean> {
    const review = this.selectedReview();
    if (!review) {
      return false;
    }

    const currentTimeSec = Math.max(0, Number(this.playerCurrentTime().toFixed(2)));
    const currentPlay = this.currentPlay();
    if (!currentPlay) {
      return false;
    }

    const startSec = currentPlay?.startSec ?? Math.max(0, currentTimeSec - 2);
    const endSec = currentPlay?.endSec ?? Math.max(startSec + 2, currentTimeSec + 2);

    const context: AgentXSelectedContext = {
      id: `film-play:${review.id}:${currentPlay?.id ?? Math.round(startSec)}`,
      kind: 'film_play',
      title: `${this.getReviewDisplayTitle(review)} @ ${this.formatTime(startSec)}`,
      ...(currentPlay?.label ? { summary: currentPlay.label } : {}),
      source: {
        type: 'film_review',
        id: review.id,
        label: this.getReviewDisplayTitle(review),
      },
      timeRange: {
        startSec,
        endSec,
      },
      media: {
        ...(review.videoUrl ? { videoUrl: review.videoUrl } : {}),
        ...(review.thumbnailUrl ? { thumbnailUrl: review.thumbnailUrl } : {}),
        ...(review.cloudflareVideoId ? { cloudflareVideoId: review.cloudflareVideoId } : {}),
      },
      metadata: {
        currentTimeSec,
        ...(typeof currentPlay?.number === 'number' ? { playNumber: currentPlay.number } : {}),
      },
    };

    this.agentXService.queueSelectedContext(context);
    if (showToast) {
      this.toast.success('Added play context to chat composer');
    }

    return true;
  }

  private resolveContainedMediaRect(
    containerWidth: number,
    containerHeight: number,
    mediaWidth: number,
    mediaHeight: number
  ): { x: number; y: number; width: number; height: number } {
    const containerAspect = containerWidth / Math.max(containerHeight, 1);
    const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);

    if (mediaAspect > containerAspect) {
      const width = containerWidth;
      const height = Math.round(containerWidth / mediaAspect);
      return {
        x: 0,
        y: Math.round((containerHeight - height) / 2),
        width,
        height,
      };
    }

    const height = containerHeight;
    const width = Math.round(containerHeight * mediaAspect);
    return {
      x: Math.round((containerWidth - width) / 2),
      y: 0,
      width,
      height,
    };
  }

  private resetDrawOverlay(): void {
    this.drawAnnotation = null;
    this.activeStroke = [];
    this.drawInteraction = null;
    this.currentDrawEffectWindow = null;
    this.currentDrawAnnotationIndex = null;
    this.hasDrawing.set(false);
    this.syncDrawCanvasCursor();
    this.renderDrawOverlay();
  }

  private restoreDrawOverlayForPlay(play: FilmTimelinePlay | null): void {
    const annotation = this.resolvePrimaryPlayAnnotation(play);
    if (!annotation) {
      this.resetDrawOverlay();
      return;
    }

    const restoredAnnotation = this.restoreEditableDrawAnnotation(annotation);
    if (!restoredAnnotation) {
      this.resetDrawOverlay();
      return;
    }

    this.drawAnnotation = restoredAnnotation;
    this.activeStroke = [];
    this.drawInteraction = null;
    this.selectedDrawTool.set(restoredAnnotation.kind);
    this.currentDrawAnnotationIndex = this.resolvePrimaryPlayAnnotationIndex(play);
    this.currentDrawEffectWindow = this.resolveDrawEffectWindowForPlay(play, annotation);
    this.hasDrawing.set(true);
    this.syncDrawCanvasCursor();
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  private restoreAnnotationStrokes(
    annotation: PersistedDrawPlayAnnotation
  ): Array<Array<DrawAnnotationPoint>> {
    const sourceStrokes = this.resolvePersistedStrokeCandidates(annotation);

    return sourceStrokes
      .map((stroke) => this.normalizeRestoredStroke(stroke))
      .filter((stroke: DrawAnnotationPoint[]) => stroke.length > 0);
  }

  private resolvePersistedStrokeCandidates(
    annotation: PersistedDrawPlayAnnotation
  ): readonly unknown[] {
    if (Array.isArray(annotation.strokes) && annotation.strokes.length > 0) {
      const rawStrokes = annotation.strokes as readonly unknown[];
      const hasNestedStrokeArrays = rawStrokes.some((stroke) => Array.isArray(stroke));
      // Older payloads sometimes persist freehand data as a single flat
      // array of points instead of an array of stroke arrays.
      return hasNestedStrokeArrays ? rawStrokes : [rawStrokes];
    }

    if (Array.isArray(annotation.points) && annotation.points.length > 0) {
      return [annotation.points as readonly unknown[]];
    }

    return [];
  }

  private normalizeRestoredStroke(stroke: unknown): DrawAnnotationPoint[] {
    const points = Array.isArray(stroke) ? stroke : [];
    return points
      .map((point) =>
        point && typeof point === 'object' ? (point as Partial<DrawAnnotationPoint>) : null
      )
      .filter(
        (point): point is DrawAnnotationPoint =>
          point !== null && Number.isFinite(point.x) && Number.isFinite(point.y)
      )
      .map((point) => ({
        x: this.roundNormalizedPoint(point.x),
        y: this.roundNormalizedPoint(point.y),
      }));
  }

  private restoreEditableDrawAnnotation(
    annotation: TeamFilmReviewPlayAnnotation
  ): EditableDrawAnnotation | null {
    if (annotation.kind === 'text') {
      return {
        kind: 'text',
        bounds: this.normalizeDrawBounds(annotation.bounds),
        text: annotation.text,
      };
    }

    if (annotation.kind === 'freehand') {
      const restoredStrokes = this.restoreAnnotationStrokes(annotation);
      if (!restoredStrokes.length) {
        return null;
      }

      return {
        kind: 'freehand',
        bounds: this.normalizeDrawBounds(annotation.bounds),
        strokes: restoredStrokes,
      };
    }

    return {
      kind: annotation.kind,
      bounds: this.normalizeDrawBounds(annotation.bounds),
    };
  }

  private scheduleCurrentPlayAnnotationPersistence(): void {
    if (this.playAnnotationPersistTimer !== null) {
      clearTimeout(this.playAnnotationPersistTimer);
    }

    this.playAnnotationPersistTimer = setTimeout(() => {
      this.playAnnotationPersistTimer = null;
      void this.persistCurrentPlayAnnotation();
    }, 180);
  }

  private async flushCurrentPlayAnnotationPersistence(): Promise<void> {
    while (true) {
      if (this.playAnnotationPersistTimer !== null) {
        clearTimeout(this.playAnnotationPersistTimer);
        this.playAnnotationPersistTimer = null;
        await this.persistCurrentPlayAnnotation();
        continue;
      }

      if (this.playAnnotationPersistInFlight) {
        try {
          await this.playAnnotationPersistInFlight;
        } catch {
          // Service already surfaces the error state.
        }
        continue;
      }

      if (this.playAnnotationPersistQueued) {
        await this.persistCurrentPlayAnnotation();
        continue;
      }

      return;
    }
  }

  private async persistCurrentPlayAnnotation(): Promise<void> {
    if (this.playAnnotationPersistInFlight) {
      this.playAnnotationPersistQueued = true;
      try {
        await this.playAnnotationPersistInFlight;
      } catch {
        // Service already surfaces the error state.
      }
      return;
    }

    const review = this.selectedReview();
    const currentPlay = this.currentPlay();
    const playIndex = this.currentPlayIndex();
    if (!review?.timeline || !currentPlay || playIndex < 0 || playIndex >= review.timeline.length) {
      return;
    }

    const nextAnnotations = this.resolveCurrentPlayAnnotationsForPersistence();
    const shouldAssignNewAnnotationIndex =
      this.currentDrawAnnotationIndex === null && !!this.resolveCurrentPlayAnnotation();
    const operation = this.service.saveTimelinePlayAnnotations(
      review.id,
      playIndex,
      nextAnnotations
    );
    this.playAnnotationPersistInFlight = operation;

    try {
      await operation;
      if (shouldAssignNewAnnotationIndex && nextAnnotations.length > 0) {
        this.currentDrawAnnotationIndex = nextAnnotations.length - 1;
      }
    } catch {
      // Service already surfaces the error state.
    } finally {
      this.playAnnotationPersistInFlight = null;
      if (this.playAnnotationPersistQueued) {
        this.playAnnotationPersistQueued = false;
        await this.persistCurrentPlayAnnotation();
      }
    }
  }

  private resolveCurrentPlayAnnotation(): TeamFilmReviewPlayAnnotation | null {
    const play = this.currentPlay();
    if (!play || !this.hasDrawing() || !this.drawAnnotation) {
      return null;
    }

    const effectWindow =
      this.currentDrawEffectWindow ??
      this.resolveDrawEffectWindowForPlay(play, this.resolvePrimaryPlayAnnotation(play)) ??
      this.resolveDefaultDrawEffectWindow(play, this.playerCurrentTime());

    if (this.drawAnnotation.kind === 'text') {
      const bounds = this.normalizeDrawBounds(this.drawAnnotation.bounds);
      const text = this.drawAnnotation.text.trim();
      if (
        !text ||
        bounds.maxX - bounds.minX < this.minimumDrawSelectionSize ||
        bounds.maxY - bounds.minY < this.minimumDrawSelectionSize
      ) {
        return null;
      }

      return {
        kind: 'text',
        bounds,
        text,
        activeFromSec: this.roundPlaybackSecond(effectWindow.startSec),
        activeUntilSec: this.roundPlaybackSecond(effectWindow.endSec),
      };
    }

    if (this.drawAnnotation.kind !== 'freehand') {
      const bounds = this.normalizeDrawBounds(this.drawAnnotation.bounds);
      if (
        bounds.maxX - bounds.minX < this.minimumDrawSelectionSize ||
        bounds.maxY - bounds.minY < this.minimumDrawSelectionSize
      ) {
        return null;
      }

      return {
        kind: this.drawAnnotation.kind,
        bounds,
        strokeCount: 1,
        activeFromSec: this.roundPlaybackSecond(effectWindow.startSec),
        activeUntilSec: this.roundPlaybackSecond(effectWindow.endSec),
      };
    }

    const strokes = this.normalizeDrawStrokesForPersistence(this.drawAnnotation.strokes);
    const points = strokes.flat();
    if (points.length === 0) {
      return null;
    }
    const bounds = this.computeBoundsFromPoints(points);

    return {
      kind: 'freehand',
      bounds,
      strokeCount: strokes.length,
      points: this.compactDrawPointsFromStrokes(strokes, this.maxContextAnnotationPoints),
      strokes,
      activeFromSec: this.roundPlaybackSecond(effectWindow.startSec),
      activeUntilSec: this.roundPlaybackSecond(effectWindow.endSec),
    };
  }

  private resolveCurrentPlayAnnotationsForPersistence(): readonly TeamFilmReviewPlayAnnotation[] {
    const play = this.currentPlay();
    const nextAnnotation = this.resolveCurrentPlayAnnotation();
    const existingAnnotations = this.resolveStoredPlayAnnotations(play);

    if (!nextAnnotation) {
      if (this.currentDrawAnnotationIndex === null) {
        return existingAnnotations;
      }

      return existingAnnotations.filter(
        (_annotation, index) => index !== this.currentDrawAnnotationIndex
      );
    }

    if (this.currentDrawAnnotationIndex === null) {
      return [...existingAnnotations, nextAnnotation];
    }

    return existingAnnotations.map((annotation, index) =>
      index === this.currentDrawAnnotationIndex ? nextAnnotation : annotation
    );
  }

  private normalizeDrawStrokesForPersistence(
    strokes: readonly (readonly DrawAnnotationPoint[])[]
  ): readonly (readonly DrawAnnotationPoint[])[] {
    const normalizedStrokes = strokes
      .map((stroke) =>
        stroke.map((point) => ({
          x: this.roundNormalizedPoint(point.x),
          y: this.roundNormalizedPoint(point.y),
        }))
      )
      .filter((stroke) => stroke.length > 0);

    const totalPointCount = normalizedStrokes.reduce((sum, stroke) => sum + stroke.length, 0);
    if (totalPointCount <= this.maxPersistedAnnotationPoints) {
      return normalizedStrokes;
    }

    const step = Math.max(1, Math.ceil(totalPointCount / this.maxPersistedAnnotationPoints));
    return normalizedStrokes
      .map((stroke) =>
        stroke.filter(
          (_, index) => index === 0 || index === stroke.length - 1 || index % step === 0
        )
      )
      .filter((stroke) => stroke.length > 0);
  }

  private compactDrawPointsFromStrokes(
    strokes: readonly (readonly DrawAnnotationPoint[])[],
    maxPoints: number
  ): readonly DrawAnnotationPoint[] {
    const points = strokes.flat();
    if (points.length <= maxPoints) {
      return points;
    }

    const step = Math.max(1, Math.ceil(points.length / maxPoints));
    return points.filter((_, index) => index % step === 0).slice(0, maxPoints);
  }

  private computeBoundsFromPoints(points: readonly DrawAnnotationPoint[]): DrawAnnotationBounds {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return {
      minX: this.roundNormalizedPoint(minX),
      minY: this.roundNormalizedPoint(minY),
      maxX: this.roundNormalizedPoint(maxX),
      maxY: this.roundNormalizedPoint(maxY),
    };
  }

  private buildShapeBoundsFromAnchor(
    anchor: DrawAnnotationPoint,
    point: DrawAnnotationPoint,
    lockAspectRatio = false
  ): DrawAnnotationBounds {
    const deltaX = point.x - anchor.x;
    const deltaY = point.y - anchor.y;

    if (!lockAspectRatio) {
      return this.normalizeDrawBounds({
        minX: anchor.x,
        minY: anchor.y,
        maxX: point.x,
        maxY: point.y,
      });
    }

    const signX = deltaX >= 0 ? 1 : -1;
    const signY = deltaY >= 0 ? 1 : -1;
    const maxAllowedX = signX > 0 ? 1 - anchor.x : anchor.x;
    const maxAllowedY = signY > 0 ? 1 - anchor.y : anchor.y;
    const canvas = this.drawCanvas?.nativeElement;
    const canvasWidth = Math.max(canvas?.clientWidth ?? 0, 1);
    const canvasHeight = Math.max(canvas?.clientHeight ?? 0, 1);
    const requestedSizePx = Math.max(
      Math.abs(deltaX) * canvasWidth,
      Math.abs(deltaY) * canvasHeight
    );
    const maxAllowedWidthPx = maxAllowedX * canvasWidth;
    const maxAllowedHeightPx = maxAllowedY * canvasHeight;
    const sizePx = Math.min(
      Math.max(
        requestedSizePx,
        this.minimumDrawSelectionSize * Math.min(canvasWidth, canvasHeight)
      ),
      maxAllowedWidthPx,
      maxAllowedHeightPx
    );
    const sizeX = sizePx / canvasWidth;
    const sizeY = sizePx / canvasHeight;

    return this.normalizeDrawBounds({
      minX: anchor.x,
      minY: anchor.y,
      maxX: anchor.x + signX * sizeX,
      maxY: anchor.y + signY * sizeY,
    });
  }

  private translateDrawAnnotation(
    annotation: EditableDrawAnnotation,
    deltaX: number,
    deltaY: number
  ): EditableDrawAnnotation {
    const clampedDeltaX = Math.max(
      -annotation.bounds.minX,
      Math.min(deltaX, 1 - annotation.bounds.maxX)
    );
    const clampedDeltaY = Math.max(
      -annotation.bounds.minY,
      Math.min(deltaY, 1 - annotation.bounds.maxY)
    );

    if (annotation.kind === 'freehand') {
      return {
        kind: 'freehand',
        bounds: this.translateDrawBounds(annotation.bounds, clampedDeltaX, clampedDeltaY),
        strokes: annotation.strokes.map((stroke) =>
          stroke.map((point) => ({
            x: this.roundNormalizedPoint(point.x + clampedDeltaX),
            y: this.roundNormalizedPoint(point.y + clampedDeltaY),
          }))
        ),
      };
    }

    if (annotation.kind === 'text') {
      return {
        kind: 'text',
        bounds: this.translateDrawBounds(annotation.bounds, clampedDeltaX, clampedDeltaY),
        text: annotation.text,
      };
    }

    return {
      kind: annotation.kind,
      bounds: this.translateDrawBounds(annotation.bounds, clampedDeltaX, clampedDeltaY),
    };
  }

  private resizeDrawAnnotation(
    annotation: EditableDrawAnnotation,
    handle: DrawResizeHandle,
    point: DrawAnnotationPoint
  ): EditableDrawAnnotation {
    const nextBounds = this.buildResizedDrawBounds(annotation, handle, point);
    if (annotation.kind === 'freehand') {
      return {
        kind: 'freehand',
        bounds: nextBounds,
        strokes: this.scaleDrawStrokesToBounds(annotation.strokes, annotation.bounds, nextBounds),
      };
    }

    if (annotation.kind === 'text') {
      return {
        kind: 'text',
        bounds: nextBounds,
        text: annotation.text,
      };
    }

    return {
      kind: annotation.kind,
      bounds: nextBounds,
    };
  }

  private buildResizedDrawBounds(
    annotation: EditableDrawAnnotation,
    handle: DrawResizeHandle,
    point: DrawAnnotationPoint
  ): DrawAnnotationBounds {
    const opposite = this.resolveOppositeDrawCorner(annotation.bounds, handle);
    const rawPoint = {
      x: this.roundNormalizedPoint(point.x),
      y: this.roundNormalizedPoint(point.y),
    };

    if (annotation.kind === 'square') {
      const signX = handle === 'ne' || handle === 'se' ? 1 : -1;
      const signY = handle === 'sw' || handle === 'se' ? 1 : -1;
      const maxAllowedX = signX > 0 ? 1 - opposite.x : opposite.x;
      const maxAllowedY = signY > 0 ? 1 - opposite.y : opposite.y;
      const dx = rawPoint.x - opposite.x;
      const dy = rawPoint.y - opposite.y;
      const size = Math.min(
        Math.max(Math.max(Math.abs(dx), Math.abs(dy)), this.minimumDrawSelectionSize),
        maxAllowedX,
        maxAllowedY
      );

      return this.normalizeDrawBounds({
        minX: opposite.x,
        minY: opposite.y,
        maxX: opposite.x + signX * size,
        maxY: opposite.y + signY * size,
      });
    }

    return this.normalizeDrawBounds({
      minX: opposite.x,
      minY: opposite.y,
      maxX: rawPoint.x,
      maxY: rawPoint.y,
    });
  }

  private scaleDrawStrokesToBounds(
    strokes: readonly (readonly DrawAnnotationPoint[])[],
    sourceBounds: DrawAnnotationBounds,
    targetBounds: DrawAnnotationBounds
  ): Array<Array<DrawAnnotationPoint>> {
    const sourceWidth = Math.max(sourceBounds.maxX - sourceBounds.minX, 0.001);
    const sourceHeight = Math.max(sourceBounds.maxY - sourceBounds.minY, 0.001);
    const targetWidth = Math.max(targetBounds.maxX - targetBounds.minX, 0.001);
    const targetHeight = Math.max(targetBounds.maxY - targetBounds.minY, 0.001);

    return strokes.map((stroke) =>
      stroke.map((point) => ({
        x: this.roundNormalizedPoint(
          targetBounds.minX + ((point.x - sourceBounds.minX) / sourceWidth) * targetWidth
        ),
        y: this.roundNormalizedPoint(
          targetBounds.minY + ((point.y - sourceBounds.minY) / sourceHeight) * targetHeight
        ),
      }))
    );
  }

  private resolveDrawHandlePositions(
    bounds: DrawAnnotationBounds
  ): Record<DrawResizeHandle, DrawAnnotationPoint> {
    return {
      nw: { x: bounds.minX, y: bounds.minY },
      ne: { x: bounds.maxX, y: bounds.minY },
      se: { x: bounds.maxX, y: bounds.maxY },
      sw: { x: bounds.minX, y: bounds.maxY },
    };
  }

  private resolveOppositeDrawCorner(
    bounds: DrawAnnotationBounds,
    handle: DrawResizeHandle
  ): DrawAnnotationPoint {
    switch (handle) {
      case 'nw':
        return { x: bounds.maxX, y: bounds.maxY };
      case 'ne':
        return { x: bounds.minX, y: bounds.maxY };
      case 'se':
        return { x: bounds.minX, y: bounds.minY };
      case 'sw':
        return { x: bounds.maxX, y: bounds.minY };
    }
  }

  private translateDrawBounds(
    bounds: DrawAnnotationBounds,
    deltaX: number,
    deltaY: number
  ): DrawAnnotationBounds {
    return this.normalizeDrawBounds({
      minX: bounds.minX + deltaX,
      minY: bounds.minY + deltaY,
      maxX: bounds.maxX + deltaX,
      maxY: bounds.maxY + deltaY,
    });
  }

  private normalizeDrawBounds(bounds: DrawAnnotationBounds): DrawAnnotationBounds {
    return {
      minX: this.roundNormalizedPoint(Math.min(bounds.minX, bounds.maxX)),
      minY: this.roundNormalizedPoint(Math.min(bounds.minY, bounds.maxY)),
      maxX: this.roundNormalizedPoint(Math.max(bounds.minX, bounds.maxX)),
      maxY: this.roundNormalizedPoint(Math.max(bounds.minY, bounds.maxY)),
    };
  }

  private cloneEditableDrawAnnotation(annotation: EditableDrawAnnotation): EditableDrawAnnotation {
    if (annotation.kind === 'freehand') {
      return {
        kind: 'freehand',
        bounds: { ...annotation.bounds },
        strokes: annotation.strokes.map((stroke) => stroke.map((point) => ({ ...point }))),
      };
    }

    if (annotation.kind === 'text') {
      return {
        kind: 'text',
        bounds: { ...annotation.bounds },
        text: annotation.text,
      };
    }

    return {
      kind: annotation.kind,
      bounds: { ...annotation.bounds },
    };
  }

  private buildDefaultTextEffectBounds(): DrawAnnotationBounds {
    const minX = (1 - this.defaultTextEffectWidth) / 2;
    const minY = (1 - this.defaultTextEffectHeight) / 2;

    return this.normalizeDrawBounds({
      minX,
      minY,
      maxX: minX + this.defaultTextEffectWidth,
      maxY: minY + this.defaultTextEffectHeight,
    });
  }

  private focusTextEffectInput(selectAll = false): void {
    setTimeout(() => {
      const input = this.textEffectInput?.nativeElement;
      if (!input) {
        return;
      }

      input.focus();
      if (selectAll) {
        input.select();
      }
    });
  }

  private resolveDrawHitTarget(
    point: DrawAnnotationPoint,
    canvas: HTMLCanvasElement
  ): DrawHitTarget {
    const annotation = this.drawAnnotation;
    if (!annotation) {
      return { kind: 'none' };
    }

    if (annotation.kind === 'text') {
      return { kind: 'none' };
    }

    const hitPaddingX =
      (this.drawHandleSizePx + this.drawHandleHitPaddingPx) / Math.max(canvas.clientWidth, 1);
    const hitPaddingY =
      (this.drawHandleSizePx + this.drawHandleHitPaddingPx) / Math.max(canvas.clientHeight, 1);
    const handles = this.resolveDrawHandlePositions(annotation.bounds);

    for (const [handle, handlePoint] of Object.entries(handles) as Array<
      [DrawResizeHandle, DrawAnnotationPoint]
    >) {
      if (
        Math.abs(point.x - handlePoint.x) <= hitPaddingX &&
        Math.abs(point.y - handlePoint.y) <= hitPaddingY
      ) {
        return { kind: 'handle', handle };
      }
    }

    if (
      point.x >= annotation.bounds.minX &&
      point.x <= annotation.bounds.maxX &&
      point.y >= annotation.bounds.minY &&
      point.y <= annotation.bounds.maxY
    ) {
      return { kind: 'body' };
    }

    return { kind: 'none' };
  }

  private roundNormalizedPoint(value: number): number {
    return Number(Math.max(0, Math.min(1, value)).toFixed(3));
  }

  private compactContextMetadata(
    metadata: Record<string, AgentXSelectedContextMetadataValue | undefined>
  ): Readonly<Record<string, AgentXSelectedContextMetadataValue>> {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        return typeof value !== 'string' || value.trim().length > 0;
      })
    ) as Readonly<Record<string, AgentXSelectedContextMetadataValue>>;
  }

  protected onPlayerTimeUpdate(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;
    if (this.isScrubbing) {
      this.logSeekDebug('timeupdate-skipped-scrubbing', player);
      return;
    }
    const current = player.currentTime || 0;

    if (this.rafId !== null && !player.paused && !player.ended) {
      if (!this.enforceTimelinePlayBoundary(player, current)) {
        this.pauseAtReachedDrawEffect(player, current);
      }
      return;
    }

    if (this.enforceTimelinePlayBoundary(player, current)) return;
    if (this.pauseAtReachedDrawEffect(player, current)) return;
    this.updatePlayerTimeSignal(current);
    this.syncSeekUi(current);

    // Keep UI smooth even if the browser emits sparse timeupdate events.
    if (!player.paused && !player.ended) {
      this.startSmoothProgressTracking();
    }
  }

  private async deleteDrawEffectMarker(markerId: string): Promise<void> {
    const review = this.selectedReview();
    const markerTarget = this.parseDrawEffectMarkerId(markerId);
    if (
      !review ||
      !markerTarget ||
      !review.timeline ||
      markerTarget.playIndex >= review.timeline.length
    ) {
      return;
    }

    const play = review.timeline[markerTarget.playIndex];
    if (!play) return;

    const nextAnnotations = this.resolveStoredPlayAnnotations(play).filter(
      (_annotation, index) => index !== markerTarget.annotationIndex
    );

    await this.flushCurrentPlayAnnotationPersistence();
    await this.service.saveTimelinePlayAnnotations(
      review.id,
      markerTarget.playIndex,
      nextAnnotations
    );

    if (markerTarget.playIndex === this.currentPlayIndex()) {
      if (this.currentDrawAnnotationIndex === markerTarget.annotationIndex) {
        this.resetDrawOverlay();
      } else if (
        this.currentDrawAnnotationIndex !== null &&
        this.currentDrawAnnotationIndex > markerTarget.annotationIndex
      ) {
        this.currentDrawAnnotationIndex -= 1;
      }
    }
  }

  private async updateDrawEffectDuration(markerId: string, durationSec: number): Promise<void> {
    const markerTarget = this.parseDrawEffectMarkerId(markerId);
    if (!markerTarget) {
      return;
    }

    await this.flushCurrentPlayAnnotationPersistence();

    const review = this.selectedReview();
    const currentPlayIndex = this.currentPlayIndex();
    const play = this.currentPlay();
    if (!review || markerTarget.playIndex !== currentPlayIndex || !play) {
      return;
    }

    const annotation =
      this.resolveStoredPlayAnnotations(play)[markerTarget.annotationIndex] ?? null;
    if (!annotation) return;

    const playStart = Number.isFinite(play.startSec) ? play.startSec : 0;
    const playEnd = Number.isFinite(play.endSec)
      ? Math.max(playStart + 0.1, play.endSec)
      : Math.max(playStart + durationSec, this.playerDuration());
    const currentWindow =
      (this.currentDrawAnnotationIndex === markerTarget.annotationIndex
        ? this.currentDrawEffectWindow
        : null) ??
      this.resolveDrawEffectWindowForPlay(play, annotation) ??
      this.resolveDefaultDrawEffectWindow(play, this.playerCurrentTime());

    const startSec = Math.max(playStart, Math.min(currentWindow.startSec, playEnd - 0.05));
    const endSec = Math.max(startSec + 0.05, Math.min(playEnd, startSec + durationSec));

    const nextAnnotations = this.resolveStoredPlayAnnotations(play).map((entry, index) =>
      index === markerTarget.annotationIndex
        ? {
            ...entry,
            activeFromSec: this.roundPlaybackSecond(startSec),
            activeUntilSec: this.roundPlaybackSecond(endSec),
          }
        : entry
    );

    if (this.currentDrawAnnotationIndex === markerTarget.annotationIndex) {
      this.currentDrawEffectWindow = { startSec, endSec };
      this.renderDrawOverlay();
    }

    await this.service.saveTimelinePlayAnnotations(
      review.id,
      markerTarget.playIndex,
      nextAnnotations
    );
  }

  protected onPlayerPlay(): void {
    this.isPlaying.set(true);
    this.startSmoothProgressTracking();
  }

  protected onPlayerPause(): void {
    this.isPlaying.set(false);
    this.stopSmoothProgressTracking();
    const player = this.filmPlayer?.nativeElement;
    const current = player?.currentTime || 0;
    this.updatePlayerTimeSignal(current, true);
    this.syncSeekUi(current);
  }

  protected onPlayerEnded(): void {
    this.isPlaying.set(false);
    this.stopSmoothProgressTracking();
    const player = this.filmPlayer?.nativeElement;
    const current = player?.currentTime || 0;
    this.updatePlayerTimeSignal(current, true);
    this.syncSeekUi(current);
  }

  protected async togglePlayPause(): Promise<void> {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    if (player.paused) {
      this.isPlaying.set(true);
      this.startSmoothProgressTracking();
      await this.playWhenReady(player).catch(() => {
        this.isPlaying.set(false);
        this.stopSmoothProgressTracking();
      });
      return;
    }

    this.isPlaying.set(false);
    this.stopSmoothProgressTracking();
    player.pause();
  }

  protected toggleInlinePlayOverlay(): void {
    this.isInlinePlayOverlayExpanded.update((expanded) => !expanded);
  }

  protected onPlayerWrapperKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (this.shouldIgnorePlayerShortcut(event)) return;

    const key = event.key.toLowerCase();

    if (
      key === ' ' ||
      key === 'spacebar' ||
      key === 'k' ||
      key === 'enter' ||
      key === 'mediaplaypause'
    ) {
      event.preventDefault();
      void this.togglePlayPause();
      return;
    }

    if (key === 'mediaplay') {
      event.preventDefault();
      if (!this.isPlaying()) {
        void this.togglePlayPause();
      }
      return;
    }

    if (key === 'mediapause') {
      event.preventDefault();
      if (this.isPlaying()) {
        void this.togglePlayPause();
      }
      return;
    }

    if (key === 'arrowleft' || key === 'j') {
      event.preventDefault();
      this.seekRelative(key === 'j' ? -10 : -5);
      return;
    }

    if (key === 'arrowright' || key === 'l') {
      event.preventDefault();
      this.seekRelative(key === 'l' ? 10 : 5);
      return;
    }

    if (key === 'home') {
      event.preventDefault();
      this.onSeekTime(0);
      return;
    }

    if (key === 'end') {
      const duration = this.playerDuration();
      if (!Number.isFinite(duration) || duration <= 0) return;
      event.preventDefault();
      this.onSeekTime(duration);
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      void this.toggleFullscreen();
    }
  }

  protected seekRelative(deltaSec: number): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    this.seekVideoTo(player, (player.currentTime || 0) + deltaSec);
  }

  protected onSeekInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const nextTime = Number(input?.value ?? '0');
    this.onSeekTime(nextTime);
  }
  protected onSeekTime(nextTime: number): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;
    if (!Number.isFinite(nextTime)) return;

    this.logSeekDebug('seek-request', player, { requestedTime: nextTime });
    this.seekVideoTo(player, nextTime);
  }

  protected onPlayerSeeking(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    this.logSeekDebug('player-seeking', player);

    if (this.isScrubbing) {
      this.syncSeekUi(player.currentTime || 0);
      return;
    }

    this.stopSmoothProgressTracking();
    this.syncSeekUi(player.currentTime || 0);
  }

  protected onPlayerSeeked(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    const current = player.currentTime || 0;
    this.logSeekDebug('player-seeked', player);
    this.updatePlayerTimeSignal(current, true);
    this.syncSeekUi(current);

    if (!this.isScrubbing && !player.paused && !player.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected onSeekPointerDown(): void {
    this.isScrubbing = true;
    this.isSeekDragLockActive.set(true);
    this.logSeekDebug('seek-pointer-down');
  }

  protected onSeekPointerUp(): void {
    const player = this.filmPlayer?.nativeElement;
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);

    this.logSeekDebug('seek-pointer-up', player ?? undefined);

    if (!player) return;

    this.isPlaying.set(!player.paused && !player.ended);
    if (!player.paused && !player.ended) {
      this.startSmoothProgressTracking();
      return;
    }

    this.stopSmoothProgressTracking();
  }

  private seekVideoTo(player: HTMLVideoElement, nextTime: number): void {
    this.logSeekDebug('seek-commit-before', player, { requestedTime: nextTime });
    const committedTime = commitMediaSeek(player, nextTime);
    this.lastDrawEffectPauseCheckSec = committedTime;
    this.updatePlayerTimeSignal(committedTime, true);
    this.syncSeekUi(committedTime);
    this.logSeekDebug('seek-commit-after', player, {
      requestedTime: nextTime,
      committedTime,
    });
  }

  private startSmoothProgressTracking(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.rafId !== null) return;

    const step = (): void => {
      const player = this.filmPlayer?.nativeElement;
      if (!player) {
        this.stopSmoothProgressTracking();
        return;
      }

      const current = player.currentTime || 0;
      if (this.enforceTimelinePlayBoundary(player, current)) {
        return;
      }
      if (this.pauseAtReachedDrawEffect(player, current)) {
        return;
      }
      this.updatePlayerTimeSignal(current);
      this.syncSeekUi(current);

      if (!player.paused && !player.ended) {
        this.rafId = requestAnimationFrame(step);
        return;
      }

      this.stopSmoothProgressTracking();
    };

    this.rafId = requestAnimationFrame(step);
  }

  private getActiveTimelineSeekBounds(): { startSec: number; endSec: number } | null {
    // Each loaded source clip plays as its own complete video (like the regular
    // viewer). We never clamp/auto-pause playback to a single play's window, so
    // scrubbing backward and resuming is always seamless.
    return null;
  }

  private getNativePlaybackSourcePlay(): FilmTimelinePlay | null {
    const timeline = this.currentTimeline();
    const sourceIndex = this.nativePlaybackSourcePlayIndex();
    if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= timeline.length) {
      return this.currentPlay();
    }

    return timeline[sourceIndex] ?? this.currentPlay();
  }

  private clampToActiveSeekBounds(nextTime: number, player: HTMLVideoElement): number {
    const playBounds = this.getActiveTimelineSeekBounds();
    if (playBounds) {
      return Math.max(playBounds.startSec, Math.min(nextTime, playBounds.endSec));
    }

    const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
    return Math.max(0, Math.min(nextTime, duration));
  }

  private enforceTimelinePlayBoundary(player: HTMLVideoElement, currentSec: number): boolean {
    const playBounds = this.getActiveTimelineSeekBounds();
    if (!playBounds) return false;

    if (currentSec < playBounds.startSec - 0.05) {
      player.currentTime = playBounds.startSec;
      this.updatePlayerTimeSignal(player.currentTime, true);
      this.syncSeekUi(player.currentTime);
      return true;
    }

    const endThreshold = playBounds.endSec;
    if (currentSec <= endThreshold) {
      return false;
    }

    const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
    const stopTime = Math.max(
      playBounds.startSec,
      Math.min(endThreshold, Number.isFinite(duration) ? duration - 0.001 : endThreshold)
    );
    player.currentTime = stopTime;
    player.pause();
    this.isPlaying.set(false);
    this.stopSmoothProgressTracking();
    this.updatePlayerTimeSignal(player.currentTime, true);
    this.syncSeekUi(player.currentTime);
    return true;
  }

  private pauseAtReachedDrawEffect(player: HTMLVideoElement, currentSec: number): boolean {
    const previousSec = this.lastDrawEffectPauseCheckSec;
    this.lastDrawEffectPauseCheckSec = currentSec;

    if (!Number.isFinite(currentSec)) {
      return false;
    }

    if (previousSec === null || !Number.isFinite(previousSec) || currentSec <= previousSec) {
      return false;
    }

    const play = this.currentPlay();
    if (!play) {
      return false;
    }

    const pauseTargetSec = this.resolveDrawEffectPauseTarget(play, previousSec, currentSec);
    if (pauseTargetSec === null) {
      return false;
    }

    const committedTime = commitMediaSeek(
      player,
      this.clampToActiveSeekBounds(pauseTargetSec, player)
    );
    player.pause();
    this.isPlaying.set(false);
    this.stopSmoothProgressTracking();
    this.updatePlayerTimeSignal(committedTime, true);
    this.syncSeekUi(committedTime);
    return true;
  }

  private resolveDrawEffectPauseTarget(
    play: FilmTimelinePlay,
    previousSec: number,
    currentSec: number
  ): number | null {
    const nextEffectStart = this.resolveStoredPlayAnnotations(play)
      .map((annotation) => this.resolveDrawEffectWindowForPlay(play, annotation)?.startSec ?? null)
      .filter((startSec): startSec is number => Number.isFinite(startSec))
      .sort((left, right) => left - right)
      .find((startSec) => previousSec < startSec && currentSec >= startSec);

    return nextEffectStart ?? null;
  }

  private async playWhenReady(player: HTMLVideoElement): Promise<void> {
    await playMediaWhenReady(player);
  }

  private shouldIgnorePlayerShortcut(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;

    if (target === this.playerContainer?.nativeElement) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();
    if (
      tagName === 'button' ||
      tagName === 'input' ||
      tagName === 'select' ||
      tagName === 'textarea' ||
      tagName === 'a'
    ) {
      return true;
    }

    return target.isContentEditable;
  }

  private stopSmoothProgressTracking(): void {
    if (this.rafId === null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  private updatePlayerTimeSignal(currentSec: number, force = false): void {
    const safeCurrent = Number.isFinite(currentSec) ? currentSec : 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (force || this.isScrubbing || now - this.lastSignalUpdateMs >= 16) {
      this.lastSignalUpdateMs = now;
      this.playerCurrentTime.set(safeCurrent);
      this.maybeRenderDrawOverlayForPlayback(now, force);
    }
  }

  private maybeRenderDrawOverlayForPlayback(now: number, force: boolean): void {
    if (!this.hasDrawing()) return;

    const shouldRenderImmediately =
      force || this.isScrubbing || this.drawInteraction !== null || this.drawModeEnabled();
    const drawOverlayVisible =
      shouldRenderImmediately || this.shouldRenderDrawOverlayAtCurrentTime();

    if (!drawOverlayVisible) {
      if (this.lastDrawOverlayVisible) {
        this.lastDrawOverlayVisible = false;
        this.lastDrawOverlayRenderMs = now;
        this.renderDrawOverlay();
      }
      return;
    }

    if (
      shouldRenderImmediately ||
      now - this.lastDrawOverlayRenderMs >= this.drawOverlayPlaybackRenderIntervalMs
    ) {
      this.lastDrawOverlayVisible = true;
      this.lastDrawOverlayRenderMs = now;
      this.renderDrawOverlay();
    }
  }

  private syncSeekUi(currentSec: number): void {
    void currentSec;
  }

  protected setPlaybackRate(rate: number): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    if (!Number.isFinite(rate) || rate <= 0) return;

    player.playbackRate = rate;
    this.playbackRate.set(rate);
  }

  protected toggleFullscreen(): void {
    const container = this.playerContainer?.nativeElement;
    if (!container || typeof document === 'undefined') return;

    if (!document.fullscreenElement) {
      const requestFullscreen = container.requestFullscreen?.bind(container) as
        | (() => Promise<void>)
        | undefined;
      const webkitRequestFullscreen = (
        container as HTMLElement & { webkitRequestFullscreen?: () => void }
      ).webkitRequestFullscreen;

      if (requestFullscreen) {
        void requestFullscreen().catch(() => undefined);
        return;
      }

      webkitRequestFullscreen?.call(container);
      return;
    }

    const exitFullscreen = document.exitFullscreen?.bind(document) as
      | (() => Promise<void>)
      | undefined;
    const webkitExitFullscreen = (document as Document & { webkitExitFullscreen?: () => void })
      .webkitExitFullscreen;

    if (exitFullscreen) {
      void exitFullscreen().catch(() => undefined);
      return;
    }

    webkitExitFullscreen?.call(document);
  }

  public isCloudflareReviewProcessing(review: FilmListReview | null | undefined): boolean {
    if (!review?.cloudflareVideoId?.trim()) return false;
    if (review.readyToStream === true) return false;

    const status = review.cloudflareStatus?.trim().toLowerCase();
    return (
      review.readyToStream === false ||
      status === 'inprogress' ||
      status === 'queued' ||
      status === 'pending'
    );
  }

  public getCloudflareProcessingMessage(review: FilmListReview): string {
    const status = review.cloudflareStatus?.trim();
    if (status) {
      return `Current status: ${status}. The video will appear here once Stream finishes encoding.`;
    }
    return 'The video will appear here once Stream finishes encoding.';
  }

  public resolveNativeVideoUrl(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    if (this.cloudflareNativePlaybackFailed() && this.isCloudflarePlaybackReview(review, play)) {
      return null;
    }

    return this.resolveNativeVideoUrlCandidate(review, play);
  }

  private resolveNativeVideoUrlCandidate(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    const cloudflareHlsUrl = this.resolveCloudflareHlsUrl(review, play);
    if (cloudflareHlsUrl) return cloudflareHlsUrl;

    const videoUrl = this.resolvePlaybackSource(review, play)?.videoUrl?.trim();
    return videoUrl && videoUrl.length > 0 ? videoUrl : null;
  }

  private resolveCloudflareHlsUrl(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    return resolvePlayableVideoUrl(this.resolvePlaybackSource(review, play));
  }

  private isCloudflarePlaybackReview(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): boolean {
    return isCloudflarePlaybackSource(this.resolvePlaybackSource(review, play));
  }

  public resolveCloudflareEmbedUrl(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    const baseUrl = this.resolveCloudflareBaseEmbedUrl(review, play);
    if (!baseUrl) return null;
    return this.withCloudflarePlayerParams(baseUrl);
  }

  private resolveCloudflareBaseEmbedUrl(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): string | null {
    return resolveSharedCloudflareBaseEmbedUrl(this.resolvePlaybackSource(review, play));
  }

  private withCloudflarePlayerParams(url: string): string {
    try {
      const parsed = new URL(url);
      const startTimeSec = this.cloudflareStartTimeSec();
      if (Number.isFinite(startTimeSec) && startTimeSec > 0.01) {
        parsed.searchParams.set('startTime', `${Number(startTimeSec.toFixed(2))}s`);
      } else {
        parsed.searchParams.delete('startTime');
      }

      if (this.cloudflareAutoplayRequested()) {
        parsed.searchParams.set('autoplay', 'true');
      } else {
        parsed.searchParams.delete('autoplay');
      }

      return parsed.toString();
    } catch {
      return url;
    }
  }

  public getSafeIframeUrl(url: string): SafeResourceUrl {
    const cached = this.safeIframeUrlCache.get(url);
    if (cached) return cached;

    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.safeIframeUrlCache.set(url, safeUrl);
    return safeUrl;
  }

  private resolveReviewDurationSec(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): number {
    const sourceDuration = this.resolvePlaybackSource(review, play)?.durationSec;
    if (Number.isFinite(sourceDuration) && (sourceDuration ?? 0) > 0) {
      return sourceDuration as number;
    }

    const player = this.filmPlayer?.nativeElement;
    const loadedDuration = player?.duration;
    if (
      this.nativeVideoSourceUrl &&
      player &&
      player.readyState >= HTMLMediaElement.HAVE_METADATA &&
      Number.isFinite(loadedDuration) &&
      (loadedDuration ?? 0) > 0
    ) {
      return loadedDuration as number;
    }

    const explicitDuration = review?.durationSec;
    if (Number.isFinite(explicitDuration) && (explicitDuration ?? 0) > 0) {
      return explicitDuration as number;
    }

    const timeline = (review as FilmReviewDragSource | null | undefined)?.timeline;
    if (!timeline?.length) return 0;

    const sourceId = play?.sourceId?.trim();
    if (sourceId) {
      const sourceTimeline = timeline.filter((segment) => segment.sourceId?.trim() === sourceId);
      if (sourceTimeline.length > 0) {
        return sourceTimeline.reduce(
          (duration, segment) => Math.max(duration, segment.endSec ?? 0),
          0
        );
      }
    }

    return timeline.reduce((duration, play) => Math.max(duration, play.endSec ?? 0), 0);
  }

  private resolveEffectivePlayEndSec(
    review: FilmListReview | null | undefined,
    play: FilmTimelinePlay
  ): number {
    const startSec = Number.isFinite(play.startSec) ? Math.max(0, play.startSec) : 0;
    const rawEnd = Number.isFinite(play.endSec) ? Math.max(startSec, play.endSec) : startSec;

    if (!this.isPlaceholderSourcePlay(review, play)) {
      return rawEnd;
    }

    const sourceDuration = this.resolvePlaybackSource(review, play)?.durationSec;
    if (Number.isFinite(sourceDuration) && (sourceDuration ?? 0) > startSec) {
      return Math.max(rawEnd, sourceDuration as number);
    }

    const player = this.filmPlayer?.nativeElement;
    const loadedDuration = player?.duration;
    if (Number.isFinite(loadedDuration) && (loadedDuration ?? 0) > startSec) {
      return Math.max(rawEnd, loadedDuration as number);
    }

    const signaledDuration = this.playerDuration();
    if (Number.isFinite(signaledDuration) && signaledDuration > startSec) {
      return Math.max(rawEnd, signaledDuration);
    }

    return rawEnd;
  }

  private resolveDisplayedTimelinePlayEndSec(play: FilmTimelinePlay): number {
    return this.resolveEffectivePlayEndSec(this.selectedReview(), play);
  }

  private isPlaceholderSourcePlay(
    review: FilmListReview | null | undefined,
    play: FilmTimelinePlay | null | undefined
  ): boolean {
    if (!review || !play?.sourceId?.trim()) {
      return false;
    }

    if (review.uploadMode !== 'batch_clips' && review.uploadMode !== 'full_footage') {
      return false;
    }

    if (!Number.isFinite(play.startSec) || Math.abs(play.startSec) > 0.001) {
      return false;
    }

    return Number.isFinite(play.endSec) && play.endSec <= 1.001;
  }

  private resolvePlaybackSource(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): FilmReviewPlaybackSource | null {
    if (!review) return null;

    const sources = review.sources ?? [];
    const playSources = this.resolvePlaybackSourcesForPlay(review, play);

    const sourceId = play?.sourceId?.trim();
    const matchedSource =
      (sourceId && playSources.find((source) => source.id.trim() === sourceId)) ||
      playSources[0] ||
      (sourceId && sources.find((source) => source.id.trim() === sourceId));
    if (matchedSource) {
      const angleSources = playSources.length > 0 ? playSources : sources;
      return this.resolveCameraAngleVariant(angleSources, matchedSource, false) ?? matchedSource;
    }

    const primarySource = sources[0];
    if (primarySource) {
      return this.resolveCameraAngleVariant(sources, primarySource, true) ?? primarySource;
    }

    const videoUrl = review.videoUrl?.trim();
    if (!videoUrl) return null;

    return {
      id: sourceId || this.resolveTimelinePlaySourceIds(play)[0] || review.id,
      videoUrl,
      storagePath: review.storagePath,
      cloudflareVideoId: review.cloudflareVideoId,
      cloudflareStatus: review.cloudflareStatus,
      readyToStream: review.readyToStream,
      thumbnailUrl: review.thumbnailUrl,
      durationSec: review.durationSec,
    };
  }

  private resolveTimelinePlaySourceIds(
    play: FilmTimelinePlay | null | undefined
  ): readonly string[] {
    const sourceIds = play?.sourceIds?.length
      ? play.sourceIds
      : play?.sourceId
        ? [play.sourceId]
        : [];
    return [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  }

  private resolvePlaybackSourcesForPlay(
    review: FilmListReview | null | undefined,
    play?: FilmTimelinePlay | null
  ): readonly TeamFilmReviewSourceVideo[] {
    const sources = this.resolveReviewCameraAngleSources(review);
    const explicitSourceIds = play?.sourceIds?.length
      ? [...new Set(play.sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))]
      : [];
    const sourceIds =
      explicitSourceIds.length > 0 ? explicitSourceIds : this.resolveTimelinePlaySourceIds(play);
    if (sourceIds.length === 0) return sources;

    const matchedSources = sourceIds.flatMap((sourceId) =>
      sources.filter((source) => source.id.trim() === sourceId)
    );

    if (explicitSourceIds.length > 0 || matchedSources.length === 0) {
      return matchedSources.length > 0 ? matchedSources : sources;
    }

    const primarySource = matchedSources[0];
    if (!primarySource) return sources;

    const angleGroupId = this.resolveSourceAngleMetadata(sources, primarySource).angleGroupId;
    if (!angleGroupId?.trim()) return matchedSources;

    const groupedSources = sources.filter(
      (source) => this.resolveSourceAngleMetadata(sources, source).angleGroupId === angleGroupId
    );

    return groupedSources.length > 0 ? groupedSources : matchedSources;
  }

  protected onSelectCameraAngle(cameraAngle: TeamFilmReviewCameraAngle): void {
    this.cameraAngleMenuOpen.set(false);
    if (!this.isSelectableCameraAngle(cameraAngle) || this.selectedCameraAngle() === cameraAngle) {
      return;
    }

    const player = this.filmPlayer?.nativeElement;
    const currentTimeSec = Number.isFinite(player?.currentTime)
      ? Math.max(0, player?.currentTime ?? 0)
      : Math.max(0, this.playerCurrentTime());
    this.shouldResumeAfterCameraAngleSwitch = !!player && !player.paused;
    this.pendingTimestampSeekSec = currentTimeSec;
    this.selectedCameraAngle.set(cameraAngle);
    this.updatePlayerTimeSignal(currentTimeSec, true);
    this.syncSeekUi(currentTimeSec);
    this.scheduleNativeVideoSourceSync();
  }

  protected toggleCameraAngleMenu(event: Event): void {
    event.stopPropagation();
    this.cameraAngleMenuOpen.update((open) => !open);
  }

  private resolveCameraAngleVariant(
    sources: readonly TeamFilmReviewSourceVideo[],
    source: TeamFilmReviewSourceVideo,
    allowGlobalFallback: boolean
  ): TeamFilmReviewSourceVideo | null {
    const desiredAngle = this.selectedCameraAngle();
    if (!this.isSelectableCameraAngle(desiredAngle)) return null;

    const sourceAngleMetadata = this.resolveSourceAngleMetadata(sources, source);
    if (sourceAngleMetadata.cameraAngle === desiredAngle) {
      return source;
    }

    const angleGroupId = sourceAngleMetadata.angleGroupId?.trim();
    if (angleGroupId) {
      const groupedSource = sources.find((candidate) => {
        const candidateMetadata = this.resolveSourceAngleMetadata(sources, candidate);
        return (
          candidateMetadata.angleGroupId?.trim() === angleGroupId &&
          candidateMetadata.cameraAngle === desiredAngle
        );
      });
      if (groupedSource) return groupedSource;
    }

    if (!allowGlobalFallback) return null;
    return (
      sources.find(
        (candidate) =>
          this.resolveSourceAngleMetadata(sources, candidate).cameraAngle === desiredAngle
      ) ?? null
    );
  }

  private resolveReviewCameraAngleSources(
    review: FilmListReview | null | undefined
  ): readonly TeamFilmReviewSourceVideo[] {
    if (!review) return [];
    if (review.sources?.length) return review.sources;

    const videoUrl = review.videoUrl?.trim();
    if (!videoUrl) return [];

    return [
      {
        id: review.id,
        order: 0,
        title: review.title,
        videoUrl,
        storagePath: review.storagePath,
        cloudflareVideoId: review.cloudflareVideoId,
        cloudflareStatus: review.cloudflareStatus,
        readyToStream: review.readyToStream,
        thumbnailUrl: review.thumbnailUrl,
        durationSec: review.durationSec,
      },
    ];
  }

  private resolveSourceAngleMetadata(
    sources: readonly TeamFilmReviewSourceVideo[],
    source: TeamFilmReviewSourceVideo
  ): TeamFilmReviewSourceAngleMetadata {
    const sourceIndex = sources.indexOf(source);
    const sourceNames = sources.map((item) => this.resolveSourceAngleDetectionName(item));
    const inferred = buildTeamFilmReviewSourceAngleMetadata(sourceNames)[sourceIndex] ?? {
      cameraAngle: 'unknown',
      angleDetectionSource: 'unknown',
    };
    const explicitCameraAngle = this.isSelectableCameraAngle(source.cameraAngle)
      ? source.cameraAngle
      : undefined;

    return {
      cameraAngle: explicitCameraAngle ?? inferred.cameraAngle ?? 'unknown',
      angleDetectionSource: explicitCameraAngle
        ? (source.angleDetectionSource ?? 'manual')
        : inferred.angleDetectionSource,
      ...(source.angleGroupId?.trim()
        ? { angleGroupId: source.angleGroupId.trim() }
        : inferred.angleGroupId
          ? { angleGroupId: inferred.angleGroupId }
          : {}),
    };
  }

  private resolveSourceAngleDetectionName(source: TeamFilmReviewSourceVideo): string {
    return (
      source.title?.trim() ||
      this.extractSourceBaseName(source.storagePath) ||
      this.extractSourceBaseName(source.downloadUrl) ||
      this.extractSourceBaseName(source.videoUrl) ||
      source.id
    );
  }

  protected isCameraAngleOptionActive(cameraAngle: TeamFilmReviewCameraAngle): boolean {
    return (
      this.selectedCameraAngle() === cameraAngle || this.availableCameraAngleOptions().length === 1
    );
  }

  protected selectedCameraAngleLabel(): string {
    const options = this.availableCameraAngleOptions();
    return (
      options.find((option) => option.value === this.selectedCameraAngle())?.label ??
      options[0]?.label ??
      'View'
    );
  }

  private isSelectableCameraAngle(
    cameraAngle: TeamFilmReviewCameraAngle | null | undefined
  ): cameraAngle is 'wide' | 'tight' {
    return cameraAngle === 'wide' || cameraAngle === 'tight';
  }

  protected getCameraAngleLabel(cameraAngle: TeamFilmReviewCameraAngle): string {
    if (cameraAngle === 'wide') return 'Wide';
    if (cameraAngle === 'tight') return 'Tight';
    return 'View';
  }

  protected openVideoInNewWindow(): void {
    const review = this.selectedReview();
    const videoUrl = this.resolveNativeVideoUrlCandidate(review);
    if (!videoUrl || typeof window === 'undefined') return;

    const currentTimeSec = Math.max(0, Number(this.playerCurrentTime().toFixed(2)));
    const sessionId = this.createFilmReviewPopoutSessionId();
    const payload = {
      reviewId: review?.id ?? null,
      teamId: review?.teamId?.trim() || this.teamId?.trim() || null,
      role: this.role?.trim() || null,
      sport: review?.sport?.trim() || this.sport?.trim() || '',
      startTimeSec: currentTimeSec,
    };

    try {
      window.sessionStorage.setItem(
        `${FILM_REVIEW_POPOUT_STORAGE_PREFIX}${sessionId}`,
        JSON.stringify(payload)
      );
    } catch {
      this.toast.error('Could not prepare the video player window.');
      return;
    }

    const screenWidth = window.screen.availWidth || window.innerWidth;
    const screenHeight = window.screen.availHeight || window.innerHeight;
    const popupWidth = Math.max(960, Math.round(screenWidth * 0.98));
    const popupHeight = Math.max(720, Math.round(screenHeight * 0.96));
    const popupLeft = Math.max(0, Math.round((screenWidth - popupWidth) / 2));
    const popupTop = Math.max(0, Math.round((screenHeight - popupHeight) / 2));
    const popupFeatures = [
      'popup=yes',
      'resizable=yes',
      'scrollbars=no',
      'toolbar=no',
      'location=no',
      'menubar=no',
      'status=no',
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${popupLeft}`,
      `top=${popupTop}`,
    ].join(',');

    const popoutUrl = new URL('/agent-x/film-review-popout', window.location.origin);
    popoutUrl.searchParams.set('session', sessionId);

    const videoWindow = window.open(popoutUrl.toString(), 'nxt1-film-review-player', popupFeatures);
    if (!videoWindow) {
      window.sessionStorage.removeItem(`${FILM_REVIEW_POPOUT_STORAGE_PREFIX}${sessionId}`);
      this.toast.error('Allow pop-ups to open video in a new window.');
      return;
    }

    try {
      videoWindow.moveTo(0, 0);
      videoWindow.resizeTo(screenWidth, screenHeight);
    } catch {
      // Ignore browser restrictions on scripted window resizing.
    }

    videoWindow.focus();
  }

  private createFilmReviewPopoutSessionId(): string {
    const cryptoApi = window.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private toNormalizedDrawPoint(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): DrawAnnotationPoint | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }

    return {
      x,
      y,
    };
  }

  private maybeToastDrawOutsideFrame(): void {
    const now = Date.now();
    if (now - this.lastDrawOutsideFrameToastAtMs < 1500) {
      return;
    }
    this.lastDrawOutsideFrameToastAtMs = now;
    this.toast.info('Draw directly inside the video frame.');
  }

  private ensureDrawCanvasSize(): void {
    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas || typeof window === 'undefined') return;

    this.ensureDrawOverlayResizeObserver();

    this.syncOverlayToRenderedVideoRect(canvas);

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const targetWidth = Math.max(1, Math.round(rect.width * dpr));
    const targetHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  private ensureDrawOverlayResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!this.drawOverlayResizeObserver) {
      this.drawOverlayResizeObserver = new ResizeObserver(() => {
        this.scheduleDrawOverlayGeometryRefresh();
      });
    }

    const container = this.playerContainer?.nativeElement ?? null;
    if (container && container !== this.observedOverlayContainer) {
      if (this.observedOverlayContainer) {
        this.drawOverlayResizeObserver.unobserve(this.observedOverlayContainer);
      }
      this.drawOverlayResizeObserver.observe(container);
      this.observedOverlayContainer = container;
    }

    const player = this.filmPlayer?.nativeElement ?? null;
    if (player && player !== this.observedOverlayPlayer) {
      if (this.observedOverlayPlayer) {
        this.drawOverlayResizeObserver.unobserve(this.observedOverlayPlayer);
      }
      this.drawOverlayResizeObserver.observe(player);
      this.observedOverlayPlayer = player;
    }
  }

  private scheduleDrawOverlayGeometryRefresh(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      this.ensureDrawCanvasSize();
      this.renderDrawOverlay();
      return;
    }

    if (this.drawOverlayResizeRafId !== null) {
      return;
    }

    this.drawOverlayResizeRafId = requestAnimationFrame(() => {
      this.drawOverlayResizeRafId = null;
      this.ensureDrawCanvasSize();
      this.renderDrawOverlay();
    });
  }

  private teardownDrawOverlayResizeObserver(): void {
    if (this.drawOverlayResizeRafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.drawOverlayResizeRafId);
      this.drawOverlayResizeRafId = null;
    }

    this.drawOverlayResizeObserver?.disconnect();
    this.drawOverlayResizeObserver = null;
    this.observedOverlayContainer = null;
    this.observedOverlayPlayer = null;
  }

  private syncOverlayToRenderedVideoRect(element: HTMLElement): void {
    const player = this.filmPlayer?.nativeElement;
    const container = this.playerContainer?.nativeElement;
    if (!player || !container || !player.videoWidth || !player.videoHeight) {
      element.style.left = '0px';
      element.style.top = '0px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.width = '100%';
      element.style.height = '100%';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !playerRect.width || !playerRect.height) {
      return;
    }

    const mediaRect = this.resolveContainedMediaRect(
      playerRect.width,
      playerRect.height,
      player.videoWidth,
      player.videoHeight
    );
    element.style.left = `${playerRect.left - containerRect.left + mediaRect.x}px`;
    element.style.top = `${playerRect.top - containerRect.top + mediaRect.y}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.width = `${mediaRect.width}px`;
    element.style.height = `${mediaRect.height}px`;
  }

  private renderDrawOverlay(): void {
    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    this.ensureDrawCanvasSize();

    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    const annotations = this.resolveOverlayAnnotationsToRender();
    if (!annotations.length) return;
    if (!this.drawModeEnabled() && !this.shouldRenderDrawOverlayAtCurrentTime()) return;

    const style = getComputedStyle(canvas);
    const strokeColor = style.getPropertyValue('--nxt1-color-primary').trim() || '#ccff00';
    const handleFillColor = '#ffffff';
    const handleGlyphColor = '#0b1220';
    const ratio = canvas.width / Math.max(canvas.clientWidth, 1);

    context.save();
    context.strokeStyle = strokeColor;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(2 * ratio, 2);

    for (const annotation of annotations) {
      this.renderSingleDrawAnnotation(context, canvas, annotation);
    }

    if (
      this.drawModeEnabled() &&
      this.drawAnnotation &&
      this.drawAnnotation.kind !== 'text' &&
      this.shouldRenderCurrentDrawAnnotation()
    ) {
      const selection = this.toCanvasDrawBounds(this.drawAnnotation.bounds, canvas);
      this.renderDrawSelectionCornerBadge(
        context,
        selection,
        handleFillColor,
        handleGlyphColor,
        ratio
      );
    }

    context.restore();
  }

  private resolveOverlayAnnotationsToRender(): readonly EditableDrawAnnotation[] {
    const play = this.currentPlay();
    const currentTime = this.playerCurrentTime();
    const annotations: EditableDrawAnnotation[] = [];

    if (play) {
      for (const [index, annotation] of this.resolveStoredPlayAnnotations(play).entries()) {
        if (index === this.currentDrawAnnotationIndex && this.drawAnnotation) {
          continue;
        }

        const window = this.resolveDrawEffectWindowForPlay(play, annotation);
        if (!window || currentTime < window.startSec || currentTime > window.endSec) {
          continue;
        }

        const restoredAnnotation = this.restoreEditableDrawAnnotation(annotation);
        if (restoredAnnotation && restoredAnnotation.kind !== 'text') {
          annotations.push(restoredAnnotation);
        }
      }
    }

    if (
      this.drawAnnotation &&
      this.drawAnnotation.kind !== 'text' &&
      this.shouldRenderCurrentDrawAnnotation()
    ) {
      annotations.push(this.drawAnnotation);
    }

    return annotations;
  }

  private shouldRenderCurrentDrawAnnotation(): boolean {
    if (!this.drawAnnotation) {
      return false;
    }

    if (this.drawInteraction) {
      return true;
    }

    if (this.currentDrawAnnotationIndex === null) {
      return true;
    }

    const play = this.currentPlay();
    if (!play) {
      return true;
    }

    const annotation =
      this.resolveStoredPlayAnnotations(play)[this.currentDrawAnnotationIndex] ?? null;
    if (!annotation) {
      return true;
    }

    const window =
      this.currentDrawEffectWindow ?? this.resolveDrawEffectWindowForPlay(play, annotation);
    if (!window) {
      return true;
    }

    const currentTime = this.playerCurrentTime();
    return currentTime >= window.startSec && currentTime <= window.endSec;
  }

  private renderSingleDrawAnnotation(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    annotation: EditableDrawAnnotation
  ): void {
    if (annotation.kind === 'freehand') {
      for (const stroke of annotation.strokes) {
        if (!stroke.length) continue;
        context.beginPath();
        context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);

        for (let i = 1; i < stroke.length; i++) {
          const point = stroke[i];
          if (!point) continue;
          context.lineTo(point.x * canvas.width, point.y * canvas.height);
        }

        if (stroke.length === 1) {
          context.lineTo(stroke[0].x * canvas.width + 0.01, stroke[0].y * canvas.height + 0.01);
        }

        context.stroke();
      }
      return;
    }

    const bounds = this.toCanvasDrawBounds(annotation.bounds, canvas);
    if (annotation.kind === 'square') {
      context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      return;
    }

    context.beginPath();
    context.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width / 2,
      bounds.height / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
  }

  private resolveDisplayedTextEffect(): {
    text: string;
    editing: boolean;
    window: { startSec: number; endSec: number } | null;
  } | null {
    if (this.drawModeEnabled() && this.drawAnnotation?.kind === 'text') {
      const play = this.currentPlay();
      const annotation =
        play && this.currentDrawAnnotationIndex !== null
          ? (this.resolveStoredPlayAnnotations(play)[this.currentDrawAnnotationIndex] as
              | PersistedTextPlayAnnotation
              | undefined)
          : null;
      const window =
        this.currentDrawEffectWindow ??
        this.resolveDrawEffectWindowForPlay(play, annotation) ??
        this.resolveDefaultDrawEffectWindow(play, this.playerCurrentTime());
      const currentTime = this.playerCurrentTime();

      if (window && (currentTime < window.startSec || currentTime > window.endSec)) {
        return null;
      }

      return {
        text: this.drawAnnotation.text,
        editing: true,
        window,
      };
    }

    const play = this.currentPlay();
    if (!play) {
      return null;
    }

    const currentTime = this.playerCurrentTime();
    for (const [index, annotation] of this.resolveStoredPlayAnnotations(play).entries()) {
      if (annotation.kind !== 'text') {
        continue;
      }

      const window =
        (index === this.currentDrawAnnotationIndex ? this.currentDrawEffectWindow : null) ??
        this.resolveDrawEffectWindowForPlay(play, annotation);
      if (!window || currentTime < window.startSec || currentTime > window.endSec) {
        continue;
      }

      return {
        text: annotation.text,
        editing: false,
        window,
      };
    }

    return null;
  }

  private toCanvasDrawBounds(
    bounds: DrawAnnotationBounds,
    canvas: HTMLCanvasElement
  ): { x: number; y: number; width: number; height: number } {
    const minX = bounds.minX * canvas.width;
    const minY = bounds.minY * canvas.height;
    const maxX = bounds.maxX * canvas.width;
    const maxY = bounds.maxY * canvas.height;
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  private renderDrawSelectionCornerBadge(
    context: CanvasRenderingContext2D,
    selection: { x: number; y: number; width: number; height: number },
    fillColor: string,
    glyphColor: string,
    ratio: number
  ): void {
    const badgeSize = Math.max(this.drawHandleSizePx * 1.15 * ratio, 12 * ratio);
    const canvasWidth = context.canvas.width;
    const badgeX = Math.min(
      selection.x + selection.width + badgeSize * 0.18,
      canvasWidth - badgeSize - 2 * ratio
    );
    const badgeY = Math.max(selection.y - badgeSize * 0.18, 2 * ratio);
    const centerX = badgeX + badgeSize / 2;
    const centerY = badgeY + badgeSize / 2;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(0.48);
    context.fillStyle = fillColor;
    context.strokeStyle = 'transparent';
    context.lineWidth = 0;
    context.shadowColor = 'rgba(0, 0, 0, 0.28)';
    context.shadowBlur = Math.max(4 * ratio, 2);
    context.shadowOffsetY = Math.max(1 * ratio, 1);
    context.beginPath();
    context.arc(0, 0, badgeSize / 2, 0, Math.PI * 2);
    context.fill();

    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.strokeStyle = glyphColor;
    context.lineWidth = Math.max(1.25 * ratio, 1);
    context.shadowColor = 'rgba(0, 0, 0, 0.42)';
    context.shadowBlur = Math.max(1.5 * ratio, 1);
    context.shadowOffsetY = Math.max(0.5 * ratio, 0.5);
    // Draw a conventional resize icon (diagonal with arrowheads)
    const arm = badgeSize * 0.24;
    const head = badgeSize * 0.1;

    context.beginPath();
    context.moveTo(-arm, arm);
    context.lineTo(arm, -arm);
    context.stroke();

    context.beginPath();
    context.moveTo(arm, -arm);
    context.lineTo(arm - head, -arm);
    context.moveTo(arm, -arm);
    context.lineTo(arm, -arm + head);
    context.stroke();

    context.beginPath();
    context.moveTo(-arm, arm);
    context.lineTo(-arm + head, arm);
    context.moveTo(-arm, arm);
    context.lineTo(-arm, arm - head);
    context.stroke();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.restore();
  }

  private syncDrawCanvasCursor(point?: DrawAnnotationPoint): void {
    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    if (!this.drawModeEnabled()) {
      canvas.style.cursor = 'default';
      return;
    }

    if (this.drawInteraction?.mode === 'move') {
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.drawInteraction?.mode === 'resize') {
      canvas.style.cursor = this.resolveDrawResizeCursor(this.drawInteraction.handle);
      return;
    }

    if (point) {
      const hitTarget = this.resolveDrawHitTarget(point, canvas);
      if (hitTarget.kind === 'handle') {
        canvas.style.cursor = this.resolveDrawResizeCursor(hitTarget.handle);
        return;
      }

      if (hitTarget.kind === 'body') {
        canvas.style.cursor = 'grab';
        return;
      }
    }

    canvas.style.cursor = 'crosshair';
  }

  private resolveDrawResizeCursor(handle: DrawResizeHandle): string {
    return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
  }

  private shouldRenderDrawOverlayAtCurrentTime(): boolean {
    const play = this.currentPlay();
    if (!play) {
      return true;
    }

    const currentSec = this.playerCurrentTime();
    return this.resolveStoredPlayAnnotations(play).some((annotation, index) => {
      const window =
        (index === this.currentDrawAnnotationIndex ? this.currentDrawEffectWindow : null) ??
        this.resolveDrawEffectWindowForPlay(play, annotation);
      return !!window && currentSec >= window.startSec && currentSec <= window.endSec;
    });
  }

  private resolveDrawEffectWindowForPlay(
    play: FilmTimelinePlay | null | undefined,
    annotation: TeamFilmReviewPlayAnnotation | null | undefined
  ): { startSec: number; endSec: number } | null {
    if (!play || !annotation) return null;

    const startRaw = Number(annotation.activeFromSec);
    const endRaw = Number(annotation.activeUntilSec);
    const fallbackStart = Number.isFinite(play.startSec) ? play.startSec : 0;
    const fallbackEnd = Math.max(
      fallbackStart + 0.1,
      Number.isFinite(play.endSec) ? play.endSec : fallbackStart + this.drawEffectDurationSec
    );

    let startSec = Number.isFinite(startRaw) ? startRaw : fallbackStart;
    startSec = Math.max(fallbackStart, Math.min(startSec, fallbackEnd - 0.05));

    const defaultEndSec = Math.min(fallbackEnd, startSec + this.drawEffectDurationSec);
    let endSec = Number.isFinite(endRaw) ? endRaw : defaultEndSec;
    endSec = Math.max(startSec + 0.05, Math.min(endSec, fallbackEnd));

    if (endSec <= startSec) return null;
    return { startSec, endSec };
  }

  private resolveDefaultDrawEffectWindow(
    play: FilmTimelinePlay | null,
    anchorSec: number
  ): { startSec: number; endSec: number } {
    const startBound = Number.isFinite(play?.startSec) ? (play?.startSec as number) : 0;
    const endBound = Number.isFinite(play?.endSec)
      ? Math.max(startBound + 0.1, play?.endSec as number)
      : Math.max(startBound + this.drawEffectDurationSec, this.playerDuration());
    const safeAnchor = Number.isFinite(anchorSec) ? anchorSec : startBound;
    const startSec = Math.max(startBound, Math.min(safeAnchor, endBound - 0.05));
    const endSec = Math.max(
      startSec + 0.05,
      Math.min(endBound, startSec + this.drawEffectDurationSec)
    );
    return { startSec, endSec };
  }

  private roundPlaybackSecond(value: number): number {
    return Number(Math.max(0, value).toFixed(3));
  }

  private buildDrawEffectMarkerId(playIndex: number, annotationIndex: number): string {
    return `play-${playIndex}-annotation-${annotationIndex}`;
  }

  private parseDrawEffectMarkerId(
    markerId: string
  ): { playIndex: number; annotationIndex: number } | null {
    const match = /^play-(\d+)-annotation-(\d+)$/.exec(markerId);
    if (!match) return null;

    const playIndex = Number(match[1]);
    const annotationIndex = Number(match[2]);
    if (!Number.isInteger(playIndex) || playIndex < 0) return null;
    if (!Number.isInteger(annotationIndex) || annotationIndex < 0) return null;
    return { playIndex, annotationIndex };
  }

  private resolveStoredPlayAnnotations(
    play: FilmTimelinePlay | null | undefined
  ): readonly TeamFilmReviewPlayAnnotation[] {
    if (!play) return [];
    if (play.annotations?.length) {
      return play.annotations.filter(
        (annotation): annotation is TeamFilmReviewPlayAnnotation => !!annotation
      );
    }

    return play.annotation ? [play.annotation] : [];
  }

  private resolvePrimaryPlayAnnotation(
    play: FilmTimelinePlay | null | undefined
  ): TeamFilmReviewPlayAnnotation | null {
    const annotations = this.resolveStoredPlayAnnotations(play);
    return annotations[annotations.length - 1] ?? null;
  }

  private resolvePrimaryPlayAnnotationIndex(
    play: FilmTimelinePlay | null | undefined
  ): number | null {
    const annotations = this.resolveStoredPlayAnnotations(play);
    return annotations.length ? annotations.length - 1 : null;
  }

  /**
   * Format seconds to MM:SS display format.
   *
   * @param seconds - Raw seconds value
   * @returns Formatted time string (e.g., "01:30")
   */
  protected formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const remainingSeconds = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  }
}
