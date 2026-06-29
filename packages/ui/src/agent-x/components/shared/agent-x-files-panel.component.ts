import { CommonModule } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import {
  USER_ROLES,
  type AgentXAttachment,
  type TeamFileFolderDoc,
  type TeamFilmReviewDoc,
  type TeamFilmReviewSourceVideo,
} from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { IconName } from '@nxt1/design-tokens/assets/icons';
import type { Subscription } from 'rxjs';

import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtMarkdownComponent } from '../../../components/markdown';
import { NxtSearchBarComponent } from '../../../components/search-bar/search-bar.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import { NxtCtaButtonComponent } from '../../../components/cta-button/cta-button.component';
import {
  commitMediaSeek,
  isCloudflarePlaybackSource,
  isHlsSourceUrl,
  playMediaWhenReady,
  resolveCloudflareBaseEmbedUrl,
  resolvePlayableVideoUrl,
} from '../../../components/video-playback';
import { NxtVideoControlsComponent } from '../../../components/video-controls';
import {
  AgentXLibraryFolderTreeComponent,
  type AgentXLibraryFolderTreeController,
  type AgentXLibraryFolderTreeNode,
} from './agent-x-library-folder-tree.component';
import { type AgentXShareMemberOption } from './agent-x-share-member-picker.component';
import {
  AgentXShareAccessPanelComponent,
  type AgentXSharePermission,
} from './agent-x-share-access-panel.component';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXLibraryChromeComponent } from './agent-x-library-chrome.component';
import { AgentXLibraryLoadingStateComponent } from './agent-x-library-loading-state.component';
import { AgentXFilmReviewPanelComponent } from './agent-x-film-review-panel.component';
import { AgentXViewerSurfaceComponent } from './agent-x-viewer-surface.component';
import {
  AgentXFilesService,
  FILES_UPLOAD_CANCELLED_MESSAGE,
  type AgentXLibraryFile,
  type AgentXFilesUploadHandle,
  type AgentXFilesUploadProgress,
  type FileSharePermission,
  type FileSharePrincipalType,
} from '../../services/agent-x-files.service';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import {
  AgentXVideoUploadService,
  VIDEO_UPLOAD_CANCELLED_MESSAGE,
  type VideoUploadHandle,
  type VideoUploadProgress,
} from '../../services/agent-x-video-upload.service';
import { AgentXJobService, isEnqueueFailure } from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import { createInlineVideoThumbnail } from '../../utils/video-thumbnail.util';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtArchiveService, type ArchiveDownloadEntry } from '../../../services/archive';

type FilesAskAgentPromptId =
  | 'create-cutup-folders'
  | 'create-highlight'
  | 'pull-best-plays'
  | 'compare-film'
  | 'build-practice-plan'
  | 'install-plan'
  | 'position-room-notes'
  | 'callsheet'
  | 'suggest-plays'
  | 'scout-team-playbook'
  | 'scout-opponent-tendencies'
  | 'self-scout-cutup'
  | 'scouting-report'
  | 'summarize-selection'
  | 'extract-key-details'
  | 'build-action-plan'
  | 'game-day-playbook'
  | 'full-playbook'
  | 'tempo-packages'
  | 'trick-play-ideas'
  | 'position-room-notes'
  | 'game-plan'
  | 'opening-script';

type FilesAskAgentPromptOption = {
  readonly id: FilesAskAgentPromptId;
  readonly label: string;
  readonly hint: string;
};

type FilesAskAgentPromptSection = {
  readonly title: string;
  readonly options: readonly FilesAskAgentPromptOption[];
};

type FilesPanelOpenTabRef = {
  readonly kind: 'file' | 'review';
  readonly id: string;
};

type UploadDestinationPickerTarget = 'file' | 'folder';

type UploadDestinationOption = {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly normalizedName: string;
};

type FileShareGrant = {
  readonly accessKey: string;
  readonly principalType: FileSharePrincipalType;
  readonly principalId: string;
  readonly label: string;
  readonly permission: FileSharePermission;
};

type TeamFileTreeNode = {
  readonly id: string;
  readonly name: string;
  readonly items: readonly AgentXLibraryFile[];
  readonly children: readonly TeamFileTreeNode[];
  readonly depth: number;
  readonly source: TeamFileFolderDoc | null;
  readonly isUnassigned?: boolean;
};

type ImportedFileDescriptor = {
  readonly file: File;
  readonly relativePath: string | null;
};

type UploadGroup = {
  readonly folderId: string | null;
  readonly files: readonly File[];
};

type FileWithRelativePath = File & {
  readonly webkitRelativePath?: string;
};

type WebKitFileSystemEntry = {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
};

