import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ROLES } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import { OnboardingLinkDropStepComponent } from '@nxt1/ui/onboarding/onboarding-link-drop-step';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtModalService } from '@nxt1/ui/services/modal';

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class {},
  ActionSheetController: class {},
  LoadingController: class {},
}));

describe('OnboardingLinkDropStepComponent', () => {
  let fixture: ComponentFixture<OnboardingLinkDropStepComponent>;
  let component: OnboardingLinkDropStepComponent;

  const prompt = vi.fn();
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
    prompt.mockReset();
    logger.child.mockReturnValue(logger);
    logger.info.mockReset();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.debug.mockReset();
    logger.fatal.mockReset();

    await TestBed.configureTestingModule({
      imports: [OnboardingLinkDropStepComponent],
      providers: [
        { provide: NxtModalService, useValue: { prompt } },
        { provide: NxtLoggingService, useValue: logger },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingLinkDropStepComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('selectedSports', ['Basketball']);
    fixture.componentRef.setInput('role', USER_ROLES.ATHLETE);
    fixture.detectChanges();
  });

  it('renders the add custom link button in link mode', () => {
    const button = fixture.nativeElement.querySelector(
      `[data-testid="${TEST_IDS.LINK_SOURCES.ADD_CUSTOM_LINK_BUTTON}"]`
    );

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Add Custom Link');
  });

  it('adds a custom link and emits updated form data', async () => {
    const emitted: LinkSourcesFormData[] = [];
    component.linkSourcesChange.subscribe((value) => emitted.push(value));

    prompt
      .mockResolvedValueOnce({ confirmed: true, value: 'My ESPN Profile' })
      .mockResolvedValueOnce({ confirmed: true, value: 'espn.com/profile' });

    await component.addCustomLink();
    fixture.detectChanges();

    const customGroup = component.platformGroups().find((group) => group.key === 'custom-links');

    expect(customGroup).toBeDefined();
    expect(customGroup?.sources).toHaveLength(1);
    expect(customGroup?.sources[0]?.label).toBe('My ESPN Profile');
    expect(customGroup?.sources[0]?.url).toBe('https://espn.com/profile');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.links.some((link) => link.platform.startsWith('custom::'))).toBe(true);
  });

  it('clears restored custom links when the input data resets', () => {
    fixture.componentRef.setInput('linkSourcesData', {
      links: [
        {
          platform: 'custom::abc123',
          connected: true,
          connectionType: 'link',
          scopeType: 'global',
          username: 'Team Site',
          url: 'https://example.com/team',
        },
      ],
    });
    fixture.detectChanges();

    expect(component.platformGroups().some((group) => group.key === 'custom-links')).toBe(true);

    fixture.componentRef.setInput('linkSourcesData', null);
    fixture.detectChanges();

    expect(component.platformGroups().some((group) => group.key === 'custom-links')).toBe(false);
  });
});
