import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  ViewEncapsulation,
  input,
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import type { AgentXSelectedContext } from '@nxt1/core/ai';

import { NxtIconComponent } from '../../../components/icon/icon.component';
import { AgentXContextDragDirective } from '../../directives/agent-x-context-drag.directive';
import { AgentXLibraryItemRowComponent } from './agent-x-library-item-row.component';
import { type AgentXShareMemberOption } from './agent-x-share-member-picker.component';
import {
  AgentXShareAccessPanelComponent,
  type AgentXSharePermission,
} from './agent-x-share-access-panel.component';

export interface AgentXLibraryFolderTreeNode {
  readonly id: string;
  readonly name: string;
  readonly items: readonly unknown[];
  readonly children: readonly AgentXLibraryFolderTreeNode[];
  readonly isUnassigned?: boolean;
  readonly depth?: number;
  readonly source?: unknown;
}

export interface AgentXLibraryFolderItemContext {
  readonly $implicit: unknown;
  readonly folder: AgentXLibraryFolderTreeNode;
}

export interface AgentXLibraryFolderTreeController {
  isLibraryReorderDragActive(): boolean;
  isCreatingFolder(): boolean;
  getCreatingSubfolderParentId(): string | null;
  getCreateDraft(): string;
  onCreateDraftInput(value: string): void;
  onCreateCancel(event?: Event): void;
  onCreateConfirm(event?: Event): void | Promise<void>;
  onMenuBackdropTap(event?: Event): void;
  isFolderMenuOpen(folderId: string): boolean;
  shouldOpenFolderMenuUpward(folderId: string): boolean;
  isFolderBeingEdited(folderId: string): boolean;
  isFolderBeingShared(folderId: string): boolean;
  isFolderDeleteConfirming(folderId: string): boolean;
  getRenameDraft(): string;
  onRenameInput(value: string): void;
  isFolderExpanded(folderId: string): boolean;
  isReviewMenuOpenInFolder(folder: AgentXLibraryFolderTreeNode): boolean;
  isFolderDropTarget(folderId: string): boolean;
  areAllFolderItemsSelected(folder: AgentXLibraryFolderTreeNode): boolean;
  isSomeFolderItemsSelected(folder: AgentXLibraryFolderTreeNode): boolean;
  isItemMenuOpen(item: unknown): boolean;
  getFolderDragContexts(
    folder: AgentXLibraryFolderTreeNode
  ): AgentXSelectedContext | readonly AgentXSelectedContext[] | null;
  getDeleteFolderConfirmText(folder: AgentXLibraryFolderTreeNode): string;
  canManageFolderSharing(folder: AgentXLibraryFolderTreeNode): boolean;
  isFolderShared(folder: AgentXLibraryFolderTreeNode): boolean;
  getFolderSharePrincipalType(): 'user' | 'team' | 'organization';
  getFolderSharePermission(): AgentXSharePermission;
  getFolderSharePrincipalId(): string;
  getFolderTeamId(folder: AgentXLibraryFolderTreeNode): string;
  getFolderOrganizationId(folder: AgentXLibraryFolderTreeNode): string;
  getShareCandidateQuery(): string;
  onShareCandidateQueryInput(value: string): void;
  isShareCandidatesLoading(): boolean;
  getShareCandidates(): readonly AgentXShareMemberOption[];
  getFolderSelectedShareUserIds(): readonly string[];
  toggleFolderShareCandidate(
    folder: AgentXLibraryFolderTreeNode,
    event: { candidate: AgentXShareMemberOption; checked: boolean }
  ): void | Promise<void>;
  getFolderShareGrants(folder: AgentXLibraryFolderTreeNode): readonly {
    readonly accessKey: string;
    readonly principalType: 'user' | 'team' | 'organization';
    readonly principalId: string;
    readonly label: string;
    readonly permission: AgentXSharePermission;
  }[];
  onFolderShareTypeChange(value: string): void;
  onFolderSharePermissionChange(value: AgentXSharePermission): void;
  startShareFolder(folder: AgentXLibraryFolderTreeNode, event: Event): void | Promise<void>;
  cancelShareFolder(event?: Event): void;
  canSubmitFolderShare(folder: AgentXLibraryFolderTreeNode): boolean;
  confirmShareFolder(folder: AgentXLibraryFolderTreeNode, event?: Event): void | Promise<void>;
  changeFolderShareGrantPermission(
    folder: AgentXLibraryFolderTreeNode,
    event: {
      grant: {
        readonly accessKey: string;
        readonly principalType: 'user' | 'team' | 'organization';
        readonly principalId: string;
        readonly label: string;
        readonly permission: AgentXSharePermission;
      };
      permission: AgentXSharePermission;
    }
  ): void | Promise<void>;
  removeFolderShare(
    folder: AgentXLibraryFolderTreeNode,
    grant: {
      readonly accessKey: string;
      readonly principalType: 'user' | 'team' | 'organization';
      readonly principalId: string;
      readonly label: string;
      readonly permission: AgentXSharePermission;
    },
    event?: Event
  ): void | Promise<void>;
  toggleFolder(folderId: string, event?: Event): void;
  onToggleFolderSelection(folder: AgentXLibraryFolderTreeNode, event: Event): void;
  openFolderMenu(event: Event, folder: AgentXLibraryFolderTreeNode): void;
  canRenameFolder(folder: AgentXLibraryFolderTreeNode): boolean;
  canDeleteFolder(folder: AgentXLibraryFolderTreeNode): boolean;
  startRenameFolder(folder: AgentXLibraryFolderTreeNode, event: Event): void;
  cancelRename(event: Event): void;
  confirmRename(folder: AgentXLibraryFolderTreeNode, event: Event): void | Promise<void>;
  startCreateSubfolder(folder: AgentXLibraryFolderTreeNode, event: Event): void;
  startDeleteFolder(folder: AgentXLibraryFolderTreeNode, event: Event): void;
  cancelDeleteFolder(event: Event): void;
  confirmDeleteFolder(folder: AgentXLibraryFolderTreeNode, event: Event): void | Promise<void>;
  onFolderReorderDragStart(): void;
  onFolderReorderDragEnd(): void;
  onFolderItemDragStart(): void;
  onFolderItemDragEnd(): void;
  canReorderFolders(folders: readonly AgentXLibraryFolderTreeNode[]): boolean;
  canReorderFolderItems(items: readonly unknown[]): boolean;
  onFolderReorder(
    event: CdkDragDrop<readonly AgentXLibraryFolderTreeNode[]>,
    parentId: string | null
  ): void | Promise<void>;
  onFolderItemsReorder(
    folder: AgentXLibraryFolderTreeNode,
    event: CdkDragDrop<readonly unknown[]>
  ): void | Promise<void>;
  onFolderDragOver(folderId: string, event: DragEvent): void;
  onFolderDragLeave(folderId: string, event: DragEvent): void;
  onFolderDrop(folder: AgentXLibraryFolderTreeNode, event: DragEvent): void | Promise<void>;
  onFolderContextDragStart(folder: AgentXLibraryFolderTreeNode, event: DragEvent): void;
  onFolderContextDragEnd(): void;
}

