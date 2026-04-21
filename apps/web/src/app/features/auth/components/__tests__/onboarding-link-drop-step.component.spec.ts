import { Component, input, output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ROLES } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import type { ConnectedSource } from '@nxt1/ui/components/connected-sources';
import { OnboardingLinkDropStepComponent } from '@nxt1/ui/onboarding/onboarding-link-drop-step';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtConnectedSourcesComponent } from '@nxt1/ui/components/connected-sources';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtModalService } from '@nxt1/ui/services/modal';
import { NxtToastService } from '@nxt1/ui/services/toast';

/** Minimal stub for NxtConnectedSourcesComponent — avoids required-input issues in unit tests */
@Component({
  selector: 'nxt1-connected-sources',
  standalone: true,
  template: '',
})
class StubNxtConnectedSourcesComponent {
  readonly sources = input.required<readonly ConnectedSource[]>();
  readonly title = input<string | undefined>();
  readonly collapsible = input<boolean | undefined>();
  readonly initialExpanded = input<boolean | undefined>();
  readonly sourceTap = output<ConnectedSource>();
}

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
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: NxtModalService, useValue: { prompt } },
        { provide: NxtLoggingService, useValue: logger },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        {
          provide: NxtToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
        {
          provide: NxtPlatformService,
          useValue: {
            isNative: vi.fn().mockReturnValue(false),
            isBrowser: vi.fn().mockReturnValue(true),
            viewport: vi.fn().mockReturnValue({ width: 1280, height: 800 }),
            hasTouch: vi.fn().mockReturnValue(false),
          },
        },
      ],
    })
      .overrideComponent(OnboardingLinkDropStepComponent, {
        remove: { imports: [NxtConnectedSourcesComponent] },
        add: { imports: [StubNxtConnectedSourcesComponent] },
      })
      .compileComponents();

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

  it('pins Google and Microsoft to the top of sign-in mode without duplicating them later', () => {
    component.setMode('signin');
    fixture.detectChanges();

    const groups = component.platformGroups();
    const firstGroup = groups[0];
    const laterPlatforms = groups
      .slice(1)
      .flatMap((group) => group.sources.map((source) => source.platform));

    expect(firstGroup?.key).toBe('priority-signin');
    expect(firstGroup?.sources.map((source) => source.platform)).toEqual(['google', 'microsoft']);
    expect(laterPlatforms).not.toContain('google');
    expect(laterPlatforms).not.toContain('microsoft');
  });

  // TODO: Signal effect flushing incompatible with overrideComponent in Jest/Vitest+JSDOM.
  // TestBed.flushEffects() / appRef.tick() does not reliably flush constructor effects
  // when overrideComponent modifies the host component's import graph. The linkSourcesData →
  // _customLinks → platformGroups reactive chain works in the real app and is covered by E2E.
  it.todo('clears restored custom links when the input data resets');
});
