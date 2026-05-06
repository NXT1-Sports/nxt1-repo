import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentXOperationChatExecutionPlanComponent } from './agent-x-operation-chat-execution-plan.component';
import { AgentXOperationChatThinkingComponent } from './agent-x-operation-chat-thinking.component';
import { NxtAgentXExtendedThinkingComponent } from './agent-x-extended-thinking.component';
import { HapticsService } from '../../../services/haptics/haptics.service';

describe('AgentXOperationChatThinkingComponent', () => {
  let fixture: ComponentFixture<AgentXOperationChatThinkingComponent>;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXOperationChatThinkingComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXOperationChatThinkingComponent);
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  it('renders the provided thinking label', () => {
    fixture.componentRef.setInput('label', 'Analyzing video...');
    fixture.detectChanges();

    expect(nativeEl.textContent).toContain('Analyzing video...');
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
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [NxtAgentXExtendedThinkingComponent],
      providers: [{ provide: HapticsService, useValue: hapticsMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(NxtAgentXExtendedThinkingComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
  });

  function setExtendedThinkingInputs(isStreaming: boolean): void {
    Object.defineProperty(component, 'content', {
      configurable: true,
      value: () => 'Checking profile image ownership.',
    });
    Object.defineProperty(component, 'isStreaming', {
      configurable: true,
      value: () => isStreaming,
    });
  }

  it('keeps streaming reasoning collapsed while still showing thinking status', () => {
    setExtendedThinkingInputs(true);
    fixture.detectChanges();

    expect(nativeEl.textContent).toContain('Thinking');
    expect(nativeEl.querySelector('.ext-thinking__pulse')).not.toBeNull();
    expect(nativeEl.querySelector('.ext-thinking__body')).toBeNull();
  });

  it('allows streaming reasoning to be opened by the user', async () => {
    setExtendedThinkingInputs(true);
    fixture.detectChanges();

    await component.toggle();
    fixture.detectChanges();

    expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    expect(nativeEl.querySelector('.ext-thinking__body')?.textContent).toContain(
      'Checking profile image ownership.'
    );
  });
});

describe('AgentXOperationChatExecutionPlanComponent', () => {
  let fixture: ComponentFixture<AgentXOperationChatExecutionPlanComponent>;
  let component: AgentXOperationChatExecutionPlanComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXOperationChatExecutionPlanComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXOperationChatExecutionPlanComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('title', 'Execution Plan');
    fixture.componentRef.setInput('items', [
      { id: '1', label: 'Analyze clips', done: true },
      { id: '2', label: 'Generate report', done: false },
    ]);
    fixture.detectChanges();
  });

  it('renders the title and computed progress', () => {
    expect(nativeEl.textContent).toContain('Execution Plan');
    expect(nativeEl.textContent).toContain('1/2');
  });

  it('starts collapsed by default', () => {
    const details = nativeEl.querySelector('details') as HTMLDetailsElement;

    expect(details.open).toBe(false);
  });

  it('emits expandedChange when the details element toggles', () => {
    const spy = vi.fn();
    component.expandedChange.subscribe(spy);

    const details = nativeEl.querySelector('details') as HTMLDetailsElement;
    details.open = false;
    details.dispatchEvent(new Event('toggle'));

    expect(spy).toHaveBeenCalledWith(false);
  });

  it('stops active spinner rendering when paused', () => {
    fixture.componentRef.setInput('items', [
      { id: '1', label: 'Search programs', done: false, active: true },
    ]);
    fixture.componentRef.setInput('paused', true);
    fixture.detectChanges();

    const spinner = nativeEl.querySelector('.execution-plan-dock__item-spinner');
    expect(spinner).toBeNull();
  });
});