@Component({
  selector: 'nxt1-agent-x-library-folder-tree',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    NxtIconComponent,
    AgentXContextDragDirective,
    AgentXLibraryItemRowComponent,
    AgentXShareAccessPanelComponent,
  ],
  template: `
    <div class="agent-x-library-folder-tree">
      <ng-template #folderTreeTemplate let-folders let-isNested="isNested" let-parentId="parentId">
        <div
          class="film-playlist-folder-list"
          cdkDropList
          cdkDropListOrientation="vertical"
          [cdkDropListData]="folders"
          [cdkDropListDisabled]="!controller().canReorderFolders(folders)"
          (cdkDropListDropped)="controller().onFolderReorder($event, parentId)"
        >
          @for (folder of folders; track folder.id) {
            <section
              class="film-playlist-folder"
              cdkDrag
              [cdkDragData]="folder"
              cdkDragLockAxis="y"
              cdkDragPreviewContainer="parent"
              [cdkDragDisabled]="folder.isUnassigned || !controller().canReorderFolders(folders)"
              (cdkDragStarted)="controller().onFolderReorderDragStart()"
              (cdkDragEnded)="controller().onFolderReorderDragEnd()"
              [class.film-playlist-folder--nested]="isNested"
              [class.film-playlist-folder--menu-open]="
                controller().isFolderMenuOpen(folder.id) ||
                controller().isReviewMenuOpenInFolder(folder)
              "
              [class.film-playlist-folder--drop-target]="
                !controller().isLibraryReorderDragActive() &&
                controller().isFolderDropTarget(folder.id)
              "
              (dragover)="controller().onFolderDragOver(folder.id, $event)"
              (dragleave)="controller().onFolderDragLeave(folder.id, $event)"
              (drop)="controller().onFolderDrop(folder, $event)"
            >
              @if (!folder.isUnassigned && controller().canReorderFolders(folders)) {
                <button
                  type="button"
                  class="film-playlist-folder__reorder-handle"
                  cdkDragHandle
                  aria-label="Reorder folder"
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
              }

              <div class="film-playlist-folder__header">
                <span class="film-playlist-folder__selection">
                  <input
                    type="checkbox"
                    class="film-playbook-checkbox"
                    [checked]="controller().areAllFolderItemsSelected(folder)"
                    [indeterminate]="controller().isSomeFolderItemsSelected(folder)"
                    [attr.aria-label]="'Select folder ' + folder.name"
                    (click)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                    (change)="controller().onToggleFolderSelection(folder, $event)"
                  />
                </span>

                <button
                  type="button"
                  class="film-playlist-folder__toggle"
                  [nxtAgentXContextDrag]="controller().getFolderDragContexts(folder)"
                  [nxtAgentXContextDragDisabled]="controller().isLibraryReorderDragActive()"
                  [attr.draggable]="
                    folder.isUnassigned || controller().isLibraryReorderDragActive() ? null : true
                  "
                  [attr.aria-expanded]="controller().isFolderExpanded(folder.id)"
                  (dragstart)="controller().onFolderContextDragStart(folder, $event)"
                  (dragend)="controller().onFolderContextDragEnd()"
                  (click)="controller().toggleFolder(folder.id, $event)"
                >
                  <span class="film-playlist-folder__chevron" aria-hidden="true">
                    @if (controller().isFolderExpanded(folder.id)) {
                      <nxt1-icon name="chevronDown" [size]="16"></nxt1-icon>
                    } @else {
                      <nxt1-icon name="chevronRight" [size]="16"></nxt1-icon>
                    }
                  </span>
                  <nxt1-icon name="folder" [size]="16" class="film-playlist-folder__icon" />
                  <span class="film-playlist-folder__name-row">
                    <span class="film-playlist-folder__name">{{ folder.name }}</span>
                    @if (controller().isFolderShared(folder)) {
                      <span class="film-playlist-folder__shared-indicator" title="Shared folder">
                        <nxt1-icon name="people" [size]="13"></nxt1-icon>
                      </span>
                    }
                  </span>
                  <span class="film-playlist-folder__count">{{ folderContentCount(folder) }}</span>
                </button>

                @if (!folder.isUnassigned) {
                  <div class="film-playlist-folder__menu-anchor">
                    <button
                      type="button"
                      class="film-list-item__menu-btn film-playlist-folder__menu-btn"
                      aria-label="Folder options"
                      [attr.aria-expanded]="controller().isFolderMenuOpen(folder.id)"
                      aria-haspopup="menu"
                      (click)="controller().openFolderMenu($event, folder)"
                    >
                      <nxt1-icon name="moreHorizontal" [size]="18"></nxt1-icon>
                    </button>

                    @if (controller().isFolderMenuOpen(folder.id)) {
                      <div
                        class="film-list-item__menu film-playlist-folder__menu"
                        [class.film-playlist-folder__menu--open-up]="
                          controller().shouldOpenFolderMenuUpward(folder.id)
                        "
                        role="menu"
                        aria-label="Folder options"
                        (click)="$event.stopPropagation()"
                      >
                        @if (controller().isFolderBeingEdited(folder.id)) {
                          <div class="film-list-item__menu-rename">
                            <label
                              class="film-list-item__menu-label"
                              for="shared-folder-rename-{{ folder.id }}"
                            >
                              Rename folder
                            </label>
                            <input
                              id="shared-folder-rename-{{ folder.id }}"
                              type="text"
                              class="film-list-item__menu-input"
                              maxlength="80"
                              [value]="controller().getRenameDraft()"
                              (input)="controller().onRenameInput($any($event.target).value)"
                              (keydown.enter)="controller().confirmRename(folder, $event)"
                              (keydown.escape)="controller().cancelRename($event)"
                            />
                            <div class="film-list-item__menu-actions">
                              <button
                                type="button"
                                class="film-list-item__menu-action film-list-item__menu-action--primary"
                                (click)="controller().confirmRename(folder, $event)"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                class="film-list-item__menu-action"
                                (click)="controller().cancelRename($event)"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        } @else if (controller().isFolderBeingShared(folder.id)) {
                          <nxt1-agent-x-share-access-panel
                            [itemId]="folder.id"
                            [teamId]="controller().getFolderTeamId(folder)"
                            [organizationId]="controller().getFolderOrganizationId(folder)"
                            [principalType]="controller().getFolderSharePrincipalType()"
                            [permission]="controller().getFolderSharePermission()"
                            [query]="controller().getShareCandidateQuery()"
                            [loading]="controller().isShareCandidatesLoading()"
                            [candidates]="controller().getShareCandidates()"
                            [grants]="controller().getFolderShareGrants(folder)"
                            [selectedUserIds]="controller().getFolderSelectedShareUserIds()"
                            [submitDisabled]="!controller().canSubmitFolderShare(folder)"
                            [emptyAccessMessage]="'Only you can access this folder right now.'"
                            (principalTypeChange)="controller().onFolderShareTypeChange($event)"
                            (permissionChange)="controller().onFolderSharePermissionChange($event)"
                            (queryChange)="controller().onShareCandidateQueryInput($event)"
                            (candidateToggled)="
                              controller().toggleFolderShareCandidate(folder, $event)
                            "
                            (grantPermissionChange)="
                              controller().changeFolderShareGrantPermission(folder, $event)
                            "
                            (removeGrant)="controller().removeFolderShare(folder, $event)"
                            (submit)="controller().confirmShareFolder(folder, $event)"
                            (cancel)="controller().cancelShareFolder($event)"
                          />
                        } @else if (controller().isFolderDeleteConfirming(folder.id)) {
                          <div class="film-list-item__menu-confirm">
                            <p class="film-list-item__menu-confirm-text">
                              {{ controller().getDeleteFolderConfirmText(folder) }}
                            </p>
                            <div class="film-list-item__menu-actions">
                              <button
                                type="button"
                                class="film-list-item__menu-action film-list-item__menu-action--danger"
                                (click)="controller().confirmDeleteFolder(folder, $event)"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                class="film-list-item__menu-action"
                                (click)="controller().cancelDeleteFolder($event)"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        } @else {
                          @if (controller().canRenameFolder(folder)) {
                            <button
                              type="button"
                              class="film-list-item__menu-action"
                              role="menuitem"
                              (click)="controller().startRenameFolder(folder, $event)"
                            >
                              Rename
                            </button>
                          }
                          <button
                            type="button"
                            class="film-list-item__menu-action"
                            role="menuitem"
                            (click)="controller().startCreateSubfolder(folder, $event)"
                          >
                            Add subfolder
                          </button>
                          @if (controller().canManageFolderSharing(folder)) {
                            <button
                              type="button"
                              class="film-list-item__menu-action"
                              role="menuitem"
                              (click)="controller().startShareFolder(folder, $event)"
                            >
                              Share
                            </button>
                          }
                          @if (controller().canDeleteFolder(folder)) {
                            <button
                              type="button"
                              class="film-list-item__menu-action film-list-item__menu-action--danger"
                              role="menuitem"
                              (click)="controller().startDeleteFolder(folder, $event)"
                            >
                              Delete folder
                            </button>
                          }
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              @if (controller().isFolderExpanded(folder.id)) {
                <div class="film-playlist-folder__dropzone">
                  @if (
                    controller().isCreatingFolder() &&
                    controller().getCreatingSubfolderParentId() === folder.id
                  ) {
                    <div class="film-playlist-create" role="group" aria-label="Create subfolder">
                      <input
                        type="text"
                        class="film-playlist-create__input"
                        placeholder="Subfolder name"
                        maxlength="80"
                        [value]="controller().getCreateDraft()"
                        (input)="controller().onCreateDraftInput($any($event.target).value)"
                        (keydown.enter)="controller().onCreateConfirm($event)"
                        (keydown.escape)="controller().onCreateCancel($event)"
                      />
                      <button
                        type="button"
                        class="film-playlist-create__btn film-playlist-create__btn--primary"
                        (click)="controller().onCreateConfirm($event)"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        class="film-playlist-create__btn"
                        (click)="controller().onCreateCancel($event)"
                      >
                        Cancel
                      </button>
                    </div>
                  }

                  @if (folder.children.length > 0) {
                    <div class="film-playlist-folder__children">
                      <ng-container
                        [ngTemplateOutlet]="folderTreeTemplate"
                        [ngTemplateOutletContext]="{
                          $implicit: folder.children,
                          isNested: true,
                          parentId: folder.id,
                        }"
                      ></ng-container>
                    </div>
                  }

                  @if (
                    folder.items.length === 0 &&
                    folder.children.length === 0 &&
                    controller().getCreatingSubfolderParentId() !== folder.id
                  ) {
                    <div class="film-playlist-folder__empty">{{ emptyFolderLabel() }}</div>
                  }

                  <div
                    class="film-playlist-folder__review-list"
                    cdkDropList
                    cdkDropListOrientation="vertical"
                    [cdkDropListData]="folder.items"
                    [cdkDropListDisabled]="!controller().canReorderFolderItems(folder.items)"
                    (cdkDropListDropped)="controller().onFolderItemsReorder(folder, $event)"
                  >
                    @for (item of folder.items; track trackItem(item, $index)) {
                      <nxt1-agent-x-library-item-row
                        cdkDrag
                        [cdkDragData]="item"
                        cdkDragLockAxis="y"
                        cdkDragPreviewContainer="parent"
                        [cdkDragDisabled]="!controller().canReorderFolderItems(folder.items)"
                        [menuOpen]="controller().isItemMenuOpen(item)"
                        (cdkDragStarted)="controller().onFolderItemDragStart()"
                        (cdkDragEnded)="controller().onFolderItemDragEnd()"
                      >
                        @if (controller().canReorderFolderItems(folder.items)) {
                          <button
                            type="button"
                            class="film-list-item__reorder-handle"
                            cdkDragHandle
                            aria-label="Reorder item"
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
                        }

                        <ng-container
                          [ngTemplateOutlet]="itemTemplate()"
                          [ngTemplateOutletContext]="{ $implicit: item, folder: folder }"
                        ></ng-container>
                      </nxt1-agent-x-library-item-row>
                    }
                  </div>
                </div>
              }
            </section>
          }
        </div>
      </ng-template>

      <ng-container
        [ngTemplateOutlet]="folderTreeTemplate"
        [ngTemplateOutletContext]="{
          $implicit: folders(),
          isNested: false,
          parentId: null,
        }"
      ></ng-container>
    </div>
  `,
  styles: [
    `
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

      .agent-x-library-folder-tree .film-playlist-folder {
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

      .agent-x-library-folder-tree .film-playlist-folder--drop-target {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .agent-x-library-folder-tree .film-playlist-folder--menu-open {
        z-index: 340;
      }

      .agent-x-library-folder-tree
        .film-playlist-folder--menu-open
        > .film-playlist-folder__header {
        z-index: 360;
      }

      .agent-x-library-folder-tree .film-playlist-folder--nested {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 72%, transparent);
      }

      .agent-x-library-folder-tree .film-playlist-folder__header {
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

      .agent-x-library-folder-tree .film-playlist-folder__selection {
        width: 28px;
        min-width: 28px;
        min-height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .agent-x-library-folder-tree .film-playlist-folder__menu-anchor {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        min-height: 38px;
      }

      .agent-x-library-folder-tree .film-playlist-folder__toggle {
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

      .agent-x-library-folder-tree .film-playlist-folder__toggle:hover {
        background: var(--nxt1-color-surface-200);
      }

      .agent-x-library-folder-tree .film-playlist-folder__reorder-handle {
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

      .agent-x-library-folder-tree .film-playlist-folder__reorder-handle:hover,
      .agent-x-library-folder-tree .film-playlist-folder__reorder-handle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-text-primary) 8%, transparent);
        color: var(--nxt1-color-primary);
        outline: none;
      }

      .agent-x-library-folder-tree .film-playlist-folder__reorder-handle:active {
        cursor: grabbing;
      }

      .agent-x-library-folder-tree .film-reorder-grip {
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-auto-rows: 3px;
        gap: 2px;
      }

      .agent-x-library-folder-tree .film-reorder-grip span {
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.72;
      }

      .agent-x-library-folder-tree .film-playlist-folder__chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-secondary);
      }

      .agent-x-library-folder-tree .film-playlist-folder__icon {
        color: color-mix(in srgb, var(--nxt1-color-primary) 80%, var(--nxt1-color-text-primary));
      }

      .agent-x-library-folder-tree .film-playlist-folder .film-playlist-folder__menu-btn {
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

      .agent-x-library-folder-tree .film-list-item__menu-backdrop {
        position: fixed;
        inset: 0;
        background: transparent;
        border: 0;
        margin: 0;
        padding: 0;
        z-index: 2;
      }

      .agent-x-library-folder-tree .film-list-item__menu {
        position: absolute;
        min-width: var(--nxt1-spacing-52, 13rem);
        max-width: min(22rem, calc(100vw - 24px));
        max-height: min(70vh, 34rem);
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
        z-index: 320;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .agent-x-library-folder-tree .film-list-item__menu-action {
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

      .agent-x-library-folder-tree .film-list-item__menu-action:hover,
      .agent-x-library-folder-tree .film-list-item__menu-action:focus-visible {
        background: var(--nxt1-nav-hover-bg);
        outline: none;
      }

      .agent-x-library-folder-tree .film-list-item__menu-action:active {
        background: var(--nxt1-nav-hover-bg);
      }

      .agent-x-library-folder-tree .film-list-item__menu-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .agent-x-library-folder-tree .film-list-item__menu-action--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }

      .agent-x-library-folder-tree .film-list-item__menu-action--primary {
        color: var(--log-primary, var(--nxt1-color-primary));
      }

      .agent-x-library-folder-tree .film-list-item__menu-rename,
      .agent-x-library-folder-tree .film-list-item__menu-confirm {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .agent-x-library-folder-tree .film-list-item__menu-share-empty {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-ui-radius-default, 8px);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 55%, transparent);
        padding: 8px 10px;
      }

      .agent-x-library-folder-tree .film-list-item__menu-share-empty .film-list-item__menu-help {
        padding: 0;
      }

      .agent-x-library-folder-tree .film-list-item__menu-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        display: block;
        padding: 2px 4px 0;
      }

      .agent-x-library-folder-tree .film-list-item__menu-input {
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

      .agent-x-library-folder-tree .film-list-item__menu-input:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }

      .agent-x-library-folder-tree .film-list-item__menu-actions {
        display: flex;
        gap: 4px;
      }

      .agent-x-library-folder-tree .film-list-item__menu-actions .film-list-item__menu-action {
        justify-content: center;
      }

      .agent-x-library-folder-tree .film-list-item__menu-confirm-text {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--nxt1-nav-text);
        padding: 2px 4px;
      }

      .agent-x-library-folder-tree .film-playlist-folder__menu {
        top: calc(100% + 2px);
        right: 0;
        z-index: 380;
      }

      .agent-x-library-folder-tree .film-playlist-folder__menu--open-up {
        top: auto;
        bottom: calc(100% + 2px);
      }

      .agent-x-library-folder-tree .film-playlist-folder__name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 700;
      }

      .agent-x-library-folder-tree .film-playlist-folder__name-row {
        min-width: 0;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
      }

      .agent-x-library-folder-tree .film-playlist-folder__name-row .film-playlist-folder__name {
        flex: 1 1 auto;
        min-width: 0;
      }

      .agent-x-library-folder-tree .film-playlist-folder__shared-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-brand-primary, var(--nxt1-color-primary));
        flex: 0 0 auto;
      }

      .agent-x-library-folder-tree .film-playlist-folder__count {
        min-width: 24px;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 700;
        text-align: center;
      }

      .agent-x-library-folder-tree .film-playlist-folder__dropzone {
        display: grid;
        gap: 8px;
        padding: 0 8px 8px 12px;
        position: relative;
      }

      .agent-x-library-folder-tree .film-playlist-folder__children {
        display: grid;
        gap: 8px;
        min-width: 0;
        margin-left: 12px;
        padding-left: 12px;
        border-left: 1px solid color-mix(in srgb, var(--nxt1-color-border-subtle) 86%, transparent);
      }

      .agent-x-library-folder-tree .film-playlist-folder__review-list,
      .agent-x-library-folder-tree .film-playlist-folder-list {
        display: grid;
        gap: 8px;
        min-width: 0;
      }

      .agent-x-library-folder-tree .film-playlist-folder__review-list > *,
      .agent-x-library-folder-tree .film-playlist-folder-list > * {
        min-width: 0;
      }

      .agent-x-library-folder-tree .film-playlist-folder__empty {
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: 8px;
        padding: 10px;
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        text-align: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 70%, transparent);
      }

      .agent-x-library-folder-tree .cdk-drag-preview.film-playlist-folder {
        box-sizing: border-box;
        border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .cdk-drag-preview.film-list-item-row,
      .cdk-drag-preview.film-playlist-folder {
        box-sizing: border-box;
        border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .agent-x-library-folder-tree .cdk-drag-placeholder {
        opacity: 0.24;
      }

      .agent-x-library-folder-tree
        .film-playlist-folder-list.cdk-drop-list-dragging
        .film-playlist-folder:not(.cdk-drag-placeholder) {
        transition: transform 180ms ease;
      }

      .agent-x-library-folder-tree
        .film-playlist-folder__review-list.cdk-drop-list-dragging
        .film-list-item-row:not(.cdk-drag-placeholder) {
        transition: transform 180ms ease;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXLibraryFolderTreeComponent {
  readonly folders = input.required<readonly AgentXLibraryFolderTreeNode[]>();
  readonly controller = input.required<AgentXLibraryFolderTreeController>();
  readonly itemTemplate = input.required<TemplateRef<AgentXLibraryFolderItemContext>>();
  readonly emptyFolderLabel = input('Drop items here');

  protected trackItem(item: unknown, index: number): string | number {
    if (typeof item === 'object' && item !== null && 'id' in item) {
      const value = (item as { readonly id?: unknown }).id;
      if (typeof value === 'string' || typeof value === 'number') {
        return value;
      }
    }

    return index;
  }

  protected folderContentCount(folder: AgentXLibraryFolderTreeNode): number {
    const childFolders = folder.children.length;
    const childFiles = folder.items.length;
    const nestedContent = folder.children.reduce(
      (total, childFolder) => total + this.folderContentCount(childFolder),
      0
    );

    return childFolders + childFiles + nestedContent;
  }
}
