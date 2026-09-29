/**
 * @fileoverview ChatBubbleActionsComponent — Unit Tests
 * @module @nxt1/ui/agent-x
 *
 * Tests the action chip row rendered below each message.
 * Pure component — no TestBed, uses Angular's ComponentFixture
 * via the official testing utilities.
 *
 * Coverage:
 * - Copy button is always visible
 * - Feedback/Delete buttons are hidden
 * - Edit button visibility follows canEdit, with no countdown shown
 * - Edit button renders before the copy button
 * - Alignment class applied correctly
 * - Copy/edit buttons emit the correct outputs
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatBubbleActionsComponent } from '../components/chat/agent-x-chat-bubble-actions.component';
import { AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS } from '@nxt1/core/testing';

describe('ChatBubbleActionsComponent', () => {
  let fixture: ComponentFixture<ChatBubbleActionsComponent>;
  let component: ChatBubbleActionsComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatBubbleActionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatBubbleActionsComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function query(testId: string): HTMLElement | null {
    return nativeEl.querySelector(`[data-testid="${testId}"]`);
  }

  // ─── Visibility ────────────────────────────────────────────────────────────

  it('should render root with correct test id', () => {
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.ROOT)).toBeTruthy();
  });

  it('should always render copy button', () => {
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_COPY)).toBeTruthy();
  });

  it('should NOT render feedback button', () => {
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_FEEDBACK)).toBeNull();
  });

  it('should NOT render edit button when canEdit=false', () => {
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT)).toBeNull();
  });

  it('should render edit button when canEdit=true', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT)).toBeTruthy();
  });

  it('should render edit button without a countdown label', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const editBtn = query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT);
    expect(editBtn?.getAttribute('aria-label')).toBe('Edit prompt');
    expect(editBtn?.textContent?.trim()).toBe('');
  });

  it('should render the edit button before the copy button', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const buttons = Array.from(nativeEl.querySelectorAll('button'));
    const editIndex = buttons.findIndex(
      (btn) => btn.getAttribute('data-testid') === AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT
    );
    const copyIndex = buttons.findIndex(
      (btn) => btn.getAttribute('data-testid') === AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_COPY
    );
    expect(editIndex).toBeGreaterThanOrEqual(0);
    expect(copyIndex).toBeGreaterThan(editIndex);
  });

  it('should emit edit event on edit button click', () => {
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const spy = vi.fn();
    component.edit.subscribe(spy);
    const btn = query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT) as HTMLButtonElement;
    btn.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  // ─── Alignment ─────────────────────────────────────────────────────────────

  it('should NOT have end-alignment class by default', () => {
    const root = query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.ROOT)!;
    expect(root.classList.contains('msg-actions--end')).toBe(false);
  });

  it('should apply end-alignment class when alignEnd=true', () => {
    fixture.componentRef.setInput('alignEnd', true);
    fixture.detectChanges();
    const root = query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.ROOT)!;
    expect(root.classList.contains('msg-actions--end')).toBe(true);
  });

  // ─── Outputs ───────────────────────────────────────────────────────────────

  it('should emit copy event on copy button click', () => {
    const spy = vi.fn();
    component.copy.subscribe(spy);
    const btn = query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_COPY) as HTMLButtonElement;
    btn.click();
    expect(spy).toHaveBeenCalledOnce();
  });
});
