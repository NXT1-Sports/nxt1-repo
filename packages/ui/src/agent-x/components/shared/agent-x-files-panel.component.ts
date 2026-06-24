import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
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
import type { TeamFileFolderDoc, TeamFilmReviewDoc } from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { IconName } from '@nxt1/design-tokens/assets/icons';

import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtSearchBarComponent } from '../../../components/search-bar/search-bar.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import {
  AgentXLibraryFolderTreeComponent,
  type AgentXLibraryFolderTreeController,
  type AgentXLibraryFolderTreeNode,
} from './agent-x-library-folder-tree.component';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXLibraryChromeComponent } from './agent-x-library-chrome.component';
import { AgentXLibraryLoadingStateComponent } from './agent-x-library-loading-state.component';
import { AgentXFilmReviewPanelComponent } from './agent-x-film-review-panel.component';
import { AgentXViewerSurfaceComponent } from './agent-x-viewer-surface.component';
import { AgentXFilesService, type AgentXLibraryFile } from '../../services/agent-x-files.service';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import { AgentXService } from '../../services/agent-x.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtArchiveService, type ArchiveDownloadEntry } from '../../../services/archive';

type TeamFileTreeNode = AgentXLibraryFolderTreeNode & {
  readonly source?: TeamFileFolderDoc | null;
  readonly children: readonly TeamFileTreeNode[];
  readonly items: readonly AgentXLibraryFile[];
};

const TEAM_FILES_UNASSIGNED_FOLDER_ID = 'team-files-unassigned';

type FilesAskAgentPromptId =
  | 'create-cutup-folders'
  | 'create-highlight'
  | 'pull-best-plays'
  | 'practice-script'
  | 'build-practice-plan'
  | 'scout-opponent-tendencies'
  | 'player-evaluation-notes'
  | 'summarize-selection'
  | 'extract-key-details'
  | 'build-action-plan';

type FilesAskAgentPromptOption = {
  readonly id: FilesAskAgentPromptId;
  readonly label: string;
  readonly hint: string;
};

type FilesAskAgentPromptSection = {
  readonly title: string;
  readonly options: readonly FilesAskAgentPromptOption[];
};

