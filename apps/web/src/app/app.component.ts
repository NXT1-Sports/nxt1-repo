import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  afterNextRender,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import {
  NxtPlatformService,
  NxtLoggingService,
  NxtBreadcrumbService,
  NxtThemeService,
} from '@nxt1/ui/services';
import {
  NxtAppDownloadBarComponent,
  NxtAppDownloadBarService,
} from '@nxt1/ui/components/app-download-bar';
import type { AuthUser } from '@nxt1/core/auth';
import type { ILogger } from '@nxt1/core/logging';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { WebVitalsService } from './core/services';
import { AuthFlowService } from './core/services/auth/auth-flow.service';
import { environment } from '../environments/environment';

/**
 * Root Application Component
 *
 * Architecture:
 * - Uses signals for reactive state management
 * - SSR-safe with platform checks
 * - Handles global app initialization and loading states
 * - Routes delegate to feature modules via lazy loading
 * - All styles use Tailwind CSS utilities in template
 *
 * @example
 * The component bootstraps with a loading state that resolves
 * once authentication is determined. Child routes handle their
 * own loading states independently.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NxtAppDownloadBarComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('AppComponent');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  protected readonly downloadBar = inject(NxtAppDownloadBarService);
  private readonly webVitals = inject(WebVitalsService);
  private readonly authFlow = inject(AuthFlowService);

  /** Theme service — injected at root so it initializes on every route (including 404) */
  private readonly theme = inject(NxtThemeService);

  private readonly bootstrappedTeamOrgId = signal<string | null>(null);
  private pendingTeamBrandOrgId: string | null = null;

  /** Sync auth state to download bar — hide for logged-in users */
  private readonly authSyncEffect = effect(() => {
    this.downloadBar.setAuthenticated(this.authFlow.isAuthenticated());
  });

  /** Seed Team colors from the signed-in user's linked organization as soon as auth resolves. */
  private readonly teamBrandBootstrapEffect = effect(() => {
    if (!this.platform.isBrowser()) {
      return;
    }

    if (!this.authFlow.isAuthReady()) {
      return;
    }

    const seed = this.resolveUserTeamBrandSeed(this.authFlow.user());

    if (!seed) {
      this.pendingTeamBrandOrgId = null;
      this.bootstrappedTeamOrgId.set(null);
      this.theme.clearStoredTeamBrand();
      return;
    }

    if (seed.primaryColor) {
      this.pendingTeamBrandOrgId = null;
      this.bootstrappedTeamOrgId.set(seed.organizationId);
      this.theme.setStoredTeamBrand(seed.primaryColor, seed.secondaryColor);
      return;
    }

    if (this.bootstrappedTeamOrgId() !== seed.organizationId) {
      this.theme.clearStoredTeamBrand();
    }

    if (
      this.bootstrappedTeamOrgId() === seed.organizationId ||
      this.pendingTeamBrandOrgId === seed.organizationId
    ) {
      return;
    }

    void this.bootstrapTeamBrand(seed.organizationId);
  });

  // ============================================
  // STATE SIGNALS
  // ============================================

  /** Global loading state - shown during initial auth resolution */
  readonly loading = signal(true);

  /** App initialization error state */
  readonly error = signal<string | null>(null);

  /** Whether the app is ready to render content */
  readonly isReady = computed(() => !this.loading() && !this.error());

  /** Current year for footer copyright */
  readonly currentYear = new Date().getFullYear();

  constructor() {
    // SSR-safe DOM initialization
    afterNextRender(() => {
      this.initializeBrowserFeatures();
    });
  }

  ngOnInit(): void {
    this.setupRouterEvents();
    this.initializeApp();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize app state.
   *
   * Marks the app as ready immediately — auth state resolves
   * asynchronously and the UI adapts reactively via signals.
   * No artificial delay; rendering begins on the first frame.
   */
  private initializeApp(): void {
    this.loading.set(false);
  }

  /**
   * Initialize browser-only features
   * Called in afterNextRender to ensure DOM is available.
   *
   * PERFORMANCE: Non-critical initializations are deferred to idle time
   * so they don't compete with LCP rendering on the main thread.
   */
  private initializeBrowserFeatures(): void {
    if (!this.platform.isBrowser()) return;

    // Initialize breadcrumb tracking for crashlytics context
    this.breadcrumbs.initialize();

    // Initialize app download promotion bar (scroll-triggered)
    this.downloadBar.initialize();

    // Start Core Web Vitals collection (LCP, INP, CLS, FCP, TTFB)
    this.webVitals.initialize();

    // Log app initialization
    this.logger.info('Browser features initialized');
  }

  /**
   * Setup router event listeners for analytics, scroll restoration, etc.
   */
  private setupRouterEvents(): void {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.platform.isBrowser()) {
        // Scroll to top on navigation
        window.scrollTo(0, 0);
      }
    });
  }

  private resolveUserTeamBrandSeed(user: AuthUser | null): {
    readonly organizationId: string;
    readonly primaryColor: string | null;
    readonly secondaryColor: string | null;
  } | null {
    const sports = user?.sports ?? [];
    const linkedSport =
      sports.find((sport) => sport.isPrimary && sport.team?.organizationId?.trim()) ??
      sports.find((sport) => sport.team?.organizationId?.trim());

    const organizationId = linkedSport?.team?.organizationId?.trim();
    if (!organizationId) {
      return null;
    }

    const linkedTeam = linkedSport?.team;

    return {
      organizationId,
      primaryColor: linkedTeam?.primaryColor?.trim() || null,
      secondaryColor: linkedTeam?.secondaryColor?.trim() || null,
    };
  }

  private async bootstrapTeamBrand(organizationId: string): Promise<void> {
    this.pendingTeamBrandOrgId = organizationId;

    try {
      const response = await firstValueFrom(
        this.http.get<{
          success: boolean;
          data?: {
            id: string;
            primaryColor?: string | null;
            secondaryColor?: string | null;
          };
        }>(`${environment.apiURL}/programs/${encodeURIComponent(organizationId)}`)
      );

      if (this.pendingTeamBrandOrgId !== organizationId) {
        return;
      }

      const primaryColor = response.data?.primaryColor?.trim() || null;
      const secondaryColor = response.data?.secondaryColor?.trim() || null;

      this.bootstrappedTeamOrgId.set(organizationId);

      if (response.success && primaryColor) {
        this.theme.setStoredTeamBrand(primaryColor, secondaryColor);
        this.logger.debug('Bootstrapped team brand', { organizationId, primaryColor });
        return;
      }

      this.theme.clearStoredTeamBrand();
      this.logger.debug('No team brand colors found for organization', { organizationId });
    } catch (err) {
      if (this.pendingTeamBrandOrgId === organizationId) {
        this.theme.clearStoredTeamBrand();
      }

      this.logger.warn('Failed to bootstrap team brand', {
        organizationId,
        error: err,
      });
    } finally {
      if (this.pendingTeamBrandOrgId === organizationId) {
        this.pendingTeamBrandOrgId = null;
      }
    }
  }
}
