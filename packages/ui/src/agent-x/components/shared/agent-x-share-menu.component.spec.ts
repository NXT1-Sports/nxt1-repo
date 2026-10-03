/**
 * @fileoverview AgentXShareMenuComponent — Unit Tests
 * @module @nxt1/ui/agent-x
 *
 * NOTE: instantiated directly via `new` (not `TestBed.createComponent`) so no
 * template rendering occurs, avoiding this workspace's JIT-only test harness
 * from having to compile a nested child component's template.
 *
 * Coverage:
 * - `canManage` is false when there is no target or the user isn't the owner
 * - Opening the menu loads share candidates for the target scope
 * - Active-team fallback applies only when the target has no stored scope
 * - Candidate load failures surface an error instead of an empty list
 * - Grants exclude the owner and reflect write access
 * - Submitting a team/organization share calls shareFile and emits the updated keys
 * - Adding/removing individual users diffs the selection against existing grants
 * - Removing a grant calls shareFile with the remove action
 */
import { TestBed } from '@angular/core/testing';
import { computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentXShareMenuComponent,
  type AgentXShareMenuTarget,
} from './agent-x-share-menu.component';
import { AgentXFilesService } from '../../services/agent-x-files.service';
import { AgentXService } from '../../services/agent-x.service';
import { NxtToastService } from '../../../services/toast/toast.service';