const FILES_ASK_AGENT_PROMPT_SECTIONS: readonly FilesAskAgentPromptSection[] = [
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
    ],
  },
  {
    title: 'Coaching Workflow',
    options: [
      {
        id: 'practice-script',
        label: 'Practice Script',
        hint: 'Turn the selected material into a drill-by-drill practice script.',
      },
      {
        id: 'build-practice-plan',
        label: 'Build Practice Plan',
        hint: 'Create a timed practice plan with focus areas and coaching points.',
      },
      {
        id: 'scout-opponent-tendencies',
        label: 'Scout Opponent Tendencies',
        hint: 'Break down patterns, habits, strengths, and openings to attack.',
      },
    ],
  },
  {
    title: 'Review & Notes',
    options: [
      {
        id: 'player-evaluation-notes',
        label: 'Player Evaluation Notes',
        hint: 'Organize strengths, growth areas, and next coaching points by player.',
      },
      {
        id: 'summarize-selection',
        label: 'Summarize Files',
        hint: 'Get a fast overview of what is in the selected files and why it matters.',
      },
    ],
  },
  {
    title: 'Strategy & Ops',
    options: [
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

@Component({
  selector: 'nxt1-agent-x-files-panel-inner',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    OverlayModule,
    NxtIconComponent,
    NxtSearchBarComponent,
    NxtStateViewComponent,
    AgentXLibraryFolderTreeComponent,
    AgentXContextDragDirective,
    AgentXLibraryChromeComponent,
    AgentXLibraryLoadingStateComponent,
    AgentXFilmReviewPanelComponent,
    AgentXViewerSurfaceComponent,
  ],
  template: `
    <nxt1-agent-x-library-chrome></nxt1-agent-x-library-chrome>
    <section class="agent-x-files-panel film-review-panel">
      @if (!teamId?.trim()) {
        <div class="film-state">
          <h3>Files requires a team context</h3>
          <p>
            Connect a team in Agent X to upload files, create folders, and organize assets here.
          </p>
          <p>
            Without a connected team, personal uploads still belong in the Agent X chat composer.
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
                            Select one or more items or folders to ask Agent.
                          </p>
                        }
                        @for (section of filesAskAgentPromptSections; track section.title) {
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
                    (click)="openFilePicker()"
                  >
                    @if (filesService.saving()) {
                      Uploading...
                    } @else {
                      Upload Files
                    }
                  </button>
                </div>
                <input
                  #fileUploadInput
                  type="file"
                  class="film-library-file-input"
                  multiple
                  [attr.accept]="acceptedMimeTypes"
                  (change)="onFilesSelected($event)"
                />
              </div>
            </header>

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
              <nxt1-agent-x-library-folder-tree
                [folders]="folderNodes()"
                [controller]="folderTreeController"
                [itemTemplate]="folderItemTemplate"
                [emptyFolderLabel]="
                  hasSearchQuery()
                    ? 'No matching files in this folder.'
                    : 'Drag files here or upload new ones.'
                "
              />

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
                    @if (file.kind === 'image' && file.url) {
                      <img class="film-list-item__thumb-image" [src]="file.url" [alt]="file.name" />
                    } @else {
                      <div class="film-list-item__thumb-placeholder" aria-hidden="true">
                        <nxt1-icon [name]="iconNameForFile(file)" [size]="14"></nxt1-icon>
                      </div>
                    }
                  </div>
                  <span class="film-list-item__content">
                    <span class="film-list-item__title">{{ file.name }}</span>
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
                    role="menu"
                    aria-label="File options"
                    (click)="$event.stopPropagation()"
                  >
                    @if (isEditingFile(file.id)) {
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
                        (click)="onFileRenameStart(file, $event)"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        class="film-list-item__menu-action film-list-item__menu-action--danger"
                        role="menuitem"
                        (click)="onFileDeleteStart(file, $event)"
                      >
                        Delete
                      </button>
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
              [enableDrawTool]="enableDrawTool"
              (askAgentPromptRequested)="askAgentPromptRequested.emit($event)"
            />
          } @else if (selectedViewerFile(); as file) {
            <nxt1-agent-x-viewer-surface class="agent-x-files-viewer" aria-label="File viewer">
              <div viewer-stage class="agent-x-files-viewer__stage">
                @if (isImageFile(file)) {
                  <img class="agent-x-files-viewer__image" [src]="file.url" [alt]="file.name" />
                } @else if (isPdfFile(file)) {
                  <iframe
                    class="agent-x-files-viewer__frame"
                    [src]="file.url"
                    [title]="file.name"
                  ></iframe>
                } @else if (isVideoFile(file)) {
                  <video
                    class="agent-x-files-viewer__video"
                    [src]="file.url"
                    controls
                    playsinline
                    preload="metadata"
                  ></video>
                } @else {
                  <div class="agent-x-files-viewer__fallback">
                    <div class="agent-x-files-viewer__fallback-icon" aria-hidden="true">
                      <nxt1-icon [name]="iconNameForFile(file)" [size]="28"></nxt1-icon>
                    </div>
                    <div class="agent-x-files-viewer__fallback-copy">
                      <h3>{{ file.name }}</h3>
                      <p>
                        Preview is not available for this file type yet. The universal viewer shell
                        is in place, and richer bottom-panel content can be added here next.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="film-playbook-nav-btn"
                      (click)="openFileInNewTab(file)"
                    >
                      Open Original
                    </button>
                  </div>
                }
              </div>

              <div
                viewer-context
                class="agent-x-files-viewer__context"
                aria-label="File context panel"
              >
                <div class="agent-x-files-viewer__context-header">
                  <span class="agent-x-files-viewer__eyebrow">Context</span>
                  <h3>{{ file.name }}</h3>
                  <p>
                    This space is reserved for file-specific metadata, notes, AI summaries, and
                    downstream tools.
                  </p>
                </div>

                <div class="agent-x-files-viewer__placeholder">
                  <span>{{ file.kind | titlecase }} viewer connected.</span>
                  <span>Bottom panel content will land here next.</span>
                </div>
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

      .agent-x-files-viewer__stage,
      .agent-x-files-viewer__context {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 82%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 94%, #03111f 6%);
        border-radius: 18px;
        overflow: hidden;
      }

      .agent-x-files-viewer__stage {
        min-height: 320px;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.14), transparent 52%),
          linear-gradient(180deg, rgba(3, 13, 24, 0.92), rgba(7, 19, 32, 0.98));
      }

      .agent-x-files-viewer__image,
      .agent-x-files-viewer__frame,
      .agent-x-files-viewer__video {
        width: 100%;
        min-height: 320px;
        max-height: 62vh;
        border: 0;
        display: block;
        object-fit: contain;
        background: #020817;
      }

      .agent-x-files-viewer__fallback {
        display: grid;
        gap: 14px;
        justify-items: start;
        padding: 28px;
        color: #e6eef8;
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
        gap: 16px;
        padding: 18px;
        min-height: 180px;
      }

      .agent-x-files-viewer__context-header {
        display: grid;
        gap: 6px;
      }

      .agent-x-files-viewer__eyebrow {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-files-viewer__placeholder {
        min-height: 96px;
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: 14px;
        display: grid;
        place-items: center;
        gap: 4px;
        text-align: center;
        color: var(--nxt1-color-text-secondary);
        padding: 16px;
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
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
        color: var(--nxt1-color-text-secondary);
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFilesPanelInnerComponent implements OnChanges {
  @Input() teamId: string | null = null;
  @Input() role: string | null = null;
  @Input() sport = '';
  @Input() enableDrawTool = false;

  readonly askAgentPromptRequested = output<string>();

  protected readonly filesService = inject(AgentXFilesService);
  private readonly filmReviewService = inject(AgentXFilmReviewService);
  private readonly agentXService = inject(AgentXService);
  private readonly toast = inject(NxtToastService);
  private readonly archive = inject(NxtArchiveService);
  private readonly filmReviewPanel = viewChild(AgentXFilmReviewPanelComponent);
  private readonly fileUploadInput =
    viewChild.required<ElementRef<HTMLInputElement>>('fileUploadInput');
  private readonly expandedFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly openFolderMenuId = signal<string | null>(null);
  protected readonly isCreatingFolder = signal(false);
  protected readonly folderNameDraft = signal('');
  protected readonly creatingSubfolderParentId = signal<string | null>(null);
  protected readonly editingFolderId = signal<string | null>(null);
  protected readonly deleteFolderConfirmId = signal<string | null>(null);
  protected readonly folderRenameDraft = signal('');
  protected readonly openFileMenuId = signal<string | null>(null);
  protected readonly editingFileId = signal<string | null>(null);
  protected readonly deleteFileConfirmId = signal<string | null>(null);
  protected readonly fileRenameDraft = signal('');
  protected readonly activeFolderDropTargetId = signal<string | null>(null);
  protected readonly draggingFileIds = signal<ReadonlySet<string>>(new Set());
  protected readonly isFolderItemReorderDragActive = signal(false);
  protected readonly folderItemOrderByFolderId = signal<Record<string, readonly string[]>>({});
  protected readonly searchQuery = signal('');
  protected readonly selectedFileIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedFolderIds = signal<ReadonlySet<string>>(new Set());
  protected readonly isFilesAskAgentMenuVisible = signal(false);
  protected readonly viewerMode = signal<'library' | 'video' | 'generic'>('library');
  protected readonly selectedFilmReviewId = signal<string | null>(null);
  private readonly pendingFilmReviewId = signal<string | null>(null);

  protected readonly acceptedMimeTypes = [...AGENT_X_ALLOWED_MIME_TYPES].join(',');
  protected readonly filesAskAgentPromptSections = FILES_ASK_AGENT_PROMPT_SECTIONS;
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
  protected readonly selectedViewerFile = computed(() => this.filesService.selectedFile());
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
    isFolderBeingEdited: (folderId) => this.editingFolderId() === folderId,
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
  };

  constructor() {
    effect(() => {
      const panel = this.filmReviewPanel();
      const reviewId = this.pendingFilmReviewId();
      if (!panel || !reviewId || this.viewerMode() !== 'video') {
        return;
      }

      this.pendingFilmReviewId.set(null);
      void panel.onSelectReview(reviewId);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId'] && this.teamId) {
      void this.refreshData();
    }
  }

  public visibleOpenTabs(): readonly AgentXLibraryFile[] {
    if (this.viewerMode() === 'video') {
      const reviewTabs = this.filmReviewPanel()?.visibleOpenTabs() ?? [];
      return reviewTabs.map((review) => this.mapFilmReviewToFileTab(review));
    }

    const file = this.selectedViewerFile();
    return file ? [file] : [];
  }

  public selectedId(): string | null {
    if (this.viewerMode() === 'video') {
      return this.filmReviewPanel()?.selectedId() ?? this.filesService.selectedId();
    }

    return this.filesService.selectedId();
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
    if (!this.teamId) return;
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
  }

  public async seekToTimestampMs(_timeMs: number): Promise<void> {
    await this.filmReviewPanel()?.seekToTimestampMs(_timeMs);
  }

  public async onSelectReview(fileId: string): Promise<void> {
    if (this.viewerMode() === 'video' && this.selectedFilmReviewId()) {
      await this.filmReviewPanel()?.onSelectReview(fileId);
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

    this.backToLibrary();
  }

  public reorderVideoTabsByIndex(_previousIndex: number, _currentIndex: number): void {
    this.filmReviewPanel()?.reorderVideoTabsByIndex(_previousIndex, _currentIndex);
  }

  public openVideoFromLibrary(): void {
    this.backToLibrary();
  }

  public backToLibrary(): void {
    this.viewerMode.set('library');
    this.selectedFilmReviewId.set(null);
    this.pendingFilmReviewId.set(null);
    this.filesService.selectFile(null);
  }

  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? [...input.files] : [];
    if (!this.teamId || files.length === 0) {
      if (input) input.value = '';
      return;
    }

    try {
      await this.filesService.uploadFiles(files, this.teamId, this.sport || null);
    } finally {
      if (input) input.value = '';
    }
  }

  protected openFilePicker(): void {
    this.fileUploadInput().nativeElement.click();
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
    const teamId = this.teamId?.trim() || '';
    const name = this.folderNameDraft().trim();
    if (!teamId || !name) {
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
    this.resetFolderUiState();
    this.openFolderMenuId.set(nextId);
    this.folderRenameDraft.set(folder.name);
  }

  protected isFileMenuOpen(fileId: string): boolean {
    return this.openFileMenuId() === fileId;
  }

  protected isEditingFile(fileId: string): boolean {
    return this.editingFileId() === fileId;
  }

  protected isFileDeleteConfirming(fileId: string): boolean {
    return this.deleteFileConfirmId() === fileId;
  }

  protected onOpenFileMenu(event: Event, file: AgentXLibraryFile): void {
    event.preventDefault();
    event.stopPropagation();
    const nextId = this.openFileMenuId() === file.id ? null : file.id;
    this.resetFolderUiState();
    this.openFileMenuId.set(nextId);
    this.fileRenameDraft.set(file.name);
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
    const teamId = this.teamId?.trim() || '';
    const name = this.fileRenameDraft().trim();
    if (!teamId || !name) {
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
    const teamId = this.teamId?.trim() || '';
    if (!teamId) {
      return;
    }

    try {
      await this.filesService.deleteFile(file.id, teamId);
      this.pruneSelectedSelections();
      this.onFileMenuBackdropTap();
    } catch {
      // intentionally ignored
    }
  }

  protected onFolderRenameStart(folder: AgentXLibraryFolderTreeNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingFolderId.set(folder.id);
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
    const teamId = this.teamId?.trim() || '';
    const name = this.folderRenameDraft().trim();
    if (!teamId || !name || folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
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
    const teamId = this.teamId?.trim() || '';
    if (!teamId || folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID) {
      return;
    }

    try {
      await this.filesService.deleteFolder(folder.id, teamId);
      this.expandedFolderIds.update((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      this.onFolderMenuBackdropTap();
    } catch {
      // intentionally ignored
    }
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  protected onClearSearch(): void {
    this.searchQuery.set('');
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

    const teamId = this.teamId?.trim() || '';
    const selectedFiles = this.selectedFiles();
    const selectedFoldersWithoutFiles = this.selectedFoldersWithoutFiles();

    if (!teamId || (selectedFiles.length === 0 && selectedFoldersWithoutFiles.length === 0)) {
      this.toast.info('Select files or empty folders to delete.');
      return;
    }

    let deletedFileCount = 0;
    for (const file of selectedFiles) {
      try {
        await this.filesService.deleteFile(file.id, teamId);
        deletedFileCount += 1;
      } catch {
        // Errors are surfaced by the service.
      }
    }

    let deletedFolderCount = 0;
    for (const folder of selectedFoldersWithoutFiles) {
      try {
        await this.filesService.deleteFolder(folder.id, teamId);
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
    this.draggingFileIds.set(new Set());
    this.activeFolderDropTargetId.set(null);
  }

  protected onFolderDragOver(folderId: string, event: DragEvent): void {
    if (this.draggingFileIds().size === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.activeFolderDropTargetId.set(folderId);
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
    const draggedFileIds = [...this.draggingFileIds()];
    const teamId = this.teamId?.trim() || '';
    this.activeFolderDropTargetId.set(null);
    this.draggingFileIds.set(new Set());

    if (draggedFileIds.length === 0 || !teamId) {
      return;
    }

    const targetFolderId = folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID ? null : folder.id;
    const filesToMove = this.filesService
      .files()
      .filter(
        (entry) => draggedFileIds.includes(entry.id) && (entry.folderId ?? null) !== targetFolderId
      );
    if (filesToMove.length === 0) {
      return;
    }

    try {
      for (const currentFile of filesToMove) {
        await this.filesService.moveFile(currentFile.id, teamId, targetFolderId);
      }
    } catch {
      // intentionally ignored
    }
  }

  protected async onFolderReorder(
    event: CdkDragDrop<readonly AgentXLibraryFolderTreeNode[]>,
    parentId: string | null
  ): Promise<void> {
    const teamId = this.teamId?.trim() || '';
    if (!teamId || event.previousIndex === event.currentIndex) {
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
    const updates = sortedFolders
      .map((folder, index) => {
        const nextSortOrder = index;
        const nextParentId = normalizedParentId;
        const currentParentId = folder.parentId?.trim() || null;
        if (folder.sortOrder === nextSortOrder && currentParentId === nextParentId) {
          return null;
        }
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

  protected buildMetaLine(file: AgentXLibraryFile): string {
    return file.kind;
  }

  private buildFileDragContext(file: AgentXLibraryFile): AgentXSelectedContext {
    const kind: AgentXSelectedContext['kind'] = file.kind === 'video' ? 'film_play' : 'document';

    return {
      id: `team-file:${file.id}`,
      kind,
      title: file.name,
      summary: this.buildMetaLine(file),
      source: {
        type: 'agent_x',
        id: file.id,
        label: 'Files',
      },
      entityRefs: [{ type: 'team_file', id: file.id, label: file.name }],
      media: {
        ...(file.kind === 'video' ? { videoUrl: file.url } : {}),
        ...(file.kind === 'image' ? { imageUrl: file.url } : {}),
        ...(file.thumbnailUrl ? { thumbnailUrl: file.thumbnailUrl } : {}),
        ...(file.cloudflareVideoId ? { cloudflareVideoId: file.cloudflareVideoId } : {}),
      },
      metadata: {
        itemType: 'team_file',
        fileKind: file.kind,
        status: file.status,
        origin: file.origin,
        mimeType: file.mimeType,
        teamId: file.teamId,
        sport: file.sport ?? null,
        storagePath: file.storagePath ?? null,
        sourceThreadId: file.sourceThreadId ?? null,
        sourceMessageId: file.sourceMessageId ?? null,
        sourceOperationId: file.sourceOperationId ?? null,
        sizeBytes: file.sizeBytes,
      },
    };
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
    this.filesService.selectFile(file.id);

    if (file.kind === 'video') {
      const matchedReviewId = await this.resolveFilmReviewIdForFile(file);
      if (matchedReviewId) {
        this.selectedFilmReviewId.set(matchedReviewId);
        this.viewerMode.set('video');
        this.pendingFilmReviewId.set(matchedReviewId);
        return;
      }
    }

    this.selectedFilmReviewId.set(null);
    this.pendingFilmReviewId.set(null);
    this.viewerMode.set('generic');
  }

  protected openFileInNewTab(file: Pick<AgentXLibraryFile, 'url'>): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  protected isImageFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'image' || file.mimeType.startsWith('image/');
  }

  protected isPdfFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'pdf' || file.mimeType === 'application/pdf';
  }

  protected isVideoFile(file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>): boolean {
    return file.kind === 'video' || file.mimeType.startsWith('video/');
  }

  private async resolveFilmReviewIdForFile(file: AgentXLibraryFile): Promise<string | null> {
    const teamId = this.teamId?.trim() || '';
    if (!teamId) {
      return null;
    }

    let matchedReviewId = this.findMatchingFilmReviewId(file);
    if (matchedReviewId) {
      return matchedReviewId;
    }

    await this.filmReviewService.load(teamId, this.sport || undefined, 200);
    matchedReviewId = this.findMatchingFilmReviewId(file);
    if (matchedReviewId) {
      return matchedReviewId;
    }

    const resolvedSport = this.sport.trim() || file.sport?.trim() || '';
    if (!resolvedSport) {
      return null;
    }

    const createdReview = await this.filmReviewService.createFromVideo({
      teamId,
      sport: resolvedSport,
      title: file.name,
      videoUrl: file.url,
      uploadMode: 'single_video',
      storagePath: file.storagePath,
      cloudflareVideoId: file.cloudflareVideoId,
      cloudflareStatus: file.cloudflareStatus,
      readyToStream: file.readyToStream,
      thumbnailUrl: file.thumbnailUrl,
      source: 'team_files',
      sourceUrl: file.url,
    });

    return createdReview.id;
  }

  private findMatchingFilmReviewId(file: AgentXLibraryFile): string | null {
    const normalizedFileUrl = file.url.trim();
    const normalizedStoragePath = file.storagePath?.trim() || null;
    const normalizedCloudflareId = file.cloudflareVideoId?.trim() || null;

    const match = this.filmReviewService.reviews().find((review) => {
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

  private mapFilmReviewToFileTab(review: TeamFilmReviewDoc): AgentXLibraryFile {
    const matchingFile = this.filesService.files().find((file) => {
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

  private resetFolderUiState(): void {
    this.openFolderMenuId.set(null);
    this.editingFolderId.set(null);
    this.deleteFolderConfirmId.set(null);
    this.folderRenameDraft.set('');
    this.openFileMenuId.set(null);
    this.editingFileId.set(null);
    this.deleteFileConfirmId.set(null);
    this.fileRenameDraft.set('');
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

    switch (promptId) {
      case 'create-cutup-folders':
        return `Create cutup folders from ${subject}. Recommend the best folder structure, labels, and how the selected material should be organized for fast film work.`;
      case 'create-highlight':
        return `Create a highlight from ${subject}. Identify the strongest moments, suggest the best sequence, and explain what should make the final cut.`;
      case 'pull-best-plays':
        return `Pull the best plays from ${subject}. Rank the top moments to review, share, or save and explain why each one stands out.`;
      case 'practice-script':
        return `Build a practice script from ${subject}. Turn the selected material into a clear practice flow with drill order, timing, coaching points, and emphasis.`;
      case 'build-practice-plan':
        return `Build a practice plan from ${subject}. Create a timed session plan with goals, key periods, coaching points, and what to prioritize.`;
      case 'scout-opponent-tendencies':
        return `Scout opponent tendencies from ${subject}. Break down patterns, habits, strengths, weaknesses, and the best ways to attack or counter them.`;
      case 'player-evaluation-notes':
        return `Create player evaluation notes from ${subject}. Organize strengths, growth areas, concerns, and next coaching points by player when possible.`;
      case 'summarize-selection':
        return `Summarize ${subject}. Highlight the important contents, what each item appears to be for, and the main takeaways.`;
      case 'extract-key-details':
        return `Extract the key details from ${subject}. Pull out the most important names, dates, metrics, and decision-relevant facts.`;
      case 'build-action-plan':
        return `Build an action plan from ${subject}. Turn the selected materials into clear recommendations, priorities, and next steps.`;
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
}
