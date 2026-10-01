/**
 * @fileoverview Agent X Share Menu — reusable header-action share button
 *
 * Renders the same access-grant UX as the Lab's file/film-review 3-dot "Share"
 * action, anchored to a compact icon button so it can sit next to the
 * extend/close controls in panel headers (Files preview, Film Review).
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Auth } from '@angular/fire/auth';

import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtToastService } from '../../../services/toast/toast.service';
import {
  AgentXFilesService,
  type AgentXShareCandidate,
  type FileSharePermission,
  type FileSharePrincipalType,
} from '../../services/agent-x-files.service';
import { AgentXService } from '../../services/agent-x.service';
import {
  AgentXShareAccessPanelComponent,
  type AgentXSharePermission,
} from './agent-x-share-access-panel.component';
import { type AgentXShareMemberOption } from './agent-x-share-member-picker.component';

export interface AgentXShareMenuTarget {
  /** UniversalFiles document id used for the `/files/:fileId/share` mutation. */
  readonly shareId: string;
  readonly ownerUserId: string;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
}

export interface AgentXShareMenuAccessResult {
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
}

interface AgentXShareMenuGrant {
  readonly accessKey: string;
  readonly principalType: FileSharePrincipalType;
  readonly principalId: string;
  readonly label: string;
  readonly permission: FileSharePermission;
}

