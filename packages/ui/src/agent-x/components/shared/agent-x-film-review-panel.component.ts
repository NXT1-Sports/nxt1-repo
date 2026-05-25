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
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import {
  getTeamFilmReviewSportTagDefinitions,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewSportTagColumnWidth,
  type TeamFilmReviewSportTagDefinition,
  type TeamFilmReviewTimelineState,
} from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  type AgentXSelectedContext,
  type AgentXSelectedContextAnnotation,
  type AgentXSelectedContextMetadataValue,
} from '@nxt1/core/ai';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import { NxtVideoControlsComponent } from '../../../components/video-controls';
import { VIDEO_CONTROL_TOOLTIP_STYLES } from '../../../components/video-controls/video-control-tooltips.styles';
import { NxtPlatformService } from '../../../services/platform';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AGENT_X_AUTH_TOKEN_FACTORY } from '../../services/agent-x-job.service';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import {
  AgentXVideoUploadService,
  type VideoUploadProgress,
} from '../../services/agent-x-video-upload.service';
import { AgentXService } from '../../services/agent-x.service';

type FilmListReview = {
  id: string;
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
};

type FilmTimelinePlay = TeamFilmReviewPlaySegment;

type FilmReviewDragSource = FilmListReview & {
  readonly teamId?: string;
  readonly timelineState?: TeamFilmReviewTimelineState;
  readonly timeline?: readonly FilmTimelinePlay[];
};

type FilmReviewPlaylistFolder = {
  readonly id: string;
  readonly name: string;
  readonly reviews: readonly FilmListReview[];
  readonly isUnassigned?: boolean;
};

type LocalFilmReviewPlaylistFolder = {
  readonly id: string;
  readonly name: string;
};

const FILM_REVIEW_UNASSIGNED_PLAYLIST_ID = 'unassigned-film';
const FILM_REVIEW_PLAYLIST_DRAG_MIME = 'application/x-nxt1-film-review-id';
const FILM_REVIEW_TIMELINE_DRAG_MIME = 'application/x-nxt1-film-timeline-index';
const FILM_REVIEW_TIMELINE_COLUMN_DRAG_MIME = 'application/x-nxt1-film-timeline-column-id';
const FILM_REVIEW_STARTER_PLAYLIST_NAMES = ['Self Scout Playlist', 'Opponent Play list'] as const;
const FILM_REVIEW_PLAYLIST_STORAGE_PREFIX = 'agent-x-film-playlists';
const FILM_REVIEW_COLUMN_ORDER_STORAGE_PREFIX = 'agent-x-film-timeline-columns';

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

type TimelineColumnDropIndicator = {
  readonly columnId: string;
  readonly placement: TimelineColumnDropPlacement;
};

