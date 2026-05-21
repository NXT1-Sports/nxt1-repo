/**
 * @fileoverview Agent X Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/agent-x
 * @version 3.0.0
 *
 * Thin wrapper component that imports the shared Agent X shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { mapToConnectedSources } from '@nxt1/core';
import {
  AgentXShellComponent,
  AgentXService,
  ConnectedAccountsResyncService,
  ActivityService,
  NxtSidenavService,
  NxtLoggingService,
  NxtToastService,
  type AgentXConnectedAccountsSaveRequest,
  type AgentXUser,
} from '@nxt1/ui';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { EditProfileApiService } from '../../core/services/api/edit-profile-api.service';
import { NativeAppService } from '../../core/services/native/native-app.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { shouldStartActivityRealtimeListener } from './activity-realtime-auth-gate';

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [AgentXShellComponent],
  template: `
    <!-- Shell owns its own ion-content + ion-footer -->
    <nxt1-agent-x-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (connectedAccountsSave)="onConnectedAccountsSave($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
      }

      nxt1-agent-x-shell {
        display: block;
        flex: 1;
        height: 100%;
        min-height: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXComponent implements OnInit, OnDestroy {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly toast = inject(NxtToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly agentX = inject(AgentXService);
  private readonly activityService = inject(ActivityService);
  private readonly editProfileApi = inject(EditProfileApiService);
  private readonly connectedAccountsResync = inject(ConnectedAccountsResyncService);
  private readonly nativeApp = inject(NativeAppService);

  private resumeSub?: Subscription;

  constructor() {
    effect(() => {
      const isAuthInitialized = this.authFlow.isInitialized();
      const appUserId = this.authFlow.user()?.uid?.trim() ?? null;
      const firebaseUserId = this.authFlow.firebaseUser()?.uid?.trim() ?? null;

      if (
        !shouldStartActivityRealtimeListener({
          isAuthInitialized,
          appUserId,
          firebaseUserId,
        })
      ) {
        this.activityService.stopRealtimeListener();
        return;
      }

      this.activityService.startRealtimeForUser(appUserId);
    });
  }

  /**
   * Transform auth user to AgentXUser interface.
   */
  protected readonly userInfo = computed<AgentXUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    const profile = this.authFlow.profile();

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      role: profile?.role ?? user.role,
      selectedSports: profile?.sports?.map(({ sport }) => sport).filter(Boolean) ?? [],
      connectedSources: profile?.connectedSources ?? [],
      connectedEmails: user.connectedEmails ?? [],
      firebaseProviders: this.authFlow.firebaseUser()?.providerData ?? [],
    };
  });

  protected async onConnectedAccountsSave(
    request: AgentXConnectedAccountsSaveRequest
  ): Promise<void> {
    const user = this.authFlow.user();
    if (!user?.uid) {
      this.toast.error('Not signed in. Please refresh and try again.');
      return;
    }

    const connectedSources = mapToConnectedSources(request.linkSources.links);
    const result = await this.editProfileApi.updateSection(user.uid, 'connected-sources', {
      connectedSources,
    });

    if (result.success) {
      await this.authFlow.refreshUserProfile();
      if (request.requestResync) {
        await this.connectedAccountsResync.request(request.resyncSources ?? []);
      } else {
        this.toast.success('Connected accounts updated');
      }
    } else {
      this.logger.error('Failed to save Agent X connected accounts', undefined, {
        error: result.error,
      });
      this.toast.error(result.error ?? 'Failed to save connected accounts');
    }
  }

  ngOnInit(): void {
    const user = this.authFlow.user();
    const role = user?.role ?? 'athlete';
    this.logger.info('Agent X initialized (mobile)', { role });

    // Load thread from deep link query param (?thread=<id>) — opens in bottom sheet
    const threadId = this.route.snapshot.queryParamMap.get('thread');
    if (threadId) {
      this.logger.info('Queuing thread from query param', { threadId });
      this.agentX.queuePendingThread({ threadId, title: 'Agent X' });
    }

    // Mobile foreground recovery: when the OS resumes the app from background,
    // the SSE stream that was open before backgrounding will have been killed
    // (iOS/Android suspend network for suspended WebViews). If a drop-recovery
    // op was persisted in sessionStorage before the app was backgrounded, re-queue
    // it as a pending thread so the Agent X shell can re-attach to the stream.
    this.resumeSub = this.nativeApp.lifecycleEvents$
      .pipe(filter((event) => event === 'resume'))
      .subscribe(() => {
        const pendingOp = this.agentX.getAndClearDropRecoveryOp();
        if (!pendingOp) return;

        this.logger.info('Foreground recovery: re-queuing drop-recovery operation', {
          operationId: pendingOp.operationId,
          threadId: pendingOp.threadId,
        });

        if (pendingOp.threadId) {
          this.agentX.queuePendingThread({
            threadId: pendingOp.threadId,
            title: 'Agent X',
            operationId: pendingOp.operationId,
          });
        }
      });
  }

  ngOnDestroy(): void {
    this.resumeSub?.unsubscribe();
  }

  /**
   * Handle avatar click — open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }
}
