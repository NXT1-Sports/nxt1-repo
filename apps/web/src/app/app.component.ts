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
import type { ILogger } from '@nxt1/core/logging';
import { filter } from 'rxjs/operators';
import { AnalyticsService } from './core/services';
import { WebVitalsService } from './core/services';
import { AuthFlowService } from './core/services/auth/auth-flow.service';

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
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('AppComponent');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly downloadBar = inject(NxtAppDownloadBarService);
  private readonly webVitals = inject(WebVitalsService);
  private readonly authFlow = inject(AuthFlowService);

  /** Theme service — injected at root so it initializes on every route (including 404) */
  private readonly theme = inject(NxtThemeService);

  /** Sync auth state to download bar — hide for logged-in users */
  private readonly authSyncEffect = effect(() => {
    this.downloadBar.setAuthenticated(this.authFlow.isAuthenticated());
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
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (this.platform.isBrowser()) {
          // Scroll to top on navigation
          window.scrollTo(0, 0);

          // Track page view for analytics
          this.analytics.trackPageView(event.urlAfterRedirects);
          this.logger.debug('Page view tracked', { path: event.urlAfterRedirects });
        }
      });
  }
}
