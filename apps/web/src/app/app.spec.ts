import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtThemeService } from '@nxt1/ui/services/theme';
import { AnalyticsService } from './core/services/infrastructure/analytics.service';
import { WebVitalsService } from './core/services/infrastructure/web-vitals.service';

describe('AppComponent', () => {
  let routerEvents: Subject<NavigationEnd>;
  let router: { events: ReturnType<Subject<NavigationEnd>['asObservable']> };
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  const breadcrumb = {
    initialize: vi.fn(),
  };
  const webVitals = {
    initialize: vi.fn(),
  };
  const analytics = {
    trackPageView: vi.fn(),
  };

  logger.child.mockReturnValue(logger);

  beforeEach(async () => {
    routerEvents = new Subject<NavigationEnd>();
    router = {
      events: routerEvents.asObservable(),
    };

    logger.child.mockReturnValue(logger);
    logger.info.mockReset();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.debug.mockReset();
    logger.fatal.mockReset();
    breadcrumb.initialize.mockReset();
    webVitals.initialize.mockReset();
    analytics.trackPageView.mockReset();

    await TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: NxtPlatformService, useValue: { isBrowser: () => true } },
        { provide: NxtLoggingService, useValue: logger },
        { provide: NxtBreadcrumbService, useValue: breadcrumb },
        { provide: NxtThemeService, useValue: {} },
        { provide: AnalyticsService, useValue: analytics },
        { provide: WebVitalsService, useValue: webVitals },
      ],
    }).compileComponents();
  });

  it('tracks a page view on router navigation end', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const title = 'NXT1 Agent X';
    document.title = title;

    const component = TestBed.runInInjectionContext(() => new AppComponent());
    component.ngOnInit();

    routerEvents.next(new NavigationEnd(1, '/agent-x', '/agent-x?tab=chat'));

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(analytics.trackPageView).toHaveBeenCalledWith('/agent-x?tab=chat', title);

    scrollToSpy.mockRestore();
  });
});
