/**
 * @fileoverview AgentXMessageEditComponent — Unit Tests
 * @module @nxt1/ui/agent-x
 *
 * Tests the inline message editor (user can edit/resend a sent message).
 *
 * Coverage:
 * - Textarea rendered with correct test id
 * - initialText input populates draft on change
 * - Save button emits trimmed text
 * - Save button does NOT emit if draft is empty
 * - Cancel button emits cancel event
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentXMessageEditComponent } from '../agent-x-message-edit.component';
import { AGENT_X_MESSAGE_EDIT_TEST_IDS } from '@nxt1/core/testing';

describe('AgentXMessageEditComponent', () => {
  let fixture: ComponentFixture<AgentXMessageEditComponent>;
  let component: AgentXMessageEditComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXMessageEditComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXMessageEditComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function query<T extends HTMLElement>(testId: string): T | null {
    return nativeEl.querySelector<T>(`[data-testid="${testId}"]`);
  }

  // ─── Structural ────────────────────────────────────────────────────────────

  it('should render root with correct test id', () => {
    expect(query(AGENT_X_MESSAGE_EDIT_TEST_IDS.ROOT)).toBeTruthy();
  });

  it('should render textarea', () => {
    expect(query(AGENT_X_MESSAGE_EDIT_TEST_IDS.TEXTAREA)).toBeTruthy();
  });

  it('should render cancel and save buttons', () => {
    expect(query(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_CANCEL)).toBeTruthy();
    expect(query(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_SAVE)).toBeTruthy();
  });

  // ─── initialText input ─────────────────────────────────────────────────────

  it('should populate draft from initialText on change', () => {
    fixture.componentRef.setInput('initialText', 'Hello world');
    fixture.detectChanges();
    const textarea = query<HTMLTextAreaElement>(AGENT_X_MESSAGE_EDIT_TEST_IDS.TEXTAREA)!;
    expect(textarea.value).toBe('Hello world');
  });

  it('should update draft when initialText changes again', () => {
    fixture.componentRef.setInput('initialText', 'first');
    fixture.detectChanges();
    fixture.componentRef.setInput('initialText', 'second');
    fixture.detectChanges();
    const textarea = query<HTMLTextAreaElement>(AGENT_X_MESSAGE_EDIT_TEST_IDS.TEXTAREA)!;
    expect(textarea.value).toBe('second');
  });

  // ─── Save output ──────────────────────────────────────────────────────────

  it('should emit save with trimmed text on save click', () => {
    fixture.componentRef.setInput('initialText', '  edited message  ');
    fixture.detectChanges();

    const spy = vi.fn();
    component.save.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_SAVE)!.click();
    expect(spy).toHaveBeenCalledWith('edited message');
  });

  it('should NOT emit save when draft is empty', () => {
    fixture.componentRef.setInput('initialText', '   ');
    fixture.detectChanges();

    const spy = vi.fn();
    component.save.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_SAVE)!.click();
    expect(spy).not.toHaveBeenCalled();
  });

  // ─── Cancel output ────────────────────────────────────────────────────────

  it('should emit cancel event on cancel click', () => {
    const spy = vi.fn();
    component.cancel.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_CANCEL)!.click();
    expect(spy).toHaveBeenCalledOnce();
  });
});
