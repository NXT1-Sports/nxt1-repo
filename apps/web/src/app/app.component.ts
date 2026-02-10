import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import {
  NxtPlatformService,
  NxtLoggingService,
  NxtBreadcrumbService,
  NxtAppDownloadBarComponent,
  NxtAppDownloadBarService,
  NxtThemeService,
} from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { filter } from 'rxjs/operators';
import { AnalyticsService } from './core/services/analytics.service';

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

  /** Theme service — injected at root so it initializes on every route (including 404) */
  private readonly theme = inject(NxtThemeService);

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
   * Initialize app state and resolve authentication
   * This runs on both server and client
   */
  private async initializeApp(): Promise<void> {
    try {
      // Simulate auth resolution delay (replace with real auth check)
      // In production, this will be replaced by AuthFlowService initialization
      await this.delay(100);

      this.loading.set(false);
    } catch (err) {
      this.logger.error('Initialization failed', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to initialize application');
      this.loading.set(false);
    }
  }

  /**
   * Initialize browser-only features
   * Called in afterNextRender to ensure DOM is available
   */
  private initializeBrowserFeatures(): void {
    if (!this.platform.isBrowser()) return;

    // Initialize breadcrumb tracking for crashlytics context
    this.breadcrumbs.initialize();

    // Initialize app download promotion bar (scroll-triggered)
    this.downloadBar.initialize();

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

  // ============================================
  // UTILITY METHODS
  // ============================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
