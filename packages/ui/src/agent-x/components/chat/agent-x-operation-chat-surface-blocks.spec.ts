import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentXOperationChatExecutionPlanComponent } from './agent-x-operation-chat-execution-plan.component';
import { AgentXOperationChatThinkingComponent } from './agent-x-operation-chat-thinking.component';

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

  it('emits expandedChange when the details element toggles', () => {
    const spy = vi.fn();
    component.expandedChange.subscribe(spy);

    const details = nativeEl.querySelector('details') as HTMLDetailsElement;
    details.open = false;
    details.dispatchEvent(new Event('toggle'));

    expect(spy).toHaveBeenCalledWith(false);
  });
});