@Component({
  selector: 'nxt1-agent-x-film-review-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtIconComponent,
    NxtStateViewComponent,
    NxtVideoControlsComponent,
    AgentXContextDragDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="film-review-panel"
      [class.film-review-panel--video-view]="isVideoView()"
      [attr.data-testid]="testIds.PANEL_CONTAINER"
    >
      <input
        #videoUploadInput
        type="file"
        class="film-library-file-input"
        [accept]="acceptedFilmReviewUploadTypes"
        [attr.data-testid]="testIds.UPLOAD_INPUT"
        multiple
        (change)="onVideoFilesSelected($event)"
      />
      <input
        #breakdownUploadInput
        type="file"
        class="film-library-file-input"
        [accept]="acceptedBreakdownTypes"
        (change)="onBreakdownFileSelected($event)"
      />

      @if (!teamId?.trim()) {
        <div class="film-state" [attr.data-testid]="testIds.EMPTY_STATE">
          <h3>Film Review requires a team context</h3>
          <p>Connect a team in Agent X to load game film and AI breakdowns.</p>
        </div>
      } @else if (loading()) {
        <div class="film-state film-state--loading" [attr.data-testid]="testIds.LOADING_SKELETON">
          <div class="film-loading" aria-hidden="true">
            <div class="film-loading__card film-loading__card--library"></div>
            <div class="film-loading__card film-loading__card--library"></div>
            <div class="film-loading__card film-loading__card--viewer"></div>
            <div class="film-loading__card film-loading__card--toolbar"></div>
          </div>
        </div>
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
      } @else if (isEmpty()) {
        <div
          class="film-library film-library--empty"
          [class.film-library--drag-active]="isLibraryDragActive()"
          [attr.data-testid]="testIds.EMPTY_STATE"
          (dragenter)="onLibraryDragEnter($event)"
          (dragover)="onLibraryDragOver($event)"
          (dragleave)="onLibraryDragLeave($event)"
          (drop)="onLibraryDrop($event)"
        >
          <div class="playbooks-list-header">
            <div>
              <h3>Film Review</h3>
              <p>No film sessions yet. Upload video to start film review.</p>
            </div>
            <div class="playbooks-list-header-actions">
              <button
                type="button"
                class="btn-new"
                [disabled]="isUploadingLibraryVideo()"
                [attr.data-testid]="testIds.UPLOAD_BUTTON"
                (click)="onChooseVideosClick()"
              >
                <nxt1-icon name="plus" [size]="14"></nxt1-icon>
                New
              </button>
            </div>
          </div>

          @if (isUploadingLibraryVideo()) {
            <div
              class="film-library-upload-status film-library-upload-status--empty"
              aria-live="polite"
            >
              <div class="film-library-upload-status__row">
                <span class="film-library-upload-status__label">
                  Uploading {{ libraryUploadCurrentFile() }} of
                  {{ libraryUploadTotalFiles() }} files...
                </span>
                <span class="film-library-upload-status__pct"
                  >{{ libraryVideoUploadPercent() ?? 0 }}%</span
                >
              </div>
              <div class="film-library-upload-status__track">
                <div
                  class="film-library-upload-status__fill"
                  [style.width.%]="libraryVideoUploadPercent() ?? 0"
                ></div>
              </div>
            </div>
          } @else {
            <div class="playbooks-empty-state">
              <nxt1-state-view
                variant="empty"
                icon="videocam"
                title="No Film Sessions"
                message="Import your game video directly. You can add a breakdown sheet after upload to auto-tag the timeline."
              />

              <div class="playbooks-empty-actions">
                <button
                  type="button"
                  class="btn-empty-action btn-empty-action--primary"
                  [disabled]="isUploadingLibraryVideo()"
                  [attr.data-testid]="testIds.UPLOAD_BUTTON"
                  (click)="onChooseVideosClick()"
                >
                  <svg
                    class="btn-empty-action__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span>{{ isUploadingLibraryVideo() ? 'Uploading...' : 'Import Video' }}</span>
                </button>
              </div>
            </div>
          }

          @if (libraryUploadError(); as uploadError) {
            <p class="film-error-message film-error-message--empty">{{ uploadError }}</p>
          }
        </div>
      } @else {
        @if (!isVideoView()) {
          <div
            class="film-library"
            [class.film-library--drag-active]="isLibraryDragActive()"
            (dragenter)="onLibraryDragEnter($event)"
            (dragover)="onLibraryDragOver($event)"
            (dragleave)="onLibraryDragLeave($event)"
            (drop)="onLibraryDrop($event)"
          >
            <header class="film-library-header">
              <div class="film-library-header__copy">
                <h3 class="film-library-title">Video Library</h3>
              </div>
              <div class="film-library-header__actions">
                <button
                  type="button"
                  class="film-library-create-btn"
                  [attr.aria-expanded]="isCreatingPlaylistFolder()"
                  [attr.data-testid]="testIds.PLAYLIST_CREATE_BUTTON"
                  (click)="onPlaylistCreateToggle()"
                >
                  <nxt1-icon name="plus" [size]="14"></nxt1-icon>
                  Playlist
                </button>
                <button
                  type="button"
                  class="film-library-upload-btn"
                  [disabled]="isUploadingLibraryVideo()"
                  [attr.data-testid]="testIds.UPLOAD_BUTTON"
                  (click)="onChooseVideosClick()"
                >
                  @if (isUploadingLibraryVideo()) {
                    Uploading...
                  } @else {
                    Upload Film
                  }
                </button>
              </div>
            </header>

            @if (isCreatingPlaylistFolder()) {
              <div class="film-playlist-create" role="group" aria-label="Create playlist folder">
                <input
                  type="text"
                  class="film-playlist-create__input"
                  placeholder="Playlist folder name"
                  maxlength="80"
                  [value]="playlistFolderNameDraft()"
                  [attr.data-testid]="testIds.PLAYLIST_CREATE_INPUT"
                  (input)="onPlaylistFolderNameInput($any($event.target).value)"
                  (keydown.enter)="onPlaylistCreateConfirm($event)"
                  (keydown.escape)="onPlaylistCreateCancel($event)"
                />
                <button
                  type="button"
                  class="film-playlist-create__btn film-playlist-create__btn--primary"
                  [attr.data-testid]="testIds.PLAYLIST_CREATE_SAVE"
                  (click)="onPlaylistCreateConfirm($event)"
                >
                  Create
                </button>
                <button
                  type="button"
                  class="film-playlist-create__btn"
                  (click)="onPlaylistCreateCancel($event)"
                >
                  Cancel
                </button>
              </div>
            }

            <div
              class="film-library-dropzone"
              [class.film-library-dropzone--active]="isLibraryDragActive()"
              [attr.data-testid]="testIds.DROPZONE"
            >
              <span class="film-library-dropzone__title">Drag videos here</span>
              <span class="film-library-dropzone__meta">or click Upload Film</span>
            </div>

            @if (isUploadingLibraryVideo()) {
              <div class="film-library-upload-status" aria-live="polite">
                <div class="film-library-upload-status__row">
                  <span class="film-library-upload-status__label">
                    Uploading {{ libraryUploadCurrentFile() }} of
                    {{ libraryUploadTotalFiles() }} files...
                  </span>
                  <span class="film-library-upload-status__pct"
                    >{{ libraryVideoUploadPercent() ?? 0 }}%</span
                  >
                </div>
                <div class="film-library-upload-status__track">
                  <div
                    class="film-library-upload-status__fill"
                    [style.width.%]="libraryVideoUploadPercent() ?? 0"
                  ></div>
                </div>
              </div>
            }

            @if (libraryUploadError(); as uploadError) {
              <p class="film-error-message">{{ uploadError }}</p>
            }

            <div class="film-library-list" [attr.data-testid]="testIds.LIST_CONTAINER">
              @for (folder of playlistFolders(); track folder.id) {
                <section
                  class="film-playlist-folder"
                  [class.film-playlist-folder--menu-open]="isPlaylistFolderMenuOpen(folder.id)"
                  [class.film-playlist-folder--drop-target]="
                    activePlaylistDropTargetId() === folder.id
                  "
                  [attr.data-testid]="
                    folder.isUnassigned
                      ? testIds.PLAYLIST_UNASSIGNED_FOLDER
                      : testIds.PLAYLIST_FOLDER
                  "
                  (dragover)="onPlaylistFolderDragOver(folder.id, $event)"
                  (dragleave)="onPlaylistFolderDragLeave(folder.id, $event)"
                  (drop)="onPlaylistFolderDrop(folder, $event)"
                >
                  <div class="film-playlist-folder__header">
                    <button
                      type="button"
                      class="film-playlist-folder__toggle"
                      [attr.aria-expanded]="isPlaylistFolderExpanded(folder.id)"
                      [attr.data-testid]="testIds.PLAYLIST_FOLDER_TOGGLE"
                      (click)="togglePlaylistFolder(folder.id, $event)"
                    >
                      <span class="film-playlist-folder__chevron" aria-hidden="true">
                        @if (isPlaylistFolderExpanded(folder.id)) {
                          <nxt1-icon name="chevronDown" [size]="16"></nxt1-icon>
                        } @else {
                          <nxt1-icon name="chevronRight" [size]="16"></nxt1-icon>
                        }
                      </span>
                      <nxt1-icon name="folder" [size]="16" class="film-playlist-folder__icon" />
                      <span class="film-playlist-folder__name">{{ folder.name }}</span>
                      <span class="film-playlist-folder__count">{{ folder.reviews.length }}</span>
                    </button>

                    <div class="film-playlist-folder__menu-anchor">
                      <button
                        type="button"
                        class="film-list-item__menu-btn film-playlist-folder__menu-btn"
                        aria-label="Playlist options"
                        [attr.aria-expanded]="isPlaylistFolderMenuOpen(folder.id)"
                        aria-haspopup="menu"
                        [attr.data-testid]="testIds.PLAYLIST_FOLDER_MENU"
                        (click)="onOpenPlaylistFolderMenu($event, folder)"
                      >
                        <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                      </button>

                      @if (isPlaylistFolderMenuOpen(folder.id)) {
                        <div
                          class="film-list-item__menu-backdrop"
                          (click)="onMenuBackdropTap()"
                        ></div>
                        <div
                          class="film-list-item__menu film-playlist-folder__menu"
                          role="menu"
                          aria-label="Playlist options"
                          (click)="$event.stopPropagation()"
                        >
                          @if (isEditingPlaylistFolder(folder.id)) {
                            <div class="film-list-item__menu-rename">
                              <label
                                class="film-list-item__menu-label"
                                for="film-playlist-folder-rename-{{ folder.id }}"
                              >
                                Rename playlist
                              </label>
                              <input
                                id="film-playlist-folder-rename-{{ folder.id }}"
                                type="text"
                                class="film-list-item__menu-input"
                                maxlength="80"
                                [value]="playlistFolderRenameDraft()"
                                (input)="onPlaylistFolderRenameInput($any($event.target).value)"
                                (keydown.enter)="onPlaylistFolderRenameConfirm(folder, $event)"
                                (keydown.escape)="onPlaylistFolderRenameCancel($event)"
                              />
                              <div class="film-list-item__menu-actions">
                                <button
                                  type="button"
                                  class="film-list-item__menu-action film-list-item__menu-action--primary"
                                  (click)="onPlaylistFolderRenameConfirm(folder, $event)"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  class="film-list-item__menu-action"
                                  (click)="onPlaylistFolderRenameCancel($event)"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          } @else if (isDeletingPlaylistFolder(folder.id)) {
                            <div class="film-list-item__menu-confirm">
                              <p class="film-list-item__menu-confirm-text">
                                @if (folder.reviews.length) {
                                  Delete this playlist? Film will move to Unassigned Film.
                                } @else {
                                  Delete this empty playlist?
                                }
                              </p>
                              <div class="film-list-item__menu-actions">
                                <button
                                  type="button"
                                  class="film-list-item__menu-action film-list-item__menu-action--danger"
                                  (click)="onPlaylistFolderDeleteConfirm(folder, $event)"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  class="film-list-item__menu-action"
                                  (click)="onPlaylistFolderDeleteCancel($event)"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          } @else {
                            <button
                              type="button"
                              class="film-list-item__menu-action"
                              role="menuitem"
                              (click)="onPlaylistFolderRenameStart(folder, $event)"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              class="film-list-item__menu-action film-list-item__menu-action--danger"
                              role="menuitem"
                              (click)="onPlaylistFolderDeleteStart(folder, $event)"
                            >
                              Delete playlist
                            </button>
                          }
                        </div>
                      }
                    </div>
                  </div>

                  @if (isPlaylistFolderExpanded(folder.id)) {
                    <div
                      class="film-playlist-folder__dropzone"
                      [attr.data-testid]="testIds.PLAYLIST_FOLDER_DROPZONE"
                    >
                      @if (folder.reviews.length === 0) {
                        <div class="film-playlist-folder__empty">Drop film here</div>
                      }

                      @for (review of folder.reviews; track review.id) {
                        <div
                          class="film-list-item-row"
                          [class.film-list-item-row--menu-open]="isMenuOpen(review.id)"
                        >
                          <button
                            type="button"
                            class="film-list-item"
                            [class.film-list-item--active]="review.id === selectedId()"
                            [nxtAgentXContextDrag]="buildFilmReviewDragContext(review)"
                            [attr.data-testid]="testIds.LIST_ITEM"
                            (click)="onSelectReview(review.id)"
                            (dragstart)="onReviewPlaylistDragStart(review, $event)"
                            (dragend)="onReviewPlaylistDragEnd()"
                          >
                            <div class="film-list-item__thumbnail">
                              @if (showLibraryThumbnailLoader(review)) {
                                <div class="film-list-item__thumbnail-loader" aria-hidden="true">
                                  <span class="film-list-item__thumbnail-shimmer"></span>
                                </div>
                              }
                              @if (getVideoThumbnailUrl(review); as thumbnailUrl) {
                                <img
                                  [src]="thumbnailUrl"
                                  [alt]="getReviewDisplayTitle(review)"
                                  class="film-list-item__thumb-image"
                                />
                              } @else {
                                <video
                                  [src]="review.videoUrl"
                                  class="film-list-item__video"
                                  [class.film-list-item__video--ready]="
                                    isLibraryThumbnailReady(review.id)
                                  "
                                  muted
                                  playsinline
                                  autoplay
                                  preload="auto"
                                  (loadeddata)="onLibraryThumbnailLoaded(review.id, $event)"
                                ></video>
                              }
                            </div>
                            <span class="film-list-item__content">
                              <span class="film-list-item__title">{{
                                getReviewDisplayTitle(review)
                              }}</span>
                              <span class="film-list-item__meta">{{ getReviewMeta(review) }}</span>
                            </span>
                          </button>

                          <button
                            type="button"
                            class="film-list-item__menu-btn"
                            aria-label="Video options"
                            [attr.aria-expanded]="isMenuOpen(review.id)"
                            aria-haspopup="menu"
                            (click)="onOpenReviewMenu($event, review)"
                            [attr.data-testid]="testIds.LIST_ITEM_MENU"
                          >
                            <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                          </button>

                          @if (isMenuOpen(review.id)) {
                            <div
                              class="film-list-item__menu-backdrop"
                              (click)="onMenuBackdropTap()"
                            ></div>
                            <div
                              class="film-list-item__menu"
                              role="menu"
                              aria-label="Video options"
                              (click)="$event.stopPropagation()"
                            >
                              @if (isRenaming(review.id)) {
                                <div class="film-list-item__menu-rename">
                                  <label
                                    class="film-list-item__menu-label"
                                    for="film-rename-{{ review.id }}"
                                  >
                                    Rename video
                                  </label>
                                  <input
                                    id="film-rename-{{ review.id }}"
                                    type="text"
                                    class="film-list-item__menu-input"
                                    maxlength="120"
                                    [value]="renameDraft()"
                                    (input)="onRenameInput($any($event.target).value)"
                                    (keydown.enter)="onRenameConfirm(review, $event)"
                                    (keydown.escape)="onRenameCancel($event)"
                                  />
                                  <div class="film-list-item__menu-actions">
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action film-list-item__menu-action--primary"
                                      (click)="onRenameConfirm(review, $event)"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      (click)="onRenameCancel($event)"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              } @else if (isDeleteConfirming(review.id)) {
                                <div class="film-list-item__menu-confirm">
                                  <p class="film-list-item__menu-confirm-text">
                                    Delete this video?
                                  </p>
                                  <div class="film-list-item__menu-actions">
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action film-list-item__menu-action--danger"
                                      (click)="onDeleteConfirm(review, $event)"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      type="button"
                                      class="film-list-item__menu-action"
                                      (click)="onDeleteCancel($event)"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              } @else {
                                <button
                                  type="button"
                                  class="film-list-item__menu-action"
                                  role="menuitem"
                                  (click)="onRenameStart(review, $event)"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  class="film-list-item__menu-action"
                                  role="menuitem"
                                  (click)="onDeleteStart(review, $event)"
                                >
                                  Delete
                                </button>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </section>
              }
            </div>
          </div>
        } @else {
          @if (selectedReview(); as review) {
            <article class="film-detail">
              <div class="film-layout">
                <div
                  class="film-player-wrapper"
                  #playerContainer
                  [nxtAgentXContextDrag]="buildFilmReviewDragContext(review)"
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

                    <canvas
                      #drawCanvas
                      class="film-draw-canvas"
                      [class.film-draw-canvas--active]="drawModeEnabled()"
                      (pointerdown)="onDrawPointerDown($event)"
                      (pointermove)="onDrawPointerMove($event)"
                      (pointerup)="onDrawPointerUp($event)"
                      (pointerleave)="onDrawPointerUp($event)"
                      (pointercancel)="onDrawPointerUp($event)"
                      aria-label="Coach drawing overlay"
                    ></canvas>

                    <div class="film-top-tools">
                      <div
                        class="film-top-tools__left film-controls__cluster"
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

                      <div
                        class="film-top-tools__right film-draw-tools film-controls__cluster"
                        role="group"
                        aria-label="Drawing tools"
                      >
                        <button
                          type="button"
                          class="film-icon-btn video-controls__tooltip-host"
                          [class.film-icon-btn--primary]="drawModeEnabled()"
                          (click)="toggleDrawMode()"
                          [attr.title]="
                            drawModeEnabled() ? 'Turn off draw mode' : 'Turn on draw mode'
                          "
                          [attr.data-tooltip]="
                            drawModeEnabled() ? 'Turn off draw mode' : 'Turn on draw mode'
                          "
                          [attr.aria-label]="
                            drawModeEnabled() ? 'Disable draw mode' : 'Enable draw mode'
                          "
                        >
                          <nxt1-icon name="pencil" [size]="11"></nxt1-icon>
                        </button>
                        @if (drawModeEnabled()) {
                          <button
                            type="button"
                            class="film-icon-btn film-top-tool-btn film-top-tool-btn--danger video-controls__tooltip-host"
                            [disabled]="!hasDrawing()"
                            (click)="clearDrawOverlay()"
                            title="Clear drawing overlay"
                            data-tooltip="Clear drawing overlay"
                            aria-label="Clear drawing"
                          >
                            <nxt1-icon name="trash" [size]="11" />
                          </button>
                        }
                      </div>
                    </div>

                    <div class="film-controls-overlay" aria-label="Coach video controls">
                      <nxt1-video-controls
                        [isPlaying]="isPlaying()"
                        [currentTime]="scopedPlayerCurrentTime()"
                        [duration]="scopedPlayerDuration()"
                        [playbackRate]="playbackRate()"
                        [playbackRates]="playbackRates"
                        [showSpeedControls]="true"
                        [showFullscreen]="true"
                        [showOpenInNewWindow]="!platform.isNative()"
                        [showPlayNavigation]="true"
                        [showAdvancedPlaybackControls]="true"
                        [frameStepSeconds]="filmFrameStepSeconds"
                        [disablePreviousNav]="currentPlayIndex() <= 0"
                        [disableNextNav]="currentPlayIndex() >= (review.timeline?.length ?? 0) - 1"
                        (previousNav)="goToPreviousPlay()"
                        (seekRelative)="seekRelative($event)"
                        (playPause)="togglePlayPause()"
                        (nextNav)="goToNextPlay()"
                        (seekStart)="onSeekPointerDown()"
                        (seekEnd)="onSeekPointerUp()"
                        (seekChange)="onScopedSeekTime($event)"
                        (playbackRateChange)="setPlaybackRate($event)"
                        (openInNewWindow)="openVideoInNewWindow()"
                        (fullscreenToggle)="toggleFullscreen()"
                      />
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

                @if (review.timelineState === 'ready' && review.timeline?.length) {
                  <div class="film-playbook">
                    <div class="film-playbook-toolbar">
                      <button
                        type="button"
                        class="film-playbook-nav-btn"
                        [disabled]="currentPlayIndex() <= 0"
                        [attr.data-testid]="testIds.TIMELINE_PLAY_NAV_PREV"
                        (click)="goToPreviousPlay()"
                      >
                        ← Prev
                      </button>

                      <div class="film-playbook-current" aria-live="polite">
                        <span class="film-playbook-summary">
                          Play {{ currentPlayIndex() + 1 }} of {{ review.timeline?.length ?? 0 }}
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
                        [disabled]="currentPlayIndex() >= (review.timeline?.length ?? 0) - 1"
                        [attr.data-testid]="testIds.TIMELINE_PLAY_NAV_NEXT"
                        (click)="goToNextPlay()"
                      >
                        Next →
                      </button>
                    </div>

                    <div
                      class="film-playbook-table"
                      role="table"
                      aria-label="Tagged plays"
                      [style.--film-playbook-grid-columns]="currentTimelineGridTemplate()"
                    >
                      <div class="film-playbook-scroll">
                        <div class="film-playbook-head" role="row">
                          <span class="film-playbook-head__reorder" aria-label="Move"></span>
                          @for (column of currentTimelineColumns(); track column.id) {
                            <button
                              type="button"
                              class="film-playbook-column-header"
                              draggable="true"
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
                              (dragstart)="onTimelineColumnDragStart($event, column.id)"
                              (dragend)="onTimelineColumnDragEnd($event)"
                              (dragover)="onTimelineColumnDragOver($event, column.id)"
                              (dragleave)="onTimelineColumnDragLeave($event, column.id)"
                              (drop)="onTimelineColumnDrop($event, column.id)"
                            >
                              <span>{{ column.label }}</span>
                            </button>
                          }
                        </div>

                        <div class="film-playbook-body">
                          @for (play of review.timeline; track play.id; let idx = $index) {
                            <div
                              class="film-playbook-row"
                              role="row"
                              [class.film-playbook-row--active]="idx === currentPlayIndex()"
                              [class.film-playbook-row--editing]="isEditingTimelinePlay(play, idx)"
                              [class.film-playbook-row--dragging]="
                                idx === draggingTimelinePlayIndex()
                              "
                              [class.film-playbook-row--drop-before]="
                                isTimelinePlayDropIndicator(idx, 'before')
                              "
                              [class.film-playbook-row--drop-after]="
                                isTimelinePlayDropIndicator(idx, 'after')
                              "
                              [nxtAgentXContextDrag]="
                                isEditingTimelinePlay(play, idx)
                                  ? null
                                  : buildFilmPlayDragContext(review, play, idx)
                              "
                              [nxtAgentXContextDragDisabled]="isTimelinePlayReorderActive()"
                              [attr.tabindex]="isEditingTimelinePlay(play, idx) ? -1 : 0"
                              (click)="onSelectTimelinePlay(play, idx)"
                              (keydown.enter)="onTimelinePlayRowKeydown($event, play, idx)"
                              (keydown.space)="onTimelinePlayRowKeydown($event, play, idx)"
                              (dragover)="onTimelinePlayDragOver($event, idx)"
                              (dragleave)="onTimelinePlayDragLeave($event, idx)"
                              (drop)="onTimelinePlayDrop($event, review.id, idx)"
                              [attr.aria-label]="'Jump to ' + play.label"
                            >
                              <span class="film-playbook-cell film-playbook-cell--reorder">
                                <button
                                  type="button"
                                  class="film-playbook-reorder-handle"
                                  draggable="true"
                                  [disabled]="saving() || isEditingTimelinePlay(play, idx)"
                                  [attr.data-testid]="testIds.TIMELINE_PLAY_REORDER_HANDLE"
                                  [attr.aria-label]="'Move ' + play.label"
                                  (click)="$event.stopPropagation()"
                                  (keydown)="$event.stopPropagation()"
                                  (dragstart)="onTimelinePlayDragStart($event, idx)"
                                  (dragend)="onTimelinePlayDragEnd($event)"
                                >
                                  <nxt1-icon name="menu" [size]="14"></nxt1-icon>
                                </button>
                              </span>
                              @for (column of currentTimelineColumns(); track column.id) {
                                <span
                                  class="film-playbook-cell film-playbook-cell--editable"
                                  [class.film-playbook-cell--number]="column.kind === 'number'"
                                  [class.film-playbook-cell--label]="column.kind === 'label'"
                                  [attr.data-testid]="getTimelineColumnTestId(column)"
                                  (dblclick)="
                                    onStartTimelinePlayFieldEdit(play, idx, column.fieldKey, $event)
                                  "
                                  (touchend)="
                                    onTimelinePlayFieldTouchEnd(play, idx, column.fieldKey, $event)
                                  "
                                >
                                  @if (isEditingTimelinePlayField(play, idx, column.fieldKey)) {
                                    <input
                                      class="film-playbook-edit__input film-playbook-edit__input--cell"
                                      type="text"
                                      autofocus
                                      [value]="timelinePlayEditDraft()"
                                      [disabled]="saving()"
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
                                          play,
                                          idx,
                                          column.fieldKey,
                                          $event,
                                          column.tagDefinition
                                        )
                                      "
                                      (keydown.enter)="
                                        onSaveTimelinePlayFieldEdit(
                                          review.id,
                                          play,
                                          idx,
                                          column.fieldKey,
                                          $event,
                                          column.tagDefinition
                                        )
                                      "
                                      (keydown.escape)="onCancelTimelinePlayEdit($event)"
                                    />
                                  } @else if (column.kind === 'label') {
                                    <span class="film-playbook-label-text">
                                      {{ getTimelineColumnDisplayValue(play, column) }}
                                    </span>
                                  } @else {
                                    {{ getTimelineColumnDisplayValue(play, column) }}
                                  }
                                </span>
                              }
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                } @else {
                  <div class="film-empty-timeline-actions">
                    <button
                      type="button"
                      class="film-generate-btn"
                      [class.film-generate-btn--loading]="review.timelineState === 'generating'"
                      [disabled]="
                        saving() || isImportingBreakdown() || review.timelineState === 'generating'
                      "
                      [attr.aria-busy]="review.timelineState === 'generating'"
                      [attr.data-testid]="testIds.GENERATE_TIMELINE_BUTTON"
                      (click)="onGenerateTimeline(review.id)"
                    >
                      @if (review.timelineState === 'generating') {
                        <span class="film-generate-btn__content">
                          <span
                            class="film-generate-btn__spinner"
                            [attr.data-testid]="testIds.TIMELINE_GENERATING_SPINNER"
                            aria-hidden="true"
                          ></span>
                          <span class="film-generate-btn__text">Generating Timeline</span>
                        </span>
                        <span class="film-generate-btn__hint"
                          >Analyzing film and tagging plays...</span
                        >
                      } @else if (review.timelineState === 'error') {
                        <span class="film-generate-btn__content">
                          <span class="film-generate-btn__text">Retry Timeline</span>
                        </span>
                      } @else {
                        <span class="film-generate-btn__content">
                          <span class="film-generate-btn__text">Generate Timeline</span>
                        </span>
                      }
                    </button>

                    <button
                      type="button"
                      class="film-generate-btn film-generate-btn--secondary"
                      [disabled]="
                        saving() || isImportingBreakdown() || review.timelineState === 'generating'
                      "
                      [attr.data-testid]="testIds.BREAKDOWN_IMPORT_BUTTON"
                      (click)="onChooseBreakdownClick()"
                    >
                      <span class="film-generate-btn__content">
                        @if (isImportingBreakdown()) {
                          <span class="film-generate-btn__text">Importing Breakdown...</span>
                        } @else {
                          <span class="film-generate-btn__text">Import Breakdown</span>
                        }
                      </span>
                    </button>
                  </div>

                  <p class="film-empty-timeline-hint">
                    Have a breakdown sheet? Import it to populate the timeline right away.
                  </p>

                  @if (review.timelineState === 'error') {
                    <p class="film-error-message">
                      {{ review.timelineError ?? 'Failed to generate timeline' }}
                    </p>
                  }

                  @if (libraryUploadError(); as uploadError) {
                    <p class="film-error-message">{{ uploadError }}</p>
                  }
                }
              </div>
            </article>
          } @else {
            <div class="film-state" [attr.data-testid]="testIds.EMPTY_STATE">
              <h3>No film selected</h3>
              <p>Pick a video from the library to begin film review.</p>
            </div>
          }
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
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: 12px;
        background: transparent;
      }

      .film-review-panel--video-view {
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

      .film-library-header__copy {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .film-library-header h3 {
        margin: 0;
      }

      .film-library-upload-btn {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 999px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 12px;
        font-weight: 700;
        padding: 8px 12px;
        cursor: pointer;
        transition: all 0.18s ease;
      }

      .film-library-upload-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-primary);
      }

      .film-library-upload-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
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

      .film-library-upload-status__label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary);
      }

      .film-library-upload-status__pct {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .film-library-upload-status__track {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--nxt1-color-border-subtle);
      }

      .film-library-upload-status__fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        transition: width 0.16s ease;
      }

      .film-library-title {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--nxt1-color-text-primary);
      }

      .film-library-list {
        display: grid;
        gap: 8px;
        padding-bottom: 160px;
      }

      .film-library-header__actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .film-library-create-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 32px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 999px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 12px;
        font-weight: 700;
        padding: 0 11px;
        cursor: pointer;
        transition: all 0.18s ease;
      }

      .film-library-create-btn:hover,
      .film-library-create-btn[aria-expanded='true'] {
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-primary);
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

      .film-playlist-folder__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 32px;
        align-items: center;
        gap: 4px;
        width: 100%;
        min-height: 38px;
        padding: 0 6px 0 0;
        position: relative;
        z-index: 6;
        overflow: visible;
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
        aspect-ratio: 16/8;
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
        min-width: 0;
        width: 100%;
        max-width: 100%;
        height: auto;
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

      .film-icon-btn.film-top-tool-btn--danger {
        color: var(--nxt1-color-danger);
      }

      .film-icon-btn.film-top-tool-btn--danger:hover:not(:disabled) {
        color: var(--nxt1-color-danger);
      }

      .film-draw-canvas {
        position: absolute;
        inset: 0;
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

      .film-state--loading {
        border: 0;
        border-radius: 0;
        padding: 0;
        text-align: left;
        background: transparent;
      }

      .film-loading {
        display: grid;
        gap: 10px;
      }

      .film-loading__card {
        border-radius: var(--nxt1-radius-md, 12px);
        min-height: 88px;
        background: linear-gradient(
          100deg,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 20%,
          var(--agent-surface-hover, rgba(0, 0, 0, 0.05)) 45%,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 70%
        );
        background-size: 200% 100%;
        animation: film-loading-pulse 1.1s ease-in-out infinite;
      }

      .film-loading__card--viewer {
        min-height: 180px;
      }

      .film-loading__card--toolbar {
        min-height: 56px;
      }

      @keyframes film-loading-pulse {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .film-loading__card {
          animation: none;
        }
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
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        gap: 10px;
      }

      .film-empty-timeline-actions .film-generate-btn {
        flex: 1 1 260px;
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
        overflow: hidden;
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
        overflow-y: hidden;
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

      .film-playbook-cell--reorder {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
      }

      .film-playbook-reorder-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--nxt1-color-text-tertiary);
        cursor: grab;
        touch-action: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .film-playbook-reorder-handle:hover:not(:disabled),
      .film-playbook-reorder-handle:focus-visible {
        background: var(--nxt1-color-surface-100);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-reorder-handle:active:not(:disabled) {
        cursor: grabbing;
      }

      .film-playbook-reorder-handle:disabled {
        opacity: 0.42;
        cursor: not-allowed;
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

        .film-library-header__actions {
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

        .film-library-create-btn,
        .film-library-upload-btn {
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
    VIDEO_CONTROL_TOOLTIP_STYLES,
    `
      .film-list-item-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 4px;
        z-index: 1;
      }
      .film-list-item-row--menu-open {
        z-index: 80;
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
        z-index: 100;
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
  private readonly service = inject(AgentXFilmReviewService);
  private readonly agentXService = inject(AgentXService);
  protected readonly platform = inject(NxtPlatformService);
  private readonly toast = inject(NxtToastService);
  private readonly uploadService = inject(AgentXVideoUploadService);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly sanitizer = inject(DomSanitizer);
  private readonly safeIframeUrlCache = new Map<string, SafeResourceUrl>();
  private hls: Hls | null = null;
  private hlsConstructor: typeof Hls | null = null;
  private hlsLoadPromise: Promise<typeof Hls | null> | null = null;
  private nativeVideoSourceUrl: string | null = null;
  private videoSourceSyncToken = 0;
  private rafId: number | null = null;
  private lastSignalUpdateMs = 0;
  private isScrubbing = false;
  private wasPlayingBeforeSeek = false;

  private isDrawStrokeInProgress = false;
  private activeStroke: Array<{ x: number; y: number }> = [];
  private drawStrokes: Array<Array<{ x: number; y: number }>> = [];
  private readonly maxContextAnnotationPoints = 80;
  private readonly maxPersistedAnnotationPoints = 600;
  private lastTimelineFieldTouch: { key: string; atMs: number } | null = null;
  private playAnnotationPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private playAnnotationPersistInFlight: Promise<void> | null = null;
  private playAnnotationPersistQueued = false;

  @Input() teamId: string | null = null;
  @Input() sport = '';

  private filmPlayer?: ElementRef<HTMLVideoElement>;

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

  protected readonly testIds = TEST_IDS.FILM_REVIEW;
  protected readonly reviews = this.service.reviews;
  protected readonly selectedId = this.service.selectedId;
  protected readonly selectedReview = this.service.selectedReview;
  protected readonly loading = this.service.loading;
  protected readonly saving = this.service.saving;
  protected readonly error = this.service.error;
  protected readonly isEmpty = this.service.isEmpty;
  protected readonly inlinePlayOverlayCollapseIconPath = 'M15 6L9 12L15 18';
  protected readonly inlinePlayOverlayExpandIconPath = 'M9 6L15 12L9 18';
  protected readonly filmFrameStepSeconds = 1 / 30;
  protected readonly isVideoView = signal(false);
  protected readonly isPlaying = signal(false);
  protected readonly playerCurrentTime = signal(0);
  protected readonly playerDuration = signal(0);
  protected readonly playbackRate = signal(1);
  protected readonly cloudflareIframeLoading = signal(false);
  protected readonly cloudflareNativePlaybackFailed = signal(false);
  protected readonly isInlinePlayOverlayExpanded = signal(true);
  private readonly cloudflareStartTimeSec = signal(0);
  private readonly cloudflareAutoplayRequested = signal(false);
  protected readonly isSeekDragLockActive = signal(false);
  protected readonly drawModeEnabled = signal(false);
  protected readonly hasDrawing = signal(false);
  protected readonly openMenuReviewId = signal<string | null>(null);
  protected readonly openPlaylistFolderMenuId = signal<string | null>(null);
  protected readonly isCreatingPlaylistFolder = signal(false);
  protected readonly playlistFolderNameDraft = signal('');
  protected readonly editingPlaylistFolderId = signal<string | null>(null);
  protected readonly deletePlaylistFolderConfirmId = signal<string | null>(null);
  protected readonly playlistFolderRenameDraft = signal('');
  protected readonly localPlaylistFolders = signal<readonly LocalFilmReviewPlaylistFolder[]>([]);
  protected readonly collapsedPlaylistFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly draggingReviewId = signal<string | null>(null);
  protected readonly activePlaylistDropTargetId = signal<string | null>(null);
  protected readonly renamingReviewId = signal<string | null>(null);
  protected readonly playlistEditingReviewId = signal<string | null>(null);
  protected readonly deleteConfirmReviewId = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly playlistDraft = signal('');
  protected readonly draggingTimelinePlayIndex = signal<number | null>(null);
  protected readonly timelinePlayDropIndicator = signal<TimelinePlayDropIndicator | null>(null);
  protected readonly timelineColumnOrder = signal<readonly string[]>([]);
  protected readonly draggingTimelineColumnId = signal<string | null>(null);
  protected readonly timelineColumnDropIndicator = signal<TimelineColumnDropIndicator | null>(null);
  protected readonly editingTimelinePlayKey = signal<string | null>(null);
  protected readonly timelinePlayEditDraft = signal('');
  protected readonly generatedVideoThumbnails = signal<Record<string, string>>({});
  protected readonly libraryThumbnailReady = signal<Record<string, boolean>>({});
  protected readonly isLibraryDragActive = signal(false);
  protected readonly isUploadingLibraryVideo = signal(false);
  protected readonly isImportingBreakdown = signal(false);
  protected readonly libraryVideoUploadPercent = signal<number | null>(null);
  protected readonly libraryUploadCurrentFile = signal(0);
  protected readonly libraryUploadTotalFiles = signal(0);
  protected readonly libraryUploadError = signal<string | null>(null);
  protected readonly panelSport = signal('');
  protected readonly playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  protected readonly acceptedFilmReviewUploadTypes = [
    ...AGENT_X_ALLOWED_MIME_TYPES.filter(
      (type) =>
        type.startsWith('video/') ||
        type === 'text/csv' ||
        type === 'application/vnd.ms-excel' ||
        type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ),
    '.csv',
    '.xls',
    '.xlsx',
  ].join(',');
  protected readonly acceptedBreakdownTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv',
    '.xls',
    '.xlsx',
  ].join(',');
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
  protected readonly currentTimelineGridTemplate = computed(() =>
    this.buildTimelineGridTemplate(this.currentTimelineColumns())
  );
  protected readonly isTimelinePlayReorderActive = computed(
    () => this.draggingTimelinePlayIndex() !== null
  );
  protected readonly playlistFolders = computed<readonly FilmReviewPlaylistFolder[]>(() => {
    const folders = new Map<
      string,
      { name: string; reviews: FilmListReview[]; isUnassigned?: boolean }
    >();
    folders.set(FILM_REVIEW_UNASSIGNED_PLAYLIST_ID, {
      name: 'Unassigned Film',
      reviews: [],
      isUnassigned: true,
    });

    for (const folder of this.localPlaylistFolders()) {
      folders.set(folder.id, { name: folder.name, reviews: [] });
    }

    for (const review of this.reviews()) {
      const playlist = this.resolveReviewPlaylist(review);
      const folderId = playlist?.id ?? FILM_REVIEW_UNASSIGNED_PLAYLIST_ID;
      const folderName = playlist?.name ?? 'Unassigned Film';
      const current = folders.get(folderId) ?? {
        name: folderName,
        reviews: [],
        isUnassigned: folderId === FILM_REVIEW_UNASSIGNED_PLAYLIST_ID,
      };
      current.reviews.push(review);
      folders.set(folderId, current);
    }

    return [...folders.entries()]
      .map(([id, folder]) => ({ id, ...folder }))
      .filter((folder) => !folder.isUnassigned || folder.reviews.length > 0 || folders.size === 1)
      .sort((left, right) => {
        if (left.isUnassigned) return 1;
        if (right.isUnassigned) return -1;
        return left.name.localeCompare(right.name);
      });
  });

  // Timeline play navigation state - using inline type for portability
  protected readonly currentPlayIndex = signal(0);

  public isInlineVideoView(): boolean {
    return this.isVideoView();
  }

  public getInlineHeaderTitle(): string {
    const review = this.selectedReview();
    return review ? this.getReviewDisplayTitle(review) : 'Film Review';
  }

  public backToLibrary(): void {
    void this.onBackToLibrary();
  }

  protected readonly currentPlay = computed<FilmTimelinePlay | null>(() => {
    const review = this.selectedReview();
    const idx = this.currentPlayIndex();
    if (!review?.timeline || idx < 0 || idx >= review.timeline.length) return null;
    return review.timeline[idx] ?? null;
  });

  /**
   * Per-play scoped seek slider state.
   *
   * When the active film review has a tagged timeline, the seek slider is
   * scoped to the *current play's* bounds instead of the full video. This
   * lets coaches scrub within a single play while Prev/Next jump between
   * plays (each with its own slider range).
   *
   * Falls back to the full-video range when no timeline play is active.
   */
  protected readonly scopedPlayerDuration = computed(() => {
    const play = this.currentPlay();
    if (!play) return this.playerDuration();
    const span = play.endSec - play.startSec;
    return span > 0 ? span : this.playerDuration();
  });

  protected readonly scopedPlayerCurrentTime = computed(() => {
    const play = this.currentPlay();
    const absolute = this.playerCurrentTime();
    if (!play) return absolute;
    const span = play.endSec - play.startSec;
    if (span <= 0) return absolute;
    // Clamp the displayed position to the play's bounds so the thumb stays
    // within the scoped slider even if playback drifts past `endSec`.
    return Math.max(0, Math.min(absolute - play.startSec, span));
  });
  protected readonly currentInlinePlayOverlayCounter = computed(() => {
    const review = this.selectedReview();
    const play = this.currentPlay();
    if (!review?.timeline?.length || !play) return null;
    return `${this.currentPlayIndex() + 1}/${review.timeline.length}`;
  });
  protected readonly currentInlinePlayOverlayItems = computed(() => {
    const play = this.currentPlay();
    if (!play) return [] as Array<{ label: string; value: string }>;

    return this.currentTimelineColumns().map((column) => ({
      label: column.label,
      value: this.getTimelineColumnDisplayValue(play, column),
    }));
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['teamId'] && !changes['sport']) return;

    this.panelSport.set(this.normalizeSport(this.sport) ?? '');

    const teamId = this.teamId?.trim();
    if (!teamId) return;

    this.localPlaylistFolders.set(this.loadPersistedPlaylistFolders(teamId));
    this.timelineColumnOrder.set(this.loadPersistedTimelineColumnOrder());

    this.isVideoView.set(false);
    this.currentPlayIndex.set(0);
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.cloudflareNativePlaybackFailed.set(false);
    this.resetTimelinePlayEditing();
    void this.loadFilmReviews(teamId);
  }

  protected readonly retryLoad = (): void => {
    const teamId = this.teamId?.trim();
    if (!teamId) return;

    this.isVideoView.set(false);
    this.currentPlayIndex.set(0);
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.cloudflareNativePlaybackFailed.set(false);
    this.resetTimelinePlayEditing();
    void this.loadFilmReviews(teamId);
  };

  protected onPlaylistCreateToggle(): void {
    this.isCreatingPlaylistFolder.update((current) => !current);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistFolderNameInput(value: string): void {
    this.playlistFolderNameDraft.set(value);
  }

  protected onPlaylistCreateCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.isCreatingPlaylistFolder.set(false);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistCreateConfirm(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const name = this.playlistFolderNameDraft().trim();
    if (!name) {
      this.toast.error('Name the playlist folder first.');
      return;
    }

    const id = this.buildPlaylistFolderId(name);
    const existingFolder = this.playlistFolders().find((folder) => folder.id === id) ?? null;
    if (!existingFolder) {
      this.updateLocalPlaylistFolders((folders) => [...folders, { id, name }]);
    }

    this.collapsedPlaylistFolderIds.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    this.isCreatingPlaylistFolder.set(false);
    this.playlistFolderNameDraft.set('');
  }

  protected onPlaylistCreateFromMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetMenuState();
    this.isCreatingPlaylistFolder.set(true);
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

    const nextName = this.playlistFolderRenameDraft().trim();
    if (!nextName) {
      this.toast.error('Name the playlist folder first.');
      return;
    }

    const nextId = this.buildPlaylistFolderId(nextName);
    if (nextId === folder.id && nextName === folder.name) {
      this.resetMenuState();
      return;
    }

    try {
      await Promise.all(
        folder.reviews.map((review) =>
          this.service.updateReviewPlaylist(review.id, nextId, nextName)
        )
      );
      this.updateLocalPlaylistFolders((folders) => {
        const remaining = folders.filter((item) => item.id !== folder.id && item.id !== nextId);
        return [...remaining, { id: nextId, name: nextName }];
      });
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        next.delete(nextId);
        return next;
      });
      this.resetMenuState();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename playlist';
      this.toast.error(message);
    }
  }

  protected onPlaylistFolderDeleteStart(folder: FilmReviewPlaylistFolder, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
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

    try {
      await Promise.all(
        folder.reviews.map((review) => this.service.updateReviewPlaylist(review.id, null, null))
      );
      this.updateLocalPlaylistFolders((folders) => folders.filter((item) => item.id !== folder.id));
      this.collapsedPlaylistFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      this.resetMenuState();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete playlist';
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

  protected onReviewPlaylistDragStart(review: FilmListReview, event: DragEvent): void {
    this.draggingReviewId.set(review.id);
    event.dataTransfer?.setData(FILM_REVIEW_PLAYLIST_DRAG_MIME, review.id);
  }

  protected onReviewPlaylistDragEnd(): void {
    this.draggingReviewId.set(null);
    this.activePlaylistDropTargetId.set(null);
  }

  protected onPlaylistFolderDragOver(folderId: string, event: DragEvent): void {
    if (!this.draggingReviewId()) return;
    event.preventDefault();
    event.stopPropagation();
    this.activePlaylistDropTargetId.set(folderId);
  }

  protected onPlaylistFolderDragLeave(folderId: string, event: DragEvent): void {
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
  }

  protected async onPlaylistFolderDrop(
    folder: FilmReviewPlaylistFolder,
    event: DragEvent
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const reviewId =
      this.draggingReviewId() ?? event.dataTransfer?.getData(FILM_REVIEW_PLAYLIST_DRAG_MIME) ?? '';
    this.draggingReviewId.set(null);
    this.activePlaylistDropTargetId.set(null);
    if (!reviewId) return;

    try {
      await this.service.updateReviewPlaylist(
        reviewId,
        folder.isUnassigned ? null : folder.id,
        folder.isUnassigned ? null : folder.name
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

    try {
      await this.service.updateReviewPlaylist(
        review.id,
        folder.isUnassigned ? null : folder.id,
        folder.isUnassigned ? null : folder.name
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

  protected isRenaming(reviewId: string): boolean {
    return this.renamingReviewId() === reviewId;
  }

  protected isEditingPlaylist(reviewId: string): boolean {
    return this.playlistEditingReviewId() === reviewId;
  }

  protected isDeleteConfirming(reviewId: string): boolean {
    return this.deleteConfirmReviewId() === reviewId;
  }

  protected onMenuBackdropTap(): void {
    this.resetMenuState();
  }

  protected onRenameStart(review: FilmListReview, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
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

    const currentPlaylist = this.getEditablePlaylistName(review);
    const nextPlaylist = this.playlistDraft().trim();
    if (nextPlaylist === currentPlaylist) {
      this.resetMenuState();
      return;
    }

    await this.service.updateReviewPlaylist(
      review.id,
      nextPlaylist.length > 0 ? this.buildPlaylistFolderId(nextPlaylist) : null,
      nextPlaylist.length > 0 ? nextPlaylist : null
    );
    this.resetMenuState();
  }

  protected async onPlaylistClear(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.service.updateReviewPlaylist(review.id, null, null);
    this.resetMenuState();
  }

  protected async onRenameConfirm(review: FilmListReview, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

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
    this.deleteConfirmReviewId.set(review.id);
    this.playlistEditingReviewId.set(null);
    this.renamingReviewId.set(null);
  }

  protected onDeleteCancel(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.deleteConfirmReviewId.set(null);
  }

  protected onChooseVideosClick(): void {
    this.videoUploadInput?.nativeElement.click();
  }

  protected onChooseBreakdownClick(): void {
    this.breakdownUploadInput?.nativeElement.click();
  }

  protected async onVideoFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (input) {
      input.value = '';
    }
    await this.uploadLibraryFiles(files);
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

    await this.importBreakdownForSelectedReview(file);
  }

  protected onLibraryDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.isLibraryDragActive.set(true);
  }

  protected onLibraryDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isLibraryDragActive.set(true);
  }

  protected onLibraryDragLeave(event: DragEvent): void {
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
    event.preventDefault();
    this.isLibraryDragActive.set(false);
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    await this.uploadLibraryFiles(files);
  }

  private async uploadLibraryFiles(files: readonly File[]): Promise<void> {
    if (!files.length || this.isUploadingLibraryVideo()) {
      return;
    }

    const teamId = this.teamId?.trim() ?? '';
    if (!teamId) {
      this.toast.error('Select a team before uploading videos.');
      return;
    }

    const authTokenFactory = this.getAuthToken;
    if (!authTokenFactory) {
      this.toast.error('Upload is unavailable right now.');
      return;
    }

    const validVideos: File[] = [];
    const validBreakdowns: File[] = [];
    for (const file of files.slice(0, AGENT_X_MAX_ATTACHMENTS)) {
      if (file.type.startsWith('video/')) {
        if (file.size > AGENT_X_MAX_VIDEO_FILE_SIZE) {
          this.toast.error(`File too large: ${file.name}`);
          continue;
        }
        validVideos.push(file);
        continue;
      }

      if (this.isBreakdownSheetFile(file)) {
        if (file.size > AGENT_X_MAX_FILE_SIZE) {
          this.toast.error(`Breakdown file too large: ${file.name}`);
          continue;
        }
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

    const authToken = await authTokenFactory();
    if (!authToken) {
      this.toast.error('Please sign in again to upload videos.');
      return;
    }

    if (validVideos.length > 0) {
      this.ensureStarterPlaylistFolders();
    }

    this.libraryUploadError.set(null);
    this.isUploadingLibraryVideo.set(true);
    this.libraryVideoUploadPercent.set(0);
    this.libraryUploadCurrentFile.set(1);
    this.libraryUploadTotalFiles.set(validVideos.length + validBreakdowns.length);

    try {
      let targetReviewId = this.selectedId() ?? this.reviews()[0]?.id ?? null;
      for (let index = 0; index < validVideos.length; index += 1) {
        this.libraryUploadCurrentFile.set(index + 1);
        const file = validVideos[index] as File;
        const uploaded = await this.uploadSingleLibraryVideo(
          file,
          authToken,
          index,
          validVideos.length
        );
        const reviewSport = this.panelSport() || 'football';

        const created = await this.service.createFromVideo({
          teamId,
          sport: reviewSport,
          title: this.deriveFilmReviewTitleFromFile(file.name),
          videoUrl: uploaded.streamUrl,
          storagePath: uploaded.storagePath,
          cloudflareVideoId: uploaded.cloudflareVideoId,
          cloudflareStatus: uploaded.cloudflareStatus,
          readyToStream: uploaded.readyToStream,
          thumbnailUrl: uploaded.thumbnailUrl,
          source: 'manual_upload',
        });

        if (validVideos.length === 1) {
          targetReviewId = created.id;
        }
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

      this.toast.success(this.buildUploadSuccessMessage(validVideos.length, importedPlayCount));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload film files';
      this.libraryUploadError.set(message);
      this.toast.error(message);
    } finally {
      this.isUploadingLibraryVideo.set(false);
      this.libraryVideoUploadPercent.set(null);
      this.libraryUploadCurrentFile.set(0);
      this.libraryUploadTotalFiles.set(0);
    }
  }

  private async importBreakdownForSelectedReview(file: File): Promise<void> {
    const reviewId = this.selectedId();
    if (!reviewId) {
      this.toast.error('Select a film review before importing a breakdown.');
      return;
    }

    if (!this.isBreakdownSheetFile(file)) {
      this.toast.error(`Unsupported breakdown file: ${file.name}`);
      return;
    }

    if (file.size > AGENT_X_MAX_FILE_SIZE) {
      this.toast.error(`Breakdown file too large: ${file.name}`);
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
    storagePath?: string;
    cloudflareVideoId?: string;
    cloudflareStatus?: string;
    readyToStream?: boolean;
    thumbnailUrl?: string;
  }> {
    return new Promise((resolve, reject) => {
      const subscription = this.uploadService
        .uploadVideo(file, authToken)
        .subscribe((progress: VideoUploadProgress) => {
          if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
            const fileProgress = Math.max(0, Math.min(100, progress.percent));
            const overall = ((index + fileProgress / 100) / total) * 100;
            this.libraryVideoUploadPercent.set(Math.round(overall));
            return;
          }

          if (progress.phase === 'complete' && progress.streamUrl) {
            subscription.unsubscribe();
            resolve({
              streamUrl: progress.streamUrl,
              storagePath: progress.storagePath,
              cloudflareVideoId: progress.cloudflareVideoId,
              cloudflareStatus: progress.cloudflareStatus,
              readyToStream: progress.readyToStream,
              thumbnailUrl: progress.thumbnailUrl,
            });
            return;
          }

          if (progress.phase === 'error') {
            subscription.unsubscribe();
            reject(new Error(progress.errorMessage ?? `Failed to upload ${file.name}`));
          }
        });
    });
  }

  private deriveFilmReviewTitleFromFile(fileName: string): string {
    const withoutExt = fileName.replace(/\.[^.]+$/, '').trim();
    return withoutExt.length > 0 ? withoutExt : 'Game Film';
  }

  private isBreakdownSheetFile(file: File): boolean {
    const fileName = file.name.toLowerCase();
    return (
      file.type === 'text/csv' ||
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileName.endsWith('.csv') ||
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

    await this.service.deleteReview(review.id);
    if (this.selectedId() === review.id) {
      this.onBackToLibrary();
    }
    this.resetMenuState();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (!this.openMenuReviewId() && !this.openPlaylistFolderMenuId()) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '.film-list-item__menu-btn, .film-list-item__menu, .film-list-item__menu-backdrop'
      )
    ) {
      return;
    }
    this.resetMenuState();
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.openMenuReviewId() || this.openPlaylistFolderMenuId()) {
      this.resetMenuState();
    }
  }

  private resetMenuState(): void {
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
  }

  protected getReviewDisplayTitle(review: FilmListReview): string {
    const savedTitle = review.title?.trim();
    if (savedTitle && !this.isRawImportedVideoTitle(savedTitle, review)) {
      return savedTitle;
    }

    if (review.opponentName?.trim()) {
      return `Game Film vs ${review.opponentName.trim()}`;
    }

    return 'Game Film';
  }

  protected getReviewMeta(review: FilmListReview): string {
    return this.formatSportLabel(review.sport) ?? 'Film session';
  }

  protected getVideoThumbnailUrl(review: FilmListReview): string | null {
    const explicit = review.thumbnailUrl?.trim();
    if (explicit) return explicit;

    const generated = this.generatedVideoThumbnails()[review.id];
    return generated?.trim() ? generated : null;
  }

  protected isLibraryThumbnailReady(reviewId: string): boolean {
    return this.libraryThumbnailReady()[reviewId] === true;
  }

  protected showLibraryThumbnailLoader(review: FilmListReview): boolean {
    return !this.getVideoThumbnailUrl(review) && !this.isLibraryThumbnailReady(review.id);
  }

  private getEditablePlaylistName(review: FilmListReview): string {
    return review.playlistName?.trim() ?? '';
  }

  private formatSportLabel(value?: string): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized
      .split(/[_\s-]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  protected onLibraryThumbnailLoaded(reviewId: string, event: Event): void {
    this.pauseVideoThumbnail(event);
    this.libraryThumbnailReady.update((current) => ({
      ...current,
      [reviewId]: true,
    }));

    if (this.generatedVideoThumbnails()[reviewId]) {
      return;
    }

    const video = event.target as HTMLVideoElement | null;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      if (!dataUrl) return;

      this.generatedVideoThumbnails.update((current) => ({
        ...current,
        [reviewId]: dataUrl,
      }));
    } catch {
      // Ignore thumbnail capture errors (e.g., CORS-tainted frames).
    }
  }

  protected pauseVideoThumbnail(event: Event): void {
    const video = event.target as HTMLVideoElement | null;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
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

  private resolveReviewPlaylist(review: FilmListReview): { id: string; name: string } | null {
    const playlistName = review.playlistName?.trim();
    const playlistId =
      review.playlistId?.trim() || (playlistName ? this.buildPlaylistFolderId(playlistName) : null);
    if (!playlistId || !playlistName) return null;
    return { id: playlistId, name: playlistName };
  }

  private buildPlaylistFolderId(name: string): string {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return normalized ? `playlist-${normalized}` : `playlist-${Date.now()}`;
  }

  private ensureStarterPlaylistFolders(): void {
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

    this.updateLocalPlaylistFolders((folders) => [...folders, ...missingFolders]);
  }

  private async loadFilmReviews(teamId: string): Promise<void> {
    await this.service.load(teamId, this.panelSport() || undefined);
    this.timelineColumnOrder.set(this.loadPersistedTimelineColumnOrder());
    this.collapseAllPlaylistFolders();
  }

  private collapseAllPlaylistFolders(): void {
    const folderIds = this.playlistFolders().map((folder) => folder.id);
    this.collapsedPlaylistFolderIds.set(new Set(folderIds));
  }

  private updateLocalPlaylistFolders(
    updater: (
      folders: readonly LocalFilmReviewPlaylistFolder[]
    ) => readonly LocalFilmReviewPlaylistFolder[]
  ): void {
    const normalized = this.normalizeLocalPlaylistFolders(updater(this.localPlaylistFolders()));
    this.localPlaylistFolders.set(normalized);
    this.persistLocalPlaylistFolders(normalized);
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
      unique.set(id, { id, name });
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
        parsedFolders.push({ id, name });
      }

      return this.normalizeLocalPlaylistFolders(parsedFolders);
    } catch {
      return [];
    }
  }

  private persistLocalPlaylistFolders(folders: readonly LocalFilmReviewPlaylistFolder[]): void {
    if (!this.platform.isBrowser()) {
      return;
    }

    const teamId = this.teamId?.trim();
    if (!teamId) {
      return;
    }

    const normalized = this.normalizeLocalPlaylistFolders(folders);

    try {
      if (normalized.length === 0) {
        localStorage.removeItem(this.getPlaylistStorageKey(teamId));
        return;
      }

      localStorage.setItem(this.getPlaylistStorageKey(teamId), JSON.stringify(normalized));
    } catch {
      // Ignore local persistence failures to avoid breaking core flow.
    }
  }

  private getPlaylistStorageKey(teamId: string): string {
    return `${FILM_REVIEW_PLAYLIST_STORAGE_PREFIX}:${teamId}`;
  }

  protected async onSelectReview(reviewId: string): Promise<void> {
    await this.flushCurrentPlayAnnotationPersistence();

    this.stopSmoothProgressTracking();
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.wasPlayingBeforeSeek = false;
    this.resetTimelinePlayEditing();
    this.cloudflareNativePlaybackFailed.set(false);

    this.service.select(reviewId);
    const selectedReview = this.selectedReview();
    const nativeVideoUrl = this.resolveNativeVideoUrlCandidate(selectedReview);
    const cloudflareEmbedUrl = nativeVideoUrl
      ? null
      : this.resolveCloudflareBaseEmbedUrl(selectedReview);
    this.isVideoView.set(true);
    this.currentPlayIndex.set(0); // Reset play index when switching reviews
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.cloudflareIframeLoading.set(cloudflareEmbedUrl !== null);
    this.playerCurrentTime.set(0);
    this.playerDuration.set(this.resolveReviewDurationSec(selectedReview));
    this.syncSeekUi(0);
    this.isPlaying.set(false);
    this.playbackRate.set(1);
    this.resetDrawOverlay();
    this.drawModeEnabled.set(false);
    this.restoreDrawOverlayForPlay(this.selectedReview()?.timeline?.[0] ?? null);
    this.scheduleNativeVideoSourceSync();
  }

  protected async onBackToLibrary(): Promise<void> {
    await this.flushCurrentPlayAnnotationPersistence();

    this.isVideoView.set(false);
    this.stopSmoothProgressTracking();
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.cloudflareIframeLoading.set(false);
    this.cloudflareNativePlaybackFailed.set(false);
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.wasPlayingBeforeSeek = false;
    this.resetTimelinePlayEditing();

    this.syncSeekUi(0);
    const player = this.filmPlayer?.nativeElement;
    if (player) {
      player.pause();
    }
    this.isPlaying.set(false);
    this.drawModeEnabled.set(false);
    this.resetDrawOverlay();
  }

  ngOnDestroy(): void {
    void this.flushCurrentPlayAnnotationPersistence();
    this.stopSmoothProgressTracking();
    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.cloudflareIframeLoading.set(false);
    this.cloudflareNativePlaybackFailed.set(false);
    this.cloudflareStartTimeSec.set(0);
    this.cloudflareAutoplayRequested.set(false);
    this.safeIframeUrlCache.clear();
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);
    this.wasPlayingBeforeSeek = false;

    const player = this.filmPlayer?.nativeElement;
    if (player) {
      player.pause();
    }
    this.drawModeEnabled.set(false);
    this.resetDrawOverlay();
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
   * - Analytics: FILM_REVIEW_TIMELINE_GENERATE_INITIATED / COMPLETE / ERROR
   * - Breadcrumbs: tracked by service via trackStateChange
   * - Performance: traced via FILM_REVIEW_TIMELINE_GENERATE trace name
   */
  protected async onGenerateTimeline(reviewId: string): Promise<void> {
    const review = this.selectedReview();
    const panelSport = this.panelSport();
    const playerDuration = this.playerDuration();
    const durationCandidate =
      (Number.isFinite(review?.durationSec) && (review?.durationSec ?? 0) > 0
        ? review?.durationSec
        : undefined) ??
      (Number.isFinite(playerDuration) && playerDuration > 0 ? playerDuration : undefined);

    try {
      if (review && panelSport && this.normalizeSport(review.sport) !== panelSport) {
        await this.service.syncReviewSport(reviewId, panelSport);
      }

      await this.service.generateTimeline(reviewId, 30, durationCandidate);
      this.currentPlayIndex.set(0); // Reset play index after successful generation
      this.restoreDrawOverlayForPlay(this.selectedReview()?.timeline?.[0] ?? null);
    } catch {
      // Error already logged and tracked by service; UI reflects error state via signal
    }
  }

  /**
   * Navigate to the previous play segment.
   * Updates currentPlayIndex and seeks video player to play start time.
   */
  protected async goToPreviousPlay(): Promise<void> {
    const review = this.selectedReview();
    if (!review?.timeline) return;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    const idx = this.currentPlayIndex();
    if (idx > 0) {
      this.currentPlayIndex.set(idx - 1);
      this.jumpToPlay(review.timeline[idx - 1]);
    }
  }

  /**
   * Navigate to the next play segment.
   * Updates currentPlayIndex and seeks video player to play start time.
   */
  protected async goToNextPlay(): Promise<void> {
    const review = this.selectedReview();
    if (!review?.timeline) return;

    this.resetTimelinePlayEditing();
    await this.flushCurrentPlayAnnotationPersistence();

    const idx = this.currentPlayIndex();
    if (idx < review.timeline.length - 1) {
      this.currentPlayIndex.set(idx + 1);
      this.jumpToPlay(review.timeline[idx + 1]);
    }
  }

  protected async onSelectTimelinePlay(play: FilmTimelinePlay, index: number): Promise<void> {
    const review = this.selectedReview();
    if (!review?.timeline) return;
    if (index < 0 || index >= review.timeline.length) return;
    if (this.isEditingTimelinePlay(review.timeline[index], index)) return;

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
    if (this.saving() || !review?.timeline?.[index]) {
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
    event.preventDefault();
    event.stopPropagation();

    const sourceIndex = this.resolveTimelineDragSourceIndex(event);
    const review = this.selectedReview();
    const currentIndicator = this.timelinePlayDropIndicator();
    const placement =
      currentIndicator?.index === targetIndex
        ? currentIndicator.placement
        : this.resolveTimelinePlayDropPlacement(event);
    this.resetTimelinePlayDragState();

    if (sourceIndex === null || !review?.timeline?.length || sourceIndex === targetIndex) {
      return;
    }

    const nextIndex = this.resolveTimelineReorderIndex(
      sourceIndex,
      targetIndex,
      placement,
      review.timeline.length
    );
    if (nextIndex === sourceIndex) return;

    const activePlay = this.currentPlay();
    const activePlayId = activePlay?.id ?? null;
    const activePlayFallbackKey = activePlay
      ? `${activePlay.startSec}:${activePlay.endSec}:${activePlay.label}`
      : null;

    try {
      const updated = await this.service.reorderTimelinePlay(reviewId, sourceIndex, nextIndex);
      const timeline = updated?.timeline ?? this.selectedReview()?.timeline ?? [];
      const activeIndex = this.findTimelinePlayIndex(timeline, activePlayId, activePlayFallbackKey);
      const fallbackIndex = Math.max(0, Math.min(this.currentPlayIndex(), timeline.length - 1));

      this.currentPlayIndex.set(activeIndex >= 0 ? activeIndex : fallbackIndex);
      this.restoreDrawOverlayForPlay(timeline[this.currentPlayIndex()] ?? null);
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

    const nextPlay = this.buildUpdatedTimelinePlayFromDraft(play, fieldKey, column);
    if (!nextPlay) {
      return;
    }

    if (JSON.stringify(nextPlay) === JSON.stringify(play)) {
      this.resetTimelinePlayEditing();
      return;
    }

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
    switch (column.kind) {
      case 'number':
        return String(play.number);
      case 'label':
        return play.label;
      case 'startSec':
        return this.formatTime(play.startSec);
      case 'endSec':
        return this.formatTime(play.endSec);
      case 'durationSec':
        return this.formatTime(this.playDuration(play));
      case 'tag':
        return column.tagDefinition ? this.getTimelineTagValue(play, column.tagDefinition) : '-';
    }
  }

  protected getTimelineColumnTestId(column: TimelineGridColumn): string | null {
    if (column.kind === 'tag') return this.testIds.TIMELINE_TAG_VALUE;
    if (column.kind === 'label') return this.testIds.TIMELINE_PLAY_EDIT_BUTTON;
    return null;
  }

  private getTimelinePlayFieldDraft(play: FilmTimelinePlay, fieldKey: string): string {
    switch (fieldKey) {
      case 'number':
        return String(play.number);
      case 'label':
        return play.label;
      case 'startSec':
        return this.formatTime(play.startSec);
      case 'endSec':
        return this.formatTime(play.endSec);
      case 'durationSec':
        return this.formatTime(this.playDuration(play));
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

    return {
      id: `film-review:${review.id}`,
      kind: 'film_play',
      title,
      summary: review.opponentName ? `Film review vs ${review.opponentName}` : 'Film review video',
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
        playCount: review.timeline?.length ?? null,
      }),
    };
  }

  protected buildFilmPlayDragContext(
    review: FilmReviewDragSource,
    play: FilmTimelinePlay,
    fallbackIndex: number
  ): AgentXSelectedContext {
    const reviewTitle = this.getReviewDisplayTitle(review);
    const playId = play.id || String(play.number ?? fallbackIndex + 1);
    const title = `${play.label} @ ${this.formatTime(play.startSec)}`;
    const annotation = this.normalizeStoredPlayAnnotationForContext(play.annotation);
    const drawBounds = annotation
      ? `${annotation.bounds.minX.toFixed(3)},${annotation.bounds.minY.toFixed(3)},${annotation.bounds.maxX.toFixed(3)},${annotation.bounds.maxY.toFixed(3)}`
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
      ],
      media: {
        ...(review.videoUrl ? { videoUrl: review.videoUrl } : {}),
        ...(review.thumbnailUrl ? { thumbnailUrl: review.thumbnailUrl } : {}),
        ...(review.cloudflareVideoId ? { cloudflareVideoId: review.cloudflareVideoId } : {}),
      },
      ...(annotation ? { annotation } : {}),
      metadata: this.compactContextMetadata({
        itemType: 'film_timeline_play',
        teamId: review.teamId,
        sport: review.sport,
        opponentName: review.opponentName,
        cloudflareVideoId: review.cloudflareVideoId,
        playNumber: play.number ?? null,
        durationSec: this.playDuration(play),
        hasDrawing: !!annotation,
        drawStrokeCount: annotation?.strokeCount ?? null,
        ...(drawBounds ? { drawBounds } : {}),
        ...(annotation
          ? {
              annotationSnapshotAttached: false,
              annotationSource: 'timeline_play',
            }
          : {}),
        ...(play.tags ?? {}),
      }),
    };
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
    if (review?.id) {
      this.service.skipToPlay(review.id, play);
    }
    this.restoreDrawOverlayForPlay(play);
    if (this.jumpCloudflareIframeTo(play.startSec)) {
      return;
    }
    this.jumpTo(play.startSec);
  }

  private jumpCloudflareIframeTo(seconds: number): boolean {
    const review = this.selectedReview();
    if (this.resolveNativeVideoUrl(review)) return false;
    if (!this.resolveCloudflareBaseEmbedUrl(review)) return false;

    const nextTime = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.stopSmoothProgressTracking();
    this.isPlaying.set(false);
    this.cloudflareStartTimeSec.set(nextTime);
    this.cloudflareAutoplayRequested.set(true);
    this.cloudflareIframeLoading.set(true);
    this.updatePlayerTimeSignal(nextTime, true);
    this.playerDuration.set(this.resolveReviewDurationSec(review));
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

    this.stopSmoothProgressTracking();
    if (!shouldResume) {
      player.pause();
      this.isPlaying.set(false);
    }

    player.currentTime = Math.max(0, seconds);
    this.updatePlayerTimeSignal(player.currentTime, true);
    this.syncSeekUi(player.currentTime);

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
    this.playerDuration.set(Number.isFinite(player.duration) ? player.duration : 0);
    this.updatePlayerTimeSignal(player.currentTime || 0, true);
    this.syncSeekUi(player.currentTime || 0);
    this.playbackRate.set(player.playbackRate || 1);
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected onPlayerError(): void {
    const review = this.selectedReview();
    if (!this.isCloudflarePlaybackReview(review)) return;

    this.destroyHls();
    this.nativeVideoSourceUrl = null;
    this.stopSmoothProgressTracking();
    this.isPlaying.set(false);
    this.cloudflareNativePlaybackFailed.set(true);
    this.cloudflareIframeLoading.set(this.resolveCloudflareBaseEmbedUrl(review) !== null);
  }

  private scheduleNativeVideoSourceSync(): void {
    const syncToken = ++this.videoSourceSyncToken;
    setTimeout(() => {
      if (syncToken !== this.videoSourceSyncToken) return;
      void this.configureNativeVideoSourceForSelectedReview(syncToken);
    }, 0);
  }

  private async configureNativeVideoSourceForSelectedReview(syncToken: number): Promise<void> {
    const player = this.filmPlayer?.nativeElement;
    const videoUrl = this.resolveNativeVideoUrl(this.selectedReview());
    if (!player || !videoUrl) return;
    if (this.nativeVideoSourceUrl === videoUrl) return;

    this.destroyHls();
    this.nativeVideoSourceUrl = videoUrl;
    player.preload = 'auto';

    if (this.isHlsSourceUrl(videoUrl) && !player.canPlayType('application/vnd.apple.mpegurl')) {
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
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  protected onFullscreenChange(): void {
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected toggleDrawMode(): void {
    const enabled = !this.drawModeEnabled();
    this.drawModeEnabled.set(enabled);
    this.isDrawStrokeInProgress = false;
    this.activeStroke = [];
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  protected clearDrawOverlay(): void {
    this.resetDrawOverlay();
    void this.persistCurrentPlayAnnotation();
  }

  protected onDrawPointerDown(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    event.preventDefault();
    this.ensureDrawCanvasSize();

    const point = this.toNormalizedDrawPoint(event, canvas);
    this.activeStroke = [point];
    this.drawStrokes.push(this.activeStroke);
    this.isDrawStrokeInProgress = true;
    canvas.setPointerCapture?.(event.pointerId);
    this.hasDrawing.set(true);
    this.renderDrawOverlay();
  }

  protected onDrawPointerMove(event: PointerEvent): void {
    if (!this.drawModeEnabled() || !this.isDrawStrokeInProgress || !this.activeStroke.length)
      return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    event.preventDefault();
    const point = this.toNormalizedDrawPoint(event, canvas);
    this.activeStroke.push(point);
    this.renderDrawOverlay();
  }

  protected onDrawPointerUp(event: PointerEvent): void {
    if (!this.drawModeEnabled()) return;

    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    canvas.releasePointerCapture?.(event.pointerId);
    this.isDrawStrokeInProgress = false;
    this.activeStroke = [];
    this.scheduleCurrentPlayAnnotationPersistence();
  }

  public async queueCurrentPlayContextForChat(showToast = true): Promise<boolean> {
    const review = this.selectedReview();
    if (!review) {
      return false;
    }

    const currentTimeSec = Math.max(0, Number(this.playerCurrentTime().toFixed(2)));
    const currentPlay = this.currentPlay();
    const startSec = currentPlay?.startSec ?? Math.max(0, currentTimeSec - 2);
    const endSec = currentPlay?.endSec ?? Math.max(startSec + 2, currentTimeSec + 2);
    const annotation = this.resolveDrawAnnotation();
    const drawBounds = annotation
      ? `${annotation.bounds.minX.toFixed(3)},${annotation.bounds.minY.toFixed(3)},${annotation.bounds.maxX.toFixed(3)},${annotation.bounds.maxY.toFixed(3)}`
      : null;
    const snapshotFile = annotation
      ? await this.createAnnotatedFrameSnapshotFile(review, currentTimeSec)
      : null;

    if (!annotation && !currentPlay) {
      return false;
    }

    if (snapshotFile) {
      this.agentXService.addFiles([snapshotFile]);
    }

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
      ...(annotation ? { annotation } : {}),
      metadata: {
        currentTimeSec,
        hasDrawing: this.hasDrawing(),
        drawStrokeCount: this.drawStrokes.length,
        ...(drawBounds ? { drawBounds } : {}),
        ...(snapshotFile
          ? {
              annotationSnapshotAttached: true,
              annotationSnapshotAttachmentName: snapshotFile.name,
            }
          : annotation
            ? { annotationSnapshotAttached: false }
            : {}),
        ...(typeof currentPlay?.number === 'number' ? { playNumber: currentPlay.number } : {}),
      },
    };

    this.agentXService.queueSelectedContext(context);
    if (showToast) {
      this.toast.success(
        snapshotFile
          ? 'Added play context and annotated frame to chat composer'
          : 'Added play context to chat composer'
      );
    }

    return true;
  }

  private async createAnnotatedFrameSnapshotFile(
    review: FilmListReview,
    currentTimeSec: number
  ): Promise<File | null> {
    const player = this.filmPlayer?.nativeElement;
    const drawCanvas = this.drawCanvas?.nativeElement;
    if (!player || !drawCanvas || !this.hasDrawing()) {
      return null;
    }
    if (typeof document === 'undefined' || typeof File === 'undefined') {
      return null;
    }
    if (!player.videoWidth || !player.videoHeight || player.readyState < 2) {
      return null;
    }

    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();

    const sourceWidth = drawCanvas.width || Math.round(drawCanvas.getBoundingClientRect().width);
    const sourceHeight = drawCanvas.height || Math.round(drawCanvas.getBoundingClientRect().height);
    if (!sourceWidth || !sourceHeight) {
      return null;
    }

    const maxSnapshotWidth = 1280;
    const scale = Math.min(1, maxSnapshotWidth / sourceWidth);
    const snapshotWidth = Math.max(1, Math.round(sourceWidth * scale));
    const snapshotHeight = Math.max(1, Math.round(sourceHeight * scale));
    const snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = snapshotWidth;
    snapshotCanvas.height = snapshotHeight;

    const context = snapshotCanvas.getContext('2d');
    if (!context) {
      return null;
    }

    try {
      context.fillStyle = '#000000';
      context.fillRect(0, 0, snapshotWidth, snapshotHeight);
      context.drawImage(player, 0, 0, snapshotWidth, snapshotHeight);
      context.drawImage(drawCanvas, 0, 0, snapshotWidth, snapshotHeight);

      const blob = await this.canvasToBlob(snapshotCanvas, 'image/jpeg', 0.86);
      if (!blob) {
        return null;
      }

      return new File([blob], this.buildAnnotatedSnapshotFileName(review, currentTimeSec), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } catch {
      this.toast.info('Added drawing coordinates, but this video blocked image snapshot export.');
      return null;
    }
  }

  private canvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number
  ): Promise<Blob | null> {
    return new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, mimeType, quality);
      } catch {
        resolve(null);
      }
    });
  }

  private buildAnnotatedSnapshotFileName(review: FilmListReview, currentTimeSec: number): string {
    const title = this.getReviewDisplayTitle(review)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const timestamp = Math.max(0, Math.round(currentTimeSec * 100));
    return `${title || 'film-play'}-annotated-${timestamp}.jpg`;
  }

  private resetDrawOverlay(): void {
    this.drawStrokes = [];
    this.activeStroke = [];
    this.isDrawStrokeInProgress = false;
    this.hasDrawing.set(false);
    this.renderDrawOverlay();
  }

  private restoreDrawOverlayForPlay(play: FilmTimelinePlay | null): void {
    const annotation = play?.annotation ?? null;
    if (!annotation) {
      this.resetDrawOverlay();
      return;
    }

    const restoredStrokes = this.restoreAnnotationStrokes(annotation);
    if (!restoredStrokes.length) {
      this.resetDrawOverlay();
      return;
    }

    this.drawStrokes = restoredStrokes;
    this.activeStroke = [];
    this.isDrawStrokeInProgress = false;
    this.hasDrawing.set(true);
    this.ensureDrawCanvasSize();
    this.renderDrawOverlay();
  }

  private restoreAnnotationStrokes(
    annotation: TeamFilmReviewPlayAnnotation
  ): Array<Array<{ x: number; y: number }>> {
    const sourceStrokes = annotation.strokes?.length
      ? annotation.strokes
      : annotation.points?.length
        ? [annotation.points]
        : [];

    return sourceStrokes
      .map((stroke) =>
        stroke.map((point) => ({
          x: this.roundNormalizedPoint(point.x),
          y: this.roundNormalizedPoint(point.y),
        }))
      )
      .filter((stroke) => stroke.length > 0);
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
    if (this.playAnnotationPersistTimer !== null) {
      clearTimeout(this.playAnnotationPersistTimer);
      this.playAnnotationPersistTimer = null;
      await this.persistCurrentPlayAnnotation();
      return;
    }

    if (this.playAnnotationPersistInFlight) {
      try {
        await this.playAnnotationPersistInFlight;
      } catch {
        // Service already surfaces the error state.
      }
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

    const operation = this.service.saveTimelinePlayAnnotation(
      review.id,
      playIndex,
      this.resolveCurrentPlayAnnotation()
    );
    this.playAnnotationPersistInFlight = operation;

    try {
      await operation;
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

  private resolveDrawAnnotation(): AgentXSelectedContextAnnotation | null {
    const annotation = this.resolveCurrentPlayAnnotation();
    if (!annotation) {
      return null;
    }

    return {
      kind: annotation.kind,
      bounds: annotation.bounds,
      strokeCount: annotation.strokeCount,
      points: annotation.points,
    };
  }

  private normalizeStoredPlayAnnotationForContext(
    annotation: TeamFilmReviewPlayAnnotation | null | undefined
  ): AgentXSelectedContextAnnotation | undefined {
    if (!annotation) {
      return undefined;
    }

    const pointsFromStrokes = annotation.strokes?.flat();
    const rawPoints =
      pointsFromStrokes && pointsFromStrokes.length > 0
        ? pointsFromStrokes
        : (annotation.points ?? []);

    const points = this.compactDrawPointsFromStrokes([rawPoints], this.maxContextAnnotationPoints);

    return {
      kind: annotation.kind,
      bounds: {
        minX: this.roundNormalizedPoint(annotation.bounds.minX),
        minY: this.roundNormalizedPoint(annotation.bounds.minY),
        maxX: this.roundNormalizedPoint(annotation.bounds.maxX),
        maxY: this.roundNormalizedPoint(annotation.bounds.maxY),
      },
      strokeCount: annotation.strokeCount,
      ...(points.length > 0 ? { points } : {}),
    };
  }

  private resolveCurrentPlayAnnotation(): TeamFilmReviewPlayAnnotation | null {
    if (!this.hasDrawing() || this.drawStrokes.length === 0) {
      return null;
    }

    const strokes = this.normalizeDrawStrokesForPersistence();
    const points = strokes.flat();
    if (points.length === 0) {
      return null;
    }

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
      kind: 'freehand',
      bounds: {
        minX: this.roundNormalizedPoint(minX),
        minY: this.roundNormalizedPoint(minY),
        maxX: this.roundNormalizedPoint(maxX),
        maxY: this.roundNormalizedPoint(maxY),
      },
      strokeCount: strokes.length,
      points: this.compactDrawPointsFromStrokes(strokes, this.maxContextAnnotationPoints),
      strokes,
    };
  }

  private normalizeDrawStrokesForPersistence(): readonly (readonly { x: number; y: number }[])[] {
    const normalizedStrokes = this.drawStrokes
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
    strokes: readonly (readonly { x: number; y: number }[])[],
    maxPoints: number
  ): readonly { x: number; y: number }[] {
    const points = strokes.flat();
    if (points.length <= maxPoints) {
      return points;
    }

    const step = Math.max(1, Math.ceil(points.length / maxPoints));
    return points.filter((_, index) => index % step === 0).slice(0, maxPoints);
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
    if (this.isScrubbing) return;
    const current = player.currentTime || 0;
    this.updatePlayerTimeSignal(current);
    this.syncSeekUi(current);

    // Keep UI smooth even if the browser emits sparse timeupdate events.
    if (!player.paused && !player.ended) {
      this.startSmoothProgressTracking();
    }
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
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      if (duration > 0 && player.currentTime >= duration - 0.05) {
        player.currentTime = Math.max(0, duration - 0.1);
      }

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

    const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
    const nextTime = Math.max(0, Math.min((player.currentTime || 0) + deltaSec, duration));
    this.seekVideoTo(player, nextTime);
  }

  protected onSeekInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const nextTime = Number(input?.value ?? '0');
    this.onSeekTime(nextTime);
  }

  private pendingSeekFrameId: number | null = null;
  private pendingSeekTime: number | null = null;

  protected onSeekTime(nextTime: number): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;
    if (!Number.isFinite(nextTime)) return;

    if (this.isScrubbing) {
      this.pendingSeekTime = nextTime;
      if (this.pendingSeekFrameId === null && typeof requestAnimationFrame !== 'undefined') {
        this.pendingSeekFrameId = requestAnimationFrame(() => {
          this.pendingSeekFrameId = null;
          if (this.pendingSeekTime !== null) {
            this.seekVideoTo(player, this.pendingSeekTime);
            this.pendingSeekTime = null;
          }
        });
      }
    } else {
      this.seekVideoTo(player, nextTime);
    }
  }

  /**
   * Translate a scoped seek (relative to the current play's bounds) into
   * an absolute video time and delegate to {@link onSeekTime}. Used by the
   * per-play slider so coaches can scrub within a single play while the
   * underlying HTMLVideoElement still tracks absolute time.
   */
  protected onScopedSeekTime(scopedTime: number): void {
    const play = this.currentPlay();
    if (!play) {
      this.onSeekTime(scopedTime);
      return;
    }
    const span = play.endSec - play.startSec;
    if (span <= 0) {
      this.onSeekTime(scopedTime);
      return;
    }
    const clamped = Math.max(0, Math.min(scopedTime, span));
    this.onSeekTime(play.startSec + clamped);
  }

  protected onPlayerSeeking(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    this.stopSmoothProgressTracking();
    this.syncSeekUi(player.currentTime || 0);
  }

  protected onPlayerSeeked(): void {
    const player = this.filmPlayer?.nativeElement;
    if (!player) return;

    const current = player.currentTime || 0;
    this.updatePlayerTimeSignal(current, true);
    this.syncSeekUi(current);

    if (!this.isScrubbing && !player.paused && !player.ended) {
      this.startSmoothProgressTracking();
    }
  }

  protected onSeekPointerDown(): void {
    const player = this.filmPlayer?.nativeElement;
    this.isScrubbing = true;
    this.isSeekDragLockActive.set(true);

    if (player && !player.paused && !player.ended) {
      this.wasPlayingBeforeSeek = true;
      player.pause();
    } else {
      this.wasPlayingBeforeSeek = false;
    }
  }

  protected onSeekPointerUp(): void {
    const player = this.filmPlayer?.nativeElement;
    this.isScrubbing = false;
    this.isSeekDragLockActive.set(false);

    if (player && this.wasPlayingBeforeSeek) {
      this.wasPlayingBeforeSeek = false;
      this.isPlaying.set(true);
      void this.playWhenReady(player).catch(() => {
        this.isPlaying.set(false);
      });
      this.startSmoothProgressTracking();
    }
  }

  private seekVideoTo(player: HTMLVideoElement, nextTime: number): void {
    const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
    const targetTime = Math.max(0, Math.min(nextTime, duration));

    player.currentTime = targetTime;
    const committedTime = Number.isFinite(player.currentTime) ? player.currentTime : targetTime;
    this.updatePlayerTimeSignal(committedTime, true);
    this.syncSeekUi(committedTime);

    if (player.ended && duration > 0 && committedTime >= duration) {
      player.currentTime = Math.max(0, duration - 0.1);
    }

    if (this.isScrubbing) {
      this.updatePlayerTimeSignal(committedTime, true);
      this.syncSeekUi(committedTime);
    }
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

  private async playWhenReady(player: HTMLVideoElement): Promise<void> {
    await this.waitForSeekComplete(player, 1200);

    if (player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await this.waitForCanPlay(player, 1200);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await player.play();
        return;
      } catch {
        if (attempt >= 2) {
          throw new Error('Unable to resume playback after seek');
        }

        await this.waitForSeekComplete(player, 500);
        await this.waitForCanPlay(player, 500);
        await this.delay(120);
      }
    }
  }

  private async waitForSeekComplete(player: HTMLVideoElement, timeoutMs: number): Promise<void> {
    if (!player.seeking) return;

    await new Promise<void>((resolve) => {
      const onSeeked = (): void => {
        clearTimeout(timeout);
        player.removeEventListener('seeked', onSeeked);
        resolve();
      };

      const timeout = setTimeout(() => {
        player.removeEventListener('seeked', onSeeked);
        resolve();
      }, timeoutMs);

      player.addEventListener('seeked', onSeeked, { once: true });
    });
  }

  private async waitForCanPlay(player: HTMLVideoElement, timeoutMs: number): Promise<void> {
    if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;

    await new Promise<void>((resolve) => {
      const onCanPlay = (): void => {
        clearTimeout(timeout);
        player.removeEventListener('canplay', onCanPlay);
        resolve();
      };

      const timeout = setTimeout(() => {
        player.removeEventListener('canplay', onCanPlay);
        resolve();
      }, timeoutMs);

      player.addEventListener('canplay', onCanPlay, { once: true });
    });
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
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

  public resolveNativeVideoUrl(review: FilmListReview | null | undefined): string | null {
    if (this.cloudflareNativePlaybackFailed() && this.isCloudflarePlaybackReview(review)) {
      return null;
    }

    return this.resolveNativeVideoUrlCandidate(review);
  }

  private resolveNativeVideoUrlCandidate(review: FilmListReview | null | undefined): string | null {
    const cloudflareHlsUrl = this.resolveCloudflareHlsUrl(review);
    if (cloudflareHlsUrl) return cloudflareHlsUrl;

    const videoUrl = review?.videoUrl?.trim();
    return videoUrl && videoUrl.length > 0 ? videoUrl : null;
  }

  private resolveCloudflareHlsUrl(review: FilmListReview | null | undefined): string | null {
    const cloudflareVideoId = review?.cloudflareVideoId?.trim();
    if (cloudflareVideoId && review?.readyToStream === false) return null;
    if (cloudflareVideoId) return this.buildCloudflareHlsUrl(cloudflareVideoId, review?.videoUrl);

    const videoUrl = review?.videoUrl?.trim();
    if (!videoUrl) return null;

    try {
      const parsed = new URL(videoUrl);
      if (this.isHlsSourceUrl(videoUrl)) return videoUrl;

      if (parsed.hostname === 'watch.cloudflarestream.com') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }

      if (parsed.hostname === 'iframe.videodelivery.net') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }

      if (parsed.hostname.endsWith('.cloudflarestream.com')) {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? `${parsed.origin}/${videoId}/manifest/video.m3u8` : null;
      }

      if (parsed.hostname.endsWith('.videodelivery.net')) {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? this.buildCloudflareHlsUrl(videoId) : null;
      }
    } catch {
      return null;
    }

    return null;
  }

  private buildCloudflareHlsUrl(videoId: string, sourceUrl?: string): string {
    const normalizedVideoId = videoId.trim();

    try {
      const parsed = sourceUrl ? new URL(sourceUrl) : null;
      if (
        parsed &&
        parsed.hostname.endsWith('.cloudflarestream.com') &&
        parsed.hostname !== 'watch.cloudflarestream.com'
      ) {
        return `${parsed.origin}/${normalizedVideoId}/manifest/video.m3u8`;
      }
    } catch {
      /* Fall back to the global Stream delivery host. */
    }

    return `https://videodelivery.net/${encodeURIComponent(normalizedVideoId)}/manifest/video.m3u8`;
  }

  private isCloudflarePlaybackReview(review: FilmListReview | null | undefined): boolean {
    if (review?.cloudflareVideoId?.trim()) return true;

    const videoUrl = review?.videoUrl?.trim();
    if (!videoUrl) return false;

    try {
      const parsed = new URL(videoUrl);
      return (
        parsed.hostname === 'watch.cloudflarestream.com' ||
        parsed.hostname === 'iframe.videodelivery.net' ||
        parsed.hostname.endsWith('.cloudflarestream.com') ||
        parsed.hostname.endsWith('.videodelivery.net')
      );
    } catch {
      return false;
    }
  }

  private isHlsSourceUrl(url: string): boolean {
    try {
      return new URL(url).pathname.endsWith('/manifest/video.m3u8');
    } catch {
      return /\/manifest\/video\.m3u8(?:[?#]|$)/i.test(url);
    }
  }

  public resolveCloudflareEmbedUrl(review: FilmListReview | null | undefined): string | null {
    const baseUrl = this.resolveCloudflareBaseEmbedUrl(review);
    if (!baseUrl) return null;
    return this.withCloudflarePlayerParams(baseUrl);
  }

  private resolveCloudflareBaseEmbedUrl(review: FilmListReview | null | undefined): string | null {
    const cloudflareVideoId = review?.cloudflareVideoId?.trim();
    if (cloudflareVideoId && review?.readyToStream === false) return null;
    if (cloudflareVideoId) return `https://iframe.videodelivery.net/${cloudflareVideoId}`;

    const videoUrl = review?.videoUrl?.trim();
    if (!videoUrl) return null;

    try {
      const parsed = new URL(videoUrl);
      if (parsed.hostname === 'iframe.videodelivery.net') return videoUrl;

      if (parsed.hostname === 'watch.cloudflarestream.com') {
        const videoId = parsed.pathname.split('/').filter(Boolean)[0];
        return videoId ? `https://iframe.videodelivery.net/${videoId}` : null;
      }

      if (
        parsed.hostname.endsWith('.cloudflarestream.com') &&
        parsed.pathname.endsWith('/iframe')
      ) {
        return videoUrl;
      }
    } catch {
      return null;
    }

    return null;
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

  private resolveReviewDurationSec(review: FilmListReview | null | undefined): number {
    const explicitDuration = review?.durationSec;
    if (Number.isFinite(explicitDuration) && (explicitDuration ?? 0) > 0) {
      return explicitDuration as number;
    }

    const timeline = (review as FilmReviewDragSource | null | undefined)?.timeline;
    if (!timeline?.length) return 0;

    return timeline.reduce((duration, play) => Math.max(duration, play.endSec ?? 0), 0);
  }

  protected openVideoInNewWindow(): void {
    const review = this.selectedReview();
    const videoUrl = this.resolveNativeVideoUrlCandidate(review);
    if (!videoUrl || typeof window === 'undefined') return;

    const currentTimeSec = Math.max(0, Number(this.playerCurrentTime().toFixed(2)));
    const screenWidth = window.screen.availWidth || window.innerWidth;
    const screenHeight = window.screen.availHeight || window.innerHeight;
    const popupWidth = Math.min(1280, Math.max(720, Math.round(screenWidth * 0.82)));
    const popupHeight = Math.min(720, Math.max(405, Math.round(popupWidth * 0.5625)));
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

    const playerHtml = this.createVideoPopoutHtml(
      videoUrl.split('#')[0],
      review ? this.getReviewDisplayTitle(review) : 'NXT1 Film Review',
      currentTimeSec
    );
    const videoWindow = window.open('', 'nxt1-film-review-player', popupFeatures);
    if (!videoWindow) {
      this.toast.error('Allow pop-ups to open video in a new window.');
      return;
    }

    try {
      videoWindow.document.open();
      videoWindow.document.write(playerHtml);
      videoWindow.document.close();
      videoWindow.opener = null;
    } catch {
      videoWindow.close();
      this.toast.error('Could not open the video player window.');
      return;
    }

    videoWindow.focus();
  }

  private createVideoPopoutHtml(videoUrl: string, title: string, startTimeSec: number): string {
    const safeVideoUrl = this.toHtmlScriptValue(videoUrl);
    const safeTitle = this.toHtmlScriptValue(title);
    const brandedTitle = `NXT1 Film Review | ${title}`;
    const safeStartTime = Number.isFinite(startTimeSec) ? startTimeSec : 0;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(brandedTitle)}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: #05070a; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.18); background: rgba(5, 7, 10, 0.92); }
      .identity { display: inline-flex; align-items: center; min-width: 0; gap: 10px; }
      .brand { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 9px; border-radius: 6px; background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.24); color: #38bdf8; font-size: 11px; font-weight: 900; letter-spacing: 0.08em; }
      .divider { flex: 0 0 auto; width: 1px; height: 18px; background: rgba(148, 163, 184, 0.28); }
      h1 { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; letter-spacing: 0; }
      .status { flex: 0 0 auto; color: #94a3b8; font-size: 12px; font-weight: 600; }
      main { display: grid; min-height: 0; padding: 0; background: #000; }
      video { width: 100%; height: 100%; min-height: 0; object-fit: contain; background: #000; outline: none; }
    </style>
  </head>
  <body>
    <header>
      <div class="identity">
        <span class="brand">NXT1</span>
        <span class="divider" aria-hidden="true"></span>
        <h1 id="title"></h1>
      </div>
      <span class="status" id="status">Loading</span>
    </header>
    <main>
      <video id="player" controls playsinline preload="metadata"></video>
    </main>
    <script>
      const sourceUrl = ${safeVideoUrl};
      const title = ${safeTitle};
      const startTime = ${safeStartTime};
      const video = document.getElementById('player');
      const titleEl = document.getElementById('title');
      const statusEl = document.getElementById('status');
      document.title = 'NXT1 Film Review | ' + title;
      titleEl.textContent = title;
      video.src = sourceUrl;
      video.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(startTime) && startTime > 0 && startTime < video.duration) {
          video.currentTime = startTime;
        }
        statusEl.textContent = 'Ready';
      }, { once: true });
      video.addEventListener('error', () => {
        statusEl.textContent = 'Video unavailable';
      });
      video.focus({ preventScroll: true });
    </script>
  </body>
</html>`;
  }

  private toHtmlScriptValue(value: string): string {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private toNormalizedDrawPoint(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: 0, y: 0 };
    }

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  private ensureDrawCanvasSize(): void {
    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas || typeof window === 'undefined') return;

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

  private renderDrawOverlay(): void {
    const canvas = this.drawCanvas?.nativeElement;
    if (!canvas) return;

    this.ensureDrawCanvasSize();

    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.drawStrokes.length) return;

    const style = getComputedStyle(canvas);
    const strokeColor = style.getPropertyValue('--nxt1-color-primary').trim() || '#ccff00';
    const ratio = canvas.width / Math.max(canvas.clientWidth, 1);

    context.save();
    context.strokeStyle = strokeColor;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(2 * ratio, 2);

    for (const stroke of this.drawStrokes) {
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

    context.restore();
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
