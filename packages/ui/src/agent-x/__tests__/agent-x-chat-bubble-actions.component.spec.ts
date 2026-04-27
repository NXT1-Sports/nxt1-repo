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
 * - Feedback/Edit/Delete buttons are hidden
 * - Alignment class applied correctly
 * - Copy button emits the correct output
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatBubbleActionsComponent } from '../agent-x-chat-bubble-actions.component';
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

  it('should NOT render edit/delete buttons', () => {
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT)).toBeNull();
    expect(query(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_DELETE)).toBeNull();
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
