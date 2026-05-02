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
import { LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import type {
  MembershipEditorMode,
  MembershipEditorItem,
  UpdateMembershipRequest,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtSheetHeaderComponent } from '../../components/bottom-sheet/sheet-header.component';
import { NxtAvatarComponent } from '../../components/avatar';
import { NxtFormFieldComponent } from '../../components/form-field';
import { NxtModalService } from '../../services/modal';
import { ManageTeamMembershipService } from '../manage-team-membership.service';

type FilterTab = 'all' | 'roster' | 'staff' | 'pending';

@Component({
  selector: 'nxt1-manage-team-membership-editor',
  standalone: true,
  imports: [
    FormsModule,
    LowerCasePipe,
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
      (closeSheet)="handleClose()"
    />

    <!-- ══════════════════════════════════════════
         Segment tabs
         ══════════════════════════════════════════ -->
    <div class="nxt1-mm__segments" role="tablist">
      @for (tab of visibleTabs(); track tab) {
        <button
          type="button"
          role="tab"
          class="nxt1-mm__seg-pill"
          [class.nxt1-mm__seg-pill--active]="activeTab() === tab"
          [attr.aria-selected]="activeTab() === tab"
          (click)="activeTab.set(tab)"
        >
          <span class="nxt1-mm__seg-label">{{ labelForTab(tab) }}</span>
          @if (badgeCount(tab) > 0) {
            <span class="nxt1-mm__seg-badge">{{ badgeCount(tab) }}</span>
          }
        </button>
      }
    </div>

    <!-- ══════════════════════════════════════════
         Scrollable content
         ══════════════════════════════════════════ -->
    <div class="nxt1-mm__scroll">
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
              [class.nxt1-mm__row--editing]="editingEntryId() === member.entryId"
            >
              <!-- Avatar + identity + row actions -->
              <div class="nxt1-mm__row-main">
                <nxt1-avatar
                  [name]="memberDisplayName(member)"
                  [src]="member.profileImgs?.[0] ?? null"
                  size="sm"
                />

                <div class="nxt1-mm__identity">
                  <span class="nxt1-mm__name">{{ memberDisplayName(member) }}</span>
                  <span class="nxt1-mm__meta">
                    @if (member.role) {
                      {{ member.role }}
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
                  </span>
                </div>

                <div class="nxt1-mm__row-actions">
                  @if (member.isPending) {
                    <button
                      type="button"
                      class="nxt1-btn nxt1-mm__action-btn nxt1-mm__action-btn--approve"
                      (click)="approve(member.entryId)"
                      aria-label="Approve member"
                    >
                      <nxt1-icon name="checkmark" [size]="16" />
                    </button>
                  }
                  <button
                    type="button"
                    class="nxt1-btn nxt1-mm__action-btn"
                    [class.nxt1-mm__action-btn--active]="editingEntryId() === member.entryId"
                    (click)="toggleEdit(member)"
                    aria-label="Edit member"
                  >
                    <nxt1-icon name="pencil" [size]="16" />
                  </button>
                  <button
                    type="button"
                    class="nxt1-btn nxt1-mm__action-btn nxt1-mm__action-btn--danger"
                    (click)="remove(member.entryId)"
                    aria-label="Remove member"
                  >
                    <nxt1-icon name="trash" [size]="16" />
                  </button>
                </div>
              </div>

              <!-- Inline edit form -->
              @if (editingEntryId() === member.entryId) {
                <form class="nxt1-mm__edit-form" (ngSubmit)="saveEdit(member.entryId, member)">
                  @if (member.membershipKind === 'roster') {
                    <nxt1-form-field label="Role" [inputId]="'role-' + member.entryId">
                      <input
                        [id]="'role-' + member.entryId"
                        type="text"
                        class="nxt1-input"
                        [(ngModel)]="editRole"
                        [ngModelOptions]="{ standalone: true }"
                        placeholder="e.g. player"
                        autocomplete="off"
                      />
                    </nxt1-form-field>
                  }

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
                    <nxt1-form-field label="Positions" [inputId]="'pos-' + member.entryId">
                      <input
                        [id]="'pos-' + member.entryId"
                        type="text"
                        class="nxt1-input"
                        [(ngModel)]="editPositionsRaw"
                        [ngModelOptions]="{ standalone: true }"
                        placeholder="e.g. Point Guard, Small Forward"
                        autocomplete="off"
                      />
                    </nxt1-form-field>
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

      /* ═══════════════════════════════════════════
         SEGMENT TABS
         ═══════════════════════════════════════════ */
      .nxt1-mm__segments {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        overflow-x: auto;
        scrollbar-width: none;
        flex-shrink: 0;
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
        background: var(--nxt1-color-surface-300);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1;
      }

      .nxt1-mm__seg-pill--active .nxt1-mm__seg-badge {
        background: var(--nxt1-color-surface-500);
      }

      /* ═══════════════════════════════════════════
         SCROLL CONTAINER
         ═══════════════════════════════════════════ */
      .nxt1-mm__scroll {
        flex: 1;
        overflow-y: auto;
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
        transition: background 0.12s ease;
      }

      .nxt1-mm__row:last-child {
        border-bottom: none;
      }

      .nxt1-mm__row--editing {
        background: transparent;
      }

      .nxt1-mm__row-main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
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

      /* Row action icon buttons */
      .nxt1-mm__row-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        flex-shrink: 0;
      }

      .nxt1-mm__action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: 1px solid transparent;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.12s ease,
          color 0.12s ease,
          border-color 0.12s ease;
      }

      .nxt1-mm__action-btn:hover {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-border-default);
      }

      .nxt1-mm__action-btn--active {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-mm__action-btn--approve {
        color: var(--nxt1-color-success);
        border-color: var(--nxt1-color-success);
      }

      .nxt1-mm__action-btn--approve:hover {
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
        border-color: var(--nxt1-color-success);
      }

      .nxt1-mm__action-btn--danger {
        color: var(--nxt1-color-error);
        border-color: transparent;
      }

      .nxt1-mm__action-btn--danger:hover {
        background: var(--nxt1-color-errorBg);
        border-color: var(--nxt1-color-error);
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
  readonly close = output<{ changed: boolean }>();

  protected readonly service = inject(ManageTeamMembershipService);
  private readonly modalController = inject(ModalController, { optional: true });
  private readonly modal = inject(NxtModalService);

  protected readonly activeTab = signal<FilterTab>('all');
  protected readonly editingEntryId = signal<string | null>(null);
  protected editRole = '';
  protected editTitle = '';
  protected editPositionsRaw = ''; // comma-separated string bound to the input
  protected editJerseyNumber = '';

  protected readonly skeletonRows = [1, 2, 3, 4, 5];

  protected readonly visibleTabs = computed<readonly FilterTab[]>(() => {
    const mode = this.mode();
    if (mode === 'roster') return ['roster', 'pending'];
    if (mode === 'staff') return ['staff', 'pending'];
    return ['all', 'roster', 'staff', 'pending'];
  });

  protected readonly filteredItems = computed(() => {
    const tab = this.activeTab();
    const items = this.service.items();
    if (tab === 'pending') return items.filter((item) => item.isPending);
    if (tab === 'roster') return items.filter((item) => item.membershipKind === 'roster');
    if (tab === 'staff') return items.filter((item) => item.membershipKind === 'staff');
    return items;
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

  protected async approve(entryId: string): Promise<void> {
    const changed = await this.service.approveMember(entryId);
    if (changed) this.emitClose(true);
  }

  protected async remove(entryId: string): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: 'Remove Member?',
      message: 'This will remove the member from the team.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      destructive: true,
      preferNative: 'native',
    });

    if (!confirmed) {
      return;
    }

    const changed = await this.service.removeMember(entryId);
    if (changed) {
      this.emitClose(true);
    }
  }

  protected toggleEdit(member: MembershipEditorItem): void {
    if (this.editingEntryId() === member.entryId) {
      this.cancelEdit();
    } else {
      this.startEdit(member);
    }
  }

  protected startEdit(member: MembershipEditorItem): void {
    this.editingEntryId.set(member.entryId);
    this.editRole = member.role ?? '';
    this.editTitle = member.title ?? '';
    this.editPositionsRaw = member.positions?.join(', ') ?? '';
    this.editJerseyNumber = member.jerseyNumber != null ? String(member.jerseyNumber) : '';
  }

  protected cancelEdit(): void {
    this.editingEntryId.set(null);
    this.editRole = '';
    this.editTitle = '';
    this.editPositionsRaw = '';
    this.editJerseyNumber = '';
  }

  protected async saveEdit(entryId: string, member: MembershipEditorItem): Promise<void> {
    const positions = this.editPositionsRaw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const payload: UpdateMembershipRequest = {
      role: member.membershipKind === 'roster' ? this.editRole.trim() || undefined : undefined,
      title: member.membershipKind === 'staff' ? this.editTitle.trim() || undefined : undefined,
      positions: member.membershipKind === 'roster' ? positions : undefined,
      jerseyNumber:
        member.membershipKind === 'roster' && this.editJerseyNumber.trim()
          ? this.editJerseyNumber.trim()
          : undefined,
    };

    const changed = await this.service.updateMember(entryId, payload);
    if (changed) {
      this.cancelEdit();
    }
  }

  protected handleClose(): void {
    this.emitClose(false);
  }

  private emitClose(changed: boolean): void {
    this.close.emit({ changed });
    void this.dismissNativeModal(changed);
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
