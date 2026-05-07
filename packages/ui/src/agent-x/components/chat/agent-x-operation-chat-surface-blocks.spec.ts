import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentXOperationChatExecutionPlanComponent } from './agent-x-operation-chat-execution-plan.component';
import { AgentXOperationChatRecurringTasksDockComponent } from './agent-x-operation-chat-recurring-tasks-dock.component';
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

describe('AgentXOperationChatRecurringTasksDockComponent', () => {
  let fixture: ComponentFixture<AgentXOperationChatRecurringTasksDockComponent>;
  let component: AgentXOperationChatRecurringTasksDockComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXOperationChatRecurringTasksDockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXOperationChatRecurringTasksDockComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('tasks', [
      {
        taskKey: 'task-1',
        title: 'Send recruiting email',
        nextSendLabel: 'Next send: 5/5/2026, 4:00 AM',
      },
    ]);
    fixture.detectChanges();
  });

  it('renders recurring title and next-send label', () => {
    expect(nativeEl.textContent).toContain('Recurring Tasks');
    expect(nativeEl.textContent).toContain('Send recruiting email');
    expect(nativeEl.textContent).toContain('Next send: 5/5/2026, 4:00 AM');
  });

  it('emits cancelTask when cancel button is clicked', () => {
    const spy = vi.fn();
    component.cancelTask.subscribe(spy);

    const button = nativeEl.querySelector('.recurring-dock__cancel') as HTMLButtonElement;
    button.click();

    expect(spy).toHaveBeenCalledWith('task-1');
  });

  it('disables cancel button and shows cancelling state', () => {
    fixture.componentRef.setInput('cancellingTaskKeys', ['task-1']);
    fixture.detectChanges();

    const button = nativeEl.querySelector('.recurring-dock__cancel') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Cancelling...');
  });

  it('emits expandedChange when toggled', () => {
    const spy = vi.fn();
    component.expandedChange.subscribe(spy);

    const details = nativeEl.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));

    expect(spy).toHaveBeenCalledWith(true);
  });

  it('shows loading state while recurring tasks are resolving', () => {
    fixture.componentRef.setInput('tasks', []);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(nativeEl.textContent).toContain('Checking recurring tasks...');
  });
});
