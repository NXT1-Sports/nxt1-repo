/**
 * @fileoverview Regression test: onboarding actions must not throw before the
 * shared state machine has finished (async) initialization.
 *
 * Reproduces Sentry issue JAVASCRIPT-ANGULAR-1B:
 * "TypeError: Cannot read properties of undefined (reading 'continue')".
 *
 * Mocks `inject()`/`effect()` directly (rather than TestBed) so we avoid
 * compiling the component's full standalone-import tree, which pulls in
 * Ionic components unrelated to this guard behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  AuthFlowService,
  AuthApiService,
  AuthErrorHandler,
  AUTH_SERVICE,
  OnboardingAnalyticsService,
} from '../../../../core/services/auth';
import { SeoService } from '../../../../core/services';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtThemeService } from '@nxt1/ui/services/theme';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ProfileGenerationStateService } from '@nxt1/ui/profile';

const onboardingMocks = vi.hoisted(() => {
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  return {
    router: { navigate: vi.fn() },
    route: { snapshot: { queryParamMap: { get: () => null } } },
    authFlow: { isInitialized: () => false, user: () => null, signOut: vi.fn() },
    authApi: { getUserProfile: vi.fn(), validateTeamCode: vi.fn() },
    authErrorHandler: {},
    seo: { updatePage: vi.fn() },
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    platform: { isMobile: () => false },
    themeService: { setTemporaryOverride: vi.fn() },
    onboardingAnalytics: { endSession: vi.fn() },
    profileGenerationState: {},
    http: { get: vi.fn() },
    browserAuth: { getIdToken: vi.fn() },
    logger,
  };
});

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn((token: unknown) => {
      if (token === PLATFORM_ID) return 'browser';
      if (token === Router) return onboardingMocks.router;
      if (token === ActivatedRoute) return onboardingMocks.route;
      if (token === AuthFlowService) return onboardingMocks.authFlow;
      if (token === AuthApiService) return onboardingMocks.authApi;
      if (token === AuthErrorHandler) return onboardingMocks.authErrorHandler;
      if (token === SeoService) return onboardingMocks.seo;
      if (token === NxtToastService) return onboardingMocks.toast;
      if (token === NxtPlatformService) return onboardingMocks.platform;
      if (token === NxtThemeService) return onboardingMocks.themeService;
      if (token === OnboardingAnalyticsService) return onboardingMocks.onboardingAnalytics;
      if (token === ProfileGenerationStateService) return onboardingMocks.profileGenerationState;
      if (token === NxtLoggingService) return onboardingMocks.logger;
      if (token === HttpClient) return onboardingMocks.http;
      if (token === AUTH_SERVICE) return onboardingMocks.browserAuth;
      return undefined;
    }),
    // The constructor's effect() only reacts to auth-ready state; it isn't
    // needed to exercise the pre-init guard behavior under test.
    effect: vi.fn(() => ({ destroy: vi.fn() })),
  };
});

describe('OnboardingComponent — machine readiness guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onboardingMocks.logger.child.mockReturnValue(onboardingMocks.logger);
  });

  it('does not throw when onContinue/onSkip/onBack/onRoleSelect fire before the machine is created', async () => {
    const { OnboardingComponent } = await import('./onboarding.component');
    const component = new OnboardingComponent();

    // The state machine is created asynchronously in initializeStateMachine();
    // it has not resolved yet since auth is never marked initialized above.
    expect(component.machineReady()).toBe(false);

    expect(() => component.onContinue()).not.toThrow();
    expect(() => component.onSkip()).not.toThrow();
    expect(() => component.onBack()).not.toThrow();
    expect(() => component.onRoleSelect('athlete')).not.toThrow();
    expect(() => component.goToStep(0)).not.toThrow();
    expect(() =>
      component.onProfileChange({ firstName: 'a', lastName: 'b', profileImgs: null })
    ).not.toThrow();
  });
});
