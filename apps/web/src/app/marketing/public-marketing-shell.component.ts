import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { NxtAppDownloadBarComponent } from '@nxt1/ui/components/app-download-bar';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import {
  PublicMarketingHeaderComponent,
  type PublicNavItem,
} from './public-marketing-header.component';

const PUBLIC_NAV_ITEMS: readonly PublicNavItem[] = [
  {
    id: 'nav-agent-x',
    label: 'Agent X',
    route: '/agent-x',
  },
  {
    id: 'nav-programs',
    label: 'Programs',
    route: '/programs',
  },
];

const DOWNLOAD_BAR_DISMISSED_KEY = 'nxt1:download-bar-dismissed:v2';
const DOWNLOAD_BAR_SCROLL_THRESHOLD = 220;
const DOWNLOAD_BAR_END_HIDE_OFFSET = 220;
const DOWNLOAD_BAR_DIRECTION_INTENT_TTL_MS = 600;
const PUBLIC_MARKETING_SCROLL_CLASS = 'nxt1-public-marketing-scroll';
const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
const GOOGLE_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';

@Component({
  selector: 'app-public-marketing-shell',
  standalone: true,
  imports: [RouterOutlet, PublicMarketingHeaderComponent, NxtAppDownloadBarComponent],
  template: `
    <div class="public-shell">
      <aside
        class="platform-promo platform-promo--mobile"
        [class.platform-promo--hidden]="platformBannerScrolledAway()"
        aria-label="NXT1 platform announcement"
      >
        <div
          class="platform-promo__inner platform-promo__inner--mobile"
          [class.platform-promo__inner--hidden]="platformBannerScrolledAway()"
        >
          <div class="platform-promo__message platform-promo__message--mobile">
            <span class="platform-promo__status" aria-hidden="true"></span>
            <span class="platform-promo__label">Download the NXT1 app.</span>
            <span class="platform-promo__copy">Get the full platform on iPhone and Android.</span>
          </div>
        </div>
      </aside>

      <aside
        class="platform-promo"
        [class.platform-promo--hidden]="platformBannerScrolledAway()"
        aria-label="NXT1 app download announcement"
      >
        <div
          class="platform-promo__inner"
          [class.platform-promo__inner--hidden]="platformBannerScrolledAway()"
        >
          <div class="platform-promo__message">
            <span class="platform-promo__status" aria-hidden="true"></span>
            <span class="platform-promo__label">Download the NXT1 app</span>
            <span class="platform-promo__copy">
              Take the full platform with you and get NXT1 on iPhone or Android.
            </span>
          </div>

          <button type="button" class="platform-promo__button" (click)="goToAppDownload()">
            Download the App
          </button>
        </div>
      </aside>

      <app-public-marketing-header
        [items]="headerItems"
        (navigate)="onHeaderNavigate($event)"
        (logoClick)="goHome()"
      />

      <main class="public-shell__content">
        <router-outlet />
      </main>

      @defer (on timer(6s); on interaction) {
        <nxt1-app-download-bar
          [visible]="downloadBarVisible()"
          [bottomOffset]="16"
          (dismissed)="dismissDownloadBar()"
        ></nxt1-app-download-bar>
      } @placeholder {
        <div aria-hidden="true"></div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        background: var(--nxt1-color-bg-primary);
      }

      .public-shell {
        min-height: 100dvh;
        background: var(--nxt1-color-bg-primary);
      }

      .public-shell__content {
        min-width: 0;
      }

      app-public-marketing-header {
        display: block !important;
        position: sticky;
        top: 0;
        z-index: 40;
      }

      .platform-promo {
        display: none;
      }

      @media (min-width: 768px) {
        .platform-promo--mobile {
          display: none !important;
        }
      }

      @media (max-width: 767.98px) {
        app-public-marketing-header {
          display: block !important;
        }

        .platform-promo--mobile {
          display: block;
          max-height: 42px;
          overflow: hidden;
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent),
              transparent 54%,
              color-mix(in srgb, var(--nxt1-color-secondary) 10%, transparent)
            ),
            var(--nxt1-color-bg-primary);
          transition:
            max-height var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo--mobile.platform-promo--hidden {
          max-height: 0;
          border-bottom-color: transparent;
        }

        .platform-promo__inner--mobile {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-2);
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__inner--hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-8px);
        }

        .platform-promo__message--mobile {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-1_5, 6px);
          color: var(--nxt1-color-text-secondary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-medium);
          line-height: var(--nxt1-lineHeight-normal);
          text-align: center;
        }

        .platform-promo__message--mobile .platform-promo__status {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: var(--nxt1-borderRadius-full);
          background: var(--nxt1-color-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        }

        .platform-promo__message--mobile .platform-promo__label {
          flex: 0 0 auto;
          color: var(--nxt1-color-text-primary);
          font-weight: var(--nxt1-fontWeight-semibold);
        }

        .platform-promo__message--mobile .platform-promo__copy {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 374px) {
          .platform-promo__message--mobile .platform-promo__copy {
            display: none;
          }
        }
      }

      @media (min-width: 768px) {
        .platform-promo {
          display: block;
          max-height: 44px;
          overflow: hidden;
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent),
              transparent 36%,
              color-mix(in srgb, var(--nxt1-color-secondary) 10%, transparent)
            ),
            var(--nxt1-color-bg-primary);
          transition:
            max-height var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-normal, 220ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo--hidden {
          max-height: 0;
          border-bottom-color: transparent;
        }

        .platform-promo__inner {
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-4);
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__inner--hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-8px);
        }

        .platform-promo__message {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: var(--nxt1-spacing-2);
          color: var(--nxt1-color-text-secondary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: var(--nxt1-fontWeight-medium);
          line-height: var(--nxt1-lineHeight-normal);
        }

        .platform-promo__status {
          width: 8px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: var(--nxt1-borderRadius-full);
          background: var(--nxt1-color-primary);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        }

        .platform-promo__label {
          flex: 0 0 auto;
          color: var(--nxt1-color-text-primary);
          font-weight: var(--nxt1-fontWeight-semibold);
        }

        .platform-promo__copy {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .platform-promo__button {
          flex: 0 0 auto;
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 46%, transparent);
          border-radius: var(--nxt1-borderRadius-full);
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
          background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
          color: var(--nxt1-color-primary);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xs);
          font-weight: var(--nxt1-fontWeight-semibold);
          line-height: var(--nxt1-lineHeight-normal);
          cursor: pointer;
          transition:
            background-color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            border-color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease),
            transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
        }

        .platform-promo__button:hover {
          background: color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
          border-color: var(--nxt1-color-primary);
          transform: translateY(-1px);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicMarketingShellComponent {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private promoViewed = false;

  protected readonly headerItems = PUBLIC_NAV_ITEMS;
  protected readonly platformBannerScrolledAway = signal(false);
  protected readonly downloadBarScrolledPastThreshold = signal(false);
  protected readonly downloadBarScrollingDown = signal(false);
  protected readonly downloadBarNearPageEnd = signal(false);
  protected readonly downloadBarDismissed = signal(false);
  private previousScrollY = 0;

  protected readonly downloadBarVisible = computed(
    () =>
      !this.downloadBarDismissed() &&
      this.downloadBarScrolledPastThreshold() &&
      this.downloadBarScrollingDown() &&
      !this.downloadBarNearPageEnd()
  );

  constructor() {
    afterNextRender(() => {
      this.initializePublicChrome();
    });
  }

  protected onHeaderNavigate(event: PublicNavItem): void {
    const route = event.route;
    if (route) {
      void this.router.navigateByUrl(route);
      return;
    }

    if (event.href && this.isBrowser) {
      window.location.href = event.href;
    }
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/');
  }

  protected goToAppDownload(): void {
    this.trackPromoSelected('public_marketing_shell_banner');

    if (!this.isBrowser) return;

    window.open(this.resolveAppDownloadUrl(), '_blank', 'noopener,noreferrer');
  }

  protected dismissDownloadBar(): void {
    this.downloadBarDismissed.set(true);

    if (!this.isBrowser) return;

    try {
      window.localStorage.setItem(DOWNLOAD_BAR_DISMISSED_KEY, 'true');
    } catch {
      // Ignore storage failures in locked-down browser contexts.
    }
  }

  private initializePublicChrome(): void {
    if (!this.isBrowser) return;

    this.trackPromoViewed('public_marketing_shell_banner');

    document.documentElement.classList.add(PUBLIC_MARKETING_SCROLL_CLASS);
    document.body.classList.add(PUBLIC_MARKETING_SCROLL_CLASS);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.scheduleScrollToTop());

    try {
      this.downloadBarDismissed.set(
        window.localStorage.getItem(DOWNLOAD_BAR_DISMISSED_KEY) === 'true'
      );
    } catch {
      this.downloadBarDismissed.set(false);
    }

    let lastUserDirectionAt = 0;
    let lastTouchClientY: number | null = null;

    const markUserScrollDirection = (scrollingDown: boolean) => {
      this.downloadBarScrollingDown.set(scrollingDown);
      lastUserDirectionAt = window.performance.now();
    };

    const updateScrollDirectionFromPosition = (scrollY: number) => {
      if (window.performance.now() - lastUserDirectionAt < DOWNLOAD_BAR_DIRECTION_INTENT_TTL_MS) {
        return;
      }

      if (scrollY > this.previousScrollY) {
        this.downloadBarScrollingDown.set(true);
      } else if (scrollY < this.previousScrollY) {
        this.downloadBarScrollingDown.set(false);
      }
    };

    const updateScrollState = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

      updateScrollDirectionFromPosition(scrollY);
      this.platformBannerScrolledAway.set(scrollY > 24);
      this.downloadBarScrolledPastThreshold.set(scrollY > DOWNLOAD_BAR_SCROLL_THRESHOLD);
      this.downloadBarNearPageEnd.set(maxScroll - scrollY < DOWNLOAD_BAR_END_HIDE_OFFSET);
      this.previousScrollY = scrollY;
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) {
        markUserScrollDirection(true);
      } else if (event.deltaY < 0) {
        markUserScrollDirection(false);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      lastTouchClientY = event.touches.item(0)?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentTouchY = event.touches.item(0)?.clientY ?? null;
      if (currentTouchY === null || lastTouchClientY === null) {
        lastTouchClientY = currentTouchY;
        return;
      }

      if (currentTouchY < lastTouchClientY) {
        markUserScrollDirection(true);
      } else if (currentTouchY > lastTouchClientY) {
        markUserScrollDirection(false);
      }

      lastTouchClientY = currentTouchY;
    };

    const handleTouchEnd = () => {
      lastTouchClientY = null;
    };

    window.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    updateScrollState();

    this.destroyRef.onDestroy(() => {
      document.documentElement.classList.remove(PUBLIC_MARKETING_SCROLL_CLASS);
      document.body.classList.remove(PUBLIC_MARKETING_SCROLL_CLASS);
      window.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    });
  }

  private scheduleScrollToTop(): void {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      this.elementRef.nativeElement
        .querySelectorAll<HTMLElement>('.public-shell, .public-shell__content, main, article')
        .forEach((element) => {
          element.scrollTop = 0;
          element.scrollLeft = 0;
        });
      this.platformBannerScrolledAway.set(false);
      this.downloadBarScrolledPastThreshold.set(false);
      this.downloadBarScrollingDown.set(false);
      this.downloadBarNearPageEnd.set(false);
      this.previousScrollY = 0;
    };

    scrollToTop();
    window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(scrollToTop);
    });
  }

  private trackPromoViewed(placement: string): void {
    if (this.promoViewed) return;
    this.promoViewed = true;
    this.analytics?.trackEvent(FIREBASE_EVENTS.VIEW_PROMOTION, {
      creative_name: 'mobile_app_download_banner',
      creative_slot: placement,
      promotion_id: 'mobile_app_download',
      promotion_name: 'Mobile App Download Banner',
      location_id: placement,
    });
  }

  private trackPromoSelected(placement: string): void {
    this.analytics?.trackEvent(FIREBASE_EVENTS.SELECT_PROMOTION, {
      creative_name: 'mobile_app_download_banner',
      creative_slot: placement,
      promotion_id: 'mobile_app_download',
      promotion_name: 'Mobile App Download Banner',
      location_id: placement,
    });
  }

  private resolveAppDownloadUrl(): string {
    if (!this.isBrowser) return IOS_APP_STORE_URL;

    const userAgent = window.navigator.userAgent.toLowerCase();
    return userAgent.includes('android') ? GOOGLE_PLAY_STORE_URL : IOS_APP_STORE_URL;
  }
}
