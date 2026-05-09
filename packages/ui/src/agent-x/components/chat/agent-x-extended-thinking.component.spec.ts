import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtAgentXExtendedThinkingComponent } from './agent-x-extended-thinking.component';

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

  it('shows thinking status while streaming without opening reasoning content', () => {
    setInputs(true);
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');
    const pulse = nativeEl.querySelector('.ext-thinking__pulse');

    expect(toggle?.textContent).toContain('Thinking...');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(pulse).not.toBeNull();
    expect(body).toBeNull();
  });

  it('lets the user open streaming reasoning on demand', async () => {
    setInputs(true);
    fixture.detectChanges();

    nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');

    expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(body?.textContent).toContain('Checking team timeline');
  });

  it('stays collapsed by default after streaming finishes', () => {
    setInputs(false);
    fixture.detectChanges();

    const toggle = nativeEl.querySelector<HTMLButtonElement>('.ext-thinking__toggle');
    const body = nativeEl.querySelector('.ext-thinking__body');

    expect(toggle?.textContent).toContain('View reasoning');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(body).toBeNull();
  });
});
