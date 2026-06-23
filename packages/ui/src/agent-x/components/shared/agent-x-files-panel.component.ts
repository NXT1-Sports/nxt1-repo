import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type { TeamFileDoc, TeamFileFolderDoc } from '@nxt1/core';
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
import { AgentXLibraryChromeComponent } from './agent-x-library-chrome.component';
import { AgentXLibraryItemRowComponent } from './agent-x-library-item-row.component';
import { AgentXLibraryLoadingStateComponent } from './agent-x-library-loading-state.component';
import { AgentXFilesService } from '../../services/agent-x-files.service';

type TeamFileTreeNode = AgentXLibraryFolderTreeNode & {
  readonly source?: TeamFileFolderDoc | null;
  readonly children: readonly TeamFileTreeNode[];
  readonly items: readonly TeamFileDoc[];
};

const TEAM_FILES_UNASSIGNED_FOLDER_ID = 'team-files-unassigned';

@Component({
  selector: 'nxt1-agent-x-files-panel-inner',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    NxtIconComponent,
    NxtSearchBarComponent,
    NxtStateViewComponent,
    AgentXLibraryFolderTreeComponent,
    AgentXLibraryChromeComponent,
    AgentXLibraryItemRowComponent,
    AgentXLibraryLoadingStateComponent,
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
          <header class="film-library-header agent-x-files-panel__toolbar">
            <div class="film-library-header__actions-primary">
              <div class="film-playbook-ask-agent">
                <button
                  type="button"
                  class="film-playbook-nav-btn film-playbook-nav-btn--attach"
                  aria-label="Ask Agent X about files"
                  (click)="askAgentAboutFiles()"
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
                </button>
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
              ></button>
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
              <nxt1-agent-x-library-item-row
                cdkDrag
                [cdkDragData]="file"
                cdkDragLockAxis="y"
                cdkDragPreviewContainer="parent"
                [cdkDragDisabled]="!canReorderFolderItems(folder.items)"
                (cdkDragStarted)="onFolderItemReorderDragStart()"
                (cdkDragEnded)="onFolderItemReorderDragEnd()"
              >
                <button
                  type="button"
                  class="film-list-item__reorder-handle"
                  cdkDragHandle
                  [attr.aria-label]="'Reorder file'"
                >
                  <span class="film-reorder-grip" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </button>

                <button
                  type="button"
                  class="film-list-item"
                  [attr.draggable]="true"
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
              </nxt1-agent-x-library-item-row>
            </ng-template>
          </div>
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
  protected readonly activeFolderDropTargetId = signal<string | null>(null);
  protected readonly draggingFileId = signal<string | null>(null);
  protected readonly isFolderItemReorderDragActive = signal(false);
  protected readonly folderItemOrderByFolderId = signal<Record<string, readonly string[]>>({});
  protected readonly searchQuery = signal('');

  protected readonly acceptedMimeTypes = [...AGENT_X_ALLOWED_MIME_TYPES].join(',');
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
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
  protected readonly folderNodes = computed<readonly TeamFileTreeNode[]>(() =>
    this.buildFolderTree(
      this.filesService.folders(),
      this.filteredFiles(),
      this.normalizedSearchQuery()
    )
  );

  protected readonly folderTreeController: AgentXLibraryFolderTreeController = {
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
    areAllFolderItemsSelected: () => false,
    isSomeFolderItemsSelected: () => false,
    getFolderDragContexts: () => null,
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
    onToggleFolderSelection: () => {},
    openFolderMenu: (event, folder) => this.onOpenFolderMenu(event, folder),
    startRenameFolder: (folder, event) => this.onFolderRenameStart(folder, event),
    cancelRename: (event) => this.onFolderRenameCancel(event),
    confirmRename: (folder, event) => this.onFolderRenameConfirm(folder, event),
    startCreateSubfolder: (folder, event) => this.onFolderCreateSubfolderStart(folder, event),
    startDeleteFolder: (folder, event) => this.onFolderDeleteStart(folder, event),
    cancelDeleteFolder: (event) => this.onFolderDeleteCancel(event),
    confirmDeleteFolder: (folder, event) => this.onFolderDeleteConfirm(folder, event),
    onFolderReorderDragStart: () => {},
    onFolderReorderDragEnd: () => {},
    onFolderItemDragStart: () => {},
    onFolderItemDragEnd: () => {},
    canReorderFolders: (folders) => folders.filter((folder) => !folder.isUnassigned).length > 1,
    canReorderFolderItems: (items) => this.canReorderFolderItems(items as readonly TeamFileDoc[]),
    onFolderReorder: (event, parentId) => this.onFolderReorder(event, parentId),
    onFolderItemsReorder: (folder, event) =>
      this.onFolderItemsReorder(folder, event as CdkDragDrop<readonly TeamFileDoc[]>),
    onFolderDragOver: (folderId, event) => this.onFolderDragOver(folderId, event),
    onFolderDragLeave: (folderId, event) => this.onFolderDragLeave(folderId, event),
    onFolderDrop: (folder, event) => this.onFolderDrop(folder, event),
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId'] && this.teamId) {
      void this.refreshData();
    }
  }

  public visibleOpenTabs(): readonly TeamFileDoc[] {
    return [];
  }

  public selectedId(): string | null {
    return null;
  }

  public isInlineVideoView(): boolean {
    return false;
  }

  public getInlineHeaderTitle(): string {
    return 'Files';
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
  }

  public async seekToTimestampMs(_timeMs: number): Promise<void> {}

  public async onSelectReview(fileId: string): Promise<void> {
    const file = this.filesService.files().find((entry) => entry.id === fileId) ?? null;
    if (file) {
      this.openFile(file);
    }
  }

  public getReviewDisplayTitle(file: Pick<TeamFileDoc, 'name'>): string {
    return file.name;
  }

  public closeVideoTab(_tabId?: string, event?: Event): void {
    event?.stopPropagation();
  }

  public reorderVideoTabsByIndex(_previousIndex: number, _currentIndex: number): void {}

  public openVideoFromLibrary(): void {}

  public backToLibrary(): void {}

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

  protected onOpenFolderMenu(event: Event, folder: AgentXLibraryFolderTreeNode): void {
    event.preventDefault();
    event.stopPropagation();
    const nextId = this.openFolderMenuId() === folder.id ? null : folder.id;
    this.resetFolderUiState();
    this.openFolderMenuId.set(nextId);
    this.folderRenameDraft.set(folder.name);
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

  protected askAgentAboutFiles(): void {
    const query = this.searchQuery().trim();
    const prompt = query
      ? `Use the files currently visible in the Files library matching "${query}" for the current task.`
      : 'Use the files currently visible in the Files library for the current task.';
    this.askAgentPromptRequested.emit(prompt);
  }

  protected onFileDragStart(
    file: TeamFileDoc,
    _folderItems: readonly TeamFileDoc[],
    event: DragEvent
  ): void {
    if (this.isFolderItemReorderDragActive()) {
      event.preventDefault();
      return;
    }

    this.draggingFileId.set(file.id);
    const dragContext = this.buildFileDragContext(file);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', file.id);
      event.dataTransfer.setData(
        AGENT_X_SELECTED_CONTEXT_DRAG_MIME,
        serializeAgentXSelectedContextForDrag(dragContext)
      );
    }
  }

  protected onFileDragEnd(): void {
    this.draggingFileId.set(null);
    this.activeFolderDropTargetId.set(null);
  }

  protected onFolderDragOver(folderId: string, event: DragEvent): void {
    if (!this.draggingFileId()) {
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
    const fileId = this.draggingFileId();
    const teamId = this.teamId?.trim() || '';
    this.activeFolderDropTargetId.set(null);
    this.draggingFileId.set(null);

    if (!fileId || !teamId) {
      return;
    }

    const targetFolderId = folder.id === TEAM_FILES_UNASSIGNED_FOLDER_ID ? null : folder.id;
    const currentFile = this.filesService.files().find((entry) => entry.id === fileId) ?? null;
    const currentFolderId = currentFile?.folderId ?? null;
    if (currentFolderId === targetFolderId) {
      return;
    }

    try {
      await this.filesService.moveFile(fileId, teamId, targetFolderId);
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

  protected canReorderFolderItems(items: readonly TeamFileDoc[]): boolean {
    return items.length > 1;
  }

  protected onFolderItemsReorder(
    folder: AgentXLibraryFolderTreeNode,
    event: CdkDragDrop<readonly TeamFileDoc[]>
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
    this.draggingFileId.set(null);
  }

  protected onFolderItemReorderDragEnd(): void {
    this.isFolderItemReorderDragActive.set(false);
  }

  protected iconNameForFile(file: Pick<TeamFileDoc, 'kind'>): IconName {
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

  protected buildMetaLine(file: TeamFileDoc): string {
    return file.kind;
  }

  private buildFileDragContext(file: TeamFileDoc): AgentXSelectedContext {
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

  protected openFile(file: Pick<TeamFileDoc, 'url'>): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  private resetFolderUiState(): void {
    this.openFolderMenuId.set(null);
    this.editingFolderId.set(null);
    this.deleteFolderConfirmId.set(null);
    this.folderRenameDraft.set('');
  }

  private buildFolderTree(
    folders: readonly TeamFileFolderDoc[],
    files: readonly TeamFileDoc[],
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

    const filesByFolderId = new Map<string | null, TeamFileDoc[]>();
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
    items: readonly TeamFileDoc[],
    folderItemOrder: Record<string, readonly string[]>
  ): readonly TeamFileDoc[] {
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

  public visibleOpenTabs(): readonly TeamFileDoc[] {
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

  public getReviewDisplayTitle(file: Pick<TeamFileDoc, 'name'>): string {
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