@Component({
  selector: 'nxt1-agent-x-share-menu',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, AgentXShareAccessPanelComponent],
  template: `
    @if (canManage()) {
      <div class="agent-x-share-menu">
        <button
          type="button"
          class="agent-column-icon-btn agent-x-share-menu__trigger"
          [class.agent-column-icon-btn--active]="isOpen()"
          [attr.aria-expanded]="isOpen()"
          [attr.aria-label]="triggerAriaLabel"
          [attr.title]="triggerAriaLabel"
          aria-haspopup="menu"
          (click)="onToggleMenu($event)"
        >
          <nxt1-icon name="lock" [size]="14"></nxt1-icon>
          <span>Share</span>
        </button>

        @if (isOpen()) {
          <div class="agent-x-share-menu__backdrop" (click)="onClose($event)"></div>
          <div
            class="agent-x-share-menu__panel"
            role="menu"
            aria-label="Share access"
            (click)="$event.stopPropagation()"
          >
            <nxt1-agent-x-share-access-panel
              [itemId]="target?.shareId ?? ''"
              [teamId]="target?.teamId ?? ''"
              [organizationId]="target?.organizationId ?? ''"
              [principalType]="principalType()"
              [permission]="permission()"
              [query]="query()"
              [loading]="candidatesLoading()"
              [candidates]="visibleCandidates()"
              [grants]="grants()"
              [selectedUserIds]="selectedUserIds()"
              [submitDisabled]="submitDisabled()"
              emptyAccessMessage="Only you can access this right now."
              (principalTypeChange)="onPrincipalTypeChange($event)"
              (permissionChange)="onPermissionChange($event)"
              (queryChange)="onQueryInput($event)"
              (candidateToggled)="onCandidateToggled($event)"
              (grantPermissionChange)="onGrantPermissionChange($event)"
              (removeGrant)="onRemoveGrant($event)"
              (submit)="onSubmit($event)"
              (cancel)="onClose($event)"
            />
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .agent-x-share-menu {
        position: relative;
        display: inline-flex;
      }

      .agent-column-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--agent-text-muted);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          opacity 0.15s ease;
        flex-shrink: 0;
      }

      .agent-column-icon-btn:hover:not(:disabled) {
        background: var(--agent-surface-hover);
        color: var(--agent-text-primary);
      }

      .agent-column-icon-btn--active {
        background: color-mix(in srgb, var(--agent-primary) 12%, transparent);
        color: var(--agent-primary);
      }

      .agent-x-share-menu__trigger {
        width: auto;
        gap: 6px;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 600;
        background: var(--agent-primary, var(--nxt1-color-primary, #ccff00));
        color: var(--agent-text-on-primary, var(--nxt1-color-text-onPrimary, #0a0a0a));
      }

      .agent-x-share-menu__trigger:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark, var(--agent-primary, #ccff00));
        color: var(--agent-text-on-primary, var(--nxt1-color-text-onPrimary, #0a0a0a));
      }

      .agent-x-share-menu__trigger.agent-column-icon-btn--active,
      .agent-x-share-menu__trigger:focus-visible {
        background: var(--nxt1-color-primaryDark, var(--agent-primary, #ccff00));
        color: var(--agent-text-on-primary, var(--nxt1-color-text-onPrimary, #0a0a0a));
        outline: none;
      }

      .agent-x-share-menu__backdrop {
        position: fixed;
        inset: 0;
        z-index: 99;
      }

      .agent-x-share-menu__panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 100;
        width: min(340px, calc(100vw - 32px));
        max-height: min(70vh, 520px);
        overflow-y: auto;
        padding: 12px;
        border-radius: var(--nxt1-radius-lg, 14px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, #18181b);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXShareMenuComponent {
  private readonly filesService = inject(AgentXFilesService);
  private readonly agentXService = inject(AgentXService);
  private readonly auth = inject(Auth, { optional: true });
  private readonly toast = inject(NxtToastService);

  readonly accessChanged = output<AgentXShareMenuAccessResult>();

  private readonly _target = signal<AgentXShareMenuTarget | null>(null);

  /** Classic decorator input (not signal `input()`) so computed()s stay reactive while remaining JIT-testable. */
  @Input()
  set target(value: AgentXShareMenuTarget | null) {
    this._target.set(value);
  }
  get target(): AgentXShareMenuTarget | null {
    return this._target();
  }

  @Input() triggerAriaLabel = 'Share';

  private readonly currentUserId = computed(
    () => this.agentXService.userContext()?.userId?.trim() ?? ''
  );
  private readonly effectiveCurrentUserId = computed(
    () => this.currentUserId() || this.auth?.currentUser?.uid?.trim() || ''
  );

  protected readonly isOpen = signal(false);
  protected readonly principalType = signal<FileSharePrincipalType>('user');
  protected readonly permission = signal<FileSharePermission>('read');
  protected readonly principalId = signal('');
  protected readonly selectedUserIds = signal<readonly string[]>([]);
  protected readonly query = signal('');
  protected readonly candidates = signal<readonly AgentXShareCandidate[]>([]);
  protected readonly candidatesLoading = signal(false);
  private candidatesRequestId = 0;

  protected readonly canManage = computed(() => {
    const target = this.target;
    const currentUserId = this.effectiveCurrentUserId();
    return !!target && currentUserId.length > 0 && target.ownerUserId === currentUserId;
  });

  protected readonly grants = computed<readonly AgentXShareMenuGrant[]>(() => {
    const target = this.target;
    if (!target) return [];

    const ownerAccessKey = `user:${target.ownerUserId}`;
    const writableAccessKeys = new Set(target.writeAccessKeys ?? []);
    return (target.readAccessKeys ?? [])
      .filter((accessKey) => accessKey !== ownerAccessKey)
      .map((accessKey) => this.parseGrant(accessKey, writableAccessKeys.has(accessKey)))
      .filter((grant): grant is AgentXShareMenuGrant => grant !== null);
  });

  protected readonly visibleCandidates = computed<readonly AgentXShareMemberOption[]>(() => {
    const query = this.query().trim().toLowerCase();
    const candidates = this.candidates();
    if (!query) {
      return candidates.slice(0, 50);
    }

    return candidates.filter((candidate) => {
      const haystack = `${candidate.displayName} ${candidate.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  protected readonly submitDisabled = computed(() => {
    const target = this.target;
    if (!target) return true;

    if (this.principalType() === 'user') {
      const existingUserIds = this.userPrincipalIds(this.grants());
      return (
        !this.hasSelectionChanges(existingUserIds, this.selectedUserIds()) ||
        this.filesService.saving()
      );
    }

    return this.resolvePrincipalId(target).length === 0 || this.filesService.saving();
  });

  protected async onToggleMenu(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const target = this.target;
    if (!target) return;

    const next = !this.isOpen();
    this.isOpen.set(next);
    if (!next) {
      return;
    }

    this.principalType.set('user');
    this.permission.set('read');
    this.principalId.set('');
    this.selectedUserIds.set(this.userPrincipalIds(this.grants()));
    this.query.set('');
    await this.loadCandidates(target.teamId, target.organizationId);
  }

  protected onClose(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.candidatesRequestId += 1;
    this.isOpen.set(false);
    this.principalType.set('user');
    this.permission.set('read');
    this.principalId.set('');
    this.selectedUserIds.set([]);
    this.query.set('');
    this.candidates.set([]);
  }

  protected onPrincipalTypeChange(value: string): void {
    if (value === 'user' || value === 'team' || value === 'organization') {
      this.principalType.set(value);
    } else {
      this.principalType.set('user');
    }

    if (value !== 'user') {
      this.principalId.set('');
      this.query.set('');
    }
  }

  protected onPermissionChange(value: AgentXSharePermission): void {
    this.permission.set(value === 'write' ? 'write' : 'read');
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    this.principalId.set('');
  }

  protected onCandidateToggled(event: {
    candidate: AgentXShareMemberOption;
    checked: boolean;
  }): void {
    this.selectedUserIds.update((ids) =>
      this.toggleSelection(ids, event.candidate.id, event.checked)
    );
  }

  protected async onSubmit(event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const target = this.target;
    if (!target) return;

    const principalType = this.principalType();

    if (principalType === 'user') {
      const selectedUserIds = new Set(this.selectedUserIds());
      const existingUserIds = new Set(this.userPrincipalIds(this.grants()));
      const usersToAdd = [...selectedUserIds].filter((userId) => !existingUserIds.has(userId));
      const usersToRemove = [...existingUserIds].filter((userId) => !selectedUserIds.has(userId));

      if (usersToAdd.length === 0 && usersToRemove.length === 0) {
        this.onClose();
        return;
      }

      try {
        let result: AgentXShareMenuAccessResult | null = null;
        for (const userId of usersToRemove) {
          result = await this.filesService.shareFile(target.shareId, {
            action: 'remove',
            principalType: 'user',
            principalId: userId,
          });
        }

        for (const userId of usersToAdd) {
          result = await this.filesService.shareFile(target.shareId, {
            action: 'add',
            permission: this.permission(),
            principalType: 'user',
            principalId: userId,
          });
        }

        if (result) {
          this.accessChanged.emit(result);
        }

        this.toast.success('Share access updated');
        this.onClose();
      } catch {
        this.toast.error('Failed to update share access');
      }
      return;
    }

    const principalId = this.resolvePrincipalId(target);
    if (!principalId) {
      return;
    }

    try {
      const result = await this.filesService.shareFile(target.shareId, {
        action: 'add',
        permission: this.permission(),
        principalType,
        principalId,
      });
      this.accessChanged.emit(result);
      this.toast.success(this.buildGrantedMessage(principalType, this.permission()));
      this.principalId.set('');
      this.query.set('');
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onGrantPermissionChange(event: {
    grant: AgentXShareMenuGrant;
    permission: AgentXSharePermission;
  }): Promise<void> {
    const target = this.target;
    if (!target) return;

    try {
      const result = await this.filesService.shareFile(target.shareId, {
        action: 'add',
        permission: event.permission,
        principalType: event.grant.principalType,
        principalId: event.grant.principalId,
      });
      this.accessChanged.emit(result);
      this.toast.success(
        this.buildGrantedMessage(event.grant.principalType, event.permission, event.grant.label)
      );
    } catch {
      this.toast.error('Failed to update share access');
    }
  }

  protected async onRemoveGrant(grant: AgentXShareMenuGrant, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    const target = this.target;
    if (!target) return;

    try {
      const result = await this.filesService.shareFile(target.shareId, {
        action: 'remove',
        principalType: grant.principalType,
        principalId: grant.principalId,
      });
      this.accessChanged.emit(result);
      this.toast.success(this.buildRevokedMessage(grant.label));
    } catch {
      this.toast.error('Failed to revoke share access');
    }
  }

  private async loadCandidates(
    teamId: string | null | undefined,
    organizationId: string | null | undefined
  ): Promise<void> {
    const requestId = ++this.candidatesRequestId;
    this.candidatesLoading.set(true);
    this.candidates.set([]);

    try {
      const candidates = await this.filesService.loadShareCandidates({ teamId, organizationId });
      if (requestId !== this.candidatesRequestId) return;
      this.candidates.set(candidates);
    } catch {
      if (requestId !== this.candidatesRequestId) return;
      this.candidates.set([]);
    } finally {
      if (requestId === this.candidatesRequestId) {
        this.candidatesLoading.set(false);
      }
    }
  }

  private resolvePrincipalId(target: AgentXShareMenuTarget): string {
    if (this.principalType() === 'team') {
      return target.teamId?.trim() || '';
    }

    if (this.principalType() === 'organization') {
      return target.organizationId?.trim() || '';
    }

    return this.principalId().trim();
  }

  private parseGrant(accessKey: string, hasWriteAccess: boolean): AgentXShareMenuGrant | null {
    if (accessKey.startsWith('user:')) {
      const principalId = accessKey.slice('user:'.length).trim();
      const candidate = this.candidates().find((candidate) => candidate.id === principalId);
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
            label: 'Everyone on the team',
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
            label: 'Everyone in the organization',
            permission: hasWriteAccess ? 'write' : 'read',
          }
        : null;
    }

    return null;
  }

  private buildGrantedMessage(
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

  private buildRevokedMessage(label?: string | null): string {
    return `Removed ${label?.trim() || 'shared'} access`;
  }

  private userPrincipalIds(grants: readonly AgentXShareMenuGrant[]): readonly string[] {
    return grants
      .filter((grant) => grant.principalType === 'user')
      .map((grant) => grant.principalId);
  }

  private toggleSelection(
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

  private hasSelectionChanges(
    initialIds: readonly string[],
    selectedIds: readonly string[]
  ): boolean {
    if (initialIds.length !== selectedIds.length) {
      return true;
    }

    const selected = new Set(selectedIds);
    return initialIds.some((id) => !selected.has(id));
  }
}
