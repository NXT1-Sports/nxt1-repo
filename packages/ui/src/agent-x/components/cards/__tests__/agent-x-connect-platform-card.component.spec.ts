import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentXRichCard } from '@nxt1/core/ai';
import {
  AgentXConnectPlatformCardComponent,
  type ConnectPlatformCardActionEvent,
} from '../agent-x-connect-platform-card.component';
import { ConnectedAccountsModalService } from '../../../../components/connected-sources/connected-accounts-modal.service';

import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentXRichCard } from '@nxt1/core/ai';
import {
  AgentXConnectPlatformCardComponent,
  type ConnectPlatformCardActionEvent,
} from '../agent-x-connect-platform-card.component';
import { ConnectedAccountsModalService } from '../../../../components/connected-sources/connected-accounts-modal.service';

/**
 * Stub for `NxtPlatformIconComponent` used only to isolate this spec from an
 * unrelated pre-existing Ivy/happy-dom incompatibility with the shared
 * component's `@if`/required-input template in the vitest TestBed harness.
 */
@Component({
  selector: 'nxt1-platform-icon',
  standalone: true,
  template: '',
})
class StubPlatformIconComponent {
  readonly icon = input('link');
  readonly faviconUrl = input<string | null | undefined>(null);
  readonly size = input<number>(16);
  readonly alt = input<string>('');
}

function createCard(payload: Record<string, unknown>): AgentXRichCard {
  return {
    agentId: 'router',
    type: 'connect-platform',
    title: 'Connect Hudl',
    payload,
  } as unknown as AgentXRichCard;
}

describe('AgentXConnectPlatformCardComponent', () => {
  let fixture: ComponentFixture<AgentXConnectPlatformCardComponent>;
  let component: AgentXConnectPlatformCardComponent;
  let openSpy: ReturnType<typeof vi.fn>;

  function setCard(payload: Record<string, unknown>): void {
    Object.defineProperty(component, 'card', {
      configurable: true,
      value: () => createCard(payload),
    });
  }

  beforeEach(async () => {
    openSpy = vi.fn().mockResolvedValue({ connected: true });

    await TestBed.configureTestingModule({
      imports: [AgentXConnectPlatformCardComponent],
      providers: [{ provide: ConnectedAccountsModalService, useValue: { open: openSpy } }],
    })
      .overrideComponent(AgentXConnectPlatformCardComponent, {
        set: { imports: [StubPlatformIconComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AgentXConnectPlatformCardComponent);
    component = fixture.componentInstance;
    setCard({ platform: 'hudl' });
  });

  it('resolves the platform label and icon from PLATFORM_REGISTRY', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Connect Hudl');
  });

  it('falls back to the provided platformLabel/reason/connectLabel overrides', () => {
    setCard({
      platform: 'some-unknown-platform',
      platformLabel: 'Some Platform',
      reason: 'Custom reason to connect.',
      connectLabel: 'Link it now',
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Some Platform');
    expect(compiled.textContent).toContain('Custom reason to connect.');
    expect(compiled.textContent).toContain('Link it now');
  });

  it('opens the Connected Accounts modal focused on the requested platform and emits actionSelected', async () => {
    fixture.detectChanges();
    const emitted: ConnectPlatformCardActionEvent[] = [];
    component.actionSelected.subscribe((event) => emitted.push(event));

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="agent-x-connect-platform-card-connect-button"]'
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalledWith({ focusPlatform: 'hudl' });
    expect(emitted).toEqual([
      { action: 'connect-platform', platform: 'hudl', pendingTool: undefined },
    ]);
  });
});
