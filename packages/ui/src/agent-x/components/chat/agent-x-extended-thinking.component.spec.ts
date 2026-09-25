import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HapticsService } from '../../../services/haptics/haptics.service';
import {
  NxtAgentXExtendedThinkingComponent,
  nextThinkingExpandedState,
} from './agent-x-extended-thinking.component';

describe('nextThinkingExpandedState', () => {
  it('opens the instant streaming starts', () => {
    expect(nextThinkingExpandedState(false, true, false)).toBe(true);
  });

  it('stays open while streaming continues', () => {
    expect(nextThinkingExpandedState(true, true, true)).toBe(true);
  });

  it('respects a manual collapse mid-stream (no transition == no forced change)', () => {
    expect(nextThinkingExpandedState(true, true, false)).toBe(false);
  });

  it('closes the instant streaming finishes', () => {
    expect(nextThinkingExpandedState(true, false, true)).toBe(false);
  });

  it('leaves history content (never streamed) collapsed', () => {
    expect(nextThinkingExpandedState(false, false, false)).toBe(false);
  });
});

describe('NxtAgentXExtendedThinkingComponent', () => {
  let fixture: ComponentFixture<NxtAgentXExtendedThinkingComponent>;
  let component: NxtAgentXExtendedThinkingComponent;
  let nativeEl: HTMLElement;
  const hapticsMock = {
    impact: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    hapticsMock.impact.mockClear();

    await TestBed.configureTestingModule({
      imports: [NxtAgentXExtendedThinkingComponent],
      providers: [{ provide: HapticsService, useValue: hapticsMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(NxtAgentXExtendedThinkingComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  // NOTE: signal inputs aren't wired through BrowserDynamicTestingModule's JIT
  // compiler in this workspace, so inputs are stubbed directly on the instance.
  // This only supports a fixed value for the lifetime of the fixture, which is
  // why transition behavior is covered by the `nextThinkingExpandedState` unit
  // tests above instead of here.
  function setInputs(isStreaming: boolean): void {
    Object.defineProperty(component, 'content', {
      configurable: true,
      value: () => 'Checking team timeline and preparing the next step.',
    });
    Object.defineProperty(component, 'isStreaming', {
      configurable: true,
      value: () => isStreaming,
    });
  }

  it('auto-opens reasoning when created while already streaming', () => {
    setInputs(true);
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');
    const pulse = nativeEl.querySelector('.ext-thinking__pulse');

    expect(toggle?.textContent).toContain('Thinking...');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(pulse).not.toBeNull();
    expect(body?.textContent).toContain('Checking team timeline');
  });

  it('lets the user manually collapse and reopen while streaming', async () => {
    setInputs(true);
    fixture.detectChanges();

    nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    expect(nativeEl.querySelector('.ext-thinking__toggle')?.getAttribute('aria-expanded')).toBe(
      'false'
    );
    expect(nativeEl.querySelector('.ext-thinking__body')).toBeNull();

    nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(body?.textContent).toContain('Checking team timeline');
  });

  it('stays collapsed by default for content that never streamed', () => {
    setInputs(false);
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');

    expect(toggle?.textContent).toContain('View reasoning');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(body).toBeNull();
  });
});