type WebKitFileSystemFileEntry = WebKitFileSystemEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type WebKitFileSystemDirectoryReader = {
  readEntries: (
    successCallback: (entries: readonly WebKitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type WebKitFileSystemDirectoryEntry = WebKitFileSystemEntry & {
  createReader: () => WebKitFileSystemDirectoryReader;
};

type DataTransferItemWithWebKitEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebKitFileSystemEntry | null;
};

const FILES_PANEL_FILE_TAB_PREFIX = 'file:';
const FILES_PANEL_REVIEW_TAB_PREFIX = 'review:';
const TEAM_FILES_UNASSIGNED_FOLDER_ID = 'team-files-unassigned-folder';
const ROOT_FOLDER_ORDER_KEY = '__root__';

const FILES_ASK_AGENT_PROMPT_SECTIONS_COACH: readonly FilesAskAgentPromptSection[] = [
  {
    title: 'Film & Media',
    options: [
      {
        id: 'create-cutup-folders',
        label: 'Create Cutup Folders',
        hint: 'Lay out the folders and buckets needed to organize this film fast.',
      },
      {
        id: 'create-highlight',
        label: 'Create Highlight',
        hint: 'Pick the strongest moments and suggest a clean highlight sequence.',
      },
      {
        id: 'pull-best-plays',
        label: 'Pull Best Plays',
        hint: 'Surface the clips or moments that matter most for review or sharing.',
      },
      {
        id: 'compare-film',
        label: 'Compare Film',
        hint: 'Compare selected clips/files to surface key differences, trends, and coaching takeaways.',
      },
    ],
  },
  {
    title: 'Practice & Install',
    options: [
      {
        id: 'build-practice-plan',
        label: 'Practice Plan',
        hint: 'Create a timed practice plan with focus areas and coaching points.',
      },
      {
        id: 'install-plan',
        label: 'Install Plan',
        hint: 'Lay out install progression, teaching order, and checkpoints by period/day.',
      },
      {
        id: 'position-room-notes',
        label: 'Position Room Notes',
        hint: 'Generate position-specific teaching notes, reminders, and emphasis points.',
      },
      {
        id: 'callsheet',
        label: 'Callsheet',
        hint: 'Assemble a situational callsheet with top calls and sequencing notes.',
      },
    ],
  },
  {
    title: 'Game Planning',
    options: [
      {
        id: 'suggest-plays',
        label: 'Suggest Plays',
        hint: 'Recommend the best play ideas based on what is in the selected material.',
      },
      {
        id: 'game-plan',
        label: 'Game Plan',
        hint: 'Build a complete game plan with priorities, keys, and in-game adjustments.',
      },
      {
        id: 'opening-script',
        label: 'Opening Script',
        hint: 'Script the opening sequence with call order, tempo, and intent for each call.',
      },
      {
        id: 'tempo-packages',
        label: 'Tempo Packages',
        hint: 'Design tempo packages and situational pacing adjustments from the selected files.',
      },
      {
        id: 'trick-play-ideas',
        label: 'Trick Play Ideas',
        hint: 'Generate high-upside trick play concepts with setup and risk notes.',
      },
    ],
  },
  {
    title: 'Playbooks',
    options: [
      {
        id: 'game-day-playbook',
        label: 'Game Day Playbook',
        hint: 'Build a game-day ready playbook with situational sections and quick-call flow.',
      },
      {
        id: 'full-playbook',
        label: 'Full Playbook',
        hint: 'Assemble a full playbook structure with install tags and situational groupings.',
      },
      {
        id: 'scout-team-playbook',
        label: 'Scout Team Playbook',
        hint: 'Create a scout-team playbook to mirror opponent looks and tendencies.',
      },
      {
        id: 'scout-opponent-tendencies',
        label: 'Scout Opponent Tendencies',
        hint: 'Break down patterns, habits, strengths, and openings to attack.',
      },
    ],
  },
  {
    title: 'Strategy & Analysis',
    options: [
      {
        id: 'self-scout-cutup',
        label: 'Self Scout Cutup',
        hint: 'Build a self-scout cutup plan from the selected material and tag focus points.',
      },
      {
        id: 'scouting-report',
        label: 'Scouting Report',
        hint: 'Generate a structured scouting report with tendencies, alerts, and recommendations.',
      },
      {
        id: 'summarize-selection',
        label: 'Summarize Files',
        hint: 'Get a fast overview of what is in the selected files and why it matters.',
      },
      {
        id: 'extract-key-details',
        label: 'Extract Key Details',
        hint: 'Pull out names, dates, metrics, timestamps, and decision-ready facts.',
      },
      {
        id: 'build-action-plan',
        label: 'Build Action Plan',
        hint: 'Convert the selected materials into priorities, tasks, and next steps.',
      },
    ],
  },
] as const;

const FILES_ASK_AGENT_PROMPT_SECTIONS_ATHLETE: readonly FilesAskAgentPromptSection[] = [
  {
    title: 'Film Analysis',
    options: [
      {
        id: 'create-cutup-folders',
        label: 'Organize Folders',
        hint: 'Set up clean folders so your clips are easy to review week to week.',
      },
      {
        id: 'compare-film',
        label: 'Compare Film',
        hint: 'Compare clips to see what improved, what slipped, and what repeats.',
      },
      {
        id: 'pull-best-plays',
        label: 'Pull Best Plays',
        hint: 'Identify your top reps to keep reinforcing and sharing.',
      },
      {
        id: 'create-highlight',
        label: 'Create Highlight',
        hint: 'Build a clean athlete-ready highlight sequence from selected clips.',
      },
      {
        id: 'self-scout-cutup',
        label: 'Self Scout Cutup',
        hint: 'Tag tendencies and build a cutup focused on your correction priorities.',
      },
    ],
  },
  {
    title: 'Player Development',
    options: [
      {
        id: 'build-practice-plan',
        label: 'Skill Work Plan',
        hint: 'Build a focused skill session plan around your current correction priorities.',
      },
      {
        id: 'position-room-notes',
        label: 'Position Notes',
        hint: 'Generate position-specific notes for technique, keys, and corrections.',
      },
      {
        id: 'build-action-plan',
        label: 'Action Plan',
        hint: 'Turn selected film into weekly priorities and a step-by-step improvement plan.',
      },
      {
        id: 'scouting-report',
        label: 'Performance Report',
        hint: 'Summarize strengths, weak spots, and what to attack next in training.',
      },
    ],
  },
  {
    title: 'Review & Study',
    options: [
      {
        id: 'summarize-selection',
        label: 'Summarize Files',
        hint: 'Get a quick summary of what matters most in selected files.',
      },
      {
        id: 'extract-key-details',
        label: 'Extract Key Details',
        hint: 'Pull out key metrics, clips, timestamps, and cues to remember.',
      },
      {
        id: 'scout-opponent-tendencies',
        label: 'Scout Opponent Tendencies',
        hint: 'Study opponent patterns and where you can win reps.',
      },
    ],
  },
] as const;

@Component({
  selector: 'nxt1-agent-x-files-panel-inner',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    OverlayModule,
    NxtCtaButtonComponent,
    NxtIconComponent,
    NxtMarkdownComponent,
    NxtSearchBarComponent,
    NxtStateViewComponent,
    AgentXLibraryFolderTreeComponent,
    AgentXShareAccessPanelComponent,
    NxtVideoControlsComponent,
    AgentXContextDragDirective,
    AgentXLibraryChromeComponent,
    AgentXLibraryLoadingStateComponent,
    AgentXFilmReviewPanelComponent,
    AgentXViewerSurfaceComponent,
  ],
  template: `
    <nxt1-agent-x-library-chrome></nxt1-agent-x-library-chrome>
    <section class="agent-x-files-panel film-review-panel">
      @if (
        !teamId?.trim() &&
        !filesService.loading() &&
        !filesService.error() &&
        filesService.files().length === 0 &&
        filesService.folders().length === 0
      ) {
        <div class="film-state">
          <h3>No shared files yet</h3>
          <p>
            Files shared directly with you, your teams, and your organization appear here
            automatically.
          </p>
          <p>
            You can upload and organize files in your personal library immediately, and shared team
            or organization files will appear here automatically.
          </p>
        </div>
      } @else {
        @if (filesService.loading()) {
          <nxt1-agent-x-library-loading-state />
        } @else if (filesService.error()) {
          <nxt1-state-view
            variant="error"
            title="Could not load files"
            [message]="filesService.error() ?? 'Unable to load files'"
            actionLabel="Try Again"
            actionIcon="refresh"
            (action)="refreshData()"
          />
        } @else {
          @if (viewerMode() === 'library') {
            <header class="film-library-header agent-x-files-panel__toolbar">
              <div class="film-library-header__actions-primary">
                <div class="film-playbook-ask-agent">
                  <button
                    type="button"
                    class="film-playbook-nav-btn film-playbook-nav-btn--attach"
                    cdkOverlayOrigin
                    #filesAskAgentMenuOrigin="cdkOverlayOrigin"
                    aria-label="Ask Agent X about files"
                    [attr.aria-expanded]="isFilesAskAgentMenuOpen()"
                    aria-haspopup="menu"
                    (click)="onToggleFilesAskAgentMenu($event)"
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
                    @if (selectedSelectionCount() > 0) {
                      <span class="film-playbook-ask-agent__count">
                        {{ selectedSelectionCount() }}
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

                  @if (isFilesAskAgentMenuOpen()) {
                    <ng-template
                      cdkConnectedOverlay
                      [cdkConnectedOverlayOrigin]="filesAskAgentMenuOrigin"
                      [cdkConnectedOverlayOpen]="true"
                      [cdkConnectedOverlayHasBackdrop]="true"
                      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                      [cdkConnectedOverlayPositions]="askAgentMenuPositions"
                      [cdkConnectedOverlayPush]="true"
                      [cdkConnectedOverlayViewportMargin]="8"
                      (backdropClick)="onCloseFilesAskAgentMenu($event)"
                      (detach)="onCloseFilesAskAgentMenu()"
                    >
                      <div
                        class="film-playbook-ask-agent-menu film-playbook-ask-agent-menu--prompts"
                        role="menu"
                      >
                        @if (selectedSelectionCount() <= 0) {
                          <p class="film-playbook-ask-agent-menu__empty">
                            Select one or more items or folders to ask Agent... Or ask anything.
                          </p>
                        }
                        @for (section of filesAskAgentPromptSections(); track section.title) {
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
                                  [disabled]="selectedSelectionCount() <= 0"
                                  (click)="onFilesAskAgentPromptSelect(option.id, $event)"
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

                <div class="film-library-search-wrap">
                  <nxt1-search-bar
                    variant="desktop"
                    [desktopUsePlainSearchIcon]="true"
                    placeholder="Search files, folders, and outputs"
                    [value]="searchQuery()"
                    (searchInput)="onSearchInput($event)"
                    (searchClear)="onClearSearch()"
                  />
                  @if (hasSearchQuery()) {
                    <span class="film-library-search-count" aria-live="polite">
                      {{ filteredFileCount() }}
                    </span>
                  }
                </div>
              </div>

              <div class="film-library-header__actions-secondary">
                @if (hasSelectedFiles()) {
                  <button
                    type="button"
                    class="film-playbook-nav-btn"
                    [attr.aria-label]="downloadSelectedFilesButtonAriaLabel()"
                    (click)="onDownloadSelectedFiles($event)"
                  >
                    <nxt1-icon name="download" [size]="14"></nxt1-icon>
                    <span>Download</span>
                  </button>
                }

                @if (hasDeletableSelection()) {
                  <button
                    type="button"
                    class="film-playbook-nav-btn film-playbook-nav-btn--danger"
                    [disabled]="filesService.saving()"
                    [attr.aria-label]="deleteSelectedFilesButtonAriaLabel()"
                    (click)="onDeleteSelectedFiles($event)"
                  >
                    <nxt1-icon name="trash" [size]="14"></nxt1-icon>
                    <span>Delete</span>
                  </button>
                }
                <button
                  type="button"
                  class="film-playbook-nav-btn"
                  [disabled]="filesService.saving()"
                  (click)="onFolderCreateToggle($event)"
                >
                  <nxt1-icon name="plus" [size]="14"></nxt1-icon>
                  Folder
                </button>
                <div class="film-upload-menu-anchor">
                  <button
                    type="button"
                    class="film-playbook-nav-btn"
                    [disabled]="filesService.saving()"
                    [attr.aria-expanded]="isUploadMenuOpen()"
                    aria-haspopup="menu"
                    (click)="onToggleUploadMenu($event)"
                  >
                    @if (isUploadingFiles()) {
                      Uploading...
                    } @else {
                      Upload
                    }
                  </button>
                  @if (isUploadMenuOpen()) {
                    <button
                      type="button"
                      class="film-list-item__menu-backdrop"
                      aria-label="Close upload menu"
                      (click)="onCloseUploadMenu($event)"
                    ></button>
                    <div class="film-upload-menu" role="menu" aria-label="Upload destination menu">
                      @if (uploadDestinationMenuStep() === 'destination') {
                        <div class="film-upload-destination-menu">
                          <div class="film-upload-destination-menu__header">
                            <button
                              type="button"
                              class="film-upload-destination-menu__back"
                              (click)="onBackToUploadTypeMenu($event)"
                            >
                              <nxt1-icon name="chevronLeft" [size]="14"></nxt1-icon>
                              Back
                            </button>
                            <div class="film-upload-destination-menu__copy">
                              <span class="film-upload-destination-menu__title">
                                @if (uploadDestinationTarget() === 'folder') {
                                  Choose where the imported folder goes
                                } @else {
                                  Choose where the upload goes
                                }
                              </span>
                            </div>
                          </div>

                          <label class="film-upload-destination-menu__search">
                            <span class="film-upload-destination-menu__search-label">
                              Destination folder
                            </span>
                            <input
                              type="text"
                              class="film-upload-destination-menu__search-input"
                              placeholder="Search folders"
                              [value]="uploadDestinationSearchQuery()"
                              (input)="onUploadDestinationSearchInput($any($event.target).value)"
                            />
                          </label>

                          <div class="film-upload-destination-menu__options" role="none">
                            <button
                              type="button"
                              class="film-upload-destination-option"
                              [class.film-upload-destination-option--selected]="
                                uploadDestinationFolderId() === null
                              "
                              (click)="onUploadDestinationSelect(null, $event)"
                            >
                              <span class="film-upload-destination-option__row">
                                <nxt1-icon
                                  name="folder"
                                  [size]="16"
                                  class="film-upload-destination-option__icon"
                                ></nxt1-icon>
                                <span class="film-upload-destination-option__title"> Library </span>
                              </span>
                            </button>

                            @for (option of visibleUploadDestinationOptions(); track option.id) {
                              <button
                                type="button"
                                class="film-upload-destination-option"
                                [class.film-upload-destination-option--selected]="
                                  uploadDestinationFolderId() === option.id
                                "
                                (click)="onUploadDestinationSelect(option.id, $event)"
                              >
                                <span
                                  class="film-upload-destination-option__row"
                                  [style.padding-left.px]="option.depth * 16"
                                >
                                  <nxt1-icon
                                    name="folder"
                                    [size]="16"
                                    class="film-upload-destination-option__icon"
                                  ></nxt1-icon>
                                  <span class="film-upload-destination-option__title">
                                    {{ option.name }}
                                  </span>
                                </span>
                              </button>
                            }
                          </div>

                          @if (
                            visibleUploadDestinationOptions().length === 0 &&
                            uploadDestinationSearchQuery().trim().length > 0
                          ) {
                            <p class="film-upload-destination-menu__empty">
                              No folders match that search yet.
                            </p>
                          }
                        </div>
                      } @else {
                        <button
                          type="button"
                          class="film-upload-menu__option"
                          role="menuitem"
                          (click)="openFilePicker($event)"
                        >
                          <nxt1-icon
                            class="film-upload-menu__icon"
                            name="documentText"
                            [size]="15"
                            aria-hidden="true"
                          ></nxt1-icon>
                          <span class="film-upload-menu__copy">
                            <span class="film-upload-menu__label">Files</span>
                            <span class="film-upload-menu__hint"
                              >Docs, reports, playbooks, and spreadsheets.</span
                            >
                          </span>
                        </button>
                        <button
                          type="button"
                          class="film-upload-menu__option film-upload-menu__option--primary"
                          role="menuitem"
                          (click)="openFilmReviewPicker($event)"
                        >
                          <nxt1-icon
                            class="film-upload-menu__icon"
                            name="playCircle"
                            [size]="15"
                            aria-hidden="true"
                          ></nxt1-icon>
                          <span class="film-upload-menu__copy">
                            <span class="film-upload-menu__label">Film Study</span>
                            <span class="film-upload-menu__hint"
                              >Single or multiple videos with optional breakdown data.</span
                            >
                          </span>
                        </button>
                        <button
                          type="button"
                          class="film-upload-menu__option"
                          role="menuitem"
                          (click)="openMediaPicker($event)"
                        >
                          <nxt1-icon
                            class="film-upload-menu__icon"
                            name="image"
                            [size]="15"
                            aria-hidden="true"
                          ></nxt1-icon>
                          <span class="film-upload-menu__copy">
                            <span class="film-upload-menu__label">Media</span>
                            <span class="film-upload-menu__hint"
                              >Photos, videos, and audio clips for the library.</span
                            >
                          </span>
                        </button>
                        <button
                          type="button"
                          class="film-upload-menu__option"
                          role="menuitem"
                          (click)="openFolderPicker($event)"
                        >
                          <nxt1-icon
                            class="film-upload-menu__icon"
                            name="folder"
                            [size]="15"
                            aria-hidden="true"
                          ></nxt1-icon>
                          <span class="film-upload-menu__copy">
                            <span class="film-upload-menu__label">Folder</span>
                            <span class="film-upload-menu__hint"
                              >Import a full folder and preserve structure.</span
                            >
                          </span>
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
              <input
                #fileUploadInput
                type="file"
                class="film-library-file-input"
                multiple
                [attr.accept]="acceptedMimeTypes"
                (change)="onFilesSelected($event)"
              />
              <input
                #filmReviewUploadInput
                type="file"
                class="film-library-file-input"
                multiple
                [accept]="acceptedFilmReviewUploadTypes"
                (change)="onFilmReviewFilesSelected($event)"
              />
              <input
                #mediaUploadInput
                type="file"
                class="film-library-file-input"
                multiple
                [attr.accept]="acceptedMediaMimeTypes"
                (change)="onMediaFilesSelected($event)"
              />
              <input
                #folderUploadInput
                type="file"
                class="film-library-file-input"
                multiple
                webkitdirectory
                [attr.accept]="acceptedMimeTypes"
                (change)="onFolderFilesSelected($event)"
              />
            </header>

            @if (isUploadingFiles()) {
              <div class="film-library-upload-status" aria-live="polite">
                <div class="film-library-upload-status__row">
                  <span class="film-library-upload-status__label">
                    Uploading {{ filesUploadCurrentFile() }} of {{ filesUploadTotalFiles() }} files.
                  </span>
                  <div class="film-library-upload-status__actions">
                    <span class="film-library-upload-status__pct"
                      >{{ filesUploadPercent() ?? 0 }}%</span
                    >
                    @if (filesUploadCanCancel()) {
                      <button
                        type="button"
                        class="film-library-upload-status__cancel"
                        (click)="cancelActiveFilesUpload()"
                      >
                        Cancel
                      </button>
                    }
                  </div>
                </div>
                @if (filesUploadCurrentFileName(); as fileName) {
                  <p class="film-library-upload-status__hint">{{ fileName }}</p>
                }
                <div class="film-library-upload-status__track">
                  <div
                    class="film-library-upload-status__fill"
                    [style.width.%]="filesUploadPercent() ?? 0"
                  ></div>
                </div>
              </div>
            }

            @if (isCreatingFolder() && !creatingSubfolderParentId()) {
              <div class="film-playlist-create" role="group" aria-label="Create folder">
                <input
                  type="text"
                  class="film-playlist-create__input"
                  placeholder="Folder name"
                  maxlength="80"
                  [value]="folderNameDraft()"
                  (input)="onFolderNameInput($any($event.target).value)"
                  (keydown.enter)="onFolderCreateConfirm($event)"
                  (keydown.escape)="onFolderCreateCancel($event)"
                />
                <button
                  type="button"
                  class="film-playlist-create__btn film-playlist-create__btn--primary"
                  (click)="onFolderCreateConfirm($event)"
                >
                  Create
                </button>
                <button
                  type="button"
                  class="film-playlist-create__btn"
                  (click)="onFolderCreateCancel($event)"
                >
                  Cancel
                </button>
              </div>
            }

            <div class="film-library agent-x-files-panel__library-surface">
              <div
                class="agent-x-files-panel__dropzone"
                [class.agent-x-files-panel__dropzone--active]="isExternalImportDragActive()"
                (dragover)="onLibraryDragOver($event)"
                (dragleave)="onLibraryDragLeave($event)"
                (drop)="onLibraryDrop($event)"
              >
                @if (shouldShowTopLevelDropTarget()) {
                  <div
                    class="agent-x-files-panel__top-level-drop-target"
                    [class.agent-x-files-panel__top-level-drop-target--active]="
                      topLevelDropTargetActive()
                    "
                    (dragover)="onTopLevelDropDragOver($event)"
                    (dragleave)="onTopLevelDropDragLeave($event)"
                    (drop)="onTopLevelDrop($event)"
                  >
                    Drag folder here to move it back to top level
                  </div>
                }

                <nxt1-agent-x-library-folder-tree
                  [folders]="folderNodes()"
                  [controller]="folderTreeController"
                  [itemTemplate]="folderItemTemplate"
                  [emptyFolderLabel]="
                    hasSearchQuery()
                      ? 'No matching files in this folder.'
                      : 'Drag files or folders here, or upload new ones.'
                  "
                />
              </div>

              <ng-template #folderItemTemplate let-file let-folder="folder">
                <span class="film-list-item__selection">
                  <input
                    type="checkbox"
                    class="film-playbook-checkbox"
                    [checked]="isFileSelected(file.id)"
                    [attr.aria-label]="'Select file ' + file.name"
                    (click)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                    (change)="onToggleFileSelection(file.id, $event)"
                  />
                </span>

                <button
                  type="button"
                  class="film-list-item"
                  [class.film-list-item--active]="file.id === selectedId()"
                  [nxtAgentXContextDrag]="buildFileDragContextsForLibrary(file)"
                  [nxtAgentXContextDragDisabled]="isFolderItemReorderDragActive()"
                  (click)="openFile(file)"
                  (dragstart)="onFileDragStart(file, folder.items, $event)"
                  (dragend)="onFileDragEnd()"
                >
                  <div class="film-list-item__thumbnail">
                    @if (thumbnailUrlForListItem(file); as thumbnailUrl) {
                      <img
                        class="film-list-item__thumb-image"
                        [src]="thumbnailUrl"
                        [alt]="file.name"
                      />
                      @if (file.kind === 'video') {
                        <span class="film-list-item__thumbnail-icon" aria-hidden="true">
                          <nxt1-icon [name]="iconNameForFile(file)" [size]="14"></nxt1-icon>
                        </span>
                      }
                    } @else {
                      <div
                        class="film-list-item__thumb-placeholder"
                        [ngClass]="placeholderToneClassForFile(file)"
                        aria-hidden="true"
                      >
                        <nxt1-icon [name]="iconNameForFile(file)" [size]="14"></nxt1-icon>
                      </div>
                    }
                  </div>
                  <span class="film-list-item__content">
                    <span class="film-list-item__title-row">
                      <span class="film-list-item__title">{{ file.name }}</span>
                      @if (isFileShared(file)) {
                        <span class="film-list-item__shared-indicator" title="Shared file">
                          <nxt1-icon name="people" [size]="13"></nxt1-icon>
                        </span>
                      }
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  class="film-list-item__menu-btn"
                  aria-label="File options"
                  [attr.aria-expanded]="isFileMenuOpen(file.id)"
                  aria-haspopup="menu"
                  (click)="onOpenFileMenu($event, file)"
                >
                  <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                </button>

                @if (isFileMenuOpen(file.id)) {
                  <div
                    class="film-list-item__menu-backdrop"
                    (click)="onFileMenuBackdropTap()"
                  ></div>
                  <div
                    class="film-list-item__menu"
                    [class.film-list-item__menu--open-up]="
                      openFileMenuId() === file.id && openFileMenuUpward()
                    "
                    role="menu"
                    aria-label="File options"
                    (click)="$event.stopPropagation()"
                  >
                    @if (isSharingFile(file.id)) {
                      <nxt1-agent-x-share-access-panel
                        [itemId]="file.id"
                        [teamId]="file.teamId"
                        [organizationId]="file.organizationId ?? ''"
                        [principalType]="fileSharePrincipalType()"
                        [permission]="fileSharePermission()"
                        [query]="shareCandidateQuery()"
                        [loading]="shareCandidatesLoading()"
                        [candidates]="visibleShareCandidates()"
                        [grants]="shareablePrincipalsForFile(file)"
                        [selectedUserIds]="fileShareSelectedUserIds()"
                        [submitDisabled]="!canSubmitFileShare(file)"
                        [emptyAccessMessage]="'Only you can access this file right now.'"
                        (principalTypeChange)="onFileShareTypeChange($event)"
                        (permissionChange)="onFileSharePermissionChange($event)"
                        (queryChange)="onShareCandidateQueryInput($event)"
                        (candidateToggled)="onFileShareCandidateToggled(file, $event)"
                        (grantPermissionChange)="onFileShareGrantPermissionChange(file, $event)"
                        (removeGrant)="onFileShareRemove(file, $event)"
                        (submit)="onFileShareConfirm(file, $event)"
                        (cancel)="onFileShareCancel($event)"
                      />
                    } @else if (isEditingFile(file.id)) {
                      <div class="film-list-item__menu-rename">
                        <label
                          class="film-list-item__menu-label"
                          for="team-file-rename-{{ file.id }}"
                        >
                          Rename file
                        </label>
                        <input
                          id="team-file-rename-{{ file.id }}"
                          type="text"
                          class="film-list-item__menu-input"
                          maxlength="120"
                          [value]="fileRenameDraft()"
                          (input)="onFileRenameInput($any($event.target).value)"
                          (keydown.enter)="onFileRenameConfirm(file, $event)"
                          (keydown.escape)="onFileRenameCancel($event)"
                        />
                        <div class="film-list-item__menu-actions">
                          <button
                            type="button"
                            class="film-list-item__menu-action film-list-item__menu-action--primary"
                            (click)="onFileRenameConfirm(file, $event)"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            class="film-list-item__menu-action"
                            (click)="onFileRenameCancel($event)"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    } @else if (isFileDeleteConfirming(file.id)) {
                      <div class="film-list-item__menu-confirm">
                        <p class="film-list-item__menu-confirm-text">Delete this file?</p>
                        <div class="film-list-item__menu-actions">
                          <button
                            type="button"
                            class="film-list-item__menu-action film-list-item__menu-action--danger"
                            (click)="onFileDeleteConfirm(file, $event)"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            class="film-list-item__menu-action"
                            (click)="onFileDeleteCancel($event)"
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
                        (click)="onFileOpenAction(file, $event)"
                      >
                        Open
                      </button>
                      @if (canManageFileSharing(file)) {
                        <button
                          type="button"
                          class="film-list-item__menu-action"
                          role="menuitem"
                          (click)="onFileShareStart(file, $event)"
                        >
                          Share
                        </button>
                      }
                      <button
                        type="button"
                        class="film-list-item__menu-action"
                        role="menuitem"
                        (click)="onFileDownloadAction(file, $event)"
                      >
                        Download
                      </button>
                      @if (hasFileWriteAccess(file)) {
                        <button
                          type="button"
                          class="film-list-item__menu-action"
                          role="menuitem"
                          (click)="onFileRenameStart(file, $event)"
                        >
                          Rename
                        </button>
                      }
                      @if (hasFileWriteAccess(file)) {
                        <button
                          type="button"
                          class="film-list-item__menu-action film-list-item__menu-action--danger"
                          role="menuitem"
                          (click)="onFileDeleteStart(file, $event)"
                        >
                          Delete
                        </button>
                      }
                    }
                  </div>
                }
              </ng-template>
            </div>
          } @else if (viewerMode() === 'video' && selectedFilmReviewId()) {
            <nxt1-agent-x-film-review-panel
              [teamId]="teamId"
              [role]="role"
              [sport]="sport"
              [detailOnly]="true"
              [openingSelection]="isOpeningFilmReview()"
              [enableDrawTool]="enableDrawTool"
              (askAgentPromptRequested)="askAgentPromptRequested.emit($event)"
            />
          } @else if (selectedViewerFile(); as file) {
            <nxt1-agent-x-viewer-surface class="agent-x-files-viewer" aria-label="File viewer">
              @let hasWriteAccess = hasFileWriteAccess(file);
              <div
                viewer-stage
                class="agent-x-files-viewer__stage"
                [nxtAgentXContextDrag]="buildFileDragContext(file)"
                [nxtAgentXContextDragDisabled]="genericVideoControlDragLockActive()"
              >
                @if (isTextDocument(file)) {
                  <div class="agent-x-files-viewer__text">
                    @if (isMarkdownDocument(file)) {
                      <nxt1-markdown
                        class="agent-x-files-viewer__markdown"
                        [content]="file.textContent ?? ''"
                      />
                    } @else {
                      <pre class="agent-x-files-viewer__plain-text">{{
                        file.textContent ?? ''
                      }}</pre>
                    }
                  </div>
                } @else if (isImageFile(file)) {
                  <img class="agent-x-files-viewer__image" [src]="file.url" [alt]="file.name" />
                } @else if (safeSelectedPdfPreviewUrl(); as previewUrl) {
                  <div class="agent-x-files-viewer__frame-shell">
                    <button
                      type="button"
                      class="agent-x-files-viewer__iframe-drag-handle agent-x-files-viewer__drag-context-action"
                      aria-label="Drag PDF to chat"
                      title="Drag PDF to chat"
                      [nxtAgentXContextDrag]="buildFileDragContext(file)"
                    >
                      Drag PDF
                    </button>
                    <iframe
                      class="agent-x-files-viewer__frame"
                      [src]="previewUrl"
                      [title]="file.name"
                    ></iframe>
                  </div>
                } @else if (
                  isVideoFile(file) && safeSelectedVideoIframeFallbackUrl();
                  as videoIframeUrl
                ) {
                  <div class="agent-x-files-viewer__frame-shell">
                    <button
                      type="button"
                      class="agent-x-files-viewer__iframe-drag-handle agent-x-files-viewer__drag-context-action"
                      aria-label="Drag media to chat"
                      title="Drag media to chat"
                      [nxtAgentXContextDrag]="buildFileDragContext(file)"
                    >
                      Drag Media
                    </button>
                    <iframe
                      class="agent-x-files-viewer__frame"
                      [src]="videoIframeUrl"
                      [title]="file.name"
                      loading="lazy"
                      frameborder="0"
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                      allowfullscreen
                    ></iframe>
                  </div>
                } @else if (isVideoFile(file)) {
                  <div
                    #genericVideoShell
                    class="agent-x-files-viewer__video-shell"
                    aria-label="Video playback"
                  >
                    <video
                      #genericVideoPlayer
                      class="agent-x-files-viewer__video"
                      [attr.poster]="thumbnailUrlForListItem(file)"
                      playsinline
                      preload="auto"
                      (loadedmetadata)="onGenericVideoLoadedMetadata()"
                      (timeupdate)="onGenericVideoTimeUpdate()"
                      (play)="onGenericVideoPlay()"
                      (pause)="onGenericVideoPause()"
                      (ended)="onGenericVideoEnded()"
                      (error)="onGenericVideoError()"
                    ></video>

                    <div class="agent-x-files-viewer__video-controls" aria-label="Video controls">
                      <nxt1-video-controls
                        [isPlaying]="genericVideoIsPlaying()"
                        [currentTime]="genericVideoCurrentTime()"
                        [duration]="genericVideoDuration()"
                        [playbackRate]="genericVideoPlaybackRate()"
                        [showSpeedControls]="true"
                        [showFullscreen]="true"
                        [showOpenInNewWindow]="false"
                        [showAdvancedPlaybackControls]="false"
                        [showDurationBadge]="true"
                        [allowTransportCollapse]="false"
                        (pointerdown)="onGenericVideoControlsInteractionStart()"
                        (pointerup)="onGenericVideoControlsInteractionEnd()"
                        (pointercancel)="onGenericVideoControlsInteractionEnd()"
                        (pointerleave)="onGenericVideoControlsInteractionEnd()"
                        (playPause)="toggleGenericVideoPlayPause()"
                        (seekRelative)="seekGenericVideoRelative($event)"
                        (seekChange)="onGenericVideoSeekTime($event)"
                        (seekStart)="onGenericVideoSeekStart()"
                        (seekEnd)="onGenericVideoSeekEnd()"
                        (playbackRateChange)="setGenericVideoPlaybackRate($event)"
                        (openInNewWindow)="openSelectedVideoInNewWindow()"
                        (fullscreenToggle)="toggleGenericVideoFullscreen()"
                      />
                    </div>
                  </div>
                } @else {
                  <div class="agent-x-files-viewer__fallback">
                    <div class="agent-x-files-viewer__fallback-icon" aria-hidden="true">
                      <nxt1-icon [name]="iconNameForFile(file)" [size]="28"></nxt1-icon>
                    </div>
                    <div class="agent-x-files-viewer__fallback-copy">
                      <h3>{{ file.name }}</h3>
                      <p>{{ viewerFallbackMessage(file) }}</p>
                    </div>
                    <div class="agent-x-files-viewer__fallback-actions">
                      <button
                        type="button"
                        class="agent-x-files-viewer__icon-action"
                        [attr.aria-label]="openActionLabelForFile(file)"
                        [attr.title]="openActionLabelForFile(file)"
                        (click)="openFileInNewTab(file)"
                      >
                        <nxt1-icon name="openInNew" [size]="16"></nxt1-icon>
                      </button>
                      <button
                        type="button"
                        class="agent-x-files-viewer__icon-action"
                        aria-label="Download"
                        title="Download"
                        (click)="downloadFile(file)"
                      >
                        <nxt1-icon name="download" [size]="16"></nxt1-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <div
                viewer-context
                class="agent-x-files-viewer__context"
                aria-label="File context panel"
              >
                <div class="agent-x-files-viewer__context-header">
                  <div class="agent-x-files-viewer__context-header-main">
                    <div class="agent-x-files-viewer__context-heading">
                      <div class="agent-x-files-viewer__title-row">
                        @if (isEditingFile(file.id)) {
                          <div class="agent-x-files-viewer__title-edit-row">
                            <input
                              type="text"
                              class="agent-x-files-viewer__title-input"
                              [value]="fileRenameDraft()"
                              (input)="onFileRenameInput($any($event.target).value)"
                              (keydown.enter)="onFileRenameConfirm(file, $event)"
                              (keydown.escape)="onFileRenameCancel($event)"
                            />
                            <div class="agent-x-files-viewer__title-edit-actions">
                              <button
                                type="button"
                                class="agent-x-files-viewer__icon-action"
                                aria-label="Save title"
                                title="Save title"
                                (click)="onFileRenameConfirm(file, $event)"
                              >
                                <nxt1-icon name="checkmark" [size]="14"></nxt1-icon>
                              </button>
                              <button
                                type="button"
                                class="agent-x-files-viewer__icon-action"
                                aria-label="Cancel title edit"
                                title="Cancel title edit"
                                (click)="onFileRenameCancel($event)"
                              >
                                <nxt1-icon name="close" [size]="14"></nxt1-icon>
                              </button>
                            </div>
                          </div>
                        } @else {
                          <div class="agent-x-files-viewer__title-display-row">
                            <h3 class="agent-x-files-viewer__title">{{ file.name }}</h3>
                            <button
                              type="button"
                              class="agent-x-files-viewer__title-edit-trigger"
                              aria-label="Edit title"
                              title="Edit title"
                              (click)="onFileRenameStart(file, $event)"
                            >
                              <nxt1-icon name="pencil" [size]="14"></nxt1-icon>
                            </button>
                          </div>
                        }
                      </div>
                      @if (shouldShowGenerateNotes(file)) {
                        <div class="agent-x-files-viewer__generate-action">
                          <div class="agent-x-files-viewer__generate-notes">
                            <nxt1-cta-button
                              variant="primary"
                              [label]="
                                isGeneratingNotes(file.id)
                                  ? 'Generating Notes...'
                                  : 'Generate Notes'
                              "
                              [disabled]="isGeneratingNotes(file.id) || !hasWriteAccess"
                              (clicked)="generateNotes(file)"
                            />
                            <p class="agent-x-files-viewer__generate-note">
                              {{ generateNotesHelperCopy() }}
                            </p>
                          </div>
                        </div>
                      }
                      @if (!shouldShowGenerateNotes(file)) {
                        <div class="agent-x-files-viewer__metadata-editor">
                          <label class="agent-x-files-viewer__metadata-field">
                            <span>Summary</span>
                            <textarea
                              class="agent-x-files-viewer__metadata-textarea"
                              spellcheck="true"
                              rows="3"
                              placeholder="Add a concise summary for this file."
                              [value]="editingSummary(file)"
                              (input)="onSummaryEdit($event, file.id)"
                            ></textarea>
                          </label>
                          <div class="agent-x-files-viewer__metadata-actions">
                            @if (hasWriteAccess) {
                              <nxt1-cta-button
                                variant="primary"
                                [label]="isSavingMetadata() ? 'Saving...' : 'Save Summary'"
                                [disabled]="isSavingMetadata() || !hasPendingMetadataChanges(file)"
                                (clicked)="saveMetadata(file)"
                              />
                            }
                          </div>
                        </div>
                      }
                    </div>

                    <div class="agent-x-files-viewer__context-actions">
                      <button
                        type="button"
                        class="agent-x-files-viewer__icon-action"
                        [attr.aria-label]="openActionLabelForFile(file)"
                        [attr.title]="openActionLabelForFile(file)"
                        (click)="openFileInNewTab(file)"
                      >
                        <nxt1-icon name="openInNew" [size]="16"></nxt1-icon>
                      </button>
                      <button
                        type="button"
                        class="agent-x-files-viewer__icon-action"
                        aria-label="Download"
                        title="Download"
                        (click)="downloadFile(file)"
                      >
                        <nxt1-icon name="download" [size]="16"></nxt1-icon>
                      </button>
                    </div>
                  </div>
                </div>

                <section class="agent-x-files-viewer__content-section">
                  @if (!shouldShowGenerateNotes(file)) {
                    <textarea
                      class="agent-x-files-viewer__content-textarea"
                      spellcheck="true"
                      placeholder="Add a detailed summary, play notes, game-plan context, or any other plain-language details for this file."
                      [value]="editingTextContent(file)"
                      (input)="onTextContentEdit($event, file.id)"
                    ></textarea>
                    <div class="agent-x-files-viewer__content-actions">
                      @if (hasWriteAccess) {
                        <nxt1-cta-button
                          variant="primary"
                          [label]="
                            isGeneratingNotes(file.id) ? 'Resyncing Notes...' : 'Resync Notes'
                          "
                          [disabled]="isGeneratingNotes(file.id) || isSavingTextContent()"
                          (clicked)="generateNotes(file)"
                        />
                        <nxt1-cta-button
                          variant="primary"
                          [label]="isSavingTextContent() ? 'Saving...' : 'Save Notes'"
                          [disabled]="
                            isSavingTextContent() || textContentDrafts()[file.id] === undefined
                          "
                          (clicked)="saveTextContent(file.id)"
                        />
                      }
                    </div>
                  }
                </section>
              </div>
            </nxt1-agent-x-viewer-surface>
          }
        }
      }
    </section>
  `,
  styles: [
    `
      .agent-x-files-panel {
        display: grid;
        gap: 16px;
        padding: 12px;
      }

      .agent-x-files-panel__toolbar {
        padding: 0;
        align-items: center;
        flex-wrap: nowrap;
      }

      .agent-x-files-panel__toolbar .film-library-header__actions-primary {
        flex: 1 1 auto;
        min-width: 0;
        flex-wrap: nowrap;
      }

      .agent-x-files-panel__toolbar .film-library-header__actions-secondary {
        flex: 0 0 auto;
        flex-wrap: nowrap;
        margin-left: auto;
      }

      .agent-x-files-panel__toolbar .film-library-search-wrap {
        flex: 1 1 auto;
      }

      @media (max-width: 680px) {
        .agent-x-files-panel__toolbar {
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .agent-x-files-panel__toolbar .film-library-header__actions-primary {
          flex-basis: 100%;
          width: 100%;
          flex-wrap: wrap;
        }

        .agent-x-files-panel__toolbar .film-library-header__actions-secondary {
          width: 100%;
          flex-wrap: wrap;
          margin-left: 0;
        }

        .agent-x-files-panel__toolbar .film-library-search-wrap {
          min-width: 100%;
        }

        .agent-x-files-panel__toolbar
          .film-library-header__actions-secondary
          .film-playbook-nav-btn {
          justify-content: center;
          width: 100%;
        }
      }

      .agent-x-files-panel__count,
      .agent-x-files-panel__detail-kicker,
      .agent-x-files-panel__detail-meta {
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
      }

      .film-state {
        border: 2px dashed var(--nxt1-color-border-default);
        border-radius: 16px;
        padding: 20px;
        text-align: center;
        background: var(--nxt1-color-surface-100);
      }

      .film-state {
        display: grid;
        gap: 8px;
      }

      .film-state--error {
        border-color: var(--nxt1-color-danger-500, #c53030);
      }

      .film-state p {
        margin: 0;
      }

      .agent-x-files-panel__library-surface {
        width: 100%;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .agent-x-files-panel__dropzone {
        width: 100%;
        min-width: 0;
        border: 1px solid transparent;
        border-radius: 18px;
        transition:
          border-color 140ms ease,
          background-color 140ms ease,
          box-shadow 140ms ease;
      }

      .agent-x-files-panel__dropzone--active {
        border-color: color-mix(in srgb, var(--nxt1-color-brand-primary, #2563eb) 52%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-brand-primary, #2563eb) 7%, transparent);
        box-shadow: 0 0 0 1px
          color-mix(in srgb, var(--nxt1-color-brand-primary, #2563eb) 18%, transparent);
      }

      .agent-x-files-panel__top-level-drop-target {
        border: 1px dashed color-mix(in srgb, var(--nxt1-color-border-default) 78%, transparent);
        border-radius: 12px;
        padding: 10px 12px;
        margin: 8px 8px 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        text-align: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 85%, transparent);
        transition:
          border-color 140ms ease,
          background-color 140ms ease,
          color 140ms ease;
      }

      .agent-x-files-panel__top-level-drop-target--active {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-brand-primary, var(--nxt1-color-primary)) 55%,
          transparent
        );
        background: color-mix(
          in srgb,
          var(--nxt1-color-brand-primary, var(--nxt1-color-primary)) 10%,
          transparent
        );
        color: color-mix(
          in srgb,
          var(--nxt1-color-brand-primary, var(--nxt1-color-primary)) 85%,
          var(--nxt1-color-text-primary)
        );
      }

      .agent-x-files-viewer__stage,
      .agent-x-files-viewer__context {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 82%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 94%, #03111f 6%);
        border-radius: 18px;
        overflow: hidden;
      }

      .agent-x-files-viewer__stage.agent-x-context-drag-source {
        cursor: grab;
      }

      .agent-x-files-viewer__stage.agent-x-context-drag-source--dragging {
        cursor: grabbing;
      }
      .agent-x-files-viewer__stage {
        min-height: 420px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100);
      }

      .agent-x-files-viewer__video-shell {
        position: relative;
        width: 100%;
        min-height: 420px;
        max-height: 72vh;
        display: flex;
        align-items: stretch;
        justify-content: center;
        background:
          radial-gradient(circle at top, rgba(37, 99, 235, 0.16), transparent 42%),
          var(--nxt1-color-surface-100);
      }

      .agent-x-files-viewer__image,
      .agent-x-files-viewer__frame,
      .agent-x-files-viewer__video {
        width: 100%;
        min-height: 420px;
        max-height: 72vh;
        border: 0;
        display: block;
        object-fit: contain;
        background: var(--nxt1-color-surface-100);
      }

      .agent-x-files-viewer__frame-shell {
        position: relative;
        width: 100%;
      }

      .agent-x-files-viewer__iframe-drag-handle {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 2;
      }

      .agent-x-files-viewer__video-controls {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 1;
        pointer-events: none;
      }

      .agent-x-files-viewer__video-controls nxt1-video-controls {
        pointer-events: auto;
      }

      .agent-x-files-viewer__text {
        width: 100%;
        min-height: 420px;
        max-height: 72vh;
        overflow: auto;
        padding: 24px;
        color: var(--nxt1-color-text-primary);
      }

      .agent-x-files-viewer__markdown {
        display: block;
        width: min(100%, 840px);
        margin: 0 auto;
      }

      .agent-x-files-viewer__plain-text {
        width: min(100%, 840px);
        margin: 0 auto;
        white-space: pre-wrap;
        word-break: break-word;
        font: inherit;
        line-height: 1.65;
        color: inherit;
      }

      .agent-x-files-viewer__fallback {
        display: grid;
        gap: 14px;
        justify-items: start;
        padding: 28px;
        color: #e6eef8;
      }

      .agent-x-files-viewer__fallback-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .agent-x-files-viewer__fallback-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(148, 163, 184, 0.18);
      }

      .agent-x-files-viewer__fallback-copy {
        display: grid;
        gap: 8px;
      }

      .agent-x-files-viewer__fallback-copy h3,
      .agent-x-files-viewer__context-header h3 {
        margin: 0;
      }

      .agent-x-files-viewer__fallback-copy p,
      .agent-x-files-viewer__context-header p {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.5;
      }

      .agent-x-files-viewer__context {
        display: grid;
        gap: 18px;
        padding: 20px;
        min-height: 180px;
      }

      .agent-x-files-viewer__context-header {
        display: grid;
        gap: 12px;
      }

      .agent-x-files-viewer__context-header-main {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .agent-x-files-viewer__context-heading {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
        min-width: 0;
        flex: 1 1 320px;
      }

      .agent-x-files-viewer__title-row,
      .agent-x-files-viewer__title-display-row,
      .agent-x-files-viewer__title-edit-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        min-width: 0;
      }

      .agent-x-files-viewer__title-display-row {
        justify-content: flex-start;
      }

      .agent-x-files-viewer__title {
        margin: 0;
        min-width: 0;
        font-size: 18px;
        line-height: 1.25;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .agent-x-files-viewer__title-edit-trigger {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        border-radius: 999px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          color 0.18s ease,
          background 0.18s ease;
      }

      .film-upload-menu-anchor {
        position: relative;
      }

      .film-upload-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 30;
        min-width: 280px;
        max-width: min(320px, calc(100vw - 24px));
        display: grid;
        gap: 6px;
        padding: 8px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 12px;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 94%,
          var(--nxt1-color-surface-200) 6%
        );
        box-shadow: var(--nxt1-navigation-dropdown);
      }

      .film-upload-menu__option {
        width: 100%;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 10px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 80%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        color: var(--nxt1-color-text-primary);
        text-align: left;
        padding: 8px 10px;
        cursor: pointer;
        transition:
          border-color 140ms ease,
          background-color 140ms ease,
          box-shadow 140ms ease;
      }

      .film-upload-menu__option:hover,
      .film-upload-menu__option:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 8%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        outline: none;
      }

      .film-upload-menu__option--primary {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 34%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
      }

      .film-upload-menu__icon {
        display: inline-flex;
        color: var(--nxt1-color-text-secondary);
      }

      .film-upload-menu__option--primary .film-upload-menu__icon {
        color: var(--nxt1-color-primary);
      }

      .film-upload-menu__copy {
        min-width: 0;
      }

      .film-upload-menu__label,
      .film-upload-menu__hint {
        display: block;
      }

      .film-upload-menu__label {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
      }

      .film-upload-menu__hint {
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.4;
        color: var(--nxt1-color-text-secondary);
      }

      .film-upload-destination-menu {
        display: grid;
        gap: 10px;
        padding: 2px;
      }

      .film-upload-destination-menu__header,
      .film-upload-destination-menu__copy,
      .film-upload-destination-menu__search {
        display: grid;
      }

      .film-upload-destination-menu__header {
        gap: 10px;
      }

      .film-upload-destination-menu__copy {
        gap: 4px;
      }

      .film-upload-destination-menu__title {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        color: var(--nxt1-color-text-primary);
      }

      .film-upload-destination-menu__subtitle,
      .film-upload-destination-menu__empty,
      .film-upload-destination-menu__search-label {
        font-size: 11px;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary);
      }

      .film-upload-destination-menu__back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: fit-content;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 56%, transparent);
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition:
          border-color 140ms ease,
          background-color 140ms ease,
          color 140ms ease;
      }

      .film-upload-destination-menu__back:hover,
      .film-upload-destination-menu__back:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 34%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        color: var(--nxt1-color-text-primary);
        outline: none;
      }

      .film-upload-destination-menu__search {
        gap: 6px;
      }

      .film-upload-destination-menu__search-input {
        width: 100%;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 94%,
          var(--nxt1-color-surface-200) 6%
        );
        color: var(--nxt1-color-text-primary);
        padding: 10px 12px;
        font: inherit;
      }

      .film-upload-destination-menu__search-input:focus {
        outline: 2px solid color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
        outline-offset: 1px;
      }

      .film-upload-destination-menu__options {
        display: grid;
        gap: 6px;
        max-height: min(240px, 38vh);
        overflow-y: auto;
        padding-right: 2px;
      }

      .film-upload-destination-option {
        display: block;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 88%, transparent);
        background: transparent;
        cursor: pointer;
        transition:
          border-color 140ms ease,
          background-color 140ms ease,
          box-shadow 140ms ease;
      }

      .film-upload-destination-option__row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
      }

      .film-upload-destination-option__icon {
        color: var(--nxt1-color-text-secondary);
        flex: 0 0 auto;
      }

      .film-upload-destination-option:hover,
      .film-upload-destination-option:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 26%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 7%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
        outline: none;
      }

      .film-upload-destination-option--selected {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 34%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 9%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
      }

      .film-upload-destination-option--selected .film-upload-destination-option__icon {
        color: var(--nxt1-color-primary);
      }

      .film-upload-destination-option__title {
        display: inline-block;
        min-width: 0;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
        color: var(--nxt1-color-text-primary);
      }

      .film-upload-destination-menu__empty {
        margin: 0;
        padding: 4px 2px 0;
      }

      .film-library-upload-status {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        padding: 8px 10px;
        background: var(--nxt1-color-surface-100);
        margin-top: 6px;
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
        margin: 0;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }

      .film-library-upload-status__fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        transition: width 0.16s ease;
      }

      .agent-x-files-viewer__context-summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 14px;
        line-height: 1.6;
      }

      .agent-x-files-viewer__metadata-editor {
        display: grid;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .agent-x-files-viewer__generate-action {
        display: flex;
        justify-content: flex-start;
        width: 100%;
      }

      .agent-x-files-viewer__generate-notes {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
        max-width: 420px;
      }

      .agent-x-files-viewer__generate-note {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-files-viewer__metadata-field {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .agent-x-files-viewer__metadata-field > span {
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .agent-x-files-viewer__metadata-input,
      .agent-x-files-viewer__metadata-textarea {
        width: 100%;
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font: inherit;
      }

      .agent-x-files-viewer__metadata-input {
        min-height: 46px;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .agent-x-files-viewer__metadata-textarea {
        min-height: 88px;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        line-height: 1.5;
        resize: vertical;
      }

      .agent-x-files-viewer__metadata-input:focus,
      .agent-x-files-viewer__metadata-textarea:focus {
        outline: none;
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 60%,
          var(--nxt1-color-border-default)
        );
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .agent-x-files-viewer__metadata-actions {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .agent-x-files-viewer__drag-context-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 0 var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-pill, 999px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .agent-x-files-viewer__drag-context-action:hover {
        color: var(--nxt1-color-text-primary);
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 44%, transparent);
      }

      .agent-x-files-viewer__drag-context-action.agent-x-context-drag-source:not(
          .agent-x-context-drag-source--disabled
        ) {
        cursor: grab;
      }

      .agent-x-files-viewer__drag-context-action.agent-x-context-drag-source--dragging {
        cursor: grabbing;
      }

      .agent-x-files-viewer__drag-context-action.agent-x-context-drag-source--disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }

      .agent-x-files-viewer__tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .agent-x-files-viewer__tag-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 72%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .agent-x-files-viewer__context-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .agent-x-files-viewer__icon-action {
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 76%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 92%, transparent);
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          background 0.18s ease,
          color 0.18s ease,
          transform 0.18s ease;
      }

      .agent-x-files-viewer__icon-action:hover,
      .agent-x-files-viewer__icon-action:focus-visible {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 45%,
          var(--nxt1-color-border-default)
        );
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 10%,
          var(--nxt1-color-surface-100)
        );
        color: var(--nxt1-color-primary);
        outline: none;
        transform: translateY(-1px);
      }

      .agent-x-files-viewer__icon-action:active {
        transform: translateY(0);
      }

      .agent-x-files-viewer__context-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .agent-x-files-viewer__badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 75%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 72%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .agent-x-files-viewer__eyebrow {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-files-viewer__overview-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .agent-x-files-viewer__overview-card,
      .agent-x-files-viewer__detail-panel {
        display: grid;
        gap: 8px;
        padding: 16px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 76%, transparent);
        border-radius: 14px;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-050, rgba(255, 255, 255, 0.03)) 88%,
          transparent
        );
      }

      .agent-x-files-viewer__overview-card--primary {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-brand-primary, #7cff00) 13%, transparent),
          color-mix(
            in srgb,
            var(--nxt1-color-surface-050, rgba(255, 255, 255, 0.03)) 92%,
            transparent
          )
        );
      }

      .agent-x-files-viewer__overview-label {
        font-size: 10px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-files-viewer__overview-value {
        font-size: 18px;
        line-height: 1.2;
        color: var(--nxt1-color-text-primary);
      }

      .agent-x-files-viewer__overview-card p,
      .agent-x-files-viewer__snippet {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.5;
      }

      .agent-x-files-viewer__detail-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .agent-x-files-viewer__detail-panel--full {
        width: 100%;
      }

      .agent-x-files-viewer__content-section {
        display: grid;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      .agent-x-files-viewer__content-actions {
        display: flex;
        justify-content: flex-start;
      }

      .agent-x-files-viewer__detail-list {
        display: grid;
        gap: 10px;
        margin: 0;
      }

      .agent-x-files-viewer__detail-row {
        display: grid;
        gap: 4px;
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 55%, transparent);
      }

      .agent-x-files-viewer__detail-row--multiline {
        align-items: start;
      }

      .agent-x-files-viewer__detail-row:first-child {
        padding-top: 0;
        border-top: 0;
      }

      .agent-x-files-viewer__detail-row dt {
        font-size: 10px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-files-viewer__detail-row dd {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .agent-x-files-viewer__snippet {
        white-space: pre-wrap;
      }

      .agent-x-files-viewer__content-textarea {
        width: 100%;
        min-height: 320px;
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        font-family: inherit;
        box-shadow: var(--nxt1-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.3));
      }

      .agent-x-files-viewer__content-textarea:focus {
        outline: none;
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 60%,
          var(--nxt1-color-border-default)
        );
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--nxt1-color-primary) 16%, transparent);
      }

      .agent-x-files-viewer__content-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      @media (max-width: 980px) {
        .agent-x-files-viewer__overview-grid,
        .agent-x-files-viewer__detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }
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

      .film-list-item__title-row {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .film-list-item__thumbnail,
      .film-list-item__thumb-image,
      .film-list-item__thumb-placeholder {
        cursor: pointer;
      }

      .film-list-item__shared-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-brand-primary, var(--nxt1-color-primary));
        flex: 0 0 auto;
      }

      .film-list-item__thumbnail-icon {
        position: absolute;
        inset: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: color-mix(in srgb, white 88%, var(--nxt1-color-text-primary));
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.42));
        pointer-events: none;
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

      .film-list-item__menu-share,
      .film-list-item__menu-share-list {
        display: grid;
        gap: 8px;
      }

      .film-list-item__menu-share-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-050, rgba(255, 255, 255, 0.02));
        color: var(--nxt1-color-text-primary);
        font-size: 11px;
      }

      .film-list-item__menu-share-remove {
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
      }

      .film-list-item__menu-help {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        line-height: 1.4;
      }

      @media (max-width: 920px) {
        .film-playbook-ask-agent-menu--prompts {
          width: min(520px, 92vw);
          max-width: min(520px, 92vw);
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilesPanelInnerComponent implements OnChanges, OnDestroy {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;

  readonly askAgentPromptRequested = output<string>();
  readonly inlineVideoViewChange = output<boolean>();

  protected readonly filesService = inject(AgentXFilesService);
  private readonly filmReviewService = inject(AgentXFilmReviewService);
  private readonly uploadService = inject(AgentXVideoUploadService);
  private readonly agentXJobService = inject(AgentXJobService);
  private readonly agentXService = inject(AgentXService);
  private readonly auth = inject(Auth, { optional: true });
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(NxtToastService);
  private readonly archive = inject(NxtArchiveService);
  private readonly filmReviewPanel = viewChild(AgentXFilmReviewPanelComponent);
  private readonly genericVideoPlayer =
    viewChild<ElementRef<HTMLVideoElement>>('genericVideoPlayer');
  private readonly genericVideoShell = viewChild<ElementRef<HTMLElement>>('genericVideoShell');
  private genericHls: Hls | null = null;
  private genericHlsConstructor: typeof Hls | null = null;
  private genericHlsLoadPromise: Promise<typeof Hls | null> | null = null;
  private genericVideoSourceUrl: string | null = null;
  private genericVideoSourceSyncToken = 0;
  private genericVideoRafId: number | null = null;
  protected readonly genericCloudflareNativePlaybackFailed = signal<Record<string, true>>({});
  private readonly fileUploadInput =
    viewChild.required<ElementRef<HTMLInputElement>>('fileUploadInput');
  private readonly filmReviewUploadInput =
    viewChild.required<ElementRef<HTMLInputElement>>('filmReviewUploadInput');
  private readonly mediaUploadInput =
    viewChild.required<ElementRef<HTMLInputElement>>('mediaUploadInput');
  private readonly folderUploadInput =
    viewChild.required<ElementRef<HTMLInputElement>>('folderUploadInput');
  private readonly expandedFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly openFolderMenuId = signal<string | null>(null);
  protected readonly openFolderMenuUpward = signal(false);
  protected readonly isCreatingFolder = signal(false);
  protected readonly folderNameDraft = signal('');
  protected readonly creatingSubfolderParentId = signal<string | null>(null);
  protected readonly editingFolderId = signal<string | null>(null);
  protected readonly sharingFolderId = signal<string | null>(null);
  protected readonly deleteFolderConfirmId = signal<string | null>(null);
  protected readonly folderRenameDraft = signal('');
  protected readonly folderSharePrincipalType = signal<FileSharePrincipalType>('user');
  protected readonly folderSharePermission = signal<FileSharePermission>('read');
  protected readonly folderSharePrincipalId = signal('');
  protected readonly folderShareSelectedUserIds = signal<readonly string[]>([]);
  protected readonly shareCandidateQuery = signal('');
  protected readonly shareCandidates = signal<readonly AgentXShareMemberOption[]>([]);
  protected readonly shareCandidatesLoading = signal(false);
  private shareCandidatesRequestId = 0;
  protected readonly openFileMenuId = signal<string | null>(null);
  protected readonly openFileMenuUpward = signal(false);
  protected readonly isUploadMenuVisible = signal(false);
  protected readonly uploadDestinationMenuStep = signal<'menu' | 'destination'>('menu');
  protected readonly uploadDestinationTarget = signal<UploadDestinationPickerTarget | null>(null);
  protected readonly uploadDestinationPendingMode = signal<'file' | 'film_review' | 'media'>(
    'file'
  );
  protected readonly uploadDestinationSearchQuery = signal('');
  protected readonly uploadDestinationFolderId = signal<string | null>(null);
  protected readonly isUploadingFiles = signal(false);
  protected readonly filesUploadPercent = signal<number | null>(null);
  protected readonly filesUploadCurrentFile = signal(0);
  protected readonly filesUploadTotalFiles = signal(0);
  protected readonly filesUploadCurrentFileName = signal<string | null>(null);
  protected readonly filesUploadCanCancel = signal(false);
  protected readonly filesUploadError = signal<string | null>(null);
  protected readonly sharingFileId = signal<string | null>(null);
  protected readonly editingFileId = signal<string | null>(null);
  protected readonly deleteFileConfirmId = signal<string | null>(null);
  protected readonly fileRenameDraft = signal('');
  protected readonly fileSharePrincipalType = signal<FileSharePrincipalType>('user');
  protected readonly fileSharePermission = signal<FileSharePermission>('read');
  protected readonly fileSharePrincipalId = signal('');
  protected readonly fileShareSelectedUserIds = signal<readonly string[]>([]);
  protected readonly activeFolderDropTargetId = signal<string | null>(null);
  protected readonly draggingFolderId = signal<string | null>(null);
  protected readonly draggingFileIds = signal<ReadonlySet<string>>(new Set());
  protected readonly topLevelDropTargetActive = signal(false);
  protected readonly isFolderItemReorderDragActive = signal(false);
  protected readonly folderOrderByParentId = signal<Record<string, readonly string[]>>({});
  protected readonly folderItemOrderByFolderId = signal<Record<string, readonly string[]>>({});
  protected readonly searchQuery = signal('');
  protected readonly summaryDrafts = signal<Record<string, string>>({});
  protected readonly isSavingMetadata = signal(false);
  protected readonly textContentDrafts = signal<Record<string, string>>({});
  protected readonly isSavingTextContent = signal(false);
  protected readonly generatingNotesFileIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedFileIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly isFilesAskAgentMenuVisible = signal(false);
  protected readonly isExternalImportDragActive = signal(false);
  protected readonly viewerMode = signal<'library' | 'video' | 'generic'>('library');
  protected readonly selectedFilmReviewId = signal<string | null>(null);
  protected readonly isOpeningFilmReview = signal(false);
  protected readonly openPanelTabs = signal<readonly FilesPanelOpenTabRef[]>([]);
  protected readonly genericOpenTabIds = signal<readonly string[]>([]);
  protected readonly genericVideoIsPlaying = signal(false);
  protected readonly genericVideoCurrentTime = signal(0);
  protected readonly genericVideoDuration = signal(0);
  protected readonly genericVideoPlaybackRate = signal(1);
  protected readonly genericVideoControlDragLockActive = signal(false);
  private readonly pendingFilmReviewId = signal<string | null>(null);
  private readonly queuedUploadFolderId = signal<string | null | undefined>(undefined);
  private readonly lastUsedUploadFolderId = signal<string | null>(null);
  private activeFilesUploadHandle: AgentXFilesUploadHandle | null = null;
  private activeLibraryUploadHandle: VideoUploadHandle | null = null;
  private activeFilesUploadSubscription: Subscription | null = null;
  private readonly dragAutoScrollEdgePx = 88;
  private readonly dragAutoScrollMinStepPx = 4;
  private readonly dragAutoScrollMaxStepPx = 24;

  protected readonly acceptedMimeTypes = [...AGENT_X_ALLOWED_MIME_TYPES].join(',');
  protected readonly acceptedVideoUploadTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
    'video/avi',
    '.mp4',
    '.mov',
    '.m4v',
    '.webm',
    '.avi',
    '.mkv',
  ].join(',');
  protected readonly acceptedBreakdownTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv',
    '.xls',
    '.xlsx',
  ].join(',');
  protected readonly acceptedFilmReviewUploadTypes = [
    this.acceptedVideoUploadTypes,
    this.acceptedBreakdownTypes,
  ].join(',');
  protected readonly acceptedMediaMimeTypes = AGENT_X_ALLOWED_MIME_TYPES.filter((type) => {
    if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) {
      return true;
    }

    return /\.(png|jpe?g|webp|gif|bmp|heic|mp4|mov|m4v|webm|avi|mkv|mp3|wav|m4a|aac|ogg)$/i.test(
      type
    );
  }).join(',');

  protected readonly isAthleteRole = computed(() => {
    const role = this.role?.trim().toLowerCase();
    if (role) {
      return role === USER_ROLES.ATHLETE;
    }

    return this.agentXService.hasRole(USER_ROLES.ATHLETE);
  });
  protected readonly filesAskAgentPromptSections = computed(() =>
    this.isAthleteRole()
      ? FILES_ASK_AGENT_PROMPT_SECTIONS_ATHLETE
      : FILES_ASK_AGENT_PROMPT_SECTIONS_COACH
  );
  protected readonly generateNotesHelperCopy = computed(() =>
    this.isAthleteRole()
      ? 'Generate notes so your agent can quickly see what happened, what matters most, and what to focus on next.'
      : 'Generate notes so coaches and staff can align quickly on what happened, what matters most, and what to coach next.'
  );
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  protected readonly askAgentMenuPositions: ConnectedPosition[] = [
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
  protected readonly hasSearchQuery = computed(() => this.searchQuery().trim().length > 0);
  protected readonly normalizedSearchQuery = computed(() =>
    this.searchQuery().trim().toLowerCase()
  );
  protected readonly filteredFiles = computed(() => {
    const query = this.normalizedSearchQuery();
    const files = this.filesService.files();
    if (!query) {
      return files;
    }

    return files.filter((file) => {
      const source = `${file.name} ${file.kind} ${file.origin} ${file.sport ?? ''}`.toLowerCase();
      return source.includes(query);
    });
  });
  protected readonly filteredFileCount = computed(() => this.filteredFiles().length);
  protected readonly selectedFiles = computed<readonly AgentXLibraryFile[]>(() => {
    const selectedIds = this.selectedFileIds();
    if (selectedIds.size === 0) {
      return [];
    }

    return this.filesService.files().filter((file) => selectedIds.has(file.id));
  });
  protected readonly allFolderNodes = computed<readonly TeamFileTreeNode[]>(() =>
    this.buildFolderTree(this.filesService.folders(), this.filesService.files(), '')
  );
  protected readonly uploadDestinationOptions = computed<readonly UploadDestinationOption[]>(() =>
    this.flattenUploadDestinationOptions(this.allFolderNodes())
  );
  protected readonly visibleUploadDestinationOptions = computed<readonly UploadDestinationOption[]>(
    () => {
      const query = this.uploadDestinationSearchQuery().trim().toLowerCase();
      const options = this.uploadDestinationOptions();
      if (!query) {
        return options;
      }

      return options.filter((option) => option.normalizedName.includes(query));
    }
  );
  protected readonly selectedFolders = computed<readonly TeamFileTreeNode[]>(() => {
    const selectedFolderIds = this.selectedFolderIds();
    if (selectedFolderIds.size === 0) {
      return [];
    }

    const selectedFolders: TeamFileTreeNode[] = [];
    for (const folderId of selectedFolderIds) {
      const folder = this.findFolderNodeById(folderId, this.allFolderNodes());
      if (folder) {
        selectedFolders.push(folder);
      }
    }

    return selectedFolders;
  });
  protected readonly selectedFilesOutsideFolders = computed<readonly AgentXLibraryFile[]>(() => {
    const selectedFiles = this.selectedFiles();
    const selectedFolders = this.selectedFolders();
    if (selectedFolders.length === 0) {
      return selectedFiles;
    }

    const coveredFileIds = new Set<string>();
    for (const folder of selectedFolders) {
      for (const fileId of this.collectFolderFileIds(folder)) {
        coveredFileIds.add(fileId);
      }
    }

    return selectedFiles.filter((file) => !coveredFileIds.has(file.id));
  });
  protected readonly selectedFileCount = computed(() => this.selectedFiles().length);
  protected readonly selectedFoldersWithoutFiles = computed<readonly TeamFileTreeNode[]>(() =>
    this.selectedFolders().filter((folder) => this.collectFolderFileIds(folder).length === 0)
  );
  protected readonly selectedSelectionCount = computed(
    () => this.selectedFolders().length + this.selectedFilesOutsideFolders().length
  );
  protected readonly hasSelectedFiles = computed(() => this.selectedFileCount() > 0);
  protected readonly deletableSelectionCount = computed(
    () => this.selectedFileCount() + this.selectedFoldersWithoutFiles().length
  );
  protected readonly hasDeletableSelection = computed(() => this.deletableSelectionCount() > 0);
  protected readonly genericOpenTabs = computed<readonly AgentXLibraryFile[]>(() => {
    const filesById = new Map(this.filesService.files().map((file) => [file.id, file] as const));

    return this.genericOpenTabIds()
      .map((fileId) => filesById.get(fileId))
      .filter((file): file is AgentXLibraryFile => file !== undefined);
  });
  protected readonly headerVisibleTabs = computed<readonly AgentXLibraryFile[]>(() => {
    const filesById = new Map(this.filesService.files().map((file) => [file.id, file] as const));
    const reviewsById = new Map(
      this.filmReviewService.reviews().map((review) => [review.id, review] as const)
    );

    return this.openPanelTabs()
      .map((tabRef) => {
        if (tabRef.kind === 'file') {
          const file = filesById.get(tabRef.id);
          return file ? { ...file, id: this.buildPanelTabId('file', file.id) } : null;
        }

        const review = reviewsById.get(tabRef.id);
        return review ? this.mapFilmReviewToHeaderTab(review) : null;
      })
      .filter((tab): tab is AgentXLibraryFile => tab !== null);
  });
  protected readonly selectedViewerFile = computed(() => this.filesService.selectedFile());
  protected readonly currentUserId = computed(
    () => this.agentXService.userContext()?.userId?.trim() ?? ''
  );
  protected readonly effectiveCurrentUserId = computed(
    () => this.currentUserId() || this.auth?.currentUser?.uid?.trim() || ''
  );
  protected readonly visibleShareCandidates = computed<readonly AgentXShareMemberOption[]>(() => {
    const query = this.shareCandidateQuery().trim().toLowerCase();
    const candidates = this.shareCandidates();
    if (!query) {
      return candidates.slice(0, 50);
    }

    return candidates.filter((candidate) => {
      const haystack = `${candidate.displayName} ${candidate.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  });
  protected readonly safeSelectedPdfPreviewUrl = computed<SafeResourceUrl | null>(() => {
    const file = this.selectedViewerFile();
    if (!file) {
      return null;
    }

    const previewUrl = this.isPdfFile(file) ? file.url.trim() : '';

    if (!previewUrl) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(this.resolvePdfPreviewUrl(previewUrl));
  });
  protected readonly safeSelectedVideoIframeFallbackUrl = computed<SafeResourceUrl | null>(() => {
    const file = this.selectedViewerFile();
    if (!file || !this.isVideoFile(file)) {
      return null;
    }

    if (!this.genericCloudflareNativePlaybackFailed()[file.id]) {
      return null;
    }

    const fallbackUrl = this.resolveGenericCloudflareEmbedUrl(file);
    if (!fallbackUrl) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(fallbackUrl);
  });
  protected readonly folderNodes = computed<readonly TeamFileTreeNode[]>(() =>
    this.buildFolderTree(
      this.filesService.folders(),
      this.filteredFiles(),
      this.normalizedSearchQuery()
    )
  );

  protected readonly folderTreeController: AgentXLibraryFolderTreeController = {
    isLibraryReorderDragActive: () => this.isFolderItemReorderDragActive(),
    isCreatingFolder: () => this.isCreatingFolder(),
    getCreatingSubfolderParentId: () => this.creatingSubfolderParentId(),
    getCreateDraft: () => this.folderNameDraft(),
    onCreateDraftInput: (value) => this.onFolderNameInput(value),
    onCreateCancel: (event) => this.onFolderCreateCancel(event),
    onCreateConfirm: (event) => this.onFolderCreateConfirm(event),
    onMenuBackdropTap: (event) => this.onFolderMenuBackdropTap(event),
    isFolderMenuOpen: (folderId) => this.openFolderMenuId() === folderId,
    shouldOpenFolderMenuUpward: (folderId) =>
      this.openFolderMenuId() === folderId && this.openFolderMenuUpward(),
    isFolderBeingEdited: (folderId) => this.editingFolderId() === folderId,
    isFolderBeingShared: (folderId) => this.sharingFolderId() === folderId,
    isFolderDeleteConfirming: (folderId) => this.deleteFolderConfirmId() === folderId,
    getRenameDraft: () => this.folderRenameDraft(),
    onRenameInput: (value) => this.folderRenameDraft.set(value),
    isFolderExpanded: (folderId) => this.expandedFolderIds().has(folderId),
    isReviewMenuOpenInFolder: () => false,
    isFolderDropTarget: (folderId) => this.activeFolderDropTargetId() === folderId,
    areAllFolderItemsSelected: (folder) => this.areAllFolderItemsSelected(folder),
    isSomeFolderItemsSelected: (folder) => this.isSomeFolderItemsSelected(folder),
    isItemMenuOpen: (item) => {
      const fileId =
        typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string'
          ? item.id
          : null;
      return fileId !== null ? this.isFileMenuOpen(fileId) : false;
    },
    getFolderDragContexts: (folder) => this.getFolderDragContexts(folder),
    getDeleteFolderConfirmText: (folder) =>
      folder.items.length > 0
        ? 'Delete this folder? Files inside it will move back to the main library.'
        : 'Delete this empty folder?',
    canManageFolderSharing: (folder) => this.canManageFolderSharing(folder),
    isFolderShared: (folder) => this.isFolderShared(folder),
    getFolderSharePrincipalType: () => this.folderSharePrincipalType(),
    getFolderSharePermission: () => this.folderSharePermission(),
    getFolderSharePrincipalId: () => this.folderSharePrincipalId(),
    getFolderTeamId: (folder) => this.resolveSourceFolder(folder)?.teamId?.trim() || '',
    getFolderOrganizationId: (folder) =>
      this.resolveSourceFolder(folder)?.organizationId?.trim() || '',
    getShareCandidateQuery: () => this.shareCandidateQuery(),
    onShareCandidateQueryInput: (value) => this.onShareCandidateQueryInput(value),
    isShareCandidatesLoading: () => this.shareCandidatesLoading(),
    getShareCandidates: () => this.visibleShareCandidates(),
    getFolderSelectedShareUserIds: () => this.folderShareSelectedUserIds(),
    toggleFolderShareCandidate: (folder, event) =>
      this.onFolderShareCandidateToggled(folder, event),
    getFolderShareGrants: (folder) => this.shareablePrincipalsForFolder(folder),
    onFolderShareTypeChange: (value) => this.onFolderShareTypeChange(value),
    onFolderSharePermissionChange: (value) => this.onFolderSharePermissionChange(value),
    startShareFolder: (folder, event) => this.onFolderShareStart(folder, event),
    cancelShareFolder: (event) => this.onFolderShareCancel(event),
    canSubmitFolderShare: (folder) => this.canSubmitFolderShare(folder),
    confirmShareFolder: (folder, event) => this.onFolderShareConfirm(folder, event),
    changeFolderShareGrantPermission: (folder, event) =>
      this.onFolderShareGrantPermissionChange(folder, event),
    removeFolderShare: (folder, grant, event) => this.onFolderShareRemove(folder, grant, event),
    toggleFolder: (folderId) => {
      this.expandedFolderIds.update((set) => {
        const next = new Set(set);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });
    },
    onToggleFolderSelection: (folder, event) => this.onToggleFolderSelection(folder, event),
    openFolderMenu: (event, folder) => this.onOpenFolderMenu(event, folder),
    canRenameFolder: (folder) => this.hasFolderWriteAccess(folder),
    canDeleteFolder: (folder) => this.hasFolderWriteAccess(folder),
    startRenameFolder: (folder, event) => this.onFolderRenameStart(folder, event),
    cancelRename: (event) => this.onFolderRenameCancel(event),
    confirmRename: (folder, event) => this.onFolderRenameConfirm(folder, event),
    startCreateSubfolder: (folder, event) => this.onFolderCreateSubfolderStart(folder, event),
    startDeleteFolder: (folder, event) => this.onFolderDeleteStart(folder, event),
    cancelDeleteFolder: (event) => this.onFolderDeleteCancel(event),
    confirmDeleteFolder: (folder, event) => this.onFolderDeleteConfirm(folder, event),
    onFolderReorderDragStart: () => undefined,
    onFolderReorderDragEnd: () => undefined,
    onFolderItemDragStart: () => undefined,
    onFolderItemDragEnd: () => undefined,
    canReorderFolders: (folders) => folders.filter((folder) => !folder.isUnassigned).length > 1,
    canReorderFolderItems: (items) =>
      this.canReorderFolderItems(items as readonly AgentXLibraryFile[]),
    onFolderReorder: (event, parentId) => this.onFolderReorder(event, parentId),
    onFolderItemsReorder: (folder, event) =>
      this.onFolderItemsReorder(folder, event as CdkDragDrop<readonly AgentXLibraryFile[]>),
    onFolderDragOver: (folderId, event) => this.onFolderDragOver(folderId, event),
    onFolderDragLeave: (folderId, event) => this.onFolderDragLeave(folderId, event),
    onFolderDrop: (folder, event) => this.onFolderDrop(folder, event),
    onFolderContextDragStart: (folder, event) => this.onFolderContextDragStart(folder, event),
    onFolderContextDragEnd: () => this.onFolderContextDragEnd(),
  };

  constructor() {
    effect(() => {
      this.viewerMode();
      this.inlineVideoViewChange.emit(this.isInlineVideoView());
    });

    effect(() => {
      const panel = this.filmReviewPanel();
      const reviewId = this.pendingFilmReviewId();
      if (!panel || !reviewId || this.viewerMode() !== 'video') {
        return;
      }

      this.pendingFilmReviewId.set(null);
      this.isOpeningFilmReview.set(true);
      void panel
        .refreshData()
        .then(() => panel.onSelectReview(reviewId))
        .finally(() => this.isOpeningFilmReview.set(false));
    });

    effect(() => {
      const viewerMode = this.viewerMode();
      const selectedFile = this.selectedViewerFile();

      if (viewerMode !== 'generic' || !selectedFile || !this.isVideoFile(selectedFile)) {
        this.resetGenericVideoPlayerState();
      }
    });

    effect(() => {
      const viewerMode = this.viewerMode();
      const selectedFile = this.selectedViewerFile();
      const player = this.genericVideoPlayer();

      this.genericVideoSourceSyncToken += 1;
      const syncToken = this.genericVideoSourceSyncToken;

      if (viewerMode !== 'generic' || !selectedFile || !this.isVideoFile(selectedFile)) {
        this.destroyGenericHls();
        this.genericVideoSourceUrl = null;
        return;
      }

      if (!player) {
        return;
      }

      setTimeout(() => {
        if (syncToken !== this.genericVideoSourceSyncToken) return;
        void this.configureGenericVideoSource(selectedFile, syncToken);
      }, 0);
    });

    effect(() => {
      const openTabs = this.genericOpenTabs();
      const openTabIds = openTabs.map((tab) => tab.id);
      const currentTabIds = this.genericOpenTabIds();

      if (
        openTabIds.length !== currentTabIds.length ||
        openTabIds.some((id, index) => id !== currentTabIds[index])
      ) {
        this.genericOpenTabIds.set(openTabIds);
      }

      if (this.viewerMode() !== 'generic') {
        return;
      }

      const selectedId = this.filesService.selectedId();
      if (selectedId && openTabIds.includes(selectedId)) {
        return;
      }

      const fallbackId = openTabIds.at(-1) ?? null;
      if (fallbackId) {
        this.filesService.selectFile(fallbackId);
        return;
      }

      this.backToLibrary();
    });

    effect(() => {
      const currentTabs = this.openPanelTabs();
      if (currentTabs.length === 0) {
        return;
      }

      const validFileIds = new Set(this.filesService.files().map((file) => file.id));
      const validReviewIds = new Set(this.filmReviewService.reviews().map((review) => review.id));
      const activeReviewId = this.selectedFilmReviewId();
      const pendingReviewId = this.pendingFilmReviewId();
      const nextTabs = currentTabs.filter((tabRef) =>
        tabRef.kind === 'file'
          ? validFileIds.has(tabRef.id)
          : validReviewIds.has(tabRef.id) ||
            tabRef.id === activeReviewId ||
            tabRef.id === pendingReviewId
      );

      if (
        nextTabs.length !== currentTabs.length ||
        nextTabs.some((tabRef, index) => {
          const current = currentTabs[index];
          return current?.kind !== tabRef.kind || current?.id !== tabRef.id;
        })
      ) {
        this.openPanelTabs.set(nextTabs);
      }
    });
  }

  ngOnDestroy(): void {
    this.activeFilesUploadHandle?.cancel();
    this.activeFilesUploadSubscription?.unsubscribe();
    this.stopGenericVideoSmoothProgressTracking();
    this.destroyGenericHls();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId']) {
      void this.refreshData();
    }
  }

  public visibleOpenTabs(): readonly AgentXLibraryFile[] {
    return this.headerVisibleTabs();
  }

  public selectedId(): string | null {
    if (this.viewerMode() === 'video') {
      return this.filmReviewPanel()?.selectedId() ?? this.filesService.selectedId();
    }

    return this.filesService.selectedId();
  }

  public selectedTabId(): string | null {
    if (this.viewerMode() === 'video' && this.selectedFilmReviewId()) {
      return this.buildPanelTabId('review', this.selectedFilmReviewId() as string);
    }

    const selectedFileId = this.filesService.selectedId();
    return selectedFileId ? this.buildPanelTabId('file', selectedFileId) : null;
  }

  public isInlineVideoView(): boolean {
    return this.viewerMode() !== 'library';
  }

  public getInlineHeaderTitle(): string {
    if (this.viewerMode() === 'video') {
      return (
        this.filmReviewPanel()?.getInlineHeaderTitle() ?? this.selectedViewerFile()?.name ?? 'Files'
      );
    }

    return this.selectedViewerFile()?.name ?? 'Files';
  }

  public async refreshData(): Promise<void> {
    await this.filesService.loadFiles(this.teamId);
    const validFolderIds = new Set([
      TEAM_FILES_UNASSIGNED_FOLDER_ID,
      ...this.filesService.folders().map((folder) => folder.id),
    ]);

    this.expandedFolderIds.update((current) => {
      const next = new Set<string>();
      for (const folderId of current) {
        if (validFolderIds.has(folderId)) {
          next.add(folderId);
        }
      }
      return next;
    });
    this.pruneSelectedSelections();
    this.pruneGenericOpenTabs();
  }

  public async seekToTimestampMs(_timeMs: number): Promise<void> {
    await this.filmReviewPanel()?.seekToTimestampMs(_timeMs);
  }

  public async onSelectReview(fileId: string): Promise<void> {
    const tabRef = this.parsePanelTabId(fileId);
    if (tabRef) {
      if (tabRef.kind === 'review') {
        await this.selectReviewTab(tabRef.id);
        return;
      }

      this.selectGenericFileTab(tabRef.id);
      return;
    }

    if (this.viewerMode() === 'video' && this.selectedFilmReviewId()) {
      await this.filmReviewPanel()?.onSelectReview(fileId);
      return;
    }

    if (this.viewerMode() === 'generic' && this.genericOpenTabIds().includes(fileId)) {
      this.filesService.selectFile(fileId);
      return;
    }

    const file = this.filesService.files().find((entry) => entry.id === fileId) ?? null;
    if (file) {
      await this.openFile(file);
    }
  }

  public getReviewDisplayTitle(file: Pick<AgentXLibraryFile, 'name'>): string {
    return file.name;
  }

  public closeVideoTab(_tabId?: string, event?: Event): void {
    event?.stopPropagation();

    const panelTab = _tabId ? this.parsePanelTabId(_tabId) : null;
    if (panelTab) {
      this.closePanelTab(panelTab);
      return;
    }

    if (this.viewerMode() === 'video') {
      if (_tabId) {
        this.filmReviewPanel()?.closeVideoTab(_tabId, event);
      }
      const remainingTabs = this.filmReviewPanel()?.visibleOpenTabs() ?? [];
      if (remainingTabs.length === 0) {
        this.backToLibrary();
      }
      return;
    }

    this.closeGenericFileTab(_tabId);
  }

  public reorderVideoTabsByIndex(_previousIndex: number, _currentIndex: number): void {
    if (_previousIndex === _currentIndex || _previousIndex < 0 || _currentIndex < 0) {
      return;
    }

    const currentTabs = [...this.openPanelTabs()];
    if (_previousIndex >= currentTabs.length || _currentIndex >= currentTabs.length) {
      return;
    }

    moveItemInArray(currentTabs, _previousIndex, _currentIndex);
    this.openPanelTabs.set(currentTabs);
  }

  public openVideoFromLibrary(): void {
    this.backToLibrary();
  }

  public backToLibrary(): void {
    this.viewerMode.set('library');
    this.selectedFilmReviewId.set(null);
    this.isOpeningFilmReview.set(false);
    this.pendingFilmReviewId.set(null);
    this.resetGenericVideoPlayerState();
    this.filesService.selectFile(null);
    this.filmReviewService.select(null);
    this.isUploadMenuVisible.set(false);
    this.resetUploadDestinationMenu();
  }

  public focusFolder(folderId: string): boolean {
    const normalizedFolderId = folderId.trim();
    if (!normalizedFolderId || normalizedFolderId === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return false;
    }

    const targetFolder = this.findFolderNodeById(normalizedFolderId, this.allFolderNodes());
    if (!targetFolder || targetFolder.isUnassigned) {
      return false;
    }

    const parentChain = this.collectFolderParentChain(normalizedFolderId, this.allFolderNodes());
    this.expandedFolderIds.update((current) => {
      const next = new Set(current);
      for (const parentId of parentChain) {
        next.add(parentId);
      }
      next.add(normalizedFolderId);
      return next;
    });

    this.selectedFolderIds.set(new Set([normalizedFolderId]));
    this.backToLibrary();
    return true;
  }

  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? [...input.files] : [];
    const preferredFolderId = this.consumeQueuedUploadFolderId();
    if (files.length === 0) {
      if (input) input.value = '';
      return;
    }

    try {
      await this.importFiles(
        files.map((file) => ({ file, relativePath: this.readWebkitRelativePath(file) })),
        preferredFolderId,
        'file'
      );
    } finally {
      if (input) input.value = '';
    }
  }

  protected openFilePicker(event?: Event): void {
    this.openUploadDestinationPicker('file', event);
  }

  protected async onFilmReviewFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? [...input.files] : [];
    const preferredFolderId = this.consumeQueuedUploadFolderId();
    if (files.length === 0) {
      if (input) input.value = '';
      return;
    }

    try {
      await this.uploadFilmReviewFiles(
        files,
        files.length > 1 ? 'batch' : 'full',
        {
          suppressSuccessToast: false,
        },
        preferredFolderId
      );
    } finally {
      if (input) input.value = '';
    }
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
    selectionMode: 'batch' | 'full'
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

  private isLikelyVideoFileName(fileName: string | null | undefined): boolean {
    const normalized = fileName?.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(normalized);
  }

  private buildActionableVideoUploadErrorMessage(rawMessage: string): {
    readonly reason: string;
    readonly nextStep: string;
  } {
    const normalized = rawMessage.trim().toLowerCase();

    if (
      normalized.includes('timed out') ||
      normalized.includes('timeout') ||
      normalized.includes('network error')
    ) {
      return {
        reason: 'The upload timed out while sending data.',
        nextStep: 'Retry on a stable connection. If this keeps happening, try a smaller clip.',
      };
    }

    if (
      normalized.includes('401') ||
      normalized.includes('403') ||
      normalized.includes('unauthorized') ||
      normalized.includes('token') ||
      normalized.includes('sign in')
    ) {
      return {
        reason: 'Your upload session expired or is unauthorized.',
        nextStep: 'Refresh the app, sign in again, and retry the upload.',
      };
    }

    if (normalized.includes('too large') || normalized.includes('file too large')) {
      return {
        reason: 'The selected video exceeds the upload size limit.',
        nextStep: 'Compress or trim the video, then retry.',
      };
    }

    if (
      normalized.includes('unsupported') ||
      normalized.includes('mime') ||
      normalized.includes('content type')
    ) {
      return {
        reason: 'The selected file type is not accepted for this upload flow.',
        nextStep: 'Use MP4/MOV/WebM/AVI/MKV and retry.',
      };
    }

    if (normalized.includes('provision')) {
      return {
        reason: 'The backend could not provision an upload URL.',
        nextStep: 'Retry in a moment. If it repeats, check backend upload endpoints.',
      };
    }

    if (normalized.includes('cloudflare')) {
      return {
        reason: 'The large-video transfer to Cloudflare failed.',
        nextStep: 'Retry. If it repeats, check Cloudflare upload/finalize status on backend.',
      };
    }

    if (normalized.includes('storage') || normalized.includes('firebase')) {
      return {
        reason: 'The storage write step failed.',
        nextStep: 'Retry and verify storage service health and permissions.',
      };
    }

    return {
      reason: 'The upload failed during processing.',
      nextStep: 'Retry once. If it repeats, capture this error and check backend logs.',
    };
  }

  private formatVideoUploadFailureMessage(errorMessage: string, fileName?: string | null): string {
    const details = this.buildActionableVideoUploadErrorMessage(errorMessage);
    const scopedFileName = fileName?.trim() || this.filesUploadCurrentFileName()?.trim() || 'video';
    const raw = errorMessage.trim().slice(0, 220);

    return `Video upload failed for ${scopedFileName}. ${details.reason} Next step: ${details.nextStep} Technical detail: ${raw}`;
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
    const localThumbnailPromise = createInlineVideoThumbnail(file);

    return new Promise((resolve, reject) => {
      const uploadHandle = this.uploadService.uploadVideo(file, authToken);
      this.activeLibraryUploadHandle = uploadHandle;
      const subscription = uploadHandle.progress$.subscribe((progress: VideoUploadProgress) => {
        if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
          const fileProgress = Math.max(0, Math.min(100, progress.percent));
          const overall = ((index + fileProgress / 100) / total) * 100;
          this.setFilesUploadPercentMonotonic(Math.round(overall));
          return;
        }

        if (progress.phase === 'complete' && progress.streamUrl) {
          if (this.activeLibraryUploadHandle === uploadHandle) {
            this.activeLibraryUploadHandle = null;
          }
          subscription.unsubscribe();
          const streamUrl = progress.streamUrl;
          void Promise.all([localDurationPromise, localThumbnailPromise])
            .then(([localDurationSec, localThumbnailUrl]) => {
              resolve({
                streamUrl,
                downloadUrl: progress.downloadUrl,
                storagePath: progress.storagePath,
                cloudflareVideoId: progress.cloudflareVideoId,
                cloudflareStatus: progress.cloudflareStatus,
                readyToStream: progress.readyToStream,
                thumbnailUrl: progress.thumbnailUrl ?? localThumbnailUrl ?? undefined,
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

  private async uploadFilmReviewFiles(
    files: readonly File[],
    selectionMode: 'batch' | 'full',
    options?: {
      readonly suppressSuccessToast?: boolean;
    },
    preferredFolderId?: string | null
  ): Promise<void> {
    if (!files.length || this.isUploadingFiles()) {
      return;
    }

    const teamId = this.teamId?.trim() || null;

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

    if (selectionMode === 'full' && validVideos.length > 1) {
      this.toast.error('Full Footage accepts one video plus an optional breakdown sheet.');
      return;
    }

    if (!validVideos.length && !validBreakdowns.length) {
      return;
    }

    const authToken = await this.auth?.currentUser?.getIdToken(true);
    if (!authToken) {
      this.toast.error('Please sign in again to upload videos.');
      return;
    }

    this.filesUploadError.set(null);
    this.isUploadingFiles.set(true);
    this.filesUploadPercent.set(0);
    this.filesUploadCurrentFile.set(1);
    this.filesUploadTotalFiles.set(validVideos.length + validBreakdowns.length);
    this.filesUploadCurrentFileName.set(null);
    this.filesUploadCanCancel.set(true);

    try {
      let targetReviewId: string | null = null;
      const uploadedSources: TeamFilmReviewSourceVideo[] = [];
      for (let index = 0; index < validVideos.length; index += 1) {
        this.filesUploadCurrentFile.set(index + 1);
        const file = validVideos[index] as File;
        this.filesUploadCurrentFileName.set(file.name);
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

      let importedPlayCount: number | null = null;

      if (uploadedSources.length > 0) {
        const primarySource = uploadedSources[0] as TeamFilmReviewSourceVideo;
        const primaryVideoFile = validVideos[0] as File | undefined;
        const targetPlaylistId = this.normalizeUploadFolderId(preferredFolderId);
        const created = await this.filmReviewService.createFromVideo({
          ...(teamId ? { teamId } : {}),
          sport: this.sport || 'football',
          title: this.buildFilmReviewSessionTitle(validVideos, selectionMode),
          ...(targetPlaylistId ? { playlistId: targetPlaylistId } : {}),
          ...(primaryVideoFile
            ? {
                attachment: this.buildFilmReviewUploadAttachment(
                  primaryVideoFile,
                  primarySource,
                  0
                ),
              }
            : {}),
          uploadMode: selectionMode === 'batch' ? 'batch_clips' : 'full_footage',
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

        const breakdownFile = validBreakdowns[0];
        if (breakdownFile) {
          const progressIndex = validVideos.length + 1;
          this.filesUploadCurrentFile.set(progressIndex);
          this.filesUploadCurrentFileName.set(breakdownFile.name);
          this.setFilesUploadPercentMonotonic(
            Math.round((validVideos.length / (validVideos.length + 1)) * 100)
          );

          if (!targetReviewId) {
            throw new Error('Upload a video before importing a breakdown sheet.');
          }

          const imported = await this.filmReviewService.importBreakdown(
            targetReviewId,
            breakdownFile
          );
          importedPlayCount = imported.playCount;
          this.setFilesUploadPercentMonotonic(100);
        }

        // Wait a brief moment to let backend indices settle before refresh
        await new Promise((resolve) => setTimeout(resolve, 800));
        await this.filesService.loadFiles(teamId);

        try {
          const createdFile = await this.filesService.refreshFile(targetReviewId, teamId);
          await this.openFile(createdFile);
        } catch {
          // If indexing fails, that's okay, it'll show up eventually
        }
      }

      if (!options?.suppressSuccessToast) {
        let msg =
          validVideos.length === 1
            ? 'Video added to Film Review'
            : `${validVideos.length} videos added to Film Review`;
        if (validVideos.length > 0 && importedPlayCount !== null) {
          msg = `Film added and breakdown imported (${importedPlayCount} plays)`;
        } else if (importedPlayCount !== null) {
          msg = `Breakdown imported (${importedPlayCount} plays)`;
        }
        this.toast.success(msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload film files';
      if (message === VIDEO_UPLOAD_CANCELLED_MESSAGE) {
        this.filesUploadError.set(null);
        this.toast.info('Upload cancelled.');
      } else {
        const actionableMessage = this.formatVideoUploadFailureMessage(message);
        this.filesUploadError.set(actionableMessage);
        this.toast.error(actionableMessage);
      }
    } finally {
      this.activeLibraryUploadHandle = null;
      this.isUploadingFiles.set(false);
      this.filesUploadPercent.set(0);
      this.filesUploadCurrentFile.set(0);
      this.filesUploadTotalFiles.set(0);
      this.filesUploadCurrentFileName.set(null);
    }
  }

  protected openFilmReviewPicker(event?: Event): void {
    this.openFilmReviewDestinationPicker(event);
  }

  protected async onMediaFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? [...input.files] : [];
    const preferredFolderId = this.consumeQueuedUploadFolderId();
    if (files.length === 0) {
      if (input) input.value = '';
      return;
    }

    try {
      await this.importFiles(
        files.map((file) => ({ file, relativePath: this.readWebkitRelativePath(file) })),
        preferredFolderId,
        'file'
      );
    } finally {
      if (input) input.value = '';
    }
  }

  protected openMediaPicker(event?: Event): void {
    this.openMediaDestinationPicker(event);
  }

  protected async onFolderFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? [...input.files] : [];
    const preferredFolderId = this.consumeQueuedUploadFolderId();
    if (files.length === 0) {
      if (input) input.value = '';
      return;
    }

    try {
      await this.importFiles(
        files.map((file) => ({ file, relativePath: this.readWebkitRelativePath(file) })),
        preferredFolderId,
        'file'
      );
    } finally {
      if (input) input.value = '';
    }
  }

  protected openFolderPicker(event?: Event): void {
    this.openUploadDestinationPicker('folder', event);
  }

  protected onLibraryDragOver(event: DragEvent): void {
    if (!this.isExternalFileDragEvent(event)) {
      return;
    }

    event.preventDefault();
    this.isExternalImportDragActive.set(true);
    this.applyDragAutoScroll(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onLibraryDragLeave(event: DragEvent): void {
    if (!this.isExternalFileDragEvent(event)) {
      return;
    }

    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.isExternalImportDragActive.set(false);
  }

  protected async onLibraryDrop(event: DragEvent): Promise<void> {
    if (!this.isExternalFileDragEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.isExternalImportDragActive.set(false);

    const descriptors = await this.extractDroppedFiles(event);
    await this.importFiles(descriptors, this.resolvePreferredUploadFolderId(), 'file');
  }

  protected onTopLevelDropDragOver(event: DragEvent): void {
    if (this.isExternalFileDragEvent(event)) {
      return;
    }

    if (!this.draggingFolderId()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.topLevelDropTargetActive.set(true);
    this.applyDragAutoScroll(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onTopLevelDropDragLeave(event: DragEvent): void {
    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.topLevelDropTargetActive.set(false);
  }

  protected async onTopLevelDrop(event: DragEvent): Promise<void> {
    if (this.isExternalFileDragEvent(event)) {
      return;
    }

    const draggedFolderId = this.draggingFolderId();
    if (!draggedFolderId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.topLevelDropTargetActive.set(false);
    await this.moveDraggedSelectionToTopLevel();
  }

  protected shouldShowTopLevelDropTarget(): boolean {
    const draggedFolderId = this.draggingFolderId()?.trim();
    if (!draggedFolderId) {
      return false;
    }

    const sourceFolder = this.filesService
      .folders()
      .find((candidate) => candidate.id === draggedFolderId);
    if (!sourceFolder) {
      return false;
    }

    return (sourceFolder.parentId?.trim() || null) !== null;
  }

  private async moveDraggedSelectionToTopLevel(): Promise<void> {
    const draggedFolderId = this.draggingFolderId();
    const draggedFileIds = [...this.draggingFileIds()];
    this.activeFolderDropTargetId.set(null);
    this.isExternalImportDragActive.set(false);

    if (draggedFolderId) {
      this.draggingFolderId.set(null);

      if (!this.isValidFolderMoveTarget(draggedFolderId, null)) {
        return;
      }

      const sourceFolder = this.filesService
        .folders()
        .find((candidate) => candidate.id === draggedFolderId);
      if (!sourceFolder) {
        return;
      }

      const currentParentId = sourceFolder.parentId?.trim() || null;
      if (currentParentId === null) {
        return;
      }

      if (!this.hasFolderSourceWriteAccess(sourceFolder)) {
        this.notifyReadOnlyMoveBlocked();
        return;
      }

      const teamId = sourceFolder.teamId?.trim() || this.teamId?.trim() || null;
      try {
        await this.filesService.updateFolder(draggedFolderId, {
          teamId,
          parentId: null,
        });
      } catch {
        // intentionally ignored
      }
      return;
    }

    this.draggingFileIds.set(new Set());
    const filesToMove = this.filesService
      .files()
      .filter((entry) => draggedFileIds.includes(entry.id) && (entry.folderId ?? null) !== null);
    if (filesToMove.length === 0) {
      return;
    }

    if (filesToMove.some((entry) => !this.hasFileWriteAccess(entry))) {
      this.notifyReadOnlyMoveBlocked();
      return;
    }

    try {
      for (const currentFile of filesToMove) {
        await this.filesService.moveFile(
          currentFile.id,
          this.resolveFileMutationTeamId(currentFile),
          null
        );
      }
    } catch {
      // intentionally ignored
    }
  }

  protected onFolderCreateToggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetFolderUiState();
    this.isCreatingFolder.set(true);
    this.creatingSubfolderParentId.set(null);
    this.folderNameDraft.set('');
  }

  protected onFolderNameInput(value: string): void {
    this.folderNameDraft.set(value);
  }

  protected onFolderCreateCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.isCreatingFolder.set(false);
    this.creatingSubfolderParentId.set(null);
    this.folderNameDraft.set('');
  }

  protected async onFolderCreateConfirm(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const teamId = this.teamId?.trim() || null;
    const name = this.folderNameDraft().trim();
    if (!name) {
      return;
    }

    const parentId = this.creatingSubfolderParentId()?.trim() || null;
    try {
      const createdFolder = await this.filesService.createFolder({ teamId, name, parentId });
      this.expandedFolderIds.update((current) => {
        const next = new Set(current);
        next.add(createdFolder.id);
        if (parentId) {
          next.add(parentId);
        }
        return next;
      });
      this.onFolderCreateCancel();
    } catch {
      // intentionally ignored
    }
  }

  protected onFolderMenuBackdropTap(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.resetFolderUiState();
  }

  protected onFileMenuBackdropTap(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.resetFolderUiState();
  }

  protected onOpenFolderMenu(event: Event, folder: AgentXLibraryFolderTreeNode): void {
    event.preventDefault();
    event.stopPropagation();
    const nextId = this.openFolderMenuId() === folder.id ? null : folder.id;
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const shouldOpenUpward = nextId ? this.shouldOpenContextMenuUpward(trigger) : false;
    this.resetFolderUiState();
    this.openFolderMenuId.set(nextId);
    this.openFolderMenuUpward.set(shouldOpenUpward);
    this.folderRenameDraft.set(folder.name);
  }

  protected canManageFolderSharing(folder: AgentXLibraryFolderTreeNode): boolean {
    const sourceFolder = this.resolveSourceFolder(folder);
    const currentUserId = this.effectiveCurrentUserId();
    return (
      !!sourceFolder && currentUserId.length > 0 && sourceFolder.createdByUserId === currentUserId
    );
  }

  protected shareablePrincipalsForFolder(
    folder: AgentXLibraryFolderTreeNode
  ): readonly FileShareGrant[] {
    const sourceFolder = this.resolveSourceFolder(folder);
    if (!sourceFolder) {
      return [];
    }

    const ownerAccessKey = `user:${sourceFolder.createdByUserId}`;
    const writableAccessKeys = new Set(sourceFolder.writeAccessKeys ?? []);
    return (sourceFolder.readAccessKeys ?? [])
      .filter((accessKey) => accessKey !== ownerAccessKey)
      .map((accessKey) => this.parseFileShareGrant(accessKey, writableAccessKeys.has(accessKey)))
      .filter((grant): grant is FileShareGrant => grant !== null);
  }

  protected isFolderShared(folder: AgentXLibraryFolderTreeNode): boolean {
    return this.shareablePrincipalsForFolder(folder).length > 0;
  }

  protected onFolderShareTypeChange(value: string): void {
    if (value === 'user' || value === 'team' || value === 'organization') {
      this.folderSharePrincipalType.set(value);
    } else {
      this.folderSharePrincipalType.set('user');
    }

    if (value !== 'user') {
      this.folderSharePrincipalId.set('');
      this.shareCandidateQuery.set('');
    }
  }

  protected onFolderSharePermissionChange(value: AgentXSharePermission): void {
    this.folderSharePermission.set(value === 'write' ? 'write' : 'read');
  }

  protected async onFolderShareStart(
    folder: AgentXLibraryFolderTreeNode,
    event: Event
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.sharingFolderId.set(folder.id);
    this.editingFolderId.set(null);
    this.deleteFolderConfirmId.set(null);
    this.folderSharePrincipalType.set('user');
    this.folderSharePermission.set('read');
    this.folderSharePrincipalId.set('');
    this.folderShareSelectedUserIds.set(
      this.userPrincipalIds(this.shareablePrincipalsForFolder(folder))
    );
    this.shareCandidateQuery.set('');
    await this.loadShareCandidatesForScope(
      this.resolveSourceFolder(folder)?.teamId ?? null,
      this.resolveSourceFolder(folder)?.organizationId ?? null
    );
  }

  protected onFolderShareCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.shareCandidatesRequestId += 1;
    this.sharingFolderId.set(null);
    this.folderSharePrincipalType.set('user');
    this.folderSharePermission.set('read');
    this.folderSharePrincipalId.set('');
    this.folderShareSelectedUserIds.set([]);
    this.shareCandidateQuery.set('');
    this.shareCandidates.set([]);
  }

  protected onFolderShareCandidateToggled(
    folder: AgentXLibraryFolderTreeNode,
    event: { candidate: AgentXShareMemberOption; checked: boolean }
  ): void {
    if (folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    this.folderShareSelectedUserIds.update((ids) =>
      this.toggleShareSelection(ids, event.candidate.id, event.checked)
    );
  }

  protected canSubmitFolderShare(folder: AgentXLibraryFolderTreeNode): boolean {
    if (this.folderSharePrincipalType() === 'user') {
      const existingUserIds = this.userPrincipalIds(this.shareablePrincipalsForFolder(folder));
      return (
        this.hasShareSelectionChanges(existingUserIds, this.folderShareSelectedUserIds()) &&
        !this.filesService.saving()
      );
    }

    return this.resolveFolderSharePrincipalId(folder).length > 0 && !this.filesService.saving();
  }

  protected async onFolderShareConfirm(
    folder: AgentXLibraryFolderTreeNode,
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    const principalType = this.folderSharePrincipalType();

    if (principalType === 'user') {
      const selectedUserIds = new Set(this.folderShareSelectedUserIds());
      const existingUserIds = new Set(
        this.userPrincipalIds(this.shareablePrincipalsForFolder(folder))
      );
      const usersToAdd = [...selectedUserIds].filter((userId) => !existingUserIds.has(userId));
      const usersToRemove = [...existingUserIds].filter((userId) => !selectedUserIds.has(userId));

      if (usersToAdd.length === 0 && usersToRemove.length === 0) {
        this.onFolderShareCancel();
        return;
      }

      try {
        for (const userId of usersToRemove) {
          await this.filesService.shareFolder(folder.id, {
            action: 'remove',
            principalType: 'user',
            principalId: userId,
          });
        }

        for (const userId of usersToAdd) {
          await this.filesService.shareFolder(folder.id, {
            action: 'add',
            permission: this.folderSharePermission(),
            principalType: 'user',
            principalId: userId,
          });
        }

        this.toast.success('Share access updated');
        this.onFolderShareCancel();
      } catch {
        this.toast.error('Failed to update share access');
      }
      return;
    }

    const principalId = this.resolveFolderSharePrincipalId(folder);
    if (!principalId || folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.shareFolder(folder.id, {
        action: 'add',
        permission: this.folderSharePermission(),
        principalType,
        principalId,
      });
      this.toast.success(
        this.buildShareGrantedMessage(principalType, this.folderSharePermission())
      );
      this.folderSharePrincipalId.set('');
      this.shareCandidateQuery.set('');
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onFolderShareGrantPermissionChange(
    folder: AgentXLibraryFolderTreeNode,
    event: { grant: FileShareGrant; permission: AgentXSharePermission }
  ): Promise<void> {
    if (folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.shareFolder(folder.id, {
        action: 'add',
        permission: event.permission,
        principalType: event.grant.principalType,
        principalId: event.grant.principalId,
      });
      this.toast.success(
        this.buildShareGrantedMessage(
          event.grant.principalType,
          event.permission,
          event.grant.label
        )
      );
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onFolderShareRemove(
    folder: AgentXLibraryFolderTreeNode,
    grant: FileShareGrant,
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    if (folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.shareFolder(folder.id, {
        action: 'remove',
        principalType: grant.principalType,
        principalId: grant.principalId,
      });
      this.toast.success(this.buildShareRevokedMessage(grant.label));
    } catch {
      this.toast.error('Failed to revoke share access');
    }
  }

  protected isFileMenuOpen(fileId: string): boolean {
    return this.openFileMenuId() === fileId;
  }

  protected isEditingFile(fileId: string): boolean {
    return this.editingFileId() === fileId;
  }

  protected isSharingFile(fileId: string): boolean {
    return this.sharingFileId() === fileId;
  }

  protected isFileDeleteConfirming(fileId: string): boolean {
    return this.deleteFileConfirmId() === fileId;
  }

  protected onOpenFileMenu(event: Event, file: AgentXLibraryFile): void {
    event.preventDefault();
    event.stopPropagation();
    const nextId = this.openFileMenuId() === file.id ? null : file.id;
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const shouldOpenUpward = nextId ? this.shouldOpenContextMenuUpward(trigger) : false;
    this.resetFolderUiState();
    this.openFileMenuId.set(nextId);
    this.openFileMenuUpward.set(shouldOpenUpward);
    this.fileRenameDraft.set(file.name);
  }

  protected canManageFileSharing(file: AgentXLibraryFile): boolean {
    const currentUserId = this.effectiveCurrentUserId();
    return currentUserId.length > 0 && file.ownerUserId === currentUserId;
  }

  protected shareablePrincipalsForFile(file: AgentXLibraryFile): readonly FileShareGrant[] {
    const ownerAccessKey = `user:${file.ownerUserId}`;
    const writableAccessKeys = new Set(file.writeAccessKeys ?? []);
    return (file.readAccessKeys ?? [])
      .filter((accessKey) => accessKey !== ownerAccessKey)
      .map((accessKey) => this.parseFileShareGrant(accessKey, writableAccessKeys.has(accessKey)))
      .filter((grant): grant is FileShareGrant => grant !== null);
  }

  protected isFileShared(file: AgentXLibraryFile): boolean {
    return this.shareablePrincipalsForFile(file).length > 0;
  }

  protected onFileShareTypeChange(value: string): void {
    if (value === 'user' || value === 'team' || value === 'organization') {
      this.fileSharePrincipalType.set(value);
    } else {
      this.fileSharePrincipalType.set('user');
    }

    if (value !== 'user') {
      this.fileSharePrincipalId.set('');
      this.shareCandidateQuery.set('');
    }
  }

  protected onFileSharePermissionChange(value: AgentXSharePermission): void {
    this.fileSharePermission.set(value === 'write' ? 'write' : 'read');
  }

  protected onShareCandidateQueryInput(value: string): void {
    this.shareCandidateQuery.set(value);
    this.fileSharePrincipalId.set('');
    this.folderSharePrincipalId.set('');
  }

  protected async onFileShareStart(file: AgentXLibraryFile, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.sharingFileId.set(file.id);
    this.editingFileId.set(null);
    this.deleteFileConfirmId.set(null);
    this.fileSharePrincipalType.set('user');
    this.fileSharePermission.set('read');
    this.fileSharePrincipalId.set('');
    this.fileShareSelectedUserIds.set(this.userPrincipalIds(this.shareablePrincipalsForFile(file)));
    this.shareCandidateQuery.set('');
    await this.loadShareCandidatesForScope(file.teamId, file.organizationId ?? null);
  }

  protected onFileShareCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.shareCandidatesRequestId += 1;
    this.sharingFileId.set(null);
    this.fileSharePrincipalType.set('user');
    this.fileSharePermission.set('read');
    this.fileSharePrincipalId.set('');
    this.fileShareSelectedUserIds.set([]);
    this.shareCandidateQuery.set('');
    this.shareCandidates.set([]);
  }

  protected onFileShareCandidateToggled(
    _file: AgentXLibraryFile,
    event: { candidate: AgentXShareMemberOption; checked: boolean }
  ): void {
    this.fileShareSelectedUserIds.update((ids) =>
      this.toggleShareSelection(ids, event.candidate.id, event.checked)
    );
  }

  protected canSubmitFileShare(file: AgentXLibraryFile): boolean {
    if (this.fileSharePrincipalType() === 'user') {
      const existingUserIds = this.userPrincipalIds(this.shareablePrincipalsForFile(file));
      return (
        this.hasShareSelectionChanges(existingUserIds, this.fileShareSelectedUserIds()) &&
        !this.filesService.saving()
      );
    }

    return this.resolveFileSharePrincipalId(file).length > 0 && !this.filesService.saving();
  }

  protected async onFileShareConfirm(file: AgentXLibraryFile, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const principalType = this.fileSharePrincipalType();

    if (principalType === 'user') {
      const selectedUserIds = new Set(this.fileShareSelectedUserIds());
      const existingUserIds = new Set(this.userPrincipalIds(this.shareablePrincipalsForFile(file)));
      const usersToAdd = [...selectedUserIds].filter((userId) => !existingUserIds.has(userId));
      const usersToRemove = [...existingUserIds].filter((userId) => !selectedUserIds.has(userId));

      if (usersToAdd.length === 0 && usersToRemove.length === 0) {
        this.onFileShareCancel();
        return;
      }

      try {
        for (const userId of usersToRemove) {
          await this.filesService.shareFile(file.id, {
            action: 'remove',
            principalType: 'user',
            principalId: userId,
          });
        }

        for (const userId of usersToAdd) {
          await this.filesService.shareFile(file.id, {
            action: 'add',
            permission: this.fileSharePermission(),
            principalType: 'user',
            principalId: userId,
          });
        }

        this.toast.success('Share access updated');
        this.onFileShareCancel();
      } catch {
        this.toast.error('Failed to update share access');
      }
      return;
    }

    const principalId = this.resolveFileSharePrincipalId(file);
    if (!principalId) {
      return;
    }

    try {
      await this.filesService.shareFile(file.id, {
        action: 'add',
        permission: this.fileSharePermission(),
        principalType,
        principalId,
      });
      this.toast.success(this.buildShareGrantedMessage(principalType, this.fileSharePermission()));
      this.fileSharePrincipalId.set('');
      this.shareCandidateQuery.set('');
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onFileShareGrantPermissionChange(
    file: AgentXLibraryFile,
    event: { grant: FileShareGrant; permission: AgentXSharePermission }
  ): Promise<void> {
    try {
      await this.filesService.shareFile(file.id, {
        action: 'add',
        permission: event.permission,
        principalType: event.grant.principalType,
        principalId: event.grant.principalId,
      });
      this.toast.success(
        this.buildShareGrantedMessage(
          event.grant.principalType,
          event.permission,
          event.grant.label
        )
      );
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onFileShareRemove(
    file: AgentXLibraryFile,
    grant: FileShareGrant,
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      await this.filesService.shareFile(file.id, {
        action: 'remove',
        principalType: grant.principalType,
        principalId: grant.principalId,
      });
      this.toast.success(this.buildShareRevokedMessage(grant.label));
    } catch {
      this.toast.error('Failed to revoke share access');
    }
  }

  protected onFileRenameInput(value: string): void {
    this.fileRenameDraft.set(value);
  }

  protected onFileRenameStart(file: AgentXLibraryFile, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingFileId.set(file.id);
    this.deleteFileConfirmId.set(null);
    this.fileRenameDraft.set(file.name);
  }

  protected onFileRenameCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.editingFileId.set(null);
    this.fileRenameDraft.set('');
  }

  protected async onFileRenameConfirm(file: AgentXLibraryFile, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const teamId = this.resolveFileMutationTeamId(file);
    const name = this.fileRenameDraft().trim();
    if (!name) {
      return;
    }

    try {
      await this.filesService.renameFile(file.id, teamId, name);
      this.onFileMenuBackdropTap();
    } catch {
      // intentionally ignored
    }
  }

  protected onFileDeleteStart(file: AgentXLibraryFile, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.sharingFileId.set(null);
    this.editingFileId.set(null);
    this.deleteFileConfirmId.set(file.id);
  }

  protected onFileDeleteCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.deleteFileConfirmId.set(null);
  }

  protected async onFileDeleteConfirm(file: AgentXLibraryFile, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const teamId = this.resolveFileMutationTeamId(file);

    try {
      await this.filesService.deleteFile(file.id, teamId);
      this.pruneSelectedSelections();
      this.toast.success('Deleted 1 file.');
      this.onFileMenuBackdropTap();
    } catch {
      this.toast.error('Failed to delete file.');
    }
  }

  protected onFolderRenameStart(folder: AgentXLibraryFolderTreeNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingFolderId.set(folder.id);
    this.sharingFolderId.set(null);
    this.deleteFolderConfirmId.set(null);
    this.folderRenameDraft.set(folder.name);
  }

  protected onFolderRenameCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.editingFolderId.set(null);
    this.folderRenameDraft.set('');
  }

  protected async onFolderRenameConfirm(
    folder: AgentXLibraryFolderTreeNode,
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const teamId = this.resolveFolderMutationTeamId(folder);
    const name = this.folderRenameDraft().trim();
    if (!name || folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.updateFolder(folder.id, { teamId, name });
      this.onFolderMenuBackdropTap();
    } catch {
      // intentionally ignored
    }
  }

  protected onFolderCreateSubfolderStart(folder: AgentXLibraryFolderTreeNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.resetFolderUiState();
    this.isCreatingFolder.set(true);
    this.creatingSubfolderParentId.set(folder.id);
    this.folderNameDraft.set('');
    this.expandedFolderIds.update((current) => {
      const next = new Set(current);
      next.add(folder.id);
      return next;
    });
  }

  protected onFolderDeleteStart(folder: AgentXLibraryFolderTreeNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingFolderId.set(null);
    this.sharingFolderId.set(null);
    this.deleteFolderConfirmId.set(folder.id);
  }

  protected onFolderDeleteCancel(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.deleteFolderConfirmId.set(null);
  }

  protected async onFolderDeleteConfirm(
    folder: AgentXLibraryFolderTreeNode,
    event?: Event
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const teamId = this.resolveFolderMutationTeamId(folder);
    if (folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.deleteFolder(folder.id, teamId);
      this.expandedFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      this.toast.success('Deleted 1 folder.');
      this.onFolderMenuBackdropTap();
    } catch {
      this.toast.error('Failed to delete folder.');
    }
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  protected onClearSearch(): void {
    this.searchQuery.set('');
  }

  protected isUploadMenuOpen(): boolean {
    return this.isUploadMenuVisible();
  }

  protected onToggleUploadMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const isOpen = this.isUploadMenuVisible();
    if (isOpen) {
      this.isUploadMenuVisible.set(false);
      this.resetUploadDestinationMenu();
      return;
    }

    this.resetUploadDestinationMenu();
    this.isUploadMenuVisible.set(true);
  }

  protected onCloseUploadMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.isUploadMenuVisible.set(false);
    this.resetUploadDestinationMenu();
  }

  protected onBackToUploadTypeMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.resetUploadDestinationMenu();
  }

  protected onUploadDestinationSearchInput(value: string): void {
    this.uploadDestinationSearchQuery.set(value);
  }

  protected onUploadDestinationSelect(folderId: string | null, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.uploadDestinationFolderId.set(this.normalizeUploadFolderId(folderId));
    this.onConfirmUploadDestination();
  }

  protected onConfirmUploadDestination(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();

    const target = this.uploadDestinationTarget();
    if (!target) {
      return;
    }

    const folderId = this.normalizeUploadFolderId(this.uploadDestinationFolderId());
    this.queuedUploadFolderId.set(folderId);
    this.lastUsedUploadFolderId.set(folderId);
    this.onCloseUploadMenu();

    if (target === 'folder') {
      this.folderUploadInput().nativeElement.click();
      return;
    }

    if (this.uploadDestinationPendingMode() === 'film_review') {
      this.filmReviewUploadInput().nativeElement.click();
      return;
    }

    if (this.uploadDestinationPendingMode() === 'media') {
      this.mediaUploadInput().nativeElement.click();
      return;
    }

    this.fileUploadInput().nativeElement.click();
  }

  protected isFilesAskAgentMenuOpen(): boolean {
    return this.isFilesAskAgentMenuVisible();
  }

  protected onToggleFilesAskAgentMenu(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.isFilesAskAgentMenuVisible.update((current) => !current);
  }

  protected onCloseFilesAskAgentMenu(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.isFilesAskAgentMenuVisible.set(false);
  }

  protected onFilesAskAgentPromptSelect(promptId: FilesAskAgentPromptId, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    const selectedFolders = this.selectedFolders();
    const selectedFilesOutsideFolders = this.selectedFilesOutsideFolders();
    const selectedItemCount = selectedFolders.length + selectedFilesOutsideFolders.length;
    if (selectedItemCount <= 0) {
      return;
    }

    const selectedFolderContexts = selectedFolders.map((folder) =>
      this.buildFolderDragContext(folder, this.collectFolderFiles(folder))
    );
    const selectedFileContexts = selectedFilesOutsideFolders.map((file) =>
      this.buildFileDragContext(file)
    );
    const selectedContexts = [...selectedFolderContexts, ...selectedFileContexts];
    if (selectedContexts.length <= 0) {
      return;
    }

    this.agentXService.queueSelectedContexts(selectedContexts);

    const prompt = this.buildFilesAskAgentPrompt(promptId, selectedItemCount);
    this.askAgentPromptRequested.emit(prompt);
    this.isFilesAskAgentMenuVisible.set(false);
  }

  protected downloadSelectedFilesButtonAriaLabel(): string {
    const selectedCount = this.selectedFileCount();
    return selectedCount === 1
      ? 'Download selected file'
      : `Download ${selectedCount} selected files`;
  }

  protected deleteSelectedFilesButtonAriaLabel(): string {
    const selectedFileCount = this.selectedFileCount();
    const selectedFolderCount = this.selectedFoldersWithoutFiles().length;
    const selectedCount = selectedFileCount + selectedFolderCount;

    if (selectedCount === 1) {
      return selectedFolderCount === 1 ? 'Delete selected folder' : 'Delete selected file';
    }

    if (selectedFileCount > 0 && selectedFolderCount > 0) {
      return `Delete ${selectedCount} selected items`;
    }

    return selectedFolderCount > 0
      ? `Delete ${selectedFolderCount} selected folders`
      : `Delete ${selectedFileCount} selected files`;
  }

  protected async onDownloadSelectedFiles(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const selectedFiles = this.selectedFiles();
    if (selectedFiles.length === 0) {
      this.toast.info('Select files to download.');
      return;
    }

    const archiveEntries: ArchiveDownloadEntry[] = selectedFiles.map((file) => ({
      path: this.buildSelectedFileArchivePath(file),
      source: {
        kind: 'url',
        url: file.url,
      },
    }));

    const result = await this.archive.downloadZip({
      fileName: this.buildSelectedFilesArchiveFileName(selectedFiles),
      rootFolderName: 'NXT1 Files Library',
      entries: archiveEntries,
    });

    if (!result.success) {
      this.toast.error(result.error ?? 'Failed to prepare the selected file ZIP export.');
      return;
    }

    this.toast.success(
      archiveEntries.length === 1
        ? 'Prepared ZIP export for 1 selected file.'
        : `Prepared ZIP export for ${archiveEntries.length} selected files.`
    );
  }

  protected async onDeleteSelectedFiles(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const selectedFiles = this.selectedFiles();
    const selectedFoldersWithoutFiles = this.selectedFoldersWithoutFiles();

    if (selectedFiles.length === 0 && selectedFoldersWithoutFiles.length === 0) {
      this.toast.info('Select files or empty folders to delete.');
      return;
    }

    let deletedFileCount = 0;
    for (const file of selectedFiles) {
      try {
        await this.filesService.deleteFile(file.id, this.resolveFileMutationTeamId(file));
        deletedFileCount += 1;
      } catch {
        // Errors are surfaced by the service.
      }
    }

    let deletedFolderCount = 0;
    for (const folder of selectedFoldersWithoutFiles) {
      try {
        await this.filesService.deleteFolder(
          folder.id,
          this.resolveSourceFolder(folder)?.teamId ?? null
        );
        deletedFolderCount += 1;
      } catch {
        // Errors are surfaced by the service.
      }
    }

    this.pruneSelectedSelections();

    const deletedCount = deletedFileCount + deletedFolderCount;
    if (deletedCount <= 0) {
      return;
    }

    if (deletedFileCount > 0 && deletedFolderCount > 0) {
      this.toast.success(`Deleted ${deletedCount} selected items.`);
      return;
    }

    if (deletedFolderCount > 0) {
      this.toast.success(
        deletedFolderCount === 1
          ? 'Deleted 1 selected folder.'
          : `Deleted ${deletedFolderCount} selected folders.`
      );
      return;
    }

    this.toast.success(
      deletedFileCount === 1
        ? 'Deleted 1 selected file.'
        : `Deleted ${deletedFileCount} selected files.`
    );
  }

  protected clearSelectedFiles(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.selectedFileIds.set(new Set());
    this.selectedFolderIds.set(new Set());
  }

  protected isFileSelected(fileId: string): boolean {
    return this.selectedFileIds().has(fileId);
  }

  protected onToggleFileSelection(fileId: string, event: Event): void {
    event.stopPropagation();
    const input = event.target as HTMLInputElement | null;
    const isChecked = !!input?.checked;

    this.selectedFileIds.update((current) => {
      const next = new Set(current);
      if (isChecked) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });

    this.pruneSelectedFolderSelections();
  }

  protected areAllFolderItemsSelected(folder: AgentXLibraryFolderTreeNode): boolean {
    const resolvedFolder = this.resolveFullFolderNode(folder);
    const folderFileIds = this.collectFolderFileIds(resolvedFolder);
    if (folderFileIds.length === 0) {
      return this.selectedFolderIds().has(resolvedFolder.id);
    }

    const selectedIds = this.selectedFileIds();
    return folderFileIds.every((fileId) => selectedIds.has(fileId));
  }

  protected isSomeFolderItemsSelected(folder: AgentXLibraryFolderTreeNode): boolean {
    const resolvedFolder = this.resolveFullFolderNode(folder);
    const folderFileIds = this.collectFolderFileIds(resolvedFolder);
    if (folderFileIds.length === 0) {
      return false;
    }

    const selectedIds = this.selectedFileIds();
    const selectedCount = folderFileIds.reduce(
      (count, fileId) => (selectedIds.has(fileId) ? count + 1 : count),
      0
    );
    return selectedCount > 0 && selectedCount < folderFileIds.length;
  }

  protected onToggleFolderSelection(folder: AgentXLibraryFolderTreeNode, event: Event): void {
    event.stopPropagation();
    const input = event.target as HTMLInputElement | null;
    const isChecked = !!input?.checked;
    const resolvedFolder = this.resolveFullFolderNode(folder);
    const folderFileIds = this.collectFolderFileIds(resolvedFolder);

    if (folderFileIds.length === 0) {
      this.selectedFolderIds.update((current) => {
        const next = new Set(current);
        if (isChecked) {
          next.add(resolvedFolder.id);
        } else {
          next.delete(resolvedFolder.id);
        }
        return next;
      });
      return;
    }

    this.selectedFileIds.update((current) => {
      const next = new Set(current);
      for (const fileId of folderFileIds) {
        if (isChecked) {
          next.add(fileId);
        } else {
          next.delete(fileId);
        }
      }
      return next;
    });

    this.selectedFolderIds.update((current) => {
      const next = new Set(current);
      if (isChecked) {
        next.add(resolvedFolder.id);
      } else {
        next.delete(resolvedFolder.id);
      }
      return next;
    });

    this.pruneSelectedFolderSelections();
  }

  protected getFolderDragContexts(
    folder: AgentXLibraryFolderTreeNode
  ): AgentXSelectedContext | readonly AgentXSelectedContext[] | null {
    const resolvedFolder = this.resolveFullFolderNode(folder);
    const selectedFolderIds = this.selectedFolderIds();
    if (selectedFolderIds.has(resolvedFolder.id)) {
      const selectedFolderContexts = this.selectedFolders().map((selectedFolder) =>
        this.buildFolderDragContext(selectedFolder, this.collectFolderFiles(selectedFolder))
      );
      const selectedFileContexts = this.selectedFilesOutsideFolders().map((file) =>
        this.buildFileDragContext(file)
      );
      const selectedContexts = [...selectedFolderContexts, ...selectedFileContexts];
      if (selectedContexts.length > 0) {
        return selectedContexts.length === 1 ? selectedContexts[0] : selectedContexts;
      }
    }

    return this.buildFolderDragContext(resolvedFolder, this.collectFolderFiles(resolvedFolder));
  }

  protected buildFileDragContextsForLibrary(
    file: AgentXLibraryFile
  ): readonly AgentXSelectedContext[] {
    const draggedFiles = this.resolveDraggedFiles(file.id);
    const contexts = draggedFiles.map((entry) => this.buildFileDragContext(entry));
    return contexts.length > 0 ? contexts : [this.buildFileDragContext(file)];
  }

  protected onFileDragStart(
    file: AgentXLibraryFile,
    _folderItems: readonly AgentXLibraryFile[],
    event: DragEvent
  ): void {
    if (this.isFolderItemReorderDragActive()) {
      event.preventDefault();
      return;
    }

    this.draggingFolderId.set(null);
    const draggedFiles = this.resolveDraggedFiles(file.id);
    this.draggingFileIds.set(new Set(draggedFiles.map((entry) => entry.id)));
    const dragContext = this.buildDragContextsForFiles(draggedFiles);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', file.id);
      if (dragContext) {
        event.dataTransfer.setData(
          AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
          serializeAgentXSelectedContextForDrag(dragContext)
        );
      }
    }
  }

  protected onFileDragEnd(): void {
    this.draggingFolderId.set(null);
    this.draggingFileIds.set(new Set());
    this.activeFolderDropTargetId.set(null);
    this.topLevelDropTargetActive.set(false);
  }

  protected onFolderContextDragStart(folder: AgentXLibraryFolderTreeNode, event: DragEvent): void {
    if (folder.isUnassigned || this.isFolderItemReorderDragActive()) {
      this.draggingFolderId.set(null);
      return;
    }

    this.draggingFolderId.set(folder.id);
    this.draggingFileIds.set(new Set());
    this.activeFolderDropTargetId.set(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', folder.id);
    }
  }

  protected onFolderContextDragEnd(): void {
    this.draggingFolderId.set(null);
    this.activeFolderDropTargetId.set(null);
    this.topLevelDropTargetActive.set(false);
  }

  protected onFolderDragOver(folderId: string, event: DragEvent): void {
    const draggedFolderId = this.draggingFolderId();
    if (
      this.draggingFileIds().size === 0 &&
      !draggedFolderId &&
      !this.isExternalFileDragEvent(event)
    ) {
      return;
    }

    const targetFolderId = folderId === TEAM_FILES_UNASSIGNED_FOLDER_ID ? null : folderId;
    if (draggedFolderId && !this.isValidFolderMoveTarget(draggedFolderId, targetFolderId)) {
      this.activeFolderDropTargetId.set(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.topLevelDropTargetActive.set(false);
    this.activeFolderDropTargetId.set(folderId);
    this.applyDragAutoScroll(event);
    if (this.isExternalFileDragEvent(event) && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
      this.isExternalImportDragActive.set(true);
    } else if (draggedFolderId && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onFolderDragLeave(folderId: string, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.activeFolderDropTargetId() === folderId) {
      this.activeFolderDropTargetId.set(null);
    }
  }

  protected async onFolderDrop(
    folder: AgentXLibraryFolderTreeNode,
    event: DragEvent
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const targetFolderId = folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID ? null : folder.id;

    if (this.isExternalFileDragEvent(event) && this.draggingFileIds().size === 0) {
      this.activeFolderDropTargetId.set(null);
      this.isExternalImportDragActive.set(false);
      const descriptors = await this.extractDroppedFiles(event);
      await this.importFiles(descriptors, targetFolderId, 'file');
      return;
    }

    const draggedFolderId = this.draggingFolderId();
    if (draggedFolderId) {
      this.draggingFolderId.set(null);
      this.activeFolderDropTargetId.set(null);
      this.isExternalImportDragActive.set(false);

      if (!this.isValidFolderMoveTarget(draggedFolderId, targetFolderId)) {
        return;
      }

      const sourceFolder = this.filesService
        .folders()
        .find((candidate) => candidate.id === draggedFolderId);
      if (!sourceFolder) {
        return;
      }

      const currentParentId = sourceFolder.parentId?.trim() || null;
      if (currentParentId === targetFolderId) {
        return;
      }

      if (!this.hasFolderSourceWriteAccess(sourceFolder)) {
        this.notifyReadOnlyMoveBlocked();
        return;
      }

      const teamId = sourceFolder.teamId?.trim() || this.teamId?.trim() || null;
      try {
        await this.filesService.updateFolder(draggedFolderId, {
          teamId,
          parentId: targetFolderId,
        });
      } catch {
        // intentionally ignored
      }
      return;
    }

    const draggedFileIds = [...this.draggingFileIds()];
    this.activeFolderDropTargetId.set(null);
    this.draggingFileIds.set(new Set());
    this.isExternalImportDragActive.set(false);

    if (draggedFileIds.length === 0) {
      return;
    }

    const filesToMove = this.filesService
      .files()
      .filter(
        (entry) => draggedFileIds.includes(entry.id) && (entry.folderId ?? null) !== targetFolderId
      );
    if (filesToMove.length === 0) {
      return;
    }

    if (filesToMove.some((entry) => !this.hasFileWriteAccess(entry))) {
      this.notifyReadOnlyMoveBlocked();
      return;
    }

    try {
      for (const currentFile of filesToMove) {
        await this.filesService.moveFile(
          currentFile.id,
          this.resolveFileMutationTeamId(currentFile),
          targetFolderId
        );
      }
    } catch {
      // intentionally ignored
    }
  }

  protected async onFolderReorder(
    event: CdkDragDrop<readonly AgentXLibraryFolderTreeNode[]>,
    parentId: string | null
  ): Promise<void> {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const reorderedNodes = [...event.container.data];
    moveItemInArray(reorderedNodes, event.previousIndex, event.currentIndex);

    const sortedFolders = reorderedNodes
      .filter((node) => !node.isUnassigned)
      .map((node) => node.source)
      .filter((folder): folder is TeamFileFolderDoc => {
        return !!folder && typeof folder === 'object' && 'id' in folder && 'sortOrder' in folder;
      });

    if (sortedFolders.length <= 1) {
      return;
    }

    const normalizedParentId = parentId?.trim() || null;
    const folderOrderKey = normalizedParentId ?? ROOT_FOLDER_ORDER_KEY;
    this.folderOrderByParentId.update((current) => ({
      ...current,
      [folderOrderKey]: sortedFolders.map((folder) => folder.id),
    }));

    const updates = sortedFolders
      .map((folder, index) => {
        const nextSortOrder = index;
        const nextParentId = normalizedParentId;
        const currentParentId = folder.parentId?.trim() || null;
        if (folder.sortOrder === nextSortOrder && currentParentId === nextParentId) {
          return null;
        }
        const teamId = folder.teamId?.trim() || this.teamId?.trim() || null;
        return this.filesService.updateFolder(folder.id, {
          teamId,
          sortOrder: nextSortOrder,
          parentId: nextParentId,
        });
      })
      .filter((update): update is Promise<TeamFileFolderDoc> => update !== null);

    if (updates.length === 0) {
      return;
    }

    try {
      await Promise.all(updates);
    } catch {
      // intentionally ignored
    }
  }

  private resolvePreferredUploadFolderId(explicitFolderId?: string | null): string | null {
    if (typeof explicitFolderId !== 'undefined') {
      return explicitFolderId === TEAM_FILES_UNASSIGNED_FOLDER_ID ? null : explicitFolderId;
    }

    const selectedFolders = this.selectedFolders();
    if (selectedFolders.length !== 1) {
      return null;
    }

    return selectedFolders[0]?.id === TEAM_FILES_UNASSIGNED_FOLDER_ID
      ? null
      : (selectedFolders[0]?.id ?? null);
  }

  private openUploadDestinationPicker(target: UploadDestinationPickerTarget, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.uploadDestinationTarget.set(target);
    this.uploadDestinationPendingMode.set('file');
    this.uploadDestinationSearchQuery.set('');
    this.uploadDestinationFolderId.set(this.resolveUploadDestinationSeedFolderId());
    this.uploadDestinationMenuStep.set('destination');
  }

  private openFilmReviewDestinationPicker(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.uploadDestinationTarget.set('file');
    this.uploadDestinationPendingMode.set('film_review');
    this.uploadDestinationSearchQuery.set('');
    this.uploadDestinationFolderId.set(this.resolveUploadDestinationSeedFolderId());
    this.uploadDestinationMenuStep.set('destination');
  }

  private openMediaDestinationPicker(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.uploadDestinationTarget.set('file');
    this.uploadDestinationPendingMode.set('media');
    this.uploadDestinationSearchQuery.set('');
    this.uploadDestinationFolderId.set(this.resolveUploadDestinationSeedFolderId());
    this.uploadDestinationMenuStep.set('destination');
  }

  private resolveUploadDestinationSeedFolderId(): string | null {
    const selectedFolderId = this.resolvePreferredUploadFolderId();
    if (selectedFolderId !== null) {
      return this.normalizeUploadFolderId(selectedFolderId);
    }

    return this.normalizeUploadFolderId(this.lastUsedUploadFolderId());
  }

  private resetUploadDestinationMenu(): void {
    this.uploadDestinationMenuStep.set('menu');
    this.uploadDestinationTarget.set(null);
    this.uploadDestinationSearchQuery.set('');
    this.uploadDestinationFolderId.set(null);
  }

  private consumeQueuedUploadFolderId(): string | null {
    const queuedFolderId = this.queuedUploadFolderId();
    this.queuedUploadFolderId.set(undefined);
    if (typeof queuedFolderId !== 'undefined') {
      return this.normalizeUploadFolderId(queuedFolderId);
    }

    return this.resolvePreferredUploadFolderId();
  }

  private normalizeUploadFolderId(folderId: string | null | undefined): string | null {
    if (!folderId || folderId === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return null;
    }

    const folderExists = this.filesService.folders().some((folder) => folder.id === folderId);
    return folderExists ? folderId : null;
  }

  private async importFiles(
    descriptors: readonly ImportedFileDescriptor[],
    preferredFolderId: string | null,
    uploadTarget: 'file' | 'film_review'
  ): Promise<void> {
    const teamId = this.teamId?.trim() || null;
    if (descriptors.length === 0) {
      return;
    }

    const groups = await this.resolveUploadGroups(descriptors, teamId, preferredFolderId);
    if (groups.length === 0) {
      return;
    }

    let uploadedCount = 0;
    const uploadedFileIds: string[] = [];
    const totalFiles = groups.reduce((count, group) => count + group.files.length, 0);

    this.isUploadingFiles.set(true);
    this.filesUploadError.set(null);
    this.filesUploadPercent.set(0);
    this.filesUploadCurrentFile.set(totalFiles > 0 ? 1 : 0);
    this.filesUploadTotalFiles.set(totalFiles);
    this.filesUploadCurrentFileName.set(null);
    this.filesUploadCanCancel.set(false);

    try {
      let completedBeforeGroup = 0;
      for (const group of groups) {
        const handle = this.filesService.startUploadFiles(group.files, teamId, {
          sport: this.sport || null,
          folderId: group.folderId,
          reloadAfterUpload: false,
          suppressSuccessToast: true,
          uploadTarget,
        });

        this.activeFilesUploadHandle = handle;
        this.bindFilesUploadProgress(handle, completedBeforeGroup, group.files.length, totalFiles);

        const groupUploadedIds = await handle.result;
        uploadedFileIds.push(...groupUploadedIds);
        completedBeforeGroup += group.files.length;
        uploadedCount += group.files.length;
      }

      await this.filesService.loadFiles(teamId);
      if (uploadTarget === 'film_review' && uploadedFileIds.length === 1) {
        const uploadedFileId = uploadedFileIds[0];
        if (uploadedFileId) {
          try {
            const createdFile = await this.filesService.refreshFile(uploadedFileId, teamId);
            await this.openFile(createdFile);
          } catch {
            // Fall through to the success toast if the index has not propagated yet.
          }
        }
      }
      this.toast.success(
        uploadTarget === 'film_review'
          ? uploadedCount === 1
            ? 'Imported 1 video into Film Review.'
            : `Imported ${uploadedCount} videos into Film Review.`
          : uploadedCount === 1
            ? 'Imported 1 file into Team Files.'
            : `Imported ${uploadedCount} files into Team Files.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload files';
      if (message === FILES_UPLOAD_CANCELLED_MESSAGE) {
        this.toast.info('Upload cancelled.');
      } else {
        const actionableMessage =
          this.isLikelyVideoFileName(this.filesUploadCurrentFileName()) ||
          message.toLowerCase().includes('video')
            ? this.formatVideoUploadFailureMessage(message)
            : message;
        this.filesUploadError.set(actionableMessage);
        this.toast.error(actionableMessage);
      }
    } finally {
      this.resetFilesUploadStatus();
    }
  }

  protected cancelActiveFilesUpload(): void {
    this.activeFilesUploadHandle?.cancel();
  }

  private bindFilesUploadProgress(
    handle: AgentXFilesUploadHandle,
    completedBeforeGroup: number,
    groupFileCount: number,
    totalFiles: number
  ): void {
    this.activeFilesUploadSubscription?.unsubscribe();
    this.activeFilesUploadSubscription = handle.progress$.subscribe(
      (progress: AgentXFilesUploadProgress) => {
        const currentFile = Math.max(
          1,
          Math.min(totalFiles, completedBeforeGroup + progress.currentFile)
        );
        const groupPercent = Math.max(0, Math.min(100, progress.percent));
        const overallPercent =
          totalFiles > 0
            ? ((completedBeforeGroup + (groupPercent / 100) * groupFileCount) / totalFiles) * 100
            : 100;

        this.filesUploadCurrentFile.set(currentFile);
        this.filesUploadTotalFiles.set(totalFiles);
        this.setFilesUploadPercentMonotonic(Math.round(overallPercent));
        this.filesUploadCurrentFileName.set(progress.currentFileName);
        this.filesUploadCanCancel.set(progress.canCancel);
      }
    );
  }

  private setFilesUploadPercentMonotonic(nextPercent: number): void {
    const clampedNext = Math.max(0, Math.min(100, nextPercent));
    const current = this.filesUploadPercent();
    if (typeof current === 'number') {
      this.filesUploadPercent.set(Math.max(current, clampedNext));
      return;
    }

    this.filesUploadPercent.set(clampedNext);
  }

  private resetFilesUploadStatus(): void {
    this.activeFilesUploadSubscription?.unsubscribe();
    this.activeFilesUploadSubscription = null;
    this.activeFilesUploadHandle = null;
    this.isUploadingFiles.set(false);
    this.filesUploadPercent.set(null);
    this.filesUploadCurrentFile.set(0);
    this.filesUploadTotalFiles.set(0);
    this.filesUploadCurrentFileName.set(null);
    this.filesUploadCanCancel.set(false);
  }

  private async resolveUploadGroups(
    descriptors: readonly ImportedFileDescriptor[],
    teamId: string | null,
    preferredFolderId: string | null
  ): Promise<readonly UploadGroup[]> {
    if (!teamId) {
      return [
        {
          folderId: null,
          files: descriptors.map((descriptor) => descriptor.file),
        },
      ];
    }

    const folderLookup = new Map<string, string | null>();
    for (const folder of this.filesService.folders()) {
      folderLookup.set(this.buildFolderLookupKey(folder.parentId ?? null, folder.name), folder.id);
    }

    const groups = new Map<string, File[]>();
    for (const descriptor of descriptors) {
      const directorySegments = descriptor.relativePath
        ? this.getDirectorySegments(descriptor.relativePath)
        : ([] as readonly string[]);
      let folderId = preferredFolderId;

      for (const segment of directorySegments) {
        folderId = await this.ensureImportFolder(folderLookup, teamId, folderId, segment);
      }

      const groupKey = folderId ?? '__root__';
      const current = groups.get(groupKey) ?? [];
      current.push(descriptor.file);
      groups.set(groupKey, current);
    }

    return [...groups.entries()].map(([folderId, files]) => ({
      folderId: folderId === '__root__' ? null : folderId,
      files,
    }));
  }

  private async ensureImportFolder(
    folderLookup: Map<string, string | null>,
    teamId: string,
    parentId: string | null,
    name: string
  ): Promise<string> {
    const trimmedName = name.trim().slice(0, 80);
    const lookupKey = this.buildFolderLookupKey(parentId, trimmedName);
    const existing = folderLookup.get(lookupKey);
    if (existing) {
      return existing;
    }

    const folder = await this.filesService.createFolder({
      teamId,
      name: trimmedName,
      parentId,
    });
    folderLookup.set(lookupKey, folder.id);
    return folder.id;
  }

  private buildFolderLookupKey(parentId: string | null, name: string): string {
    return `${parentId ?? '__root__'}::${name.trim().toLowerCase()}`;
  }

  private getDirectorySegments(relativePath: string): readonly string[] {
    const segments = relativePath
      .split(/[\\/]+/u)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    return segments.slice(0, -1);
  }

  private async extractDroppedFiles(event: DragEvent): Promise<readonly ImportedFileDescriptor[]> {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return [];
    }

    const entryItems = Array.from(dataTransfer.items ?? [])
      .map((item) => (item as DataTransferItemWithWebKitEntry).webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (entryItems.length > 0) {
      const descriptors = await Promise.all(
        entryItems.map((entry) => this.readEntryDescriptors(entry, ''))
      );
      return descriptors.flat();
    }

    return Array.from(dataTransfer.files ?? []).map((file) => ({
      file,
      relativePath: this.readWebkitRelativePath(file),
    }));
  }

  private async readEntryDescriptors(
    entry: WebKitFileSystemEntry,
    parentPath: string
  ): Promise<readonly ImportedFileDescriptor[]> {
    if (entry.isFile) {
      const fileEntry = entry as WebKitFileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
      return [{ file, relativePath }];
    }

    if (!entry.isDirectory) {
      return [];
    }

    const directoryEntry = entry as WebKitFileSystemDirectoryEntry;
    const childEntries = await this.readAllDirectoryEntries(directoryEntry.createReader());
    const nextParentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const descriptors = await Promise.all(
      childEntries.map((childEntry) => this.readEntryDescriptors(childEntry, nextParentPath))
    );
    return descriptors.flat();
  }

  private async readAllDirectoryEntries(
    reader: WebKitFileSystemDirectoryReader
  ): Promise<readonly WebKitFileSystemEntry[]> {
    const entries: WebKitFileSystemEntry[] = [];

    while (true) {
      const batch = await new Promise<readonly WebKitFileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

      if (batch.length === 0) {
        return entries;
      }

      entries.push(...batch);
    }
  }

  private readWebkitRelativePath(file: File): string | null {
    const relativePath = (file as FileWithRelativePath).webkitRelativePath;
    if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
      return null;
    }

    return relativePath.trim();
  }

  private isExternalFileDragEvent(event: DragEvent): boolean {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types ?? []).includes('Files');
  }

  protected canReorderFolderItems(items: readonly AgentXLibraryFile[]): boolean {
    return items.length > 1;
  }

  protected onFolderItemsReorder(
    folder: AgentXLibraryFolderTreeNode,
    event: CdkDragDrop<readonly AgentXLibraryFile[]>
  ): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const reorderedItems = [...event.container.data];
    moveItemInArray(reorderedItems, event.previousIndex, event.currentIndex);

    this.folderItemOrderByFolderId.update((current) => ({
      ...current,
      [folder.id]: reorderedItems.map((item) => item.id),
    }));
  }

  protected onFolderItemReorderDragStart(): void {
    this.isFolderItemReorderDragActive.set(true);
    this.activeFolderDropTargetId.set(null);
    this.draggingFolderId.set(null);
    this.draggingFileIds.set(new Set());
  }

  protected onFolderItemReorderDragEnd(): void {
    this.isFolderItemReorderDragActive.set(false);
  }

  protected iconNameForFile(file: Pick<AgentXLibraryFile, 'kind'>): IconName {
    switch (file.kind) {
      case 'video':
        return 'playCircle';
      case 'image':
        return 'image';
      case 'csv':
        return 'list';
      case 'app':
        return 'sparkles';
      case 'pdf':
        return 'receipt';
      case 'doc':
      default:
        return 'documentText';
    }
  }

  protected thumbnailUrlForListItem(
    file: Pick<AgentXLibraryFile, 'kind' | 'url' | 'thumbnailUrl' | 'cloudflareVideoId'>
  ): string | null {
    if (file.kind === 'image' && file.url.trim().length > 0) {
      return file.url;
    }

    if (file.kind === 'video' && typeof file.thumbnailUrl === 'string') {
      const normalizedThumbnailUrl = file.thumbnailUrl.trim();
      if (normalizedThumbnailUrl.length > 0) {
        return normalizedThumbnailUrl;
      }
    }

    if (file.kind === 'video') {
      const normalizedCloudflareVideoId = file.cloudflareVideoId?.trim();
      if (normalizedCloudflareVideoId) {
        return `https://videodelivery.net/${normalizedCloudflareVideoId}/thumbnails/thumbnail.jpg`;
      }
    }

    return null;
  }

  protected placeholderToneClassForFile(file: Pick<AgentXLibraryFile, 'kind'>): string {
    switch (file.kind) {
      case 'pdf':
        return 'film-list-item__thumb-placeholder--pdf';
      case 'csv':
        return 'film-list-item__thumb-placeholder--csv';
      case 'app':
        return 'film-list-item__thumb-placeholder--app';
      case 'doc':
      default:
        return 'film-list-item__thumb-placeholder--doc';
    }
  }

  protected buildMetaLine(file: AgentXLibraryFile): string {
    return file.kind;
  }

  protected buildFileDragContext(file: AgentXLibraryFile): AgentXSelectedContext {
    const nativeFilmReview = this.extractNativeFilmReviewPayload(file);
    const isNativeFilmReview = file.kind === 'video' && nativeFilmReview !== null;
    const kind: AgentXSelectedContext['kind'] = file.kind === 'video' ? 'film_play' : 'document';
    const title = nativeFilmReview?.title?.trim() || file.name;

    return {
      id: isNativeFilmReview ? `film-review:${file.id}` : `team-file:${file.id}`,
      kind,
      title,
      summary: isNativeFilmReview
        ? this.buildNativeFilmReviewDragSummary(file, nativeFilmReview)
        : this.buildMetaLine(file),
      source: {
        type: isNativeFilmReview ? 'film_review' : 'agent_x',
        id: file.id,
        label: isNativeFilmReview ? title : 'Files',
      },
      entityRefs: isNativeFilmReview
        ? [
            { type: 'film_review', id: file.id, label: title },
            { type: 'team_file', id: file.id, label: file.name },
          ]
        : [{ type: 'team_file', id: file.id, label: file.name }],
      media: {
        ...(file.kind === 'video' ? { videoUrl: file.url } : {}),
        ...(file.kind === 'image' ? { imageUrl: file.url } : {}),
        ...(file.thumbnailUrl ? { thumbnailUrl: file.thumbnailUrl } : {}),
        ...(file.cloudflareVideoId ? { cloudflareVideoId: file.cloudflareVideoId } : {}),
      },
      metadata: {
        itemType: isNativeFilmReview ? 'film_review' : 'team_file',
        fileKind: file.kind,
        status: file.status,
        origin: file.origin,
        mimeType: file.mimeType,
        teamId: file.teamId ?? null,
        ...(isNativeFilmReview && nativeFilmReview?.opponentName?.trim()
          ? { opponentName: nativeFilmReview.opponentName.trim() }
          : {}),
        ...(isNativeFilmReview
          ? {
              reviewId: file.id,
              playCount: this.resolveNativeFilmReviewPlayCount(nativeFilmReview),
            }
          : {}),
        sport: file.sport ?? null,
        storagePath: file.storagePath ?? null,
        sourceThreadId: file.sourceThreadId ?? null,
        sourceMessageId: file.sourceMessageId ?? null,
        sourceOperationId: file.sourceOperationId ?? null,
        sizeBytes: file.sizeBytes,
      },
    };
  }

  private extractNativeFilmReviewPayload(
    file: Pick<AgentXLibraryFile, 'kind' | 'rawPayload'>
  ): Partial<TeamFilmReviewDoc> | null {
    if (file.kind !== 'video') {
      return null;
    }

    const payload = file.rawPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const review = (payload as { filmReview?: unknown }).filmReview;
    if (!review || typeof review !== 'object' || Array.isArray(review)) {
      return null;
    }

    return review as Partial<TeamFilmReviewDoc>;
  }

  private buildNativeFilmReviewDragSummary(
    file: AgentXLibraryFile,
    review: Partial<TeamFilmReviewDoc>
  ): string {
    const summaryParts: string[] = [];
    const aiSummary = review.aiSummary?.trim();
    if (aiSummary) {
      summaryParts.push(aiSummary);
    }

    const breakdownParts: string[] = [];
    const providerLabel = this.getNativeFilmReviewBreakdownProviderLabel(
      review.breakdownSource?.provider
    );
    if (providerLabel) {
      breakdownParts.push(providerLabel);
    }

    const playCount = this.resolveNativeFilmReviewPlayCount(review);
    if (playCount > 0) {
      breakdownParts.push(`${playCount} tagged plays`);
    }

    if (breakdownParts.length > 0) {
      summaryParts.push(breakdownParts.join(' • '));
    }

    const opponentName = review.opponentName?.trim();
    if (opponentName) {
      summaryParts.push(`Film review vs ${opponentName}`);
    }

    if (summaryParts.length === 0) {
      summaryParts.push(this.buildMetaLine(file));
    }

    return summaryParts.join(' • ').slice(0, 600);
  }

  private resolveNativeFilmReviewPlayCount(review: Partial<TeamFilmReviewDoc>): number {
    if (Array.isArray(review.timeline) && review.timeline.length > 0) {
      return review.timeline.length;
    }

    if (typeof review.breakdownSource?.playCount === 'number') {
      return review.breakdownSource.playCount;
    }

    return 0;
  }

  private getNativeFilmReviewBreakdownProviderLabel(
    provider: 'hudl' | 'csv' | 'manual_import' | undefined
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

  private buildFolderDragContext(
    folder: TeamFileTreeNode,
    files: readonly AgentXLibraryFile[]
  ): AgentXSelectedContext {
    const fileCount = files.length;
    const fileTitlePreview = files
      .slice(0, 3)
      .map((file) => file.name)
      .join(' | ');
    const summaryParts: string[] = [];

    if (fileCount > 0) {
      summaryParts.push(
        fileCount === 1 ? '1 file in this folder' : `${fileCount} files in this folder`
      );
    } else {
      summaryParts.push('Folder is currently empty');
    }

    if (fileTitlePreview) {
      summaryParts.push(`Includes: ${fileTitlePreview}`);
    }

    const allFileIds = files.map((file) => file.id);

    return {
      id: `team-file-folder:${folder.id}`,
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
          type: 'team_file_folder',
          id: folder.id,
          label: folder.name,
        },
        ...files.map((file) => ({
          type: 'team_file',
          id: file.id,
          label: file.name,
        })),
      ],
      metadata: {
        itemType: 'team_file_folder',
        folderId: folder.id,
        folderName: folder.name,
        hasFiles: fileCount > 0,
        fileCount,
        fileIdsCsv: allFileIds.length > 0 ? allFileIds.join(',') : null,
      },
    };
  }

  protected async openFile(file: AgentXLibraryFile): Promise<void> {
    const teamId = this.teamId?.trim() || null;
    const inlineFilmReviewId = this.getInlineFilmReviewId(file);
    let viewerFile = file;

    if (inlineFilmReviewId) {
      this.filesService.selectFile(file.id);
      this.selectedFilmReviewId.set(null);
      this.filmReviewService.select(null);
      this.pendingFilmReviewId.set(null);
      this.resetGenericVideoPlayerState();

      if (teamId) {
        try {
          viewerFile = await this.filesService.refreshFile(file.id, teamId);
        } catch (error) {
          this.toast.error(
            error instanceof Error ? error.message : 'Failed to refresh file preview'
          );
        }
      }

      if (!this.isVideoFile(viewerFile)) {
        return;
      }

      if (this.filesService.selectedId() !== file.id) {
        return;
      }

      await this.transitionToFilmReview(viewerFile.id, inlineFilmReviewId);
      return;
    }

    // Switch immediately so tap feedback is instant, then hydrate/upgrade async.
    this.filesService.selectFile(file.id);
    this.selectedFilmReviewId.set(null);
    this.isOpeningFilmReview.set(false);
    this.filmReviewService.select(null);
    this.pendingFilmReviewId.set(null);
    this.resetGenericVideoPlayerState();
    this.addGenericFileTab(file.id);
    this.addPanelTab({ kind: 'file', id: file.id });
    this.viewerMode.set('generic');

    if (teamId) {
      try {
        viewerFile = await this.filesService.refreshFile(file.id, teamId, {
          ...(this.isPdfFile(file) ? { disposition: 'inline' } : {}),
        });
      } catch (error) {
        this.toast.error(error instanceof Error ? error.message : 'Failed to refresh file preview');
      }
    }

    this.filesService.selectFile(viewerFile.id);

    if (!this.isVideoFile(viewerFile)) {
      return;
    }

    const matchedReviewId = await this.resolveExistingFilmReviewIdForFile(viewerFile);
    if (!matchedReviewId) {
      return;
    }

    if (this.filesService.selectedId() !== viewerFile.id) {
      return;
    }

    await this.transitionToFilmReview(viewerFile.id, matchedReviewId);
  }

  private getInlineFilmReviewId(file: AgentXLibraryFile): string | null {
    if (!this.isVideoFile(file) || !file.rawPayload || typeof file.rawPayload !== 'object') {
      return null;
    }

    const payload = file.rawPayload as { filmReview?: unknown };
    if (
      !payload.filmReview ||
      typeof payload.filmReview !== 'object' ||
      Array.isArray(payload.filmReview)
    ) {
      return null;
    }

    return file.id;
  }

  protected onGenericVideoLoadedMetadata(): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player) return;

    this.syncGenericVideoPlaybackSignals(player);
    player.playbackRate = this.genericVideoPlaybackRate();

    if (!player.paused && !player.ended) {
      this.startGenericVideoSmoothProgressTracking();
    }
  }

  protected onGenericVideoTimeUpdate(): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player) return;

    this.syncGenericVideoPlaybackSignals(player);

    if (!player.paused && !player.ended) {
      this.startGenericVideoSmoothProgressTracking();
    }
  }

  protected onGenericVideoPlay(): void {
    this.genericVideoIsPlaying.set(true);
    this.startGenericVideoSmoothProgressTracking();
  }

  protected onGenericVideoPause(): void {
    this.genericVideoIsPlaying.set(false);
    this.genericVideoControlDragLockActive.set(false);
    this.stopGenericVideoSmoothProgressTracking();
  }

  protected onGenericVideoEnded(): void {
    this.genericVideoIsPlaying.set(false);
    this.genericVideoControlDragLockActive.set(false);
    this.stopGenericVideoSmoothProgressTracking();
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player) return;

    this.syncGenericVideoPlaybackSignals(player);
  }

  protected onGenericVideoError(): void {
    this.genericVideoIsPlaying.set(false);
    this.genericVideoControlDragLockActive.set(false);
    this.stopGenericVideoSmoothProgressTracking();

    const file = this.selectedViewerFile();
    if (!file || !this.isVideoFile(file) || !this.isCloudflarePlaybackFile(file)) {
      return;
    }

    this.destroyGenericHls();
    this.genericVideoSourceUrl = null;
    this.genericCloudflareNativePlaybackFailed.update((current) => {
      if (current[file.id]) {
        return current;
      }

      return { ...current, [file.id]: true };
    });
  }

  protected toggleGenericVideoPlayPause(): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player) return;

    if (player.paused) {
      this.genericVideoIsPlaying.set(true);
      this.startGenericVideoSmoothProgressTracking();
      void playMediaWhenReady(player).catch(() => {
        this.genericVideoIsPlaying.set(false);
        this.stopGenericVideoSmoothProgressTracking();
      });
      return;
    }

    this.genericVideoIsPlaying.set(false);
    this.stopGenericVideoSmoothProgressTracking();
    player.pause();
  }

  protected seekGenericVideoRelative(seconds: number): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player || !Number.isFinite(seconds)) return;

    commitMediaSeek(player, player.currentTime + seconds);
    this.syncGenericVideoPlaybackSignals(player);
  }

  protected onGenericVideoSeekTime(timeSec: number): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player || !Number.isFinite(timeSec)) return;

    commitMediaSeek(player, timeSec);
    this.syncGenericVideoPlaybackSignals(player);
  }

  protected onGenericVideoSeekStart(): void {
    this.genericVideoControlDragLockActive.set(true);
  }

  protected onGenericVideoSeekEnd(): void {
    this.genericVideoControlDragLockActive.set(false);
  }

  protected onGenericVideoControlsInteractionStart(): void {
    this.genericVideoControlDragLockActive.set(true);
  }

  protected onGenericVideoControlsInteractionEnd(): void {
    this.genericVideoControlDragLockActive.set(false);
  }

  protected setGenericVideoPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;

    this.genericVideoPlaybackRate.set(rate);
    const player = this.genericVideoPlayer()?.nativeElement;
    if (!player) return;

    player.playbackRate = rate;
  }

  protected openSelectedVideoInNewWindow(): void {
    const file = this.selectedViewerFile();
    if (!file || !this.isVideoFile(file)) return;

    void this.openFileInNewTab(file);
  }

  protected toggleGenericVideoFullscreen(): void {
    const container = this.genericVideoShell()?.nativeElement;
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

  private async configureGenericVideoSource(
    file: AgentXLibraryFile,
    syncToken: number
  ): Promise<void> {
    const player = this.genericVideoPlayer()?.nativeElement;
    const videoUrl = this.resolveGenericPlayableVideoUrl(file);
    if (!player || !videoUrl) return;

    if (this.genericVideoSourceUrl === videoUrl) {
      if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
        this.onGenericVideoLoadedMetadata();
      }
      return;
    }

    this.destroyGenericHls();
    this.genericVideoSourceUrl = videoUrl;
    this.resetGenericVideoPlayerState();
    this.configureGenericVideoCrossOrigin(player, videoUrl);
    player.preload = 'auto';
    player.removeAttribute('src');
    player.load();

    if (isHlsSourceUrl(videoUrl) && !player.canPlayType('application/vnd.apple.mpegurl')) {
      const HlsConstructor = await this.loadGenericHlsConstructor();
      if (syncToken !== this.genericVideoSourceSyncToken) return;

      if (HlsConstructor?.isSupported()) {
        const hls = new HlsConstructor({ enableWorker: true });
        this.genericHls = hls;

        hls.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
          if (this.genericHls !== hls) return;
          hls.loadSource(videoUrl);
        });

        hls.on(HlsConstructor.Events.ERROR, (_event: string, data: ErrorData) => {
          if (data.fatal) {
            this.onGenericVideoError();
          }
        });

        hls.attachMedia(player);
        return;
      }
    }

    player.src = videoUrl;
    player.load();
  }

  private async loadGenericHlsConstructor(): Promise<typeof Hls | null> {
    if (this.genericHlsConstructor) return this.genericHlsConstructor;

    this.genericHlsLoadPromise ??= import('hls.js')
      .then((module) => {
        this.genericHlsConstructor = module.default;
        return module.default;
      })
      .catch(() => null);

    return this.genericHlsLoadPromise;
  }

  private destroyGenericHls(): void {
    if (!this.genericHls) return;
    this.genericHls.destroy();
    this.genericHls = null;
  }

  private resolveGenericCloudflareEmbedUrl(
    file: Pick<AgentXLibraryFile, 'url' | 'cloudflareVideoId' | 'readyToStream'>
  ): string | null {
    return resolveCloudflareBaseEmbedUrl({
      videoUrl: file.url,
      cloudflareVideoId: file.cloudflareVideoId,
      readyToStream: file.readyToStream,
    });
  }

  private resolveGenericPlayableVideoUrl(
    file: Pick<AgentXLibraryFile, 'url' | 'cloudflareVideoId' | 'readyToStream'>
  ): string | null {
    return resolvePlayableVideoUrl({
      videoUrl: file.url,
      cloudflareVideoId: file.cloudflareVideoId,
      readyToStream: file.readyToStream,
    });
  }

  private isCloudflarePlaybackFile(
    file: Pick<AgentXLibraryFile, 'url' | 'cloudflareVideoId'>
  ): boolean {
    return isCloudflarePlaybackSource({
      videoUrl: file.url,
      cloudflareVideoId: file.cloudflareVideoId,
    });
  }

  private configureGenericVideoCrossOrigin(player: HTMLVideoElement, videoUrl: string): void {
    if (!this.shouldUseCorsForGenericVideoSource(videoUrl)) {
      player.crossOrigin = null;
      player.removeAttribute('crossorigin');
      return;
    }

    player.crossOrigin = 'anonymous';
  }

  private shouldUseCorsForGenericVideoSource(url: string): boolean {
    try {
      const parsed = new URL(url);
      return !/(?:videodelivery|cloudflarestream)\.net|(?:cloudflarestream)\.com/i.test(
        parsed.hostname
      );
    } catch {
      return true;
    }
  }

  protected async openFileInNewTab(file: AgentXLibraryFile): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const nextUrl = await this.resolveFileUrlForAction(file, 'open');
    if (!nextUrl) {
      return;
    }

    const targetUrl = this.buildOpenTargetUrl(file, nextUrl);
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  protected async downloadFile(file: AgentXLibraryFile): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const downloadUrl = await this.resolveFileUrlForAction(file, 'download');
    if (!downloadUrl) {
      return;
    }

    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  }

  private resetGenericVideoPlayerState(): void {
    const player = this.genericVideoPlayer()?.nativeElement;
    if (player && !player.paused) {
      player.pause();
    }

    this.stopGenericVideoSmoothProgressTracking();
    this.genericVideoControlDragLockActive.set(false);
    this.genericVideoIsPlaying.set(false);
    this.genericVideoCurrentTime.set(0);
    this.genericVideoDuration.set(0);
    this.genericVideoPlaybackRate.set(1);
  }

  private syncGenericVideoPlaybackSignals(player: HTMLVideoElement): void {
    this.genericVideoCurrentTime.set(Number.isFinite(player.currentTime) ? player.currentTime : 0);
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    this.genericVideoDuration.set(duration > 0 ? duration : 0);
  }

  private startGenericVideoSmoothProgressTracking(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.genericVideoRafId !== null) return;

    const step = (): void => {
      const player = this.genericVideoPlayer()?.nativeElement;
      if (!player) {
        this.stopGenericVideoSmoothProgressTracking();
        return;
      }

      this.syncGenericVideoPlaybackSignals(player);

      if (!player.paused && !player.ended) {
        this.genericVideoRafId = requestAnimationFrame(step);
        return;
      }

      this.stopGenericVideoSmoothProgressTracking();
    };

    this.genericVideoRafId = requestAnimationFrame(step);
  }

  private stopGenericVideoSmoothProgressTracking(): void {
    if (this.genericVideoRafId === null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.genericVideoRafId);
    }
    this.genericVideoRafId = null;
  }

  private addGenericFileTab(fileId: string): void {
    const currentTabs = this.genericOpenTabIds();
    if (currentTabs.includes(fileId)) {
      return;
    }

    this.genericOpenTabIds.set([...currentTabs, fileId]);
  }

  private pruneGenericOpenTabs(): void {
    const validFileIds = new Set(this.filesService.files().map((file) => file.id));
    const currentTabs = this.genericOpenTabIds();
    const nextTabs = currentTabs.filter((fileId) => validFileIds.has(fileId));

    if (
      nextTabs.length === currentTabs.length &&
      nextTabs.every((fileId, index) => fileId === currentTabs[index])
    ) {
      return;
    }

    this.genericOpenTabIds.set(nextTabs);
  }

  private closeGenericFileTab(tabId?: string): void {
    const currentTabs = this.genericOpenTabIds();
    if (currentTabs.length === 0) {
      this.backToLibrary();
      return;
    }

    const targetTabId = tabId ?? this.filesService.selectedId();
    if (!targetTabId) {
      this.backToLibrary();
      return;
    }

    const targetIndex = currentTabs.indexOf(targetTabId);
    if (targetIndex < 0) {
      return;
    }

    const nextTabs = currentTabs.filter((id) => id !== targetTabId);
    this.genericOpenTabIds.set(nextTabs);

    if (nextTabs.length === 0) {
      this.backToLibrary();
      return;
    }

    if (this.filesService.selectedId() !== targetTabId) {
      return;
    }

    const fallbackId = nextTabs[Math.max(0, targetIndex - 1)] ?? nextTabs[0] ?? null;
    this.filesService.selectFile(fallbackId);
  }

  protected isImageFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'image' || file.mimeType.startsWith('image/');
  }

  protected isTextDocument(
    file: Pick<AgentXLibraryFile, 'kind' | 'mimeType' | 'textContent' | 'origin'>
  ): boolean {
    return (
      file.kind === 'doc' &&
      file.origin !== 'agent_chat_output' &&
      typeof file.textContent === 'string' &&
      file.textContent.trim().length > 0 &&
      file.mimeType.startsWith('text/')
    );
  }

  protected isMarkdownDocument(file: Pick<AgentXLibraryFile, 'mimeType'>): boolean {
    return file.mimeType.trim().toLowerCase() === 'text/markdown';
  }

  protected shouldRenderViewerStage(
    file: Pick<AgentXLibraryFile, 'kind' | 'mimeType' | 'textContent' | 'origin'>
  ): boolean {
    return !(
      file.kind === 'doc' &&
      file.origin === 'agent_chat_output' &&
      typeof file.textContent === 'string' &&
      file.textContent.trim().length > 0 &&
      file.mimeType.startsWith('text/')
    );
  }

  protected shouldShowViewerUploadAction(
    file: Pick<AgentXLibraryFile, 'kind' | 'mimeType' | 'textContent' | 'origin'>
  ): boolean {
    return !!this.teamId?.trim() && !this.shouldRenderViewerStage(file);
  }

  protected isPdfFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'pdf' || file.mimeType === 'application/pdf';
  }

  protected isSpreadsheetFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    const normalizedMimeType = file.mimeType.trim().toLowerCase();
    return (
      file.kind === 'csv' ||
      normalizedMimeType === 'text/csv' ||
      normalizedMimeType.includes('spreadsheet') ||
      normalizedMimeType.includes('excel')
    );
  }

  protected openActionLabelForFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): string {
    return this.isSpreadsheetFile(file) ? 'Open Spreadsheet' : 'Open Original';
  }

  protected formatKindLabel(file: Pick<AgentXLibraryFile, 'kind' | 'mimeType'>): string {
    if (this.isSpreadsheetFile(file)) {
      return file.mimeType.includes('csv') ? 'CSV Spreadsheet' : 'Spreadsheet';
    }

    switch (file.kind) {
      case 'pdf':
        return 'PDF Document';
      case 'video':
        return 'Video Asset';
      case 'image':
        return 'Image Asset';
      case 'app':
        return 'App Output';
      case 'doc':
        return 'Document';
      default:
        return 'File';
    }
  }

  protected formatStatusLabel(status: string): string {
    return status
      .split(/[_\s-]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  protected formatOriginLabel(origin: string): string {
    switch (origin) {
      case 'agent_chat_input':
        return 'Added from chat';
      case 'agent_chat_output':
        return 'Generated by Agent X';
      case 'files_upload':
      default:
        return 'Uploaded to files';
    }
  }

  protected fileContextDescription(file: AgentXLibraryFile): string {
    if (this.isSpreadsheetFile(file)) {
      return 'Spreadsheet asset available for external open, download, and downstream workflow use.';
    }

    if (this.isPdfFile(file)) {
      return 'Document preview is live, with metadata and source trace available for team review.';
    }

    if (this.isVideoFile(file)) {
      return 'Media asset connected to the library with review-ready delivery metadata.';
    }

    if (this.isImageFile(file)) {
      return 'Image asset available for quick inspection, sharing, and downstream AI workflows.';
    }

    if (this.isTextDocument(file)) {
      return 'Text-based document with extracted content available directly inside the workspace.';
    }

    return 'Library asset connected with file metadata, provenance, and action controls.';
  }

  protected fileContextOverview(file: AgentXLibraryFile): string {
    if (this.isSpreadsheetFile(file)) {
      return 'Open externally to review';
    }

    if (this.isPdfFile(file)) {
      return 'Inline document preview ready';
    }

    if (this.isVideoFile(file)) {
      return file.readyToStream === false ? 'Video still processing' : 'Video review ready';
    }

    if (this.isImageFile(file)) {
      return 'Image preview ready';
    }

    if (this.isTextDocument(file)) {
      return 'Text content extracted';
    }

    return 'Asset connected';
  }

  protected fileContextSupportingLine(file: AgentXLibraryFile): string {
    const pieces = [
      this.formatFileSize(file.sizeBytes),
      this.formatOriginLabel(file.origin),
      file.sport ? `${file.sport} context` : null,
    ].filter((value): value is string => !!value);

    return pieces.join(' • ');
  }

  protected formatPortableTimestamp(timestamp: AgentXLibraryFile['updatedAt']): string {
    let date: Date | null = null;

    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
      const parsed = Date.parse(timestamp);
      if (!Number.isNaN(parsed)) {
        date = new Date(parsed);
      }
    } else if (
      timestamp &&
      typeof timestamp === 'object' &&
      'toDate' in timestamp &&
      typeof (timestamp as { toDate?: unknown }).toDate === 'function'
    ) {
      date = (timestamp as { toDate: () => Date }).toDate();
    }

    if (!date) {
      return 'Unavailable';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  protected formatFileSize(sizeBytes: number): string {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = sizeBytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const formatted = value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
    return `${formatted} ${units[unitIndex]}`;
  }

  protected folderDisplayName(file: Pick<AgentXLibraryFile, 'folderId'>): string {
    if (!file.folderId) {
      return 'Main library';
    }

    const folder = this.filesService.folders().find((entry) => entry.id === file.folderId) ?? null;
    return folder?.name ?? 'Library folder';
  }

  protected storageDisplayValue(storagePath?: string): string {
    return storagePath?.trim() ? this.truncateMiddle(storagePath, 58) : 'No storage path exposed';
  }

  protected emptyStateValue(value?: string | null): string {
    return value?.trim() ? value : 'Not linked';
  }

  protected hasDeliveryMetadata(
    file: Pick<
      AgentXLibraryFile,
      | 'thumbnailUrl'
      | 'platform'
      | 'profileUrl'
      | 'faviconUrl'
      | 'cloudflareVideoId'
      | 'cloudflareStatus'
      | 'readyToStream'
    >
  ): boolean {
    return Boolean(
      file.thumbnailUrl ||
      file.platform ||
      file.profileUrl ||
      file.faviconUrl ||
      file.cloudflareVideoId ||
      file.cloudflareStatus ||
      typeof file.readyToStream === 'boolean'
    );
  }

  protected formatTagList(tags?: readonly string[] | null): string {
    return tags?.length ? tags.join(', ') : 'None';
  }

  protected onSummaryEdit(event: Event, fileId: string): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.summaryDrafts.update((drafts) => ({ ...drafts, [fileId]: value }));
  }

  protected editingSummary(file: Pick<AgentXLibraryFile, 'id' | 'summary'>): string {
    const draft = this.summaryDrafts()[file.id];
    if (draft !== undefined) {
      return draft;
    }
    return file.summary ?? '';
  }

  protected buildFileSummaryDragContext(file: AgentXLibraryFile): AgentXSelectedContext | null {
    const summary = this.editingSummary(file).trim();
    return this.buildViewerFieldDragContext(file, 'summary', summary);
  }

  protected hasPendingMetadataChanges(file: Pick<AgentXLibraryFile, 'id' | 'summary'>): boolean {
    const nextSummary = this.editingSummary(file);
    return nextSummary !== (file.summary ?? '');
  }

  protected async saveMetadata(file: Pick<AgentXLibraryFile, 'id' | 'summary'>): Promise<void> {
    if (!this.teamId) return;

    const nextSummary = this.editingSummary(file);

    this.isSavingMetadata.set(true);
    try {
      await this.filesService.updateFileMetadata(file.id, this.teamId, {
        summary: nextSummary,
        classificationPrimary: '',
      });
      this.toast.success('File details updated');
      this.summaryDrafts.update((drafts) => {
        const next = { ...drafts };
        delete next[file.id];
        return next;
      });
    } catch {
      this.toast.error('Failed to update file details');
    } finally {
      this.isSavingMetadata.set(false);
    }
  }

  protected onTextContentEdit(event: Event, fileId: string): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.textContentDrafts.update((drafts) => ({ ...drafts, [fileId]: value }));
  }

  protected editingTextContent(file: Pick<AgentXLibraryFile, 'id' | 'textContent'>): string {
    const draft = this.textContentDrafts()[file.id];
    if (draft !== undefined) {
      return draft;
    }
    return file.textContent ?? '';
  }

  protected buildFileNotesDragContext(file: AgentXLibraryFile): AgentXSelectedContext | null {
    const notes = this.editingTextContent(file).trim();
    return this.buildViewerFieldDragContext(file, 'notes', notes);
  }

  protected async saveTextContent(fileId: string): Promise<void> {
    if (!this.teamId) return;
    const draft = this.textContentDrafts()[fileId];
    if (draft === undefined) return;

    this.isSavingTextContent.set(true);
    try {
      await this.filesService.updateFileTextContent(fileId, this.teamId, draft);
      this.toast.success('Document content updated');
      this.textContentDrafts.update((drafts) => {
        const next = { ...drafts };
        delete next[fileId];
        return next;
      });
    } catch {
      this.toast.error('Failed to update document content');
    } finally {
      this.isSavingTextContent.set(false);
    }
  }

  protected shouldShowGenerateNotes(
    file: Pick<AgentXLibraryFile, 'id' | 'summary' | 'textContent'>
  ): boolean {
    const summary = this.editingSummary(file as Pick<AgentXLibraryFile, 'id' | 'summary'>).trim();
    const textContent = this.editingTextContent(
      file as Pick<AgentXLibraryFile, 'id' | 'textContent'>
    ).trim();

    return summary.length === 0 && textContent.length === 0;
  }

  protected isGeneratingNotes(fileId: string): boolean {
    return this.generatingNotesFileIds().has(fileId);
  }

  protected async generateNotes(file: AgentXLibraryFile): Promise<void> {
    if (this.isGeneratingNotes(file.id) || !this.hasFileWriteAccess(file)) {
      return;
    }

    this.generatingNotesFileIds.update((current) => new Set(current).add(file.id));

    try {
      const job = await this.agentXJobService.enqueue(
        this.buildGenerateNotesIntent(file),
        {
          source: 'team_files',
          trigger: 'generate_artifact',
          requestedAt: new Date().toISOString(),
          fileId: file.id,
          fileName: file.name,
          teamIdOverride: this.teamId,
        },
        {
          selectedContexts: [this.buildFileDragContext(file)],
        }
      );

      if (isEnqueueFailure(job)) {
        this.toast.error(
          job.reason === 'billing'
            ? job.message
            : 'Unable to start note generation right now. Please try again.'
        );
        return;
      }

      this.toast.success('Notes generation started. Agent X is drafting notes for this file now.');
    } catch {
      this.toast.error('Unable to start note generation right now. Please try again.');
    } finally {
      this.generatingNotesFileIds.update((current) => {
        const next = new Set(current);
        next.delete(file.id);
        return next;
      });
    }
  }

  protected snippetForText(text?: string | null): string {
    if (!text?.trim()) {
      return 'No extracted text available.';
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 320 ? `${normalized.slice(0, 317)}...` : normalized;
  }

  protected viewerFallbackMessage(file: AgentXLibraryFile): string {
    if (this.isSpreadsheetFile(file)) {
      return 'Inline preview is not available for spreadsheets right now. Download it or open it in Excel or Google Docs to review.';
    }

    return 'Preview is not available for this file type yet. The universal viewer shell is in place, and richer bottom-panel content can be added here next.';
  }

  protected truncateMiddle(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    const visibleChars = Math.max(8, Math.floor((maxLength - 3) / 2));
    const start = value.slice(0, visibleChars);
    const end = value.slice(-visibleChars);
    return `${start}...${end}`;
  }

  protected hasFileWriteAccess(file: AgentXLibraryFile): boolean {
    const currentUserId = this.effectiveCurrentUserId();
    if (!currentUserId) {
      return false;
    }

    if (file.ownerUserId === currentUserId) {
      return true;
    }

    const writableAccessKeys = new Set(file.writeAccessKeys ?? []);
    if (writableAccessKeys.has(`user:${currentUserId}`)) {
      return true;
    }

    if (file.teamId && writableAccessKeys.has(`team:${file.teamId}`)) {
      return true;
    }

    return !!(file.organizationId && writableAccessKeys.has(`organization:${file.organizationId}`));
  }

  protected hasFolderWriteAccess(folder: AgentXLibraryFolderTreeNode): boolean {
    return this.hasFolderSourceWriteAccess(this.resolveSourceFolder(folder));
  }

  private hasFolderSourceWriteAccess(sourceFolder: TeamFileFolderDoc | null): boolean {
    if (!sourceFolder) {
      return false;
    }

    const currentUserId = this.effectiveCurrentUserId();
    if (!currentUserId) {
      return false;
    }

    if (sourceFolder.createdByUserId === currentUserId) {
      return true;
    }

    const writableAccessKeys = new Set(sourceFolder.writeAccessKeys ?? []);
    if (writableAccessKeys.has(`user:${currentUserId}`)) {
      return true;
    }

    if (sourceFolder.teamId && writableAccessKeys.has(`team:${sourceFolder.teamId}`)) {
      return true;
    }

    return !!(
      sourceFolder.organizationId &&
      writableAccessKeys.has(`organization:${sourceFolder.organizationId}`)
    );
  }

  private notifyReadOnlyMoveBlocked(): void {
    this.toast.error(
      'This item is shared as read-only. You can view it, but you cannot move or edit it.'
    );
  }

  private buildGenerateNotesIntent(file: AgentXLibraryFile): string {
    const roleAudience = this.isAthleteRole()
      ? 'that the athlete can use immediately to review faster, lock in key details, and focus the next training session'
      : 'that coaches and staff can use immediately to review faster, align on key details, and drive the next coaching actions';

    return [
      `Generate professional notes for the selected Team Files item titled "${file.name}".`,
      `Use the selected file context and any extracted content to produce a concise summary, plain-language notes, and clear key takeaways ${roleAudience}.`,
      'Write the saved summary and notes as regular plain text. Do not use markdown headings, bullet markers, numbered lists, bold formatting, or code fences.',
      'This is a same-record Team Files note-enrichment workflow for the selected file, not a request to create a separate document.',
      'Persist the notes directly back into the same selected Team Files record.',
      'Update the existing file instead of creating a separate document, and do not ask the user to promote or manually save it.',
      'If the selected Team Files item is an uploaded or pointer-backed artifact, keep the source file in place and write the generated notes back onto that same record via artifact metadata fields such as artifactSummary, artifactNotes, artifactTags, artifactStatus, and artifactGeneratedAt.',
    ].join(' ');
  }

  private resolvePdfPreviewUrl(url: string): string {
    if (!/\/media-proxy\/export\//i.test(url)) {
      return url;
    }

    try {
      const parsed = new URL(url, 'http://localhost');
      parsed.searchParams.set('disposition', 'inline');

      if (/^[a-z]+:\/\//i.test(url)) {
        return parsed.toString();
      }

      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}disposition=inline`;
    }
  }

  protected isVideoFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'video' || file.mimeType.startsWith('video/');
  }

  protected onFileOpenAction(file: AgentXLibraryFile, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.onFileMenuBackdropTap();
    void this.openFile(file);
  }

  protected onFileDownloadAction(file: AgentXLibraryFile, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.onFileMenuBackdropTap();
    void this.downloadFile(file);
  }

  private async resolveFileUrlForAction(
    file: AgentXLibraryFile,
    action: 'open' | 'download'
  ): Promise<string | null> {
    const teamId = file.teamId?.trim() || this.teamId?.trim() || null;

    try {
      return (
        await this.filesService.refreshFile(file.id, teamId, {
          disposition: action === 'download' ? 'attachment' : 'inline',
        })
      ).url;
    } catch (error) {
      this.toast.error(
        error instanceof Error
          ? error.message
          : action === 'download'
            ? 'Failed to download file'
            : 'Failed to open file'
      );
      return null;
    }
  }

  private buildOpenTargetUrl(file: AgentXLibraryFile, url: string): string {
    if (!this.isSpreadsheetFile(file) || !/^https?:\/\//i.test(url)) {
      return url;
    }

    // Open spreadsheets directly so users can reliably download/open in Excel or Sheets.
    return url;
  }

  private async transitionToFilmReview(fileId: string, reviewId: string): Promise<void> {
    this.filesService.selectFile(fileId);
    this.genericOpenTabIds.update((tabs) => tabs.filter((id) => id !== fileId));
    this.openPanelTabs.update((tabs) =>
      tabs.filter((tab) => !(tab.kind === 'file' && tab.id === fileId))
    );
    this.viewerMode.set('video');
    this.isOpeningFilmReview.set(true);
    this.addPanelTab({ kind: 'review', id: reviewId });

    const panel = this.filmReviewPanel();
    if (panel) {
      try {
        this.pendingFilmReviewId.set(null);
        this.selectedFilmReviewId.set(reviewId);
        this.filmReviewService.select(null);
        await panel.refreshData();
        await panel.onSelectReview(reviewId);
      } finally {
        this.isOpeningFilmReview.set(false);
      }
      return;
    }

    this.selectedFilmReviewId.set(reviewId);
    this.filmReviewService.select(reviewId);
    this.pendingFilmReviewId.set(reviewId);
  }

  private async resolveExistingFilmReviewIdForFile(
    file: AgentXLibraryFile
  ): Promise<string | null> {
    const teamId = file.teamId?.trim() || this.teamId?.trim() || null;

    const linkedReviewId = await this.filesService
      .getLinkedFilmReviewId(file.id, teamId)
      .catch(() => null);
    if (linkedReviewId) {
      return linkedReviewId;
    }

    let matchedReviewId = this.findMatchingFilmReviewId(file);
    if (matchedReviewId) {
      return matchedReviewId;
    }

    await this.filmReviewService.load(teamId, this.sport || undefined, 200);
    matchedReviewId = this.findMatchingFilmReviewId(file);
    return matchedReviewId;
  }

  private findMatchingFilmReviewId(file: AgentXLibraryFile): string | null {
    const normalizedFileUrl = file.url.trim();
    const normalizedStoragePath = file.storagePath?.trim() || null;
    const normalizedCloudflareId = file.cloudflareVideoId?.trim() || null;

    const match = this.filmReviewService.reviews().find((review) => {
      if (review.fileId?.trim() === file.id) {
        return true;
      }

      if (normalizedCloudflareId && review.cloudflareVideoId?.trim() === normalizedCloudflareId) {
        return true;
      }

      if (normalizedStoragePath && review.storagePath?.trim() === normalizedStoragePath) {
        return true;
      }

      return review.videoUrl.trim() === normalizedFileUrl;
    });

    return match?.id ?? null;
  }

  private buildPanelTabId(kind: FilesPanelOpenTabRef['kind'], id: string): string {
    return `${kind === 'file' ? FILES_PANEL_FILE_TAB_PREFIX : FILES_PANEL_REVIEW_TAB_PREFIX}${id}`;
  }

  private parsePanelTabId(tabId: string): FilesPanelOpenTabRef | null {
    if (tabId.startsWith(FILES_PANEL_FILE_TAB_PREFIX)) {
      return { kind: 'file', id: tabId.slice(FILES_PANEL_FILE_TAB_PREFIX.length) };
    }

    if (tabId.startsWith(FILES_PANEL_REVIEW_TAB_PREFIX)) {
      return { kind: 'review', id: tabId.slice(FILES_PANEL_REVIEW_TAB_PREFIX.length) };
    }

    return null;
  }

  private addPanelTab(tabRef: FilesPanelOpenTabRef): void {
    const currentTabs = this.openPanelTabs();
    if (currentTabs.some((entry) => entry.kind === tabRef.kind && entry.id === tabRef.id)) {
      return;
    }

    this.openPanelTabs.set([...currentTabs, tabRef]);
  }

  private selectGenericFileTab(fileId: string): void {
    const file = this.filesService.files().find((entry) => entry.id === fileId) ?? null;
    if (!file) {
      return;
    }

    this.filesService.selectFile(file.id);
    this.selectedFilmReviewId.set(null);
    this.isOpeningFilmReview.set(false);
    this.filmReviewService.select(null);
    this.pendingFilmReviewId.set(null);
    this.resetGenericVideoPlayerState();
    this.viewerMode.set('generic');
  }

  private async selectReviewTab(reviewId: string): Promise<void> {
    const backingFileId =
      this.resolveReviewBackingFileId(reviewId) ?? this.filesService.selectedId();
    if (!backingFileId) {
      return;
    }

    await this.transitionToFilmReview(backingFileId, reviewId);
  }

  private resolveReviewBackingFileId(reviewId: string): string | null {
    const review = this.filmReviewService.reviews().find((entry) => entry.id === reviewId) ?? null;
    if (!review) {
      return null;
    }

    const mappedTab = this.mapFilmReviewToFileTab(review);
    return mappedTab.id;
  }

  private closePanelTab(tabRef: FilesPanelOpenTabRef): void {
    const activePanelTabId = this.selectedTabId();
    const currentTabs = this.openPanelTabs();
    const targetIndex = currentTabs.findIndex(
      (entry) => entry.kind === tabRef.kind && entry.id === tabRef.id
    );
    if (targetIndex < 0) {
      return;
    }

    const nextTabs = currentTabs.filter((_, index) => index !== targetIndex);
    this.openPanelTabs.set(nextTabs);

    if (tabRef.kind === 'file') {
      if (this.filesService.selectedId() === tabRef.id) {
        this.filesService.selectFile(null);
      }
    } else {
      if (this.selectedFilmReviewId() === tabRef.id) {
        this.selectedFilmReviewId.set(null);
        this.filmReviewService.select(null);
      }
    }

    if (activePanelTabId !== this.buildPanelTabId(tabRef.kind, tabRef.id)) {
      return;
    }

    const fallbackTab = nextTabs[Math.max(0, targetIndex - 1)] ?? nextTabs[0] ?? null;
    if (!fallbackTab) {
      this.backToLibrary();
      return;
    }

    if (fallbackTab.kind === 'review') {
      void this.selectReviewTab(fallbackTab.id);
      return;
    }

    this.selectGenericFileTab(fallbackTab.id);
  }

  private mapFilmReviewToFileTab(review: TeamFilmReviewDoc): AgentXLibraryFile {
    const matchingFile = this.filesService.files().find((file) => {
      if (review.fileId?.trim() === file.id) {
        return true;
      }

      if (
        review.cloudflareVideoId?.trim() &&
        file.cloudflareVideoId?.trim() === review.cloudflareVideoId.trim()
      ) {
        return true;
      }

      if (review.storagePath?.trim() && file.storagePath?.trim() === review.storagePath.trim()) {
        return true;
      }

      return file.url.trim() === review.videoUrl.trim();
    });

    if (matchingFile) {
      return matchingFile;
    }

    const now = review.updatedAt;
    return {
      id: review.id,
      teamId: review.teamId,
      ownerUserId: review.createdBy,
      name: review.title,
      normalizedName: review.title.trim().toLowerCase(),
      mimeType: 'video/mp4',
      kind: 'video',
      status: 'ready',
      origin: 'files_upload',
      sizeBytes: 0,
      url: review.videoUrl,
      storagePath: review.storagePath,
      cloudflareVideoId: review.cloudflareVideoId,
      cloudflareStatus: review.cloudflareStatus,
      readyToStream: review.readyToStream,
      thumbnailUrl: review.thumbnailUrl,
      sport: review.sport,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      lastSeenAt: now,
    };
  }

  private mapFilmReviewToHeaderTab(review: TeamFilmReviewDoc): AgentXLibraryFile {
    const mapped = this.mapFilmReviewToFileTab(review);
    return {
      ...mapped,
      id: this.buildPanelTabId('review', review.id),
      name: review.title,
      normalizedName: review.title.trim().toLowerCase(),
    };
  }

  private resetFolderUiState(): void {
    this.shareCandidatesRequestId += 1;
    this.openFolderMenuId.set(null);
    this.openFolderMenuUpward.set(false);
    this.editingFolderId.set(null);
    this.sharingFolderId.set(null);
    this.deleteFolderConfirmId.set(null);
    this.folderRenameDraft.set('');
    this.folderSharePrincipalType.set('user');
    this.folderSharePermission.set('read');
    this.folderSharePrincipalId.set('');
    this.shareCandidateQuery.set('');
    this.shareCandidates.set([]);
    this.shareCandidatesLoading.set(false);
    this.openFileMenuId.set(null);
    this.openFileMenuUpward.set(false);
    this.sharingFileId.set(null);
    this.editingFileId.set(null);
    this.deleteFileConfirmId.set(null);
    this.fileRenameDraft.set('');
    this.fileSharePrincipalType.set('user');
    this.fileSharePermission.set('read');
    this.fileSharePrincipalId.set('');
  }

  private async loadShareCandidatesForScope(
    teamId: string | null | undefined,
    organizationId: string | null | undefined
  ): Promise<void> {
    const requestId = ++this.shareCandidatesRequestId;
    this.shareCandidatesLoading.set(true);
    this.shareCandidates.set([]);

    try {
      const candidates = await this.filesService.loadShareCandidates({
        teamId,
        organizationId,
      });
      if (requestId !== this.shareCandidatesRequestId) {
        return;
      }

      this.shareCandidates.set(candidates);
    } catch {
      if (requestId !== this.shareCandidatesRequestId) {
        return;
      }

      this.shareCandidates.set([]);
    } finally {
      if (requestId === this.shareCandidatesRequestId) {
        this.shareCandidatesLoading.set(false);
      }
    }
  }

  private shouldOpenContextMenuUpward(trigger: HTMLElement | null): boolean {
    if (!trigger || typeof window === 'undefined') {
      return false;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = Math.max(window.innerHeight || 0, 0);
    const viewportPadding = 12;
    const estimatedMenuHeight = 260;
    const availableBelow = viewportHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;

    return availableBelow < estimatedMenuHeight && availableAbove > availableBelow;
  }

  private resolveFileMutationTeamId(file: AgentXLibraryFile): string | null {
    return file.teamId?.trim() || this.teamId?.trim() || null;
  }

  private userPrincipalIds(grants: readonly FileShareGrant[]): readonly string[] {
    return grants
      .filter((grant) => grant.principalType === 'user')
      .map((grant) => grant.principalId);
  }

  private toggleShareSelection(
    ids: readonly string[],
    principalId: string,
    checked: boolean
  ): readonly string[] {
    const next = new Set(ids);
    if (checked) {
      next.add(principalId);
    } else {
      next.delete(principalId);
    }

    return [...next];
  }

  private hasShareSelectionChanges(
    initialIds: readonly string[],
    selectedIds: readonly string[]
  ): boolean {
    if (initialIds.length !== selectedIds.length) {
      return true;
    }

    const selected = new Set(selectedIds);
    return initialIds.some((id) => !selected.has(id));
  }

  private resolveFolderMutationTeamId(folder: AgentXLibraryFolderTreeNode): string | null {
    return this.resolveSourceFolder(folder)?.teamId?.trim() || this.teamId?.trim() || null;
  }

  private resolveFolderSharePrincipalId(folder: AgentXLibraryFolderTreeNode): string {
    const sourceFolder = this.resolveSourceFolder(folder);
    const principalType = this.folderSharePrincipalType();
    if (principalType === 'team') {
      return sourceFolder?.teamId?.trim() || '';
    }

    if (principalType === 'organization') {
      return sourceFolder?.organizationId?.trim() || '';
    }

    return this.folderSharePrincipalId().trim();
  }

  private resolveFileSharePrincipalId(file: AgentXLibraryFile): string {
    const principalType = this.fileSharePrincipalType();
    if (principalType === 'team') {
      return file.teamId?.trim() || '';
    }

    if (principalType === 'organization') {
      return file.organizationId?.trim() || '';
    }

    return this.fileSharePrincipalId().trim();
  }

  private parseFileShareGrant(accessKey: string, hasWriteAccess: boolean): FileShareGrant | null {
    if (accessKey.startsWith('user:')) {
      const principalId = accessKey.slice('user:'.length).trim();
      const candidate = this.shareCandidates().find((candidate) => candidate.id === principalId);
      return principalId
        ? {
            accessKey,
            principalType: 'user',
            principalId,
            label: candidate?.displayName ?? 'Shared user',
            permission: hasWriteAccess ? 'write' : 'read',
          }
        : null;
    }

    if (accessKey.startsWith('team:')) {
      const principalId = accessKey.slice('team:'.length).trim();
      return principalId
        ? {
            accessKey,
            principalType: 'team',
            principalId,
            label: `Everyone on the team`,
            permission: hasWriteAccess ? 'write' : 'read',
          }
        : null;
    }

    if (accessKey.startsWith('org:')) {
      const principalId = accessKey.slice('org:'.length).trim();
      return principalId
        ? {
            accessKey,
            principalType: 'organization',
            principalId,
            label: `Everyone in the organization`,
            permission: hasWriteAccess ? 'write' : 'read',
          }
        : null;
    }

    return null;
  }

  private buildShareGrantedMessage(
    principalType: FileSharePrincipalType,
    permission: AgentXSharePermission,
    displayName?: string | null
  ): string {
    const accessSuffix = permission === 'write' ? ' with write access' : '';
    if (principalType === 'team') {
      return `Shared with everyone on the team${accessSuffix}`;
    }

    if (principalType === 'organization') {
      return `Shared with everyone in the organization${accessSuffix}`;
    }

    return `Shared with ${displayName?.trim() || 'selected user'}${accessSuffix}`;
  }

  private buildShareRevokedMessage(label?: string | null): string {
    return `Removed ${label?.trim() || 'shared'} access`;
  }

  private resolveSourceFolder(folder: AgentXLibraryFolderTreeNode): TeamFileFolderDoc | null {
    const source = folder.source;
    return source && typeof source === 'object' ? (source as TeamFileFolderDoc) : null;
  }

  private pruneSelectedSelections(): void {
    const validIds = new Set(this.filesService.files().map((file) => file.id));
    this.selectedFileIds.update((current) => {
      if (current.size === 0) {
        return current;
      }

      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });

    this.pruneSelectedFolderSelections();
  }

  private pruneSelectedFolderSelections(): void {
    const selectedFolderIds = this.selectedFolderIds();
    if (selectedFolderIds.size === 0) {
      return;
    }

    const selectedFileIds = this.selectedFileIds();
    const nextFolderIds = new Set<string>();
    for (const folderId of selectedFolderIds) {
      const folder = this.findFolderNodeById(folderId, this.allFolderNodes());
      if (!folder) {
        continue;
      }

      const folderFileIds = this.collectFolderFileIds(folder);
      if (folderFileIds.length === 0) {
        nextFolderIds.add(folderId);
        continue;
      }

      const hasAllFilesSelected = folderFileIds.every((fileId) => selectedFileIds.has(fileId));
      if (hasAllFilesSelected) {
        nextFolderIds.add(folderId);
      }
    }

    if (!this.areSetsEqual(selectedFolderIds, nextFolderIds)) {
      this.selectedFolderIds.set(nextFolderIds);
    }
  }

  private resolveDraggedFiles(anchorFileId: string): readonly AgentXLibraryFile[] {
    const selectedIds = this.selectedFileIds();
    if (selectedIds.has(anchorFileId)) {
      const selectedFiles = this.filesService.files().filter((file) => selectedIds.has(file.id));
      if (selectedFiles.length > 0) {
        return selectedFiles;
      }
    }

    return this.filesService.files().filter((file) => file.id === anchorFileId);
  }

  private buildDragContextsForFiles(
    files: readonly AgentXLibraryFile[]
  ): AgentXSelectedContext | readonly AgentXSelectedContext[] | null {
    if (files.length === 0) {
      return null;
    }

    const contexts = files.map((file) => this.buildFileDragContext(file));
    return contexts.length === 1 ? contexts[0] : contexts;
  }

  private buildViewerFieldDragContext(
    file: AgentXLibraryFile,
    field: 'summary' | 'notes',
    text: string
  ): AgentXSelectedContext | null {
    if (!text) {
      return null;
    }

    const base = this.buildFileDragContext(file);
    const fieldLabel = field === 'summary' ? 'Summary' : 'Notes';

    return {
      ...base,
      id: `${base.id}:${field}`,
      title: `${fieldLabel}: ${file.name}`,
      summary: text.slice(0, 600),
      metadata: {
        ...(base.metadata ?? {}),
        itemType: 'team_file',
        viewerField: field,
        viewerFieldLength: text.length,
      },
    };
  }

  private buildSelectedFilesArchiveFileName(files: readonly AgentXLibraryFile[]): string {
    if (files.length === 1) {
      return `${this.sanitizeArchiveSegment(files[0]?.name ?? 'selected-file')}.zip`;
    }

    return `nxt1-files-selection-${files.length}.zip`;
  }

  private buildSelectedFileArchivePath(file: AgentXLibraryFile): string {
    const folderNames: string[] = [];
    let currentFolderId = file.folderId?.trim() || null;
    const foldersById = new Map(this.filesService.folders().map((folder) => [folder.id, folder]));

    while (currentFolderId) {
      const folder = foldersById.get(currentFolderId) ?? null;
      if (!folder) {
        break;
      }

      folderNames.unshift(this.sanitizeArchiveSegment(folder.name));
      currentFolderId = folder.parentId?.trim() || null;
    }

    return [...folderNames, this.sanitizeArchiveSegment(file.name)].join('/');
  }

  private sanitizeArchiveSegment(value: string): string {
    const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-');
    return normalized.length > 0 ? normalized : 'untitled';
  }

  private buildFilesAskAgentPrompt(
    promptId: FilesAskAgentPromptId,
    selectedItemCount: number
  ): string {
    const subject = this.buildFilesAskAgentPromptSubject(selectedItemCount);
    const athleteMode = this.isAthleteRole();

    switch (promptId) {
      case 'create-cutup-folders':
        return `Create cutup folders from ${subject}. Recommend the best folder structure, labels, and how the selected material should be organized for fast film work.`;
      case 'create-highlight':
        return athleteMode
          ? `Create a highlight from ${subject}. Build a recruiting-ready sequence that shows consistency, impact plays, and clean technique.`
          : `Create a highlight from ${subject}. Identify the strongest moments, suggest the best sequence, and explain what should make the final cut.`;
      case 'pull-best-plays':
        return athleteMode
          ? `Pull the best plays from ${subject}. Rank your top reps to keep reinforcing and explain what made each rep successful.`
          : `Pull the best plays from ${subject}. Rank the top moments to review, share, or save and explain why each one stands out.`;
      case 'build-practice-plan':
        return athleteMode
          ? `Build a practice plan from ${subject}. Create a timed athlete development plan with drill focus, rep targets, and correction priorities.`
          : `Build a practice plan from ${subject}. Create a timed session plan with goals, key periods, coaching points, and what to prioritize.`;
      case 'callsheet':
        return athleteMode
          ? `Build a callsheet from ${subject}. Organize calls by situation with quick execution cues and confidence reminders for each call.`
          : `Build a callsheet from ${subject}. Organize core calls by down-and-distance, field zone, and situation with concise coaching intent for each.`;
      case 'compare-film':
        return athleteMode
          ? `Compare film from ${subject}. Highlight what improved, what repeated, and what you should focus on next week.`
          : `Compare film from ${subject}. Highlight meaningful differences, recurring trends, and what should change in coaching emphasis or game prep.`;
      case 'suggest-plays':
        return athleteMode
          ? `Suggest plays from ${subject}. Recommend calls and concepts that match your strengths and explain why they fit.`
          : `Suggest plays from ${subject}. Recommend high-value calls and packages based on what the selected files show, with short rationale for each.`;
      case 'game-day-playbook':
        return athleteMode
          ? `Build a game day playbook from ${subject}. Organize quick-reference sections so you can execute fast in each situation.`
          : `Build a game day playbook from ${subject}. Structure ready-to-call sections, situational menus, and quick-reference notes for sideline use.`;
      case 'full-playbook':
        return athleteMode
          ? `Build a full playbook from ${subject}. Organize your concepts, tags, and installs into one player-friendly structure.`
          : `Build a full playbook from ${subject}. Organize concept families, install order, tags, and situational call menus into one complete structure.`;
      case 'scout-team-playbook':
        return `Build a scout team playbook from ${subject}. Replicate opponent structures, looks, and core calls to drive efficient scout prep.`;
      case 'position-room-notes':
        return athleteMode
          ? `Create position notes from ${subject}. Capture assignment rules, technique reminders, and correction cues you should carry into practice.`
          : `Create position room notes from ${subject}. Capture assignment rules, technique reminders, and coaching points tailored by position group.`;
      case 'install-plan':
        return athleteMode
          ? `Create an install plan from ${subject}. Sequence installs by day with clear objectives, rep goals, and checkpoints.`
          : `Create an install plan from ${subject}. Sequence installs by day/period, define objectives, and identify checkpoints and review loops.`;
      case 'game-plan':
        return athleteMode
          ? `Create a game plan from ${subject}. Build player priorities, situational answers, and adjustment cues for this week.`
          : `Create a game plan from ${subject}. Build priorities, situational answers, and adjustment triggers tied to the selected material.`;
      case 'opening-script':
        return athleteMode
          ? `Create an opening script from ${subject}. Script your first calls/reps with intent, tempo, and execution cues.`
          : `Create an opening script from ${subject}. Script the opening series with call order, intent, and tempo variation.`;
      case 'tempo-packages':
        return `Design tempo packages from ${subject}. Build pacing options by situation, include entry triggers, and note communication cues.`;
      case 'trick-play-ideas':
        return `Generate trick play ideas from ${subject}. Propose creative calls, setup steps, and risk controls aligned to the selected material.`;
      case 'self-scout-cutup':
        return athleteMode
          ? `Build a self scout cutup from ${subject}. Identify your tendency clusters, recurring mistakes, and top correction priorities.`
          : `Build a self scout cutup from ${subject}. Identify tendency clusters, call/frequency patterns, and the biggest self-scout corrections.`;
      case 'scouting-report':
        return athleteMode
          ? `Create a performance report from ${subject}. Summarize strengths, weak spots, and actionable recommendations for your development.`
          : `Create a scouting report from ${subject}. Summarize structure, tendencies, strengths, vulnerabilities, and actionable recommendations.`;
      case 'scout-opponent-tendencies':
        return athleteMode
          ? `Scout opponent tendencies from ${subject}. Break down patterns and where you can win reps with leverage and technique.`
          : `Scout opponent tendencies from ${subject}. Break down patterns, habits, strengths, weaknesses, and the best ways to attack or counter them.`;
      case 'summarize-selection':
        return `Summarize ${subject}. Highlight the important contents, what each item appears to be for, and the main takeaways.`;
      case 'extract-key-details':
        return `Extract the key details from ${subject}. Pull out the most important names, dates, metrics, and decision-relevant facts.`;
      case 'build-action-plan':
        return athleteMode
          ? `Build an action plan from ${subject}. Turn selected materials into clear weekly priorities, drill targets, and next steps.`
          : `Build an action plan from ${subject}. Turn the selected materials into clear recommendations, priorities, and next steps.`;
    }
  }

  private buildFilesAskAgentPromptSubject(selectedItemCount: number): string {
    if (selectedItemCount <= 0) {
      return 'these selected items from my files library';
    }

    if (selectedItemCount === 1) {
      return 'this selected item from my files library';
    }

    return `these ${selectedItemCount} selected items from my files library`;
  }

  private resolveFullFolderNode(folder: AgentXLibraryFolderTreeNode): TeamFileTreeNode {
    return (
      this.findFolderNodeById(folder.id, this.allFolderNodes()) ?? (folder as TeamFileTreeNode)
    );
  }

  private findFolderNodeById(
    folderId: string,
    nodes: readonly TeamFileTreeNode[]
  ): TeamFileTreeNode | null {
    const visit = (candidates: readonly TeamFileTreeNode[]): TeamFileTreeNode | null => {
      for (const node of candidates) {
        if (node.id === folderId) {
          return node;
        }

        const match = visit(node.children);
        if (match) {
          return match;
        }
      }

      return null;
    };

    return visit(nodes);
  }

  private collectFolderFiles(folder: TeamFileTreeNode): readonly AgentXLibraryFile[] {
    const files: AgentXLibraryFile[] = [];

    const visit = (node: TeamFileTreeNode): void => {
      files.push(...node.items);
      for (const child of node.children) {
        visit(child);
      }
    };

    visit(folder);
    return files;
  }

  private collectFolderFileIds(folder: TeamFileTreeNode): readonly string[] {
    return this.collectFolderFiles(folder).map((file) => file.id);
  }

  private collectFolderParentChain(
    targetFolderId: string,
    nodes: readonly TeamFileTreeNode[]
  ): readonly string[] {
    const chain: string[] = [];

    const visit = (
      candidates: readonly TeamFileTreeNode[],
      ancestors: readonly string[]
    ): boolean => {
      for (const node of candidates) {
        if (node.id === targetFolderId) {
          chain.push(...ancestors);
          return true;
        }

        if (visit(node.children, [...ancestors, node.id])) {
          return true;
        }
      }

      return false;
    };

    visit(nodes, []);
    return chain;
  }

  private isValidFolderMoveTarget(draggedFolderId: string, targetFolderId: string | null): boolean {
    if (!draggedFolderId.trim()) {
      return false;
    }

    if (targetFolderId === null) {
      return true;
    }

    if (targetFolderId === TEAM_FILES_UNASSIGNED_FOLDER_ID || targetFolderId === draggedFolderId) {
      return false;
    }

    const draggedFolderNode = this.findFolderNodeById(draggedFolderId, this.allFolderNodes());
    if (!draggedFolderNode) {
      return false;
    }

    return !this.folderSubtreeContainsId(draggedFolderNode, targetFolderId);
  }

  private applyDragAutoScroll(event: DragEvent): void {
    const scrollContainer = this.findScrollableAncestor(event.currentTarget ?? event.target);
    if (!scrollContainer) {
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }

    const pointerY = event.clientY;
    if (pointerY <= 0) {
      return;
    }

    const distanceToTop = pointerY - rect.top;
    const distanceToBottom = rect.bottom - pointerY;
    let delta = 0;

    if (distanceToTop < this.dragAutoScrollEdgePx) {
      delta = -this.computeDragAutoScrollStep(distanceToTop);
    } else if (distanceToBottom < this.dragAutoScrollEdgePx) {
      delta = this.computeDragAutoScrollStep(distanceToBottom);
    }

    if (delta === 0) {
      return;
    }

    const nextScrollTop = scrollContainer.scrollTop + delta;
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    scrollContainer.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
  }

  private computeDragAutoScrollStep(distanceToEdge: number): number {
    const clampedDistance = Math.max(0, Math.min(this.dragAutoScrollEdgePx, distanceToEdge));
    const intensity = 1 - clampedDistance / this.dragAutoScrollEdgePx;
    return Math.round(
      this.dragAutoScrollMinStepPx +
        intensity * (this.dragAutoScrollMaxStepPx - this.dragAutoScrollMinStepPx)
    );
  }

  private findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
    let node: HTMLElement | null = target instanceof HTMLElement ? target : null;
    while (node) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      const isScrollable =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        node.scrollHeight > node.clientHeight;
      if (isScrollable) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  private folderSubtreeContainsId(folder: TeamFileTreeNode, candidateFolderId: string): boolean {
    if (folder.id === candidateFolderId) {
      return true;
    }

    for (const child of folder.children) {
      if (this.folderSubtreeContainsId(child, candidateFolderId)) {
        return true;
      }
    }

    return false;
  }

  private areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) {
      return false;
    }

    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }

    return true;
  }

  private buildFolderTree(
    folders: readonly TeamFileFolderDoc[],
    files: readonly AgentXLibraryFile[],
    query: string
  ): readonly TeamFileTreeNode[] {
    const folderSiblingOrder = this.folderOrderByParentId();
    const folderItemOrder = this.folderItemOrderByFolderId();
    const folderChildren = new Map<string | null, TeamFileFolderDoc[]>();
    const folderSet = new Set(folders.map((folder) => folder.id));

    for (const folder of folders) {
      const parentId = folder.parentId?.trim() || null;
      const key = parentId && folderSet.has(parentId) ? parentId : null;
      const siblings = folderChildren.get(key) ?? [];
      siblings.push(folder);
      folderChildren.set(key, siblings);
    }

    for (const siblings of folderChildren.values()) {
      siblings.sort(
        (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
      );
    }

    for (const [parentId, siblings] of folderChildren.entries()) {
      folderChildren.set(
        parentId,
        this.applyFolderSiblingOrder(parentId, siblings, folderSiblingOrder)
      );
    }

    const filesByFolderId = new Map<string | null, AgentXLibraryFile[]>();
    for (const file of files) {
      const folderId = file.folderId && folderSet.has(file.folderId) ? file.folderId : null;
      const entries = filesByFolderId.get(folderId) ?? [];
      entries.push(file);
      filesByFolderId.set(folderId, entries);
    }

    const matchesFolderQuery = (folder: TeamFileFolderDoc): boolean =>
      query.length > 0 && folder.name.toLowerCase().includes(query);

    const buildNode = (folder: TeamFileFolderDoc): TeamFileTreeNode | null => {
      const ownItems = this.applyFolderItemOrder(
        folder.id,
        filesByFolderId.get(folder.id) ?? [],
        folderItemOrder
      );
      const children = (folderChildren.get(folder.id) ?? [])
        .map((child) => buildNode(child))
        .filter((child): child is TeamFileTreeNode => child !== null);

      if (
        !matchesFolderQuery(folder) &&
        ownItems.length === 0 &&
        children.length === 0 &&
        query.length > 0
      ) {
        return null;
      }

      return {
        id: folder.id,
        name: folder.name,
        items: ownItems,
        children,
        depth: 0,
        source: folder,
      };
    };

    const roots = (folderChildren.get(null) ?? [])
      .map((folder) => buildNode(folder))
      .filter((folder): folder is TeamFileTreeNode => folder !== null);

    const unassignedItems = this.applyFolderItemOrder(
      TEAM_FILES_UNASSIGNED_FOLDER_ID,
      filesByFolderId.get(null) ?? [],
      folderItemOrder
    );
    if (unassignedItems.length > 0 || roots.length === 0 || query.length === 0) {
      return [
        ...roots,
        {
          id: TEAM_FILES_UNASSIGNED_FOLDER_ID,
          name: 'Library',
          items: unassignedItems,
          children: [],
          isUnassigned: true,
          depth: 0,
          source: null,
        },
      ];
    }

    return roots;
  }

  private flattenUploadDestinationOptions(
    nodes: readonly TeamFileTreeNode[],
    depth = 0
  ): readonly UploadDestinationOption[] {
    const options: UploadDestinationOption[] = [];

    for (const node of nodes) {
      if (node.isUnassigned) {
        continue;
      }

      options.push({
        id: node.id,
        name: node.name,
        depth,
        normalizedName: node.name.trim().toLowerCase(),
      });

      options.push(...this.flattenUploadDestinationOptions(node.children, depth + 1));
    }

    return options;
  }

  private applyFolderItemOrder(
    folderId: string,
    items: readonly AgentXLibraryFile[],
    folderItemOrder: Record<string, readonly string[]>
  ): readonly AgentXLibraryFile[] {
    if (items.length <= 1) {
      return items;
    }

    const orderedIds = folderItemOrder[folderId];
    if (!orderedIds || orderedIds.length === 0) {
      return items;
    }

    const rank = new Map<string, number>();
    orderedIds.forEach((id, index) => {
      rank.set(id, index);
    });

    return [...items].sort((left, right) => {
      const leftRank = rank.get(left.id);
      const rightRank = rank.get(right.id);
      if (typeof leftRank === 'number' && typeof rightRank === 'number') {
        return leftRank - rightRank;
      }
      if (typeof leftRank === 'number') {
        return -1;
      }
      if (typeof rightRank === 'number') {
        return 1;
      }
      return 0;
    });
  }

  private applyFolderSiblingOrder(
    parentId: string | null,
    siblings: readonly TeamFileFolderDoc[],
    folderOrderByParentId: Record<string, readonly string[]>
  ): TeamFileFolderDoc[] {
    if (siblings.length <= 1) {
      return siblings.slice();
    }

    const orderKey = parentId ?? ROOT_FOLDER_ORDER_KEY;
    const orderedIds = folderOrderByParentId[orderKey];
    if (!orderedIds || orderedIds.length === 0) {
      return siblings.slice();
    }

    const rank = new Map<string, number>();
    orderedIds.forEach((id, index) => {
      rank.set(id, index);
    });

    return [...siblings].sort((left, right) => {
      const leftRank = rank.get(left.id);
      const rightRank = rank.get(right.id);
      if (typeof leftRank === 'number' && typeof rightRank === 'number') {
        return leftRank - rightRank;
      }
      if (typeof leftRank === 'number') {
        return -1;
      }
      if (typeof rightRank === 'number') {
        return 1;
      }
      return 0;
    });
  }
}

@Component({
  selector: 'nxt1-agent-x-files-panel-wrapper',
  standalone: true,
  imports: [AgentXFilesPanelInnerComponent],
  template: `
    <nxt1-agent-x-files-panel-inner
      [teamId]="teamId"
      [role]="role"
      [sport]="sport"
      [enableDrawTool]="enableDrawTool"
      (askAgentPromptRequested)="askAgentPromptRequested.emit($event)"
      (inlineVideoViewChange)="inlineVideoViewChange.emit($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilesPanelWrapperComponent {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;

  readonly askAgentPromptRequested = output<string>();
  readonly inlineVideoViewChange = output<boolean>();

  private readonly innerPanel = viewChild(AgentXFilesPanelInnerComponent);

  public visibleOpenTabs(): readonly AgentXLibraryFile[] {
    return this.innerPanel()?.visibleOpenTabs() ?? [];
  }

  public selectedId(): string | null {
    return this.innerPanel()?.selectedId() ?? null;
  }

  public isInlineVideoView(): boolean {
    return this.innerPanel()?.isInlineVideoView() ?? false;
  }

  public getInlineHeaderTitle(): string {
    return this.innerPanel()?.getInlineHeaderTitle() ?? 'Files';
  }

  public async refreshData(): Promise<void> {
    await this.innerPanel()?.refreshData();
  }

  public async seekToTimestampMs(timeMs: number): Promise<void> {
    await this.innerPanel()?.seekToTimestampMs(timeMs);
  }

  public async onSelectReview(fileId: string): Promise<void> {
    await this.innerPanel()?.onSelectReview(fileId);
  }

  public getReviewDisplayTitle(file: Pick<AgentXLibraryFile, 'name'>): string {
    return this.innerPanel()?.getReviewDisplayTitle(file) ?? file.name;
  }

  public closeVideoTab(tabId?: string, event?: Event): void {
    this.innerPanel()?.closeVideoTab(tabId, event);
  }

  public reorderVideoTabsByIndex(previousIndex: number, currentIndex: number): void {
    this.innerPanel()?.reorderVideoTabsByIndex(previousIndex, currentIndex);
  }

  public openVideoFromLibrary(): void {
    this.innerPanel()?.openVideoFromLibrary();
  }

  public backToLibrary(): void {
    this.innerPanel()?.backToLibrary();
  }

  public focusFolder(folderId: string): boolean {
    return this.innerPanel()?.focusFolder(folderId) ?? false;
  }
}
