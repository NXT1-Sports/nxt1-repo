/**
 * @fileoverview Regression test: onboarding actions must not throw before the
 * shared state machine has finished (async) initialization.
 *
 * Mirrors the web OnboardingComponent guard fix for Sentry issue
 * JAVASCRIPT-ANGULAR-1B on the mobile OnboardingService.
 *
 * Follows the established pattern for mobile services with Ionic
 * dependencies (see auth-flow-apple-signin.spec.ts): mock `inject()`
 * directly instead of going through TestBed/Ionic providers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthFlowService } from './auth-flow.service';
import { AuthApiService } from './auth-api.service';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';
import { ProfileService } from '../state/profile.service';
import { EditProfileApiService } from '../api/edit-profile-api.service';
import { PerformanceService } from '../infrastructure/performance.service';
import {
  HapticsService,
  NxtToastService,
  NxtLoggingService,
  NxtThemeService,
  NxtBreadcrumbService,
  ProfileGenerationStateService,
} from '@nxt1/ui';
import { CapacitorHttpAdapter } from '../../infrastructure';

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
    navController: { navigateRoot: vi.fn().mockResolvedValue(true) },
    location: { path: vi.fn(() => ''), replaceState: vi.fn() },
    authFlow: {
      isInitialized: () => false,
      user: () => null,
      signOut: vi.fn(),
    },
    profileService: {},
    profileGenerationState: {},
    authApi: { validateTeamCode: vi.fn() },
    haptics: {
      selection: vi.fn().mockResolvedValue(undefined),
      impact: vi.fn().mockResolvedValue(undefined),
    },
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    analytics: { cleanup: vi.fn() },
    themeService: { setTemporaryOverride: vi.fn() },
    editProfileApi: {},
    breadcrumb: {},
    performance: {},
    http: { get: vi.fn() },
    logger,
  };
});

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn((token: unknown) => {
      if (token === AuthFlowService) return onboardingMocks.authFlow;
      if (token === ProfileService) return onboardingMocks.profileService;
      if (token === ProfileGenerationStateService) return onboardingMocks.profileGenerationState;
      if (token === AuthApiService) return onboardingMocks.authApi;
      if (token === HapticsService) return onboardingMocks.haptics;
      if (token === NxtToastService) return onboardingMocks.toast;
      if (token === OnboardingAnalyticsService) return onboardingMocks.analytics;
      if (token === NxtThemeService) return onboardingMocks.themeService;
      if (token === EditProfileApiService) return onboardingMocks.editProfileApi;
      if (token === NxtLoggingService) return onboardingMocks.logger;
      if (token === NxtBreadcrumbService) return onboardingMocks.breadcrumb;
      if (token === PerformanceService) return onboardingMocks.performance;
      if (token === CapacitorHttpAdapter) return onboardingMocks.http;

      switch ((token as { name?: string })?.name) {
        case 'NavController':
          return onboardingMocks.navController;
        case 'Location':
          return onboardingMocks.location;
        default:
          return undefined;
      }
    }),
  };
});

describe('Mobile OnboardingService — machine readiness guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onboardingMocks.logger.child.mockReturnValue(onboardingMocks.logger);
  });

  it('does not throw when onContinue/onSkip/onBack/onRoleSelect fire before the machine is created', async () => {
    const { OnboardingService } = await import('./onboarding.service');
    const service = new OnboardingService();

    // The state machine is created asynchronously in initializeStateMachine();
    // it has not resolved yet since we never call initialize().
    expect(service.machineReady()).toBe(false);

    await expect(service.onContinue()).resolves.toBeUndefined();
    await expect(service.onSkip()).resolves.toBeUndefined();
    await expect(service.onBack()).resolves.toBeUndefined();
    await expect(service.onRoleSelect('athlete')).resolves.toBeUndefined();
    expect(() =>
      service.onProfileChange({ firstName: 'a', lastName: 'b', profileImgs: null })
    ).not.toThrow();
  });
});
