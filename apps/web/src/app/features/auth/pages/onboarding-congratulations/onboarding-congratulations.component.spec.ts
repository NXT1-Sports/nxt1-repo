import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentGoal } from '@nxt1/core';
import { OnboardingCongratulationsComponent } from './onboarding-congratulations.component';
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { OnboardingWelcomeComponent } from '@nxt1/ui/onboarding/onboarding-welcome';
import { AgentOnboardingLoadingComponent } from '@nxt1/ui/agent-x/onboarding';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtThemeService } from '@nxt1/ui/services/theme';
import { AgentXService } from '@nxt1/ui/agent-x';
import { Router } from '@angular/router';
import { AuthFlowService } from '../../../../core/services/auth';
import { SeoService } from '../../../../core/services';

@Component({
  selector: 'nxt1-auth-shell',
  standalone: true,
  template: '<ng-content />',
})
class StubAuthShellComponent {
  @Input() variant?: string;
  @Input() showLogo?: boolean;
  @Input() showBackButton?: boolean;
  @Input() maxWidth?: string;
}

@Component({
  selector: 'nxt1-onboarding-welcome',
  standalone: true,
  template: '',
})
class StubOnboardingWelcomeComponent {
  @Input() userRole?: string | null;
  @Input() firstName?: string | null;
  @Input() isLegacy?: boolean;
  @Input() isMigratedPaidLegacy?: boolean;
  @Input() showDotNavigation?: boolean;
  @Output() complete = new EventEmitter<void>();
  @Output() skip = new EventEmitter<void>();
  @Output() slideViewed = new EventEmitter<{ index: number; slideId: string }>();
  @Output() goalsChanged = new EventEmitter<AgentGoal[]>();
}

@Component({
  selector: 'nxt1-agent-onboarding-loading',
  standalone: true,
  template: '',
})
class StubAgentOnboardingLoadingComponent {
  @Input() readyToComplete?: boolean;
  @Output() loadingComplete = new EventEmitter<void>();
}

type OnboardingCongratulationsComponentPrivateApi = {
  prepareInitialAgentStateIfNeeded: () => Promise<void>;
};

describe('OnboardingCongratulationsComponent', () => {
  let fixture: ComponentFixture<OnboardingCongratulationsComponent>;
  let component: OnboardingCongratulationsComponent;

  const user = signal({ role: 'athlete', displayName: 'Taylor Goalsetter' });
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  beforeEach(async () => {
    logger.child.mockReturnValue(logger);
    logger.info.mockReset();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.debug.mockReset();
    logger.fatal.mockReset();

    await TestBed.configureTestingModule({
      imports: [OnboardingCongratulationsComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: AuthFlowService,
          useValue: {
            user,
            completeLegacyOnboarding: vi.fn(),
            refreshUserProfile: vi.fn(),
          },
        },
        { provide: SeoService, useValue: { updatePage: vi.fn() } },
        {
          provide: NxtThemeService,
          useValue: {
            setTemporaryOverride: vi.fn(),
            clearTemporaryOverride: vi.fn(),
          },
        },
        { provide: NxtLoggingService, useValue: logger },
        {
          provide: AgentXService,
          useValue: {
            setGoals: vi.fn(),
            generateBriefing: vi.fn(),
            loadDashboard: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(OnboardingCongratulationsComponent, {
        remove: {
          imports: [
            AuthShellComponent,
            OnboardingWelcomeComponent,
            AgentOnboardingLoadingComponent,
          ],
        },
        add: {
          imports: [
            StubAuthShellComponent,
            StubOnboardingWelcomeComponent,
            StubAgentOnboardingLoadingComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(OnboardingCongratulationsComponent);
    component = fixture.componentInstance;
  });

  it('does not prepare agent state while goals are still being edited', () => {
    const prepareSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    (
      component as unknown as OnboardingCongratulationsComponentPrivateApi
    ).prepareInitialAgentStateIfNeeded = prepareSpy;

    component.currentSlideIndex.set(1);
    component.onGoalsChanged([
      {
        id: 'goal-1',
        text: 'Find colleges that match my goals',
        type: 'custom',
      },
    ]);

    expect(prepareSpy).not.toHaveBeenCalled();
  });

  it('prepares agent state after the user advances beyond the goals slide', () => {
    const prepareSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    (
      component as unknown as OnboardingCongratulationsComponentPrivateApi
    ).prepareInitialAgentStateIfNeeded = prepareSpy;

    component.onSlideViewed({ index: component.totalSlides() - 1, slideId: 'athlete-ready' });

    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });
});