describe('AgentXShareMenuComponent', () => {
  const loadShareCandidates = vi.fn<AgentXFilesService['loadShareCandidates']>();
  const shareFile = vi.fn<AgentXFilesService['shareFile']>();
  const toastSuccess = vi.fn();
  const toastError = vi.fn();

  const ownedTarget: AgentXShareMenuTarget = {
    shareId: 'file-1',
    ownerUserId: 'user-1',
    teamId: 'team-77',
    organizationId: 'org-9',
    readAccessKeys: ['user:user-1', 'user:user-2'],
    writeAccessKeys: ['user:user-1'],
  };

  function createComponent(): AgentXShareMenuComponent {
    return TestBed.runInInjectionContext(() => new AgentXShareMenuComponent());
  }

  beforeEach(() => {
    vi.clearAllMocks();
    loadShareCandidates.mockResolvedValue([
      {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
        sourceScopes: ['team'],
        teamIds: ['team-77'],
        organizationIds: [],
      },
    ]);
    shareFile.mockResolvedValue({
      readAccessKeys: ['user:user-1', 'user:user-3'],
      writeAccessKeys: ['user:user-1'],
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentXFilesService,
          useValue: { loadShareCandidates, shareFile, saving: computed(() => false) },
        },
        {
          provide: AgentXService,
          useValue: { userContext: computed(() => ({ userId: 'user-1' })) },
        },
        { provide: Auth, useValue: { currentUser: { uid: 'user-1' } } },
        { provide: NxtToastService, useValue: { success: toastSuccess, error: toastError } },
      ],
    });
  });

  it('reports canManage=false when there is no target', () => {
    const component = createComponent();
    expect((component as unknown as { canManage: () => boolean }).canManage()).toBe(false);
  });

  it('reports canManage=false when the current user is not the owner', () => {
    const component = createComponent();
    component.target = { ...ownedTarget, ownerUserId: 'someone-else' };
    expect((component as unknown as { canManage: () => boolean }).canManage()).toBe(false);
  });

  it('reports canManage=true when the current user owns the target', () => {
    const component = createComponent();
    component.target = ownedTarget;
    expect((component as unknown as { canManage: () => boolean }).canManage()).toBe(true);
  });

  it('loads share candidates for the target scope when opened', async () => {
    const component = createComponent();
    component.target = ownedTarget;

    await (component as unknown as { onToggleMenu: (event: Event) => Promise<void> }).onToggleMenu(
      new Event('click')
    );

    expect(loadShareCandidates).toHaveBeenCalledWith({
      teamId: ownedTarget.teamId,
      organizationId: ownedTarget.organizationId,
    });
  });

  describe('candidate scope resolution', () => {
    type MenuAccess = {
      onToggleMenu: (event: Event) => Promise<void>;
      candidatesError: () => string | null;
    };

    async function open(component: AgentXShareMenuComponent): Promise<MenuAccess> {
      const access = component as unknown as MenuAccess;
      await access.onToggleMenu(new Event('click'));
      return access;
    }

    it('falls back to the active team when the target has no scope', async () => {
      const component = createComponent();
      component.target = { ...ownedTarget, teamId: null, organizationId: null };
      component.fallbackTeamId = 'active-team';

      await open(component);

      expect(loadShareCandidates).toHaveBeenCalledWith({
        teamId: 'active-team',
        organizationId: null,
      });
    });

    it('falls back when the stored scope is blank whitespace', async () => {
      const component = createComponent();
      component.target = { ...ownedTarget, teamId: '   ', organizationId: ' ' };
      component.fallbackTeamId = ' active-team ';

      await open(component);

      expect(loadShareCandidates).toHaveBeenCalledWith({
        teamId: 'active-team',
        organizationId: null,
      });
    });

    it('prefers the stored scope over the active team', async () => {
      const component = createComponent();
      component.target = ownedTarget;
      component.fallbackTeamId = 'active-team';

      await open(component);

      expect(loadShareCandidates).toHaveBeenCalledWith({
        teamId: 'team-77',
        organizationId: 'org-9',
      });
    });

    it('does not fall back when only an organization scope is stored', async () => {
      const component = createComponent();
      component.target = { ...ownedTarget, teamId: null };
      component.fallbackTeamId = 'active-team';

      await open(component);

      expect(loadShareCandidates).toHaveBeenCalledWith({
        teamId: null,
        organizationId: 'org-9',
      });
    });

    it('surfaces an error instead of a silent empty list when loading fails', async () => {
      loadShareCandidates.mockRejectedValueOnce(new Error('403'));
      const component = createComponent();
      component.target = ownedTarget;

      const access = await open(component);

      expect(access.candidatesError()).toBe(
        'Could not load members. Close and reopen to try again.'
      );
    });

    it('clears a previous error when reopened successfully', async () => {
      loadShareCandidates.mockRejectedValueOnce(new Error('network'));
      const component = createComponent();
      component.target = ownedTarget;

      const access = await open(component);
      await access.onToggleMenu(new Event('click'));
      const reopened = await open(component);

      expect(reopened.candidatesError()).toBeNull();
    });
  });

  it('excludes the owner from grants and marks write access', () => {
    const component = createComponent();
    component.target = ownedTarget;

    const grants = (
      component as unknown as {
        grants: () => readonly { principalId: string; permission: string }[];
      }
    ).grants();

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ principalId: 'user-2', permission: 'read' });
  });

  it('shares with the whole team and emits the updated access keys', async () => {
    const component = createComponent();
    component.target = ownedTarget;

    const accessChangedSpy = vi.fn();
    component.accessChanged.subscribe(accessChangedSpy);

    const componentAccess = component as unknown as {
      onPrincipalTypeChange: (value: string) => void;
      onSubmit: () => Promise<void>;
    };
    componentAccess.onPrincipalTypeChange('team');
    await componentAccess.onSubmit();

    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'add',
      permission: 'read',
      principalType: 'team',
      principalId: 'team-77',
    });
    expect(accessChangedSpy).toHaveBeenCalledWith({
      readAccessKeys: ['user:user-1', 'user:user-3'],
      writeAccessKeys: ['user:user-1'],
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('adds newly selected users and removes deselected users on submit', async () => {
    const component = createComponent();
    component.target = ownedTarget;

    const componentAccess = component as unknown as {
      selectedUserIds: { set: (ids: readonly string[]) => void };
      onSubmit: () => Promise<void>;
    };
    componentAccess.selectedUserIds.set(['user-3']);
    await componentAccess.onSubmit();

    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'remove',
      principalType: 'user',
      principalId: 'user-2',
    });
    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'add',
      permission: 'read',
      principalType: 'user',
      principalId: 'user-3',
    });
  });

  it('does nothing when the user selection is unchanged', async () => {
    const component = createComponent();
    component.target = ownedTarget;

    const componentAccess = component as unknown as {
      onToggleMenu: (event: Event) => Promise<void>;
      onSubmit: () => Promise<void>;
    };
    await componentAccess.onToggleMenu(new Event('click'));
    await componentAccess.onSubmit();

    expect(shareFile).not.toHaveBeenCalled();
  });

  it('removes a grant', async () => {
    const component = createComponent();
    component.target = ownedTarget;

    const grant = {
      accessKey: 'user:user-2',
      principalType: 'user' as const,
      principalId: 'user-2',
      label: 'User Two',
      permission: 'read' as const,
    };

    await (
      component as unknown as { onRemoveGrant: (grant: typeof grant) => Promise<void> }
    ).onRemoveGrant(grant);

    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'remove',
      principalType: 'user',
      principalId: 'user-2',
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('shows an error toast when the share mutation fails', async () => {
    shareFile.mockRejectedValue(new Error('network error'));
    const component = createComponent();
    component.target = ownedTarget;

    const grant = {
      accessKey: 'user:user-2',
      principalType: 'user' as const,
      principalId: 'user-2',
      label: 'User Two',
      permission: 'read' as const,
    };

    await (
      component as unknown as { onRemoveGrant: (grant: typeof grant) => Promise<void> }
    ).onRemoveGrant(grant);

    expect(toastError).toHaveBeenCalled();
  });
});
