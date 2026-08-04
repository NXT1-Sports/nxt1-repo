import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LowerCasePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import type {
  MembershipEditorMode,
  MembershipEditorItem,
  UpdateMembershipRequest,
} from '@nxt1/core';
import { formatPositionDisplay, getPositionGroupsForSport } from '@nxt1/core/constants';
import { NxtIconComponent } from '../../components/icon';
import { NxtSheetHeaderComponent } from '../../components/bottom-sheet/sheet-header.component';
import { NxtAvatarComponent } from '../../components/avatar';
import { NxtFormFieldComponent } from '../../components/form-field';
import { NxtModalService } from '../../services/modal';
import { NxtToastService } from '../../services/toast/toast.service';
import { ManageTeamMembershipService } from '../manage-team-membership.service';

type FilterTab = 'all' | 'roster' | 'staff' | 'pending';
type MembershipEditorPresentation = 'sheet' | 'overlay';

const MAX_POSITIONS = 5;

@Component({
  selector: 'nxt1-manage-team-membership-editor',
  standalone: true,
  imports: [
    FormsModule,
    LowerCasePipe,
    NgTemplateOutlet,
    IonContent,
    NxtIconComponent,
    NxtSheetHeaderComponent,
    NxtAvatarComponent,
    NxtFormFieldComponent,
  ],
  template: `
    <!-- ══════════════════════════════════════════
         Shared sheet header — matches Manage Team
         ══════════════════════════════════════════ -->
    <nxt1-sheet-header
      title="Manage Members"
      closePosition="left"
      [centerTitle]="true"
      [showBorder]="true"
      [dismissOnClose]="false"
      (closeSheet)="handleClose()"
    />

    <ng-template #editorContent>
      <!-- ══════════════════════════════════════════
           Segment tabs
           ══════════════════════════════════════════ -->
      <div class="nxt1-mm__chrome">
        <div class="nxt1-mm__segments" role="tablist">
          @for (tab of visibleTabs(); track tab) {
            <button
              type="button"
              role="tab"
              class="nxt1-mm__seg-pill"
              [class.nxt1-mm__seg-pill--active]="activeTab() === tab"
              [attr.aria-selected]="activeTab() === tab"
              (click)="setActiveTab(tab)"
            >
              <span class="nxt1-mm__seg-label">{{ labelForTab(tab) }}</span>
              @if (badgeCount(tab) > 0) {
                <span class="nxt1-mm__seg-badge">{{ badgeCount(tab) }}</span>
              }
            </button>
          }
        </div>

        @if (!service.loading() && !service.error() && filteredItems().length > 0) {
          <section class="nxt1-mm__toolbar">
            <div class="nxt1-mm__toolbar-top">
              <div class="nxt1-mm__toolbar-left">
                <button
                  type="button"
                  class="nxt1-mm__toolbar-select"
                  [class.nxt1-mm__toolbar-select--active]="allVisibleSelected()"
                  [disabled]="selectionBusy()"
                  (click)="toggleSelectAllVisible()"
                >
                  <span class="nxt1-mm__toolbar-select-box" aria-hidden="true">
                    @if (allVisibleSelected()) {
                      <nxt1-icon name="checkmark" [size]="12" />
                    }
                  </span>
                  {{ allVisibleSelected() ? 'Clear All' : 'Select All' }}
                </button>
              </div>

              <div class="nxt1-mm__toolbar-actions">
                @if (canEditSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn"
                    [disabled]="selectionBusy()"
                    (click)="editSelectedMember()"
                  >
                    Edit
                  </button>
                }

                @if (canApproveSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--approve"
                    [disabled]="selectionBusy()"
                    (click)="approveSelectedMembers()"
                  >
                    Approve
                  </button>
                }

                @if (canGrantAdminSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--primary"
                    [disabled]="selectionBusy()"
                    (click)="grantAdminToSelected()"
                  >
                    Make Admin
                  </button>
                }

                @if (canRevokeAdminSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--warning"
                    [disabled]="selectionBusy()"
                    (click)="revokeAdminFromSelected()"
                  >
                    Remove Admin
                  </button>
                }

                @if (canEnableBudgetSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--primary"
                    [disabled]="selectionBusy()"
                    (click)="enableBudgetForSelected()"
                  >
                    Budget On
                  </button>
                }

                @if (canDisableBudgetSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--warning"
                    [disabled]="selectionBusy()"
                    (click)="disableBudgetForSelected()"
                  >
                    Budget Off
                  </button>
                }

                @if (canRemoveSelection()) {
                  <button
                    type="button"
                    class="nxt1-mm__toolbar-btn nxt1-mm__toolbar-btn--danger"
                    [disabled]="selectionBusy()"
                    (click)="removeSelectedMembers()"
                  >
                    Remove
                  </button>
                }
              </div>
            </div>
          </section>
        }
      </div>

      <div class="nxt1-mm__body">
        @if (service.loading()) {
          <div class="nxt1-mm__skeleton-list">
            @for (i of skeletonRows; track i) {
              <div class="nxt1-mm__skeleton-row">
                <div class="nxt1-mm__skel nxt1-mm__skel--avatar"></div>
                <div class="nxt1-mm__skel-body">
                  <div class="nxt1-mm__skel nxt1-mm__skel--name"></div>
                  <div class="nxt1-mm__skel nxt1-mm__skel--meta"></div>
                </div>
              </div>
            }
          </div>
        } @else if (service.error()) {
          <div class="nxt1-mm__state-block">
            <div class="nxt1-mm__state-icon">
              <nxt1-icon name="alertCircle" [size]="22" />
            </div>
            <p class="nxt1-mm__state-msg">{{ service.error() }}</p>
            <button type="button" class="nxt1-mm__retry-btn" (click)="reload()">Try Again</button>
          </div>
        } @else if (filteredItems().length === 0) {
          <div class="nxt1-mm__state-block">
            <div class="nxt1-mm__state-icon">
              <nxt1-icon name="users" [size]="22" />
            </div>
            <p class="nxt1-mm__state-msg">No {{ labelForTab(activeTab()) | lowercase }} members.</p>
          </div>
        } @else {
          <ul class="nxt1-mm__list" role="list">
            @for (member of filteredItems(); track member.entryId) {
              <li
                class="nxt1-mm__row"
                [class.nxt1-mm__row--selected]="isSelected(member.entryId)"
                [class.nxt1-mm__row--editing]="editingEntryId() === member.entryId"
              >
                <!-- Selection + avatar + identity -->
                <div class="nxt1-mm__row-main">
                  <button
                    type="button"
                    class="nxt1-mm__selector"
                    [class.nxt1-mm__selector--selected]="isSelected(member.entryId)"
                    role="checkbox"
                    [attr.aria-checked]="isSelected(member.entryId)"
                    [attr.aria-label]="'Select ' + memberDisplayName(member)"
                    [disabled]="selectionBusy()"
                    (click)="toggleSelection(member)"
                  >
                    <span class="nxt1-mm__selector-box" aria-hidden="true">
                      @if (isSelected(member.entryId)) {
                        <nxt1-icon name="checkmark" [size]="12" />
                      }
                    </span>
                  </button>

                  <nxt1-avatar
                    [name]="memberDisplayName(member)"
                    [src]="member.profileImgs?.[0] ?? null"
                    size="sm"
                  />

                  <div class="nxt1-mm__identity">
                    <span class="nxt1-mm__name">{{ memberDisplayName(member) }}</span>
                    <span class="nxt1-mm__meta">
                      @if (member.role) {
                        {{ formatRole(member.role) }}
                      }
                      @if (member.membershipKind === 'roster' && member.positions?.length) {
                        &middot;
                        {{ member.positions!.join(' / ') }}
                      } @else if (member.membershipKind === 'staff' && member.title) {
                        &middot;
                        {{ member.title }}
                      }
                      @if (member.isPending) {
                        <span class="nxt1-mm__pending-badge">Pending</span>
                      }
                      @if (member.membershipKind === 'staff' && member.isTeamAdmin) {
                        <span class="nxt1-mm__admin-badge">Admin</span>
                      }
                      @if (
                        member.membershipKind === 'roster' && member.hasOrganizationBudgetAccess
                      ) {
                        <span class="nxt1-mm__admin-badge">Budget On</span>
                      }
                    </span>
                  </div>
                </div>

                <!-- Inline edit form -->
                @if (editingEntryId() === member.entryId) {
                  <form class="nxt1-mm__edit-form" (ngSubmit)="saveEdit(member.entryId, member)">
                    @if (member.membershipKind === 'staff') {
                      <nxt1-form-field label="Title" [inputId]="'title-' + member.entryId">
                        <input
                          [id]="'title-' + member.entryId"
                          type="text"
                          class="nxt1-input"
                          [(ngModel)]="editTitle"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="e.g. Head Coach, Assistant Coach"
                          autocomplete="off"
                        />
                      </nxt1-form-field>
                    }

                    @if (member.membershipKind === 'roster') {
                      <div class="nxt1-mm__positions-field">
                        <div class="nxt1-mm__positions-label-row">
                          <label class="nxt1-mm__positions-label">Positions</label>
                          <span class="nxt1-mm__positions-hint"
                            >{{ editPositions().length }}/{{ maxPositions }}</span
                          >
                        </div>

                        @if (editPositions().length > 0) {
                          <div class="nxt1-mm__position-pills">
                            @for (position of editPositions(); track position) {
                              <button
                                type="button"
                                class="nxt1-mm__position-pill"
                                (click)="removePosition(position)"
                                [attr.aria-label]="
                                  'Remove ' + formatPosition(position, member.sport)
                                "
                              >
                                {{ formatPosition(position, member.sport) }}
                                <svg
                                  class="nxt1-mm__position-pill-icon"
                                  viewBox="0 0 12 12"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M3 3l6 6M9 3L3 9"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-linecap="round"
                                    stroke-width="1.5"
                                  />
                                </svg>
                              </button>
                            }
                          </div>
                        }

                        @if (hasAvailablePositions(member)) {
                          <button
                            type="button"
                            class="nxt1-mm__position-trigger"
                            (click)="openPositionsPicker(member)"
                          >
                            <svg
                              class="nxt1-mm__position-trigger-icon"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                            >
                              <path
                                d="M8 3.25v9.5M3.25 8h9.5"
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-width="1.5"
                              />
                            </svg>
                            {{ editPositions().length === 0 ? 'Add positions' : 'Add more' }}
                          </button>
                        } @else {
                          <p class="nxt1-mm__positions-empty">
                            No positions available for this sport.
                          </p>
                        }
                      </div>

                      <nxt1-form-field label="Jersey #" [inputId]="'jersey-' + member.entryId">
                        <input
                          [id]="'jersey-' + member.entryId"
                          type="text"
                          class="nxt1-input"
                          [(ngModel)]="editJerseyNumber"
                          [ngModelOptions]="{ standalone: true }"
                          placeholder="e.g. 23"
                          autocomplete="off"
                        />
                      </nxt1-form-field>
                    }

                    <div class="nxt1-mm__edit-actions">
                      <button type="submit" class="nxt1-btn nxt1-btn-primary">Save</button>
                      <button
                        type="button"
                        class="nxt1-btn nxt1-btn-secondary"
                        (click)="cancelEdit()"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                }
              </li>
            }
          </ul>
        }
      </div>
    </ng-template>

    @if (isSheetPresentation()) {
      <ion-content [scrollY]="true" [scrollEvents]="true" class="nxt1-mm__content">
        <ng-container [ngTemplateOutlet]="editorContent" />
      </ion-content>
    } @else {
      <div class="nxt1-mm__scroll">
        <ng-container [ngTemplateOutlet]="editorContent" />
      </div>
    }
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════
         HOST
         ═══════════════════════════════════════════ */
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
        overflow: hidden;
      }

      .nxt1-mm__content {
        --background: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }

      /* ═══════════════════════════════════════════
         SEGMENT TABS
         ═══════════════════════════════════════════ */
      .nxt1-mm__chrome {
        position: sticky;
        top: 0;
        z-index: 2;
        background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, white);
        backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-mm__segments {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .nxt1-mm__segments::-webkit-scrollbar {
        display: none;
      }

      .nxt1-mm__seg-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        min-height: 34px;
        min-width: 92px;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        white-space: nowrap;
        flex: 1 1 0;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease;
      }

      .nxt1-mm__seg-label {
        line-height: 1;
      }

      .nxt1-mm__seg-pill--active {
        background: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__seg-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 6px;
        margin-inline-start: 2px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-500);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1;
      }

      .nxt1-mm__seg-pill--active .nxt1-mm__seg-badge {
        background: color-mix(
          in srgb,
          var(--nxt1-color-bg-primary) 18%,
          var(--nxt1-color-text-primary)
        );
        color: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__toolbar {
        display: block;
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
      }

      .nxt1-mm__toolbar-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-mm__toolbar-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-mm__toolbar-select,
      .nxt1-mm__toolbar-clear,
      .nxt1-mm__toolbar-btn {
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
      }

      .nxt1-mm__toolbar-select,
      .nxt1-mm__toolbar-clear {
        min-height: 38px;
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 0 14px;
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        white-space: nowrap;
      }

      .nxt1-mm__toolbar-select:hover,
      .nxt1-mm__toolbar-clear:hover,
      .nxt1-mm__toolbar-btn:hover {
        border-color: var(--nxt1-color-border-strong);
        transform: translateY(-1px);
      }

      .nxt1-mm__toolbar-select--active {
        background: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__toolbar-select-box {
        width: 18px;
        height: 18px;
        border: 1.5px solid currentColor;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-mm__toolbar-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
        justify-content: flex-end;
      }

      .nxt1-mm__toolbar-btn {
        min-height: 38px;
        padding: 0 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .nxt1-mm__toolbar-btn--approve {
        border-color: color-mix(in srgb, var(--nxt1-color-success) 35%, white);
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .nxt1-mm__toolbar-btn--primary {
        background: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__toolbar-btn--warning {
        border-color: color-mix(in srgb, var(--nxt1-color-warning) 38%, white);
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
      }

      .nxt1-mm__toolbar-btn--danger {
        border-color: color-mix(in srgb, var(--nxt1-color-error) 35%, white);
        background: var(--nxt1-color-errorBg);
        color: var(--nxt1-color-error);
      }

      .nxt1-mm__toolbar-btn:disabled,
      .nxt1-mm__toolbar-clear:disabled,
      .nxt1-mm__toolbar-select:disabled {
        opacity: 0.48;
        cursor: not-allowed;
        transform: none;
      }

      /* ═══════════════════════════════════════════
         SCROLL CONTAINER
         ═══════════════════════════════════════════ */
      .nxt1-mm__body {
        min-height: 100%;
        overscroll-behavior: contain;
        padding-bottom: calc(var(--nxt1-spacing-6) + env(safe-area-inset-bottom, 0px));
      }

      /* ═══════════════════════════════════════════
         MEMBER LIST
         ═══════════════════════════════════════════ */
      .nxt1-mm__list {
        list-style: none;
        margin: 0;
        padding: var(--nxt1-spacing-2) 0;
      }

      .nxt1-mm__row {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        transition:
          background 0.12s ease,
          border-color 0.12s ease;
      }

      .nxt1-mm__row:last-child {
        border-bottom: none;
      }

      .nxt1-mm__row--selected {
        background: color-mix(in srgb, var(--nxt1-color-primary) 6%, var(--nxt1-color-bg-primary));
      }

      .nxt1-mm__row--editing {
        background: transparent;
      }

      .nxt1-mm__row-main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-mm__selector {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        flex-shrink: 0;
      }

      .nxt1-mm__selector-box {
        width: 20px;
        height: 20px;
        border: 1.5px solid var(--nxt1-color-border-strong);
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-bg-primary);
        color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .nxt1-mm__selector--selected .nxt1-mm__selector-box {
        background: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-bg-primary);
      }

      .nxt1-mm__selector:disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }

      .nxt1-mm__identity {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .nxt1-mm__name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nxt1-mm__meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }

      .nxt1-mm__pending-badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .nxt1-mm__admin-badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      /* ═══════════════════════════════════════════
         INLINE EDIT FORM
         ═══════════════════════════════════════════ */
      .nxt1-mm__edit-form {
        margin-top: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        border: 1px solid var(--nxt1-color-border-subtle);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-100);
      }

      :host ::ng-deep .nxt1-mm__edit-form nxt1-form-field .nxt1-form-field {
        gap: var(--nxt1-spacing-1-5, 6px);
      }

      :host ::ng-deep .nxt1-mm__edit-form nxt1-form-field .nxt1-form-label {
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-mm__positions-field {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-mm__positions-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-mm__positions-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-mm__positions-hint {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary, var(--nxt1-color-text-secondary));
      }

      .nxt1-mm__position-pills {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-mm__position-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .nxt1-mm__position-pill:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-mm__position-pill-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      .nxt1-mm__position-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        min-height: 42px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .nxt1-mm__position-trigger:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-mm__position-trigger-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .nxt1-mm__positions-empty {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-mm__edit-actions {
        display: flex;
        gap: var(--nxt1-spacing-2-5);
      }

      .nxt1-mm__edit-actions .nxt1-btn {
        flex: 1;
        width: auto;
        border-radius: var(--nxt1-radius-full, 9999px);
        min-height: 40px;
      }

      /* ═══════════════════════════════════════════
         EMPTY / ERROR STATE
         ═══════════════════════════════════════════ */
      .nxt1-mm__state-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-12) var(--nxt1-spacing-6);
        text-align: center;
      }

      .nxt1-mm__state-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-mm__state-msg {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .nxt1-mm__retry-btn {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-mm__retry-btn:hover {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      /* ═══════════════════════════════════════════
         LOADING SKELETON
         ═══════════════════════════════════════════ */
      .nxt1-mm__skeleton-list {
        padding: var(--nxt1-spacing-2) 0;
      }

      .nxt1-mm__skeleton-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-mm__skeleton-row:last-child {
        border-bottom: none;
      }

      .nxt1-mm__skel-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1-5);
      }

      .nxt1-mm__skel {
        border-radius: var(--nxt1-radius-sm);
        background: var(--nxt1-color-surface-200);
        animation: nxt1-mm-shimmer 1.4s ease-in-out infinite;
      }

      .nxt1-mm__skel--avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      .nxt1-mm__skel--name {
        height: 14px;
        width: 55%;
      }

      .nxt1-mm__skel--meta {
        height: 11px;
        width: 38%;
      }

      @keyframes nxt1-mm-shimmer {
        0% {
          opacity: 0.5;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0.5;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamMembershipEditorComponent implements OnInit, OnDestroy {
  readonly teamId = input.required<string>();
  readonly mode = input<MembershipEditorMode>('all');
  readonly initialFilter = input<FilterTab | null>(null);
  readonly presentation = input<MembershipEditorPresentation>('overlay');
  readonly close = output<{ changed: boolean }>();

  protected readonly service = inject(ManageTeamMembershipService);
  private readonly modalController = inject(ModalController, { optional: true });
  private readonly modalService = inject(NxtModalService);
  private readonly toast = inject(NxtToastService);
  protected readonly isSheetPresentation = computed(() => this.presentation() === 'sheet');

  protected readonly activeTab = signal<FilterTab>('roster');
  protected readonly editingEntryId = signal<string | null>(null);
  protected readonly selectedEntryIds = signal<readonly string[]>([]);
  protected readonly batchAction = signal<string | null>(null);
  private readonly hasChanges = signal(false);
  protected editTitle = '';
  protected readonly editPositions = signal<string[]>([]);
  protected editJerseyNumber = '';
  protected readonly maxPositions = MAX_POSITIONS;

  protected readonly skeletonRows = [1, 2, 3, 4, 5];
  protected readonly rosterMembers = computed(() => this.service.rosterItems());
  protected readonly organizationBudgetAccess = computed(
    () =>
      this.service.organizationBudgetAccess() ?? {
        enabledForAllAthletes: true,
        enabledAthleteUserIds: [],
      }
  );
  protected readonly managesOrganizationBudgetPerAthlete = computed(
    () => !this.organizationBudgetAccess().enabledForAllAthletes
  );
  protected readonly updatingOrganizationBudgetAccess = computed(
    () => this.service.pendingAction() === 'update:organization-budget-access'
  );

  protected readonly visibleTabs = computed<readonly FilterTab[]>(() => {
    const mode = this.mode();
    if (mode === 'roster') return ['roster', 'pending'];
    if (mode === 'staff') return ['staff', 'pending'];
    return ['roster', 'staff', 'pending'];
  });

  protected readonly filteredItems = computed(() => {
    const tab = this.activeTab();
    const items = this.service.items();
    if (tab === 'pending') return items.filter((item) => item.isPending);
    if (tab === 'roster') return items.filter((item) => item.membershipKind === 'roster');
    if (tab === 'staff') return items.filter((item) => item.membershipKind === 'staff');
    return items;
  });
  protected readonly selectedMembers = computed(() => {
    const selectedIds = new Set(this.selectedEntryIds());
    return this.filteredItems().filter((member) => selectedIds.has(member.entryId));
  });
  protected readonly selectionCount = computed(() => this.selectedMembers().length);
  protected readonly allVisibleSelected = computed(() => {
    const visibleMembers = this.filteredItems();
    if (visibleMembers.length === 0) return false;
    const selectedIds = new Set(this.selectedEntryIds());
    return visibleMembers.every((member) => selectedIds.has(member.entryId));
  });
  protected readonly singleSelectedMember = computed(() => {
    const members = this.selectedMembers();
    return members.length === 1 ? members[0] : null;
  });
  protected readonly selectionBusy = computed(
    () => this.batchAction() !== null || this.service.pendingAction() !== null
  );
  protected readonly canEditSelection = computed(
    () => this.singleSelectedMember() !== null && !this.selectionBusy()
  );
  protected readonly canApproveSelection = computed(() => {
    const members = this.selectedMembers();
    return (
      !this.selectionBusy() && members.length > 0 && members.every((member) => member.isPending)
    );
  });
  protected readonly canRemoveSelection = computed(
    () => !this.selectionBusy() && this.selectionCount() > 0
  );
  protected readonly canGrantAdminSelection = computed(() => {
    const members = this.selectedMembers();
    return (
      !this.selectionBusy() &&
      this.service.currentUserIsTeamAdmin() &&
      members.length > 0 &&
      members.every(
        (member) =>
          member.membershipKind === 'staff' &&
          !member.isPending &&
          !!member.userId &&
          member.isTeamAdmin !== true
      )
    );
  });
  protected readonly canRevokeAdminSelection = computed(() => {
    const members = this.selectedMembers();
    return (
      !this.selectionBusy() &&
      this.service.currentUserIsTeamAdmin() &&
      members.length > 0 &&
      members.every(
        (member) =>
          member.membershipKind === 'staff' &&
          !member.isPending &&
          !!member.userId &&
          member.isTeamAdmin === true
      )
    );
  });
  protected readonly canEnableBudgetSelection = computed(() => {
    const members = this.selectedMembers();
    return (
      !this.selectionBusy() &&
      this.managesOrganizationBudgetPerAthlete() &&
      members.length > 0 &&
      members.every(
        (member) =>
          member.membershipKind === 'roster' &&
          !!member.userId &&
          member.hasOrganizationBudgetAccess !== true
      )
    );
  });
  protected readonly canDisableBudgetSelection = computed(() => {
    const members = this.selectedMembers();
    return (
      !this.selectionBusy() &&
      this.managesOrganizationBudgetPerAthlete() &&
      members.length > 0 &&
      members.every(
        (member) =>
          member.membershipKind === 'roster' &&
          !!member.userId &&
          member.hasOrganizationBudgetAccess === true
      )
    );
  });
  ngOnInit(): void {
    const seed = this.initialFilter();
    if (seed && this.visibleTabs().includes(seed)) {
      this.activeTab.set(seed);
    } else {
      this.activeTab.set(this.visibleTabs()[0] ?? 'all');
    }
    void this.service.loadMembership(this.teamId(), this.mode());
  }

  ngOnDestroy(): void {
    this.service.reset();
  }

  protected labelForTab(tab: FilterTab): string {
    if (tab === 'all') return 'All';
    if (tab === 'roster') return 'Players';
    if (tab === 'staff') return 'Staff';
    return 'Pending';
  }

  protected badgeCount(tab: FilterTab): number {
    const items = this.service.items();
    if (tab === 'pending') return items.filter((item) => item.isPending).length;
    if (tab === 'roster') return items.filter((item) => item.membershipKind === 'roster').length;
    if (tab === 'staff') return items.filter((item) => item.membershipKind === 'staff').length;
    return items.length;
  }

  protected memberDisplayName(member: MembershipEditorItem): string {
    if (member.displayName) return member.displayName;
    const first = member.firstName ?? '';
    const last = member.lastName ?? '';
    return (first + ' ' + last).trim() || 'Unknown';
  }

  protected async reload(): Promise<void> {
    await this.service.loadMembership(this.teamId(), this.mode());
  }

  protected setActiveTab(tab: FilterTab): void {
    if (this.activeTab() === tab) {
      return;
    }

    this.activeTab.set(tab);
    this.clearSelection();
  }

  protected isSelected(entryId: string): boolean {
    return this.selectedEntryIds().includes(entryId);
  }

  protected toggleSelection(member: MembershipEditorItem): void {
    if (this.selectionBusy()) {
      return;
    }

    const nextSelectedIds = new Set(this.selectedEntryIds());
    if (nextSelectedIds.has(member.entryId)) {
      nextSelectedIds.delete(member.entryId);
    } else {
      nextSelectedIds.add(member.entryId);
    }

    this.selectedEntryIds.set(Array.from(nextSelectedIds));
    this.syncEditStateToSelection();
  }

  protected toggleSelectAllVisible(): void {
    if (this.selectionBusy()) {
      return;
    }

    if (this.allVisibleSelected()) {
      this.clearSelection();
      return;
    }

    this.selectedEntryIds.set(this.filteredItems().map((member) => member.entryId));
    this.syncEditStateToSelection();
  }

  protected clearSelection(): void {
    this.selectedEntryIds.set([]);
    this.syncEditStateToSelection();
  }

  protected editSelectedMember(): void {
    const member = this.singleSelectedMember();
    if (!member) {
      return;
    }

    this.startEdit(member);
  }

  protected async approveSelectedMembers(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (members.length === 0 || !members.every((member) => member.isPending)) {
      return;
    }

    this.batchAction.set('approve-selected');
    let approvedCount = 0;

    try {
      for (const member of members) {
        const changed = await this.service.approveMember(member.entryId);
        if (changed) {
          approvedCount += 1;
        }
      }
    } finally {
      this.batchAction.set(null);
    }

    if (approvedCount > 0) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        approvedCount === members.length
          ? `Approved ${approvedCount} ${approvedCount === 1 ? 'member' : 'members'}`
          : `Approved ${approvedCount} of ${members.length} members`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to approve selected members');
  }

  protected async removeSelectedMembers(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (members.length === 0) {
      return;
    }

    const confirmed = await this.modalService.confirm({
      title: members.length === 1 ? 'Remove Member?' : `Remove ${members.length} Members?`,
      message:
        members.length === 1
          ? 'This will remove the selected member from the team.'
          : 'This will remove all selected members from the team.',
      confirmText: members.length === 1 ? 'Remove' : 'Remove Members',
      cancelText: 'Cancel',
      destructive: true,
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    this.batchAction.set('remove-selected');
    let removedCount = 0;

    try {
      for (const member of members) {
        const changed = await this.service.removeMember(member.entryId);
        if (changed) {
          removedCount += 1;
        }
      }
    } finally {
      this.batchAction.set(null);
    }

    if (removedCount > 0) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        removedCount === members.length
          ? `Removed ${removedCount} ${removedCount === 1 ? 'member' : 'members'}`
          : `Removed ${removedCount} of ${members.length} members`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to remove selected members');
  }

  protected async grantAdminToSelected(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (!this.canGrantAdminSelection()) {
      return;
    }

    if (members.length === 1) {
      const changed = await this.toggleAdminAccess(members[0]);
      if (changed) {
        this.clearSelection();
      }
      return;
    }

    const confirmed = await this.modalService.confirm({
      title: 'Make Selected Staff Admins?',
      message: `Grant team admin access to ${members.length} selected staff members?`,
      confirmText: 'Make Admins',
      cancelText: 'Cancel',
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    this.batchAction.set('grant-admin-selected');
    let updatedCount = 0;

    try {
      for (const member of members) {
        const changed = await this.service.updateAdminAccess(member.entryId, true);
        if (changed) {
          updatedCount += 1;
        }
      }
    } finally {
      this.batchAction.set(null);
    }

    if (updatedCount > 0) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        updatedCount === members.length
          ? `${updatedCount} staff ${updatedCount === 1 ? 'member is' : 'members are'} now admins`
          : `Updated admin access for ${updatedCount} of ${members.length} staff members`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to update admin access');
  }

  protected async revokeAdminFromSelected(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (!this.canRevokeAdminSelection()) {
      return;
    }

    if (members.length === 1) {
      const changed = await this.toggleAdminAccess(members[0]);
      if (changed) {
        this.clearSelection();
      }
      return;
    }

    const confirmed = await this.modalService.confirm({
      title: 'Remove Admin Access?',
      message: `Remove team admin access from ${members.length} selected staff members?`,
      confirmText: 'Remove Admin Access',
      cancelText: 'Cancel',
      destructive: true,
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    this.batchAction.set('revoke-admin-selected');
    let updatedCount = 0;

    try {
      for (const member of members) {
        const changed = await this.service.updateAdminAccess(member.entryId, false);
        if (changed) {
          updatedCount += 1;
        }
      }
    } finally {
      this.batchAction.set(null);
    }

    if (updatedCount > 0) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        updatedCount === members.length
          ? `Removed admin access from ${updatedCount} ${updatedCount === 1 ? 'member' : 'members'}`
          : `Removed admin access from ${updatedCount} of ${members.length} members`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to update admin access');
  }

  protected async enableBudgetForSelected(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (!this.canEnableBudgetSelection()) {
      return;
    }

    if (members.length === 1) {
      const changed = await this.toggleAthleteOrganizationBudgetAccess(members[0]);
      if (changed) {
        this.clearSelection();
      }
      return;
    }

    const confirmed = await this.modalService.confirm({
      title: 'Enable Org Budget?',
      message: `Allow ${members.length} selected athletes to charge usage to the organization budget?`,
      confirmText: 'Enable Budget',
      cancelText: 'Cancel',
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    const current = this.organizationBudgetAccess();
    const nextEnabledAthleteUserIds = new Set(current.enabledAthleteUserIds);
    for (const member of members) {
      if (member.userId) {
        nextEnabledAthleteUserIds.add(member.userId);
      }
    }

    this.batchAction.set('enable-budget-selected');
    const changed = await this.service.updateOrganizationBudgetAccess({
      enabledForAllAthletes: false,
      enabledAthleteUserIds: Array.from(nextEnabledAthleteUserIds),
    });
    this.batchAction.set(null);

    if (changed) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        `${members.length} ${members.length === 1 ? 'athlete can' : 'athletes can'} now use org budget`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to update athlete budget access');
  }

  protected async disableBudgetForSelected(): Promise<void> {
    const members = [...this.selectedMembers()];
    if (!this.canDisableBudgetSelection()) {
      return;
    }

    if (members.length === 1) {
      const changed = await this.toggleAthleteOrganizationBudgetAccess(members[0]);
      if (changed) {
        this.clearSelection();
      }
      return;
    }

    const confirmed = await this.modalService.confirm({
      title: 'Disable Org Budget?',
      message: `Turn off organization billing for ${members.length} selected athletes?`,
      confirmText: 'Disable Budget',
      cancelText: 'Cancel',
      destructive: true,
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    const current = this.organizationBudgetAccess();
    const nextEnabledAthleteUserIds = new Set(current.enabledAthleteUserIds);
    for (const member of members) {
      if (member.userId) {
        nextEnabledAthleteUserIds.delete(member.userId);
      }
    }

    this.batchAction.set('disable-budget-selected');
    const changed = await this.service.updateOrganizationBudgetAccess({
      enabledForAllAthletes: false,
      enabledAthleteUserIds: Array.from(nextEnabledAthleteUserIds),
    });
    this.batchAction.set(null);

    if (changed) {
      this.hasChanges.set(true);
      this.clearSelection();
      this.toast.success(
        `${members.length} ${members.length === 1 ? 'athlete now uses' : 'athletes now use'} personal billing`
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to update athlete budget access');
  }

  protected async approve(entryId: string): Promise<boolean> {
    const changed = await this.service.approveMember(entryId);
    if (changed) {
      this.hasChanges.set(true);
      this.toast.success('Member approved');
      return true;
    }

    this.toast.error(this.service.error() ?? 'Failed to approve member');
    return false;
  }

  protected async remove(entryId: string): Promise<boolean> {
    const confirmed = await this.modalService.confirm({
      title: 'Remove Member?',
      message: 'This will remove the member from the team.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      destructive: true,
      preferNative: 'native',
    });

    if (!confirmed) {
      return false;
    }

    const changed = await this.service.removeMember(entryId);
    if (changed) {
      this.hasChanges.set(true);
      this.toast.success('Member removed');
      return true;
    }

    this.toast.error(this.service.error() ?? 'Failed to remove member');
    return false;
  }

  protected toggleEdit(member: MembershipEditorItem): void {
    if (this.editingEntryId() === member.entryId) {
      this.cancelEdit();
    } else {
      this.startEdit(member);
    }
  }

  protected startEdit(member: MembershipEditorItem): void {
    this.selectedEntryIds.set([member.entryId]);
    this.editingEntryId.set(member.entryId);
    this.editTitle = member.title ?? '';
    this.editPositions.set([...(member.positions ?? [])]);
    this.editJerseyNumber = member.jerseyNumber != null ? String(member.jerseyNumber) : '';
  }

  protected cancelEdit(): void {
    this.editingEntryId.set(null);
    this.editTitle = '';
    this.editPositions.set([]);
    this.editJerseyNumber = '';
  }

  protected async saveEdit(entryId: string, member: MembershipEditorItem): Promise<void> {
    const payload: UpdateMembershipRequest = {
      title: member.membershipKind === 'staff' ? this.editTitle.trim() || undefined : undefined,
      positions: member.membershipKind === 'roster' ? this.editPositions() : undefined,
      jerseyNumber:
        member.membershipKind === 'roster' && this.editJerseyNumber.trim()
          ? this.editJerseyNumber.trim()
          : undefined,
    };

    const changed = await this.service.updateMember(entryId, payload);
    if (changed) {
      this.hasChanges.set(true);
      this.cancelEdit();
    }
  }

  protected handleClose(): void {
    this.emitClose(this.hasChanges());
  }

  protected formatPosition(position: string, sport?: string): string {
    return formatPositionDisplay(position, sport, { showAbbreviation: false });
  }

  protected formatRole(role: string): string {
    return role
      .trim()
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  protected hasAvailablePositions(member: MembershipEditorItem): boolean {
    return this.availablePositions(member).length > 0;
  }

  protected async toggleOrganizationBudgetAccessMode(): Promise<void> {
    const current = this.organizationBudgetAccess();
    const nextEnabledForAllAthletes = !current.enabledForAllAthletes;

    const confirmed = await this.modalService.confirm({
      title: nextEnabledForAllAthletes
        ? 'Enable Budget for All Athletes?'
        : 'Switch to Selected Athletes?',
      message: nextEnabledForAllAthletes
        ? 'Allow all athletes on the team to charge usage to the organization budget?'
        : 'Restrict organization budget access so only selected athletes can use it?',
      confirmText: nextEnabledForAllAthletes ? 'Enable For All' : 'Switch Mode',
      cancelText: 'Cancel',
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    const changed = await this.service.updateOrganizationBudgetAccess({
      enabledForAllAthletes: nextEnabledForAllAthletes,
      enabledAthleteUserIds: [...current.enabledAthleteUserIds],
    });

    if (changed) {
      this.hasChanges.set(true);
      this.toast.success(
        nextEnabledForAllAthletes
          ? 'Organization budget enabled for all athletes'
          : 'Switched to selected-athlete access'
      );
      return;
    }

    this.toast.error(this.service.error() ?? 'Failed to update organization budget access');
  }

  protected async toggleAthleteOrganizationBudgetAccess(
    member: MembershipEditorItem
  ): Promise<boolean> {
    if (!member.userId) {
      return false;
    }

    const current = this.organizationBudgetAccess();
    const isCurrentlyEnabled = current.enabledAthleteUserIds.includes(member.userId);
    const nextWillBeEnabled = !isCurrentlyEnabled;
    const name = this.memberDisplayName(member);

    const confirmed = await this.modalService.confirm({
      title: nextWillBeEnabled ? 'Enable Org Budget?' : 'Disable Org Budget?',
      message: nextWillBeEnabled
        ? `Allow ${name} to charge team usage to the organization budget?`
        : `Turn off organization budget access for ${name}? They will use personal billing instead.`,
      confirmText: nextWillBeEnabled ? 'Enable Budget' : 'Disable Budget',
      cancelText: 'Cancel',
      destructive: !nextWillBeEnabled,
      preferNative: 'native',
    });

    if (!confirmed) {
      return false;
    }

    const nextEnabledAthleteUserIds = new Set(current.enabledAthleteUserIds);
    if (isCurrentlyEnabled) {
      nextEnabledAthleteUserIds.delete(member.userId);
    } else {
      nextEnabledAthleteUserIds.add(member.userId);
    }

    const changed = await this.service.updateOrganizationBudgetAccess({
      enabledForAllAthletes: false,
      enabledAthleteUserIds: Array.from(nextEnabledAthleteUserIds),
    });

    if (changed) {
      this.hasChanges.set(true);
      this.toast.success(
        nextWillBeEnabled ? `${name} can now use org budget` : `${name} now uses personal billing`
      );
      return true;
    }

    this.toast.error(this.service.error() ?? 'Failed to update athlete budget access');
    return false;
  }

  protected isUpdatingAdminAccess(entryId: string): boolean {
    return this.service.pendingAction() === `admin-access:${entryId}`;
  }

  protected async toggleAdminAccess(member: MembershipEditorItem): Promise<boolean> {
    if (!member.userId) {
      return false;
    }

    const nextIsTeamAdmin = !member.isTeamAdmin;
    const name = this.memberDisplayName(member);

    const confirmed = await this.modalService.confirm({
      title: nextIsTeamAdmin ? 'Make Team Admin?' : 'Revoke Admin Access?',
      message: nextIsTeamAdmin
        ? `Grant ${name} admin access to manage team usage, billing, and members?`
        : `Remove admin access for ${name}? They will no longer be able to manage team usage or billing.`,
      confirmText: nextIsTeamAdmin ? 'Make Admin' : 'Revoke Access',
      cancelText: 'Cancel',
      destructive: !nextIsTeamAdmin,
      preferNative: 'native',
    });

    if (!confirmed) {
      return false;
    }

    const changed = await this.service.updateAdminAccess(member.entryId, nextIsTeamAdmin);

    if (changed) {
      this.hasChanges.set(true);
      this.toast.success(
        nextIsTeamAdmin
          ? `${name} can now manage /usage billing`
          : `${name} no longer has admin access`
      );
      return true;
    }

    this.toast.error(this.service.error() ?? 'Failed to update admin access');
    return false;
  }

  private syncEditStateToSelection(): void {
    const editingEntryId = this.editingEntryId();
    if (!editingEntryId) {
      return;
    }

    const selectedIds = this.selectedEntryIds();
    if (selectedIds.length !== 1 || selectedIds[0] !== editingEntryId) {
      this.cancelEdit();
    }
  }

  protected removePosition(position: string): void {
    this.editPositions.update((current) => current.filter((entry) => entry !== position));
  }

  protected async openPositionsPicker(member: MembershipEditorItem): Promise<void> {
    const sport = member.sport?.trim() ?? '';
    const positions = this.availablePositions(member);

    if (!sport || positions.length === 0) {
      return;
    }

    let keepSelecting = true;
    while (keepSelecting) {
      const current = this.editPositions();
      const atMax = current.length >= MAX_POSITIONS;
      const title =
        current.length > 0 ? `Positions (${current.length}/${MAX_POSITIONS})` : 'Select Position';

      const result = await this.modalService.actionSheet({
        title,
        actions: positions.map((position) => {
          const isSelected = current.includes(position);
          const display = formatPositionDisplay(position, sport);
          return {
            text: isSelected ? `✓ ${display}` : display,
            data: position,
            ...(atMax && !isSelected ? { destructive: false } : {}),
          };
        }),
        preferNative: 'native',
      });

      if (!result?.selected || !result.data) {
        keepSelecting = false;
        continue;
      }

      const selectedPosition = result.data as string;
      if (current.includes(selectedPosition)) {
        this.editPositions.update((existing) =>
          existing.filter((entry) => entry !== selectedPosition)
        );
      } else if (current.length < MAX_POSITIONS) {
        this.editPositions.update((existing) => [...existing, selectedPosition]);
      }
    }
  }

  private emitClose(changed: boolean): void {
    this.close.emit({ changed });
    void this.dismissNativeModal(changed);
  }

  private availablePositions(member: MembershipEditorItem): readonly string[] {
    const sport = member.sport?.trim() ?? '';
    if (!sport) {
      return [];
    }

    return getPositionGroupsForSport(sport).flatMap((group) => group.positions);
  }

  private async dismissNativeModal(changed: boolean): Promise<void> {
    if (!this.modalController) return;
    try {
      await this.modalController.dismiss({ changed });
    } catch {
      // No-op in non-Ionic contexts.
    }
  }
}
