/**
 * @fileoverview AgentXMessageUndoComponent — Unit Tests
 * @module @nxt1/ui/agent-x
 *
 * Tests the undo deletion countdown banner.
 *
 * Coverage:
 * - Banner hidden by default (visible=false)
 * - Banner shown when visible=true
 * - Timer counts down and emits expired at zero
 * - triggerId input resets the countdown
 * - Undo button emits undo event (and timer keeps running)
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentXMessageUndoComponent } from '../agent-x-message-undo.component';
import { AGENT_X_MESSAGE_UNDO_TEST_IDS } from '@nxt1/core/testing';

describe('AgentXMessageUndoComponent', () => {
  let fixture: ComponentFixture<AgentXMessageUndoComponent>;
  let component: AgentXMessageUndoComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXMessageUndoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXMessageUndoComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function query<T extends HTMLElement>(testId: string): T | null {
    return nativeEl.querySelector<T>(`[data-testid="${testId}"]`);
  }

  // ─── Visibility ────────────────────────────────────────────────────────────

  it('should NOT render banner by default (visible=false)', () => {
    expect(query(AGENT_X_MESSAGE_UNDO_TEST_IDS.BANNER)).toBeNull();
  });

  it('should render banner when visible=true', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.detectChanges();
    expect(query(AGENT_X_MESSAGE_UNDO_TEST_IDS.BANNER)).toBeTruthy();
  });

  it('should render undo button and timer inside visible banner', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.detectChanges();
    expect(query(AGENT_X_MESSAGE_UNDO_TEST_IDS.BTN_UNDO)).toBeTruthy();
    expect(query(AGENT_X_MESSAGE_UNDO_TEST_IDS.TIMER)).toBeTruthy();
  });

  // ─── Timer display ────────────────────────────────────────────────────────

  it('should display durationSeconds as initial timer value', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.componentRef.setInput('durationSeconds', 8);
    fixture.detectChanges();
    const timer = query(AGENT_X_MESSAGE_UNDO_TEST_IDS.TIMER)!;
    expect(timer.textContent?.trim()).toBe('8s');
  });

  // ─── Countdown + expired ──────────────────────────────────────────────────

  it('should emit expired after countdown finishes', fakeAsync(() => {
    const spy = vi.fn();
    component.expired.subscribe(spy);

    fixture.componentRef.setInput('durationSeconds', 2);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    tick(2000);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledOnce();
  }));

  it('should reset countdown when triggerId changes', fakeAsync(() => {
    const spy = vi.fn();
    component.expired.subscribe(spy);

    fixture.componentRef.setInput('durationSeconds', 5);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    tick(3000); // 3 s elapsed

    // New delete — bump triggerId to restart
    fixture.componentRef.setInput('triggerId', 2);
    fixture.detectChanges();
    tick(3000); // only 3 of the new 5 s elapsed — should NOT have expired yet
    expect(spy).not.toHaveBeenCalled();

    tick(2000); // finish remaining 2 s → now expires
    expect(spy).toHaveBeenCalledOnce();
  }));

  // ─── Undo output ──────────────────────────────────────────────────────────

  it('should emit undo when undo button clicked', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.detectChanges();

    const spy = vi.fn();
    component.undo.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_MESSAGE_UNDO_TEST_IDS.BTN_UNDO)!.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  it('should NOT emit expired after component is destroyed', fakeAsync(() => {
    const spy = vi.fn();
    component.expired.subscribe(spy);

    fixture.componentRef.setInput('durationSeconds', 5);
    fixture.componentRef.setInput('triggerId', 1);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    tick(2000);
    fixture.destroy();
    tick(5000); // full timer would have elapsed post-destroy
    expect(spy).not.toHaveBeenCalled();
  }));
});
