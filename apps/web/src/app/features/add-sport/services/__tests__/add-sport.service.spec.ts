/**
 * @fileoverview AddSportService Unit Tests
 * @module @nxt1/web/features/add-sport
 *
 * Unit tests for the web AddSportService.
 * Covers: initialize, navigation, form data, save, error handling.
 *
 * Pattern: TestBed with all dependencies mocked. No HTTP calls.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtPlatformService } from '@nxt1/ui/services/platform';

import { AddSportService } from '../../add-sport.service';
import { AuthFlowService } from '../../../../core/services/auth/auth-flow.service';
import { ProfileService } from '../../../../core/services/api/profile-api.service';

// ============================================
// MOCK FACTORIES
// ============================================

const createLoggerChild = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createLoggerMock = () => ({
  child: vi.fn().mockReturnValue(createLoggerChild()),
});

const createToastMock = () => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
});

const createBreadcrumbMock = () => ({
  trackStateChange: vi.fn(),
  trackUserAction: vi.fn(),
  trackNavigation: vi.fn(),
  trackFormSubmit: vi.fn(),
  trackHttpRequest: vi.fn(),
  trackAuth: vi.fn(),
});

const createAnalyticsMock = () => ({
  trackEvent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn(),
  logEvent: vi.fn(),
});

const createPlatformMock = () => ({
  isMobile: vi.fn().mockReturnValue(false),
  is: vi.fn().mockReturnValue(false),
});

const createRouterMock = () => ({
  navigate: vi.fn().mockResolvedValue(true),
});

const createAuthFlowMock = () => ({
  user: vi.fn().mockReturnValue({
    uid: 'user-123',
    role: 'athlete',
    connectedSources: [],
  }),
});

const createProfileServiceMock = () => ({
  addSport: vi.fn().mockReturnValue(of({ success: true, data: {} })),
  updateProfile: vi.fn().mockReturnValue(of({ success: true, data: {} })),
  invalidateCache: vi.fn(),
});

// ============================================
// TEST SUITE
// ============================================

describe('AddSportService', () => {
  let service: AddSportService;
  let loggerChild: ReturnType<typeof createLoggerChild>;
  let toastMock: ReturnType<typeof createToastMock>;
  let analyticsMock: ReturnType<typeof createAnalyticsMock>;
  let breadcrumbMock: ReturnType<typeof createBreadcrumbMock>;
  let routerMock: ReturnType<typeof createRouterMock>;
  let authFlowMock: ReturnType<typeof createAuthFlowMock>;
  let profileServiceMock: ReturnType<typeof createProfileServiceMock>;

  beforeAll(() => {
    const testBed = getTestBed();
    if (!testBed.platform) {
      testBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    const loggerMock = createLoggerMock();
    loggerChild = loggerMock.child();
    toastMock = createToastMock();
    analyticsMock = createAnalyticsMock();
    breadcrumbMock = createBreadcrumbMock();
    routerMock = createRouterMock();
    authFlowMock = createAuthFlowMock();
    profileServiceMock = createProfileServiceMock();

    TestBed.configureTestingModule({
      providers: [
        AddSportService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: routerMock },
        { provide: AuthFlowService, useValue: authFlowMock },
        { provide: ProfileService, useValue: profileServiceMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtPlatformService, useValue: createPlatformMock() },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
      ],
    });

    service = TestBed.inject(AddSportService);
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  describe('initialize', () => {
    it('should reset state and log wizard opened', () => {
      service.initialize();

      expect(service.currentStepIndex()).toBe(0);
      expect(service.currentStep()).toBe('sport');
      expect(service.sportFormData()).toBeNull();
      expect(service.linkSourcesFormData()).toBeNull();
      expect(service.isLoading()).toBe(false);
      expect(loggerChild.info).toHaveBeenCalledWith('Add sport wizard opened', { role: 'athlete' });
    });

    it('should track breadcrumb and analytics on open', () => {
      service.initialize();

      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('add-sport:opened', {
        role: 'athlete',
      });
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.ADD_SPORT_WIZARD_OPENED, {
        role: 'athlete',
      });
    });

    it('should redirect to auth if no user', () => {
      authFlowMock.user.mockReturnValue(null);
      service.initialize();

      expect(routerMock.navigate).toHaveBeenCalledWith(['/auth']);
      expect(loggerChild.warn).toHaveBeenCalled();
    });
  });

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  describe('computed signals', () => {
    it('should compute isTeamRoleUser for coach', () => {
      authFlowMock.user.mockReturnValue({ uid: 'u1', role: 'coach' });
      // Force re-read of computed
      expect(service.isTeamRoleUser()).toBe(true);
      expect(service.pageTitle()).toBe('Add Team');
      expect(service.linkScope()).toBe('team');
    });

    it('should compute isTeamRoleUser for athlete', () => {
      authFlowMock.user.mockReturnValue({ uid: 'u1', role: 'athlete' });
      expect(service.isTeamRoleUser()).toBe(false);
      expect(service.pageTitle()).toBe('Add Sport');
      expect(service.linkScope()).toBe('athlete');
    });

    it('should return correct agentXMessage per step', () => {
      service.initialize();
      // Step 0 = sport
      expect(service.agentXMessage()).toContain('adding to your profile');

      // Advance to step 1
      service.onSportChange({
        sports: [{ sport: 'Basketball', isPrimary: false, team: { name: '' }, positions: [] }],
      });
      service.onContinue();
      expect(service.agentXMessage()).toContain('Connect your accounts');
    });
  });

  // ============================================
  // FORM DATA
  // ============================================

  describe('form data', () => {
    it('should update sport form data', () => {
      const data = {
        sports: [{ sport: 'Football', isPrimary: false, team: { name: '' }, positions: ['QB'] }],
      };
      service.onSportChange(data);
      expect(service.sportFormData()).toEqual(data);
    });

    it('should update link sources form data', () => {
      const data = { links: [{ platform: 'hudl', connected: true, url: 'https://hudl.com/p' }] };
      service.onLinkSourcesChange(data as Parameters<typeof service.onLinkSourcesChange>[0]);
      expect(service.linkSourcesFormData()).toEqual(data);
    });

    it('should compute isCurrentStepValid based on sport data', () => {
      service.initialize();
      expect(service.isCurrentStepValid()).toBe(false);

      service.onSportChange({
        sports: [{ sport: 'Baseball', isPrimary: false, team: { name: '' }, positions: [] }],
      });
      expect(service.isCurrentStepValid()).toBe(true);
    });

    it('should compute selectedSportNames', () => {
      service.onSportChange({
        sports: [{ sport: 'Soccer', isPrimary: false, team: { name: '' }, positions: [] }],
      });
      expect(service.selectedSportNames()).toEqual(['Soccer']);
    });
  });

  // ============================================
  // NAVIGATION
  // ============================================

  describe('navigation', () => {
    beforeEach(() => {
      service.initialize();
      service.onSportChange({
        sports: [{ sport: 'Basketball', isPrimary: false, team: { name: '' }, positions: [] }],
      });
    });

    it('should advance to link-sources on continue from sport step', () => {
      service.onContinue();

      expect(service.currentStep()).toBe('link-sources');
      expect(service.currentStepIndex()).toBe(1);
      expect(service.isLastStep()).toBe(true);
    });

    it('should track analytics on step change', () => {
      service.onContinue();

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'link-sources',
        direction: 'forward',
      });
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('add-sport:step-changed', {
        step: 'link-sources',
      });
    });

    it('should go back to sport step', () => {
      service.onContinue(); // go to link-sources
      service.onBack(); // go back to sport

      expect(service.currentStep()).toBe('sport');
      expect(service.currentStepIndex()).toBe(0);
      expect(service.animationDirection()).toBe('backward');
    });

    it('should navigate to home when back from first step', () => {
      service.onBack();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  // ============================================
  // SAVE
  // ============================================

  describe('save (via onContinue on last step)', () => {
    beforeEach(() => {
      service.initialize();
      service.onSportChange({
        sports: [{ sport: 'Basketball', isPrimary: false, team: { name: '' }, positions: ['PG'] }],
      });
      service.onContinue(); // advance to link-sources
    });

    it('should save sport successfully', async () => {
      service.onContinue(); // triggers save on last step
      // Allow async save to complete
      await vi.waitFor(() => {
        expect(profileServiceMock.addSport).toHaveBeenCalledWith('user-123', {
          sport: 'Basketball',
          positions: ['PG'],
        });
      });

      expect(profileServiceMock.invalidateCache).toHaveBeenCalledWith('user-123');
      expect(toastMock.success).toHaveBeenCalledWith('Basketball added to your profile!');
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.PROFILE_SPORT_ADDED, {
        sport: 'Basketball',
        role: 'athlete',
      });
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.ADD_SPORT_WIZARD_COMPLETED, {
        sport: 'Basketball',
        connectedSourcesCount: 0,
      });
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should show error and not navigate on addSport failure', async () => {
      profileServiceMock.addSport.mockReturnValue(of({ success: false, error: 'Duplicate sport' }));

      service.onContinue();
      await vi.waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Failed to add sport. Please try again.');
      });

      expect(routerMock.navigate).not.toHaveBeenCalledWith(['/']);
    });

    it('should handle save exception with toast error', async () => {
      profileServiceMock.addSport.mockImplementation(() => {
        throw new Error('Network error');
      });

      service.onContinue();
      await vi.waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
      });

      expect(loggerChild.error).toHaveBeenCalled();
    });

    it('should skip save without sport data', async () => {
      // Reset sport data
      service.onSportChange({ sports: [] } as Parameters<typeof service.onSportChange>[0]);
      service.onContinue();

      await vi.waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Please select a sport first.');
      });

      expect(profileServiceMock.addSport).not.toHaveBeenCalled();
    });

    it('should merge connected sources when provided', async () => {
      service.onLinkSourcesChange({
        links: [
          { platform: 'hudl', connected: true, url: 'https://hudl.com/profile/1' },
          { platform: 'twitter', connected: false, url: '' },
        ],
      } as Parameters<typeof service.onLinkSourcesChange>[0]);

      service.onContinue();
      await vi.waitFor(() => {
        expect(profileServiceMock.updateProfile).toHaveBeenCalledWith('user-123', {
          connectedSources: [
            {
              platform: 'hudl',
              profileUrl: 'https://hudl.com/profile/1',
              scopeType: undefined,
              scopeId: undefined,
            },
          ],
        });
      });
    });
  });

  // ============================================
  // SKIP
  // ============================================

  describe('onSkip', () => {
    it('should trigger save on last step', async () => {
      service.initialize();
      service.onSportChange({
        sports: [{ sport: 'Tennis', isPrimary: false, team: { name: '' }, positions: [] }],
      });
      service.onContinue(); // advance to link-sources (last step)

      service.onSkip();
      await vi.waitFor(() => {
        expect(profileServiceMock.addSport).toHaveBeenCalled();
      });
    });

    it('should do nothing on first step', () => {
      service.initialize();
      service.onSkip();
      expect(profileServiceMock.addSport).not.toHaveBeenCalled();
    });
  });
});
