import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Root Application Component
 *
 * Architecture:
 * - Uses signals for reactive state management
 * - SSR-safe with platform checks
 * - Handles global app initialization and loading states
 * - Routes delegate to feature modules via lazy loading
 *
 * @example
 * The component bootstraps with a loading state that resolves
 * once authentication is determined. Child routes handle their
 * own loading states independently.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

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

  // ============================================
  // PLATFORM HELPERS
  // ============================================

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

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
      console.error('[AppComponent] Initialization failed:', err);
      this.error.set(
        err instanceof Error ? err.message : 'Failed to initialize application'
      );
      this.loading.set(false);
    }
  }

  /**
   * Initialize browser-only features
   * Called in afterNextRender to ensure DOM is available
   */
  private initializeBrowserFeatures(): void {
    if (!this.isBrowser) return;

    // Initialize any browser-specific features here
    // e.g., analytics, service worker registration, etc.
    console.log('[AppComponent] Browser features initialized');
  }

  /**
   * Setup router event listeners for analytics, scroll restoration, etc.
   */
  private setupRouterEvents(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (this.isBrowser) {
          // Scroll to top on navigation
          window.scrollTo(0, 0);

          // Track page view (integrate with analytics service)
          // this.analytics.trackPageView(event.urlAfterRedirects);
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
