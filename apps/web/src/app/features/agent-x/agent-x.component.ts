/**
 * @fileoverview Agent X Page - Web App Wrapper
 * @module @nxt1/web/features/agent-x
 * @version 2.1.0
 *
 * Thin wrapper component that imports the shared Agent X shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ LANDING STATE PATTERN (2026) ⭐
 * When logged OUT: Shows full-screen marketing landing state only.
 * When logged IN + NEEDS ONBOARDING: Shows onboarding flow.
 * When logged IN + ONBOARDED: Shows the full Agent X shell.
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 * - Auth-gated landing section visibility
 * - Onboarding flow orchestration
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  effect,
  Injector,
  afterNextRender,
  TransferState,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { mapToConnectedSources } from '@nxt1/core';
import {
  AgentXShellWebComponent,
  type AgentXConnectedAccountsSaveRequest,
  type AgentXUser,
} from '@nxt1/ui/agent-x/web';
import { AgentXService } from '@nxt1/ui/agent-x/services';
import { NxtAgentXLandingComponent } from '@nxt1/ui/agent-x/landing';
import { ConnectedAccountsResyncService } from '@nxt1/ui/components/connected-sources/resync';
import { NxtAgentXExecutionLayerSectionComponent } from '@nxt1/ui/components/agent-x-execution-layer-section';
import { NxtAgentXWelcomeHeaderComponent } from '@nxt1/ui/components/agent-x-welcome-header';
import { ActivityService } from '@nxt1/ui/activity';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import {
  AUTH_TRANSFER_STATE_KEY,
  type TransferredAuthState,
} from '../../core/services/auth/ssr-tokens';
import { EditProfileApiService } from '../../core/services/api/edit-profile-api.service';
import { SeoService } from '../../core/services/web/seo.service';
import type { SeoConfig } from '@nxt1/core/seo';

const AGENT_X_PAGE_TITLE = 'NXT1 Agent X | AI Command Center for Sports';
const AGENT_X_PAGE_DESCRIPTION =
  'Agent X is the NXT1 AI command center for sports that executes film, creative, communications, and operations for athletes, coaches, directors, and programs.';
const AGENT_X_PAGE_URL = 'https://nxt1sports.com/agent-x';
const AGENT_X_PAGE_IMAGE = 'https://nxt1sports.com/assets/shared/images/og-image.jpg';
const AGENT_X_PAGE_IMAGE_ALT = 'Agent X AI command center for sports preview';
const AGENT_X_PAGE_IMAGE_WIDTH = 1200;
const AGENT_X_PAGE_IMAGE_HEIGHT = 630;
const AGENT_X_PAGE_KEYWORDS = [
  'agent x',
  'sports intelligence command center',
  'ai sports platform',
  'sports intelligence ai',
  'ai workflow automation for sports',
  'ai for coaches and athletic programs',
  'sports operations software',
  'film analysis ai',
  'sports creative automation',
  'nxt1',
] as const;
const AGENT_X_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': 'https://nxt1sports.com/agent-x#webpage',
      url: AGENT_X_PAGE_URL,
      name: AGENT_X_PAGE_TITLE,
      description: AGENT_X_PAGE_DESCRIPTION,
      isPartOf: {
        '@type': 'WebSite',
        '@id': 'https://nxt1sports.com/#website',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      about: { '@id': 'https://nxt1sports.com/agent-x#software' },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: AGENT_X_PAGE_IMAGE,
        width: AGENT_X_PAGE_IMAGE_WIDTH,
        height: AGENT_X_PAGE_IMAGE_HEIGHT,
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://nxt1sports.com/agent-x#software',
      name: 'Agent X',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: AGENT_X_PAGE_URL,
      description: AGENT_X_PAGE_DESCRIPTION,
      image: AGENT_X_PAGE_IMAGE,
      publisher: {
        '@type': 'Organization',
        name: 'NXT1 Sports',
        url: 'https://nxt1sports.com',
      },
      featureList: [
        'Film analysis and recap packaging',
        'Creative production and branded asset generation',
        'Communications workflows and follow-up drafting',
        'Weekly operating plans and background operations',
        'Decision-grade sports intelligence for athletes, coaches, directors, and programs',
      ],
    },
  ],
} as const;

function resolveAgentXActiveTeamId(
  user:
    | {
        readonly activeSportIndex?: number | null;
        readonly sports?: ReadonlyArray<{
          readonly sport?: string | null;
          readonly isPrimary?: boolean;
          readonly team?: {
            readonly teamId?: string | null;
            readonly organizationId?: string | null;
            readonly id?: string | null;
          } | null;
        }> | null;
      }
    | null
    | undefined
): string | null {
  const sports = user?.sports ?? [];
  if (!sports.length) return null;

  const indexedSport =
    typeof user?.activeSportIndex === 'number' && user.activeSportIndex >= 0
      ? (sports[user.activeSportIndex] ?? null)
      : null;
  const primarySport = sports.find((sport) => sport.isPrimary) ?? null;
  const teamSport = sports.find(
    (sport) =>
      !!(sport.team?.teamId?.trim() || sport.team?.organizationId?.trim() || sport.team?.id?.trim())
  );

  const resolvedTeam = indexedSport?.team ?? primarySport?.team ?? teamSport?.team ?? null;
  return (
    resolvedTeam?.teamId?.trim() ||
    resolvedTeam?.organizationId?.trim() ||
    resolvedTeam?.id?.trim() ||
    null
  );
}

function resolveAgentXActiveSport(
  user:
    | {
        readonly activeSportIndex?: number | null;
        readonly sports?: ReadonlyArray<{
          readonly sport?: string | null;
          readonly isPrimary?: boolean;
          readonly team?: {
            readonly teamId?: string | null;
            readonly organizationId?: string | null;
            readonly id?: string | null;
          } | null;
        }> | null;
        readonly selectedSports?: readonly string[] | null;
        readonly connectedSources?:
          | readonly {
              readonly scopeType?: 'global' | 'sport' | 'team';
              readonly scopeId?: string;
            }[]
          | null;
      }
    | null
    | undefined
): string {
  const sports = user?.sports ?? [];
  const indexedSport =
    typeof user?.activeSportIndex === 'number' && user.activeSportIndex >= 0
      ? (sports[user.activeSportIndex] ?? null)
      : null;
  const primarySport = sports.find((sport) => sport.isPrimary) ?? null;
  const teamSport = sports.find(
    (sport) =>
      typeof sport.sport === 'string' &&
      sport.sport.trim().length > 0 &&
      !!(sport.team?.teamId?.trim() || sport.team?.organizationId?.trim() || sport.team?.id?.trim())
  );
  const scopedSport = user?.connectedSources?.find(
    (source) => source.scopeType === 'sport' && typeof source.scopeId === 'string'
  )?.scopeId;

  return (
    indexedSport?.sport?.trim() ||
    primarySport?.sport?.trim() ||
    teamSport?.sport?.trim() ||
    scopedSport?.trim() ||
    user?.selectedSports
      ?.find((sport) => typeof sport === 'string' && sport.trim().length > 0)
      ?.trim() ||
    ''
  );
}

@Component({
  selector: 'app-agent-x',
  standalone: true,
  imports: [
    AgentXShellWebComponent,
    NxtAgentXLandingComponent,
    NxtAgentXExecutionLayerSectionComponent,
    NxtAgentXWelcomeHeaderComponent,
  ],
  host: {
    '[class.agent-authenticated]': 'isAuthenticated()',
  },
  template: `
    <!-- Auth-init mask: covers landing→shell flash while Firebase session resolves -->
    @if (showAuthMask()) {
      <div class="auth-init-mask"></div>
    }

    @if (isAuthenticated()) {
      <!-- Authenticated users: full Agent X shell (goals check handled inside shell) -->
      @defer (when isAuthenticated()) {
        <nxt1-agent-x-shell-web
          [user]="userInfo()"
          [hideInput]="false"
          (connectedAccountsSave)="onConnectedAccountsSave($event)"
          (responseComplete)="onAgentResponseComplete()"
        />
      } @placeholder {
        <div class="auth-init-mask"></div>
      }
    } @else {
      <!-- Logged-out users: full-screen landing state only -->
      <div class="agent-landing-shell">
        <div class="agent-welcome-wrapper">
          <section class="agent-welcome-hero" aria-label="Agent X hero">
            <nxt1-agent-x-welcome-header />
          </section>

          <nxt1-agent-x-execution-layer-section />
        </div>

        @defer (on viewport) {
          <nxt1-agent-x-landing />
        } @placeholder {
          <div class="agent-landing-placeholder" aria-hidden="true"></div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: calc(100% + (var(--shell-content-padding-x, 0px) * 2));
        max-width: none;
        background: var(--nxt1-color-bg-primary);
        /* Pull up to negate shell__content padding-top — Agent X uses nav portal, no page header */
        margin-top: calc(-1 * (var(--nxt1-spacing-4, 1rem) + 7px));
        margin-inline: calc(-1 * var(--shell-content-padding-x, 0px));
      }

      /* Only lock viewport height + prevent scroll for authenticated desktop (chat UI) */
      @media (min-width: 769px) {
        :host(.agent-authenticated) {
          height: calc(100vh - var(--nxt1-nav-height, 56px));
          overflow: hidden;
        }
      }

      /* On mobile the shell content padding-top is 0 so don't pull up */
      @media (max-width: 768px) {
        :host {
          margin-top: 0;
        }
      }

      .auth-init-mask {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: transparent;
        pointer-events: none;
        animation: authMaskFadeOut 200ms ease 50ms both;
      }

      :host(.agent-authenticated) .auth-init-mask {
        background: var(--nxt1-color-bg-primary);
      }

      @keyframes authMaskFadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      .agent-landing-shell {
        position: relative;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-welcome-wrapper {
        position: relative;
        z-index: 10;
        background: var(--nxt1-color-bg-primary);
      }

      .agent-welcome-hero {
        min-height: calc(100vh - var(--nxt1-nav-height, 56px));
      }

      .agent-welcome-hero > nxt1-agent-x-welcome-header {
        display: block;
      }

      .agent-landing-placeholder {
        min-height: 1800px;
      }

      @media (max-width: 768px) {
        .agent-welcome-hero {
          min-height: auto;
        }

        .agent-landing-placeholder {
          min-height: 1200px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXComponent {
  private readonly logger = inject(NxtLoggingService).child('AgentXComponent');
  private readonly toast = inject(NxtToastService);
  private readonly seo = inject(SeoService);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly activityService = inject(ActivityService);
  private readonly transferState = inject(TransferState);
  private readonly transferredAuth = this.transferState.get<TransferredAuthState>(
    AUTH_TRANSFER_STATE_KEY,
    { user: null, firebaseUser: null }
  );
  private readonly hasTransferredUser = this.transferredAuth.user !== null;
  private readonly authFlowRef = signal<AuthFlowService | null>(null);
  private readonly agentXRef = signal<AgentXService | null>(null);
  private editProfileApi: EditProfileApiService | null = null;
  private connectedAccountsResync: ConnectedAccountsResyncService | null = null;
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly queuedThreadId = signal<string | null>(null);
  private readonly queuedStartupPrompt = signal<string | null>(null);
  private readonly queuedFilesPanelRequest = signal<string | null>(null);
  private readonly shellRef = viewChild(AgentXShellWebComponent);
  private profileRefreshInFlight = false;
  private profileRefreshQueued = false;

  /**
   * Auth-init overlay: prevents the marketing landing page from flashing
   * for authenticated users while Firebase resolves the session token.
   * Starts hidden on SSR/first render, shows only if auth is not yet ready
   * on the client, then fades away once Firebase resolves.
   */
  protected readonly showAuthMask = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!this.shouldResolveAuthOnClient()) {
        return;
      }

      const authFlow = this.ensureAuthFlow();
      if (authFlow.isInitialized()) {
        this.showAuthMask.set(false);
        return;
      }

      this.showAuthMask.set(this.shouldShowAuthMaskDuringResolve());
      const stop = effect(
        () => {
          if (authFlow.isInitialized()) {
            this.showAuthMask.set(false);
            stop.destroy();
          }
        },
        { injector: this.injector }
      );
    });

    effect(
      () => {
        const authFlow = this.authFlowRef();
        const user = authFlow?.user() ?? null;
        const firebaseUser = authFlow?.firebaseUser() ?? null;
        const isAuthReady = authFlow?.isAuthReady() ?? false;
        const listenerUserId = isAuthReady && firebaseUser ? user?.uid : null;

        this.activityService.startRealtimeForUser(listenerUserId);
      },
      { injector: this.injector }
    );

    effect(
      () => {
        const threadId = this.queryParamMap().get('thread')?.trim() ?? '';
        const queuedThreadId = this.queuedThreadId();

        if (!threadId) {
          if (queuedThreadId !== null) {
            this.queuedThreadId.set(null);
          }
          return;
        }

        if (!this.isAuthenticated() || queuedThreadId === threadId) {
          return;
        }

        this.logger.info('Queuing thread from query param', { threadId });
        this.ensureAgentX().queuePendingThread({ threadId, title: 'Agent X' });
        this.queuedThreadId.set(threadId);
      },
      { injector: this.injector }
    );

    effect(
      () => {
        const startupPrompt = this.queryParamMap().get('q')?.trim() ?? '';
        const queuedStartupPrompt = this.queuedStartupPrompt();

        if (!startupPrompt) {
          if (queuedStartupPrompt !== null) {
            this.queuedStartupPrompt.set(null);
          }
          return;
        }

        if (!this.isAuthenticated() || queuedStartupPrompt === startupPrompt) {
          return;
        }

        this.logger.info('Queuing startup prompt from query param');
        this.ensureAgentX().queueStartupMessage(startupPrompt);
        this.queuedStartupPrompt.set(startupPrompt);
      },
      { injector: this.injector }
    );

    effect(
      () => {
        const panel = this.queryParamMap().get('panel')?.trim() ?? '';
        const queuedFilesPanelRequest = this.queuedFilesPanelRequest();

        if (panel !== 'files') {
          if (queuedFilesPanelRequest !== null) {
            this.queuedFilesPanelRequest.set(null);
          }
          return;
        }

        const folderId = this.queryParamMap().get('folderId')?.trim() ?? '';
        const resourceId = this.queryParamMap().get('resourceId')?.trim() ?? '';
        const resourceType = this.queryParamMap().get('resourceType')?.trim() ?? '';
        const requestKey = `${folderId}|${resourceId}|${resourceType}`;

        if (!this.isAuthenticated() || queuedFilesPanelRequest === requestKey) {
          return;
        }

        const shell = this.shellRef();
        if (!shell) {
          return;
        }

        this.logger.info('Queuing files panel open from query params', {
          hasFolderId: folderId.length > 0,
          hasResourceId: resourceId.length > 0,
          resourceType: resourceType || null,
        });

        void shell.openFilesPanelFromNavigation({
          folderId: folderId || null,
          resourceId: resourceId || null,
          resourceType: resourceType || null,
        });
        this.queuedFilesPanelRequest.set(requestKey);
      },
      { injector: this.injector }
    );

    effect(
      () => {
        const isAuthenticated = this.isAuthenticated();
        const seoConfig: SeoConfig = {
          page: {
            title: AGENT_X_PAGE_TITLE,
            description: AGENT_X_PAGE_DESCRIPTION,
            canonicalUrl: AGENT_X_PAGE_URL,
            image: AGENT_X_PAGE_IMAGE,
            imageAlt: AGENT_X_PAGE_IMAGE_ALT,
            keywords: [...AGENT_X_PAGE_KEYWORDS],
            noIndex: isAuthenticated,
          },
          openGraph: {
            type: 'website',
            title: AGENT_X_PAGE_TITLE,
            description: AGENT_X_PAGE_DESCRIPTION,
            url: AGENT_X_PAGE_URL,
            image: AGENT_X_PAGE_IMAGE,
            imageAlt: AGENT_X_PAGE_IMAGE_ALT,
            imageWidth: AGENT_X_PAGE_IMAGE_WIDTH,
            imageHeight: AGENT_X_PAGE_IMAGE_HEIGHT,
          },
          twitter: {
            card: 'summary_large_image',
            title: AGENT_X_PAGE_TITLE,
            description: AGENT_X_PAGE_DESCRIPTION,
            image: AGENT_X_PAGE_IMAGE,
            imageAlt: AGENT_X_PAGE_IMAGE_ALT,
          },
          structuredData: AGENT_X_STRUCTURED_DATA,
        };

        this.seo.applySeoConfig(seoConfig);
      },
      { injector: this.injector }
    );
  }

  /** Auth state — hard-gates shell visibility */
  protected readonly isAuthenticated = computed(() => {
    const authFlow = this.authFlowRef();
    return authFlow ? authFlow.isAuthenticated() : this.hasTransferredUser;
  });

  /**
   * Transform auth user to AgentXUser interface.
   */
  protected readonly userInfo = computed<AgentXUser | null>(() => {
    const authFlow = this.authFlowRef();
    if (authFlow) {
      const user = authFlow.user();
      if (!user) return null;

      return {
        profileImg: user.profileImg ?? null,
        displayName: user.displayName,
        role: user.role,
        activeTeamId: resolveAgentXActiveTeamId(user),
        activeSport: resolveAgentXActiveSport(user),
        selectedSports: user.sports?.map(({ sport }) => sport) ?? [],
        connectedSources: user.connectedSources ?? [],
        connectedEmails: user.connectedEmails ?? [],
        firebaseProviders: authFlow.firebaseUser()?.providerData ?? [],
      };
    }

    const user = this.transferredAuth.user;
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName,
      role: user.role as AgentXUser['role'],
      activeTeamId: resolveAgentXActiveTeamId(
        user as {
          readonly activeSportIndex?: number | null;
          readonly sports?: ReadonlyArray<{
            readonly isPrimary?: boolean;
            readonly team?: {
              readonly teamId?: string | null;
              readonly organizationId?: string | null;
              readonly id?: string | null;
            } | null;
          }> | null;
        }
      ),
      activeSport: resolveAgentXActiveSport(user),
      selectedSports: user.selectedSports ?? [],
      connectedSources: [],
      connectedEmails: (user.connectedEmails as AgentXUser['connectedEmails']) ?? [],
      firebaseProviders: this.transferredAuth.firebaseUser?.providerData ?? [],
    };
  });

  private shouldResolveAuthOnClient(): boolean {
    return true;
  }

  private shouldShowAuthMaskDuringResolve(): boolean {
    return this.hasTransferredUser;
  }

  private ensureAuthFlow(): AuthFlowService {
    const existing = this.authFlowRef();
    if (existing) {
      return existing;
    }

    const authFlow = this.injector.get(AuthFlowService);
    this.authFlowRef.set(authFlow);
    return authFlow;
  }

  private ensureAgentX(): AgentXService {
    const existing = this.agentXRef();
    if (existing) {
      return existing;
    }

    const agentX = this.injector.get(AgentXService);
    this.agentXRef.set(agentX);
    return agentX;
  }

  private getEditProfileApi(): EditProfileApiService {
    if (!this.editProfileApi) {
      this.editProfileApi = this.injector.get(EditProfileApiService);
    }
    return this.editProfileApi;
  }

  private getConnectedAccountsResync(): ConnectedAccountsResyncService {
    if (!this.connectedAccountsResync) {
      this.connectedAccountsResync = this.injector.get(ConnectedAccountsResyncService);
    }
    return this.connectedAccountsResync;
  }

  protected async onConnectedAccountsSave(
    request: AgentXConnectedAccountsSaveRequest
  ): Promise<void> {
    const authFlow = this.ensureAuthFlow();
    const user = authFlow.user();
    if (!user?.uid) {
      this.toast.error('Not signed in. Please refresh and try again.');
      return;
    }

    const connectedSources = mapToConnectedSources(request.linkSources.links);
    const disconnectedSignInProviders = request.disconnectedSignInProviders ?? [];
    const result = await this.getEditProfileApi().updateSection(user.uid, 'connected-sources', {
      connectedSources,
      ...(disconnectedSignInProviders.length > 0 ? { disconnectedSignInProviders } : {}),
    });

    if (result.success) {
      await authFlow.refreshUserProfile();
      if (request.requestResync) {
        await this.getConnectedAccountsResync().request(request.resyncSources ?? []);
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

  protected onAgentResponseComplete(): void {
    const authFlow = this.ensureAuthFlow();
    if (!authFlow.user()?.uid) {
      return;
    }

    if (this.profileRefreshInFlight) {
      this.profileRefreshQueued = true;
      return;
    }

    void this.refreshAgentXUserContext();
  }

  private async refreshAgentXUserContext(): Promise<void> {
    const authFlow = this.ensureAuthFlow();
    if (!authFlow.user()?.uid) {
      return;
    }

    this.profileRefreshInFlight = true;
    try {
      await authFlow.refreshUserProfile();
    } catch (err) {
      this.logger.warn('Failed to refresh Agent X user context after response completion', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.profileRefreshInFlight = false;
      if (this.profileRefreshQueued) {
        this.profileRefreshQueued = false;
        void this.refreshAgentXUserContext();
      }
    }
  }
}
