/**
 * @fileoverview AgentXFeedbackModalComponent — Unit Tests
 * @module @nxt1/ui/agent-x
 *
 * Tests the star-rating + category/text feedback modal.
 *
 * Coverage:
 * - Modal renders with correct test ids
 * - defaultRating input seeds the star rating on change
 * - Rating changes when a star button is clicked
 * - Category select is rendered
 * - Submit emits correct payload (rating + optional category + optional text)
 * - Submit with no category / no text emits minimal payload
 * - Cancel emits close event via overlay click
 * - Cancel emits close event via cancel button
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentXFeedbackModalComponent } from '../agent-x-feedback-modal.component';
import type { AgentXFeedbackSubmitEvent } from '../agent-x-feedback-modal.component';
import { AGENT_X_FEEDBACK_MODAL_TEST_IDS } from '@nxt1/core/testing';

describe('AgentXFeedbackModalComponent', () => {
  let fixture: ComponentFixture<AgentXFeedbackModalComponent>;
  let component: AgentXFeedbackModalComponent;
  let nativeEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentXFeedbackModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXFeedbackModalComponent);
    component = fixture.componentInstance;
    nativeEl = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function query<T extends HTMLElement>(testId: string): T | null {
    return nativeEl.querySelector<T>(`[data-testid="${testId}"]`);
  }

  function queryAll(testId: string): NodeListOf<HTMLElement> {
    return nativeEl.querySelectorAll(`[data-testid="${testId}"]`);
  }

  // ─── Structural ────────────────────────────────────────────────────────────

  it('should render overlay', () => {
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.OVERLAY)).toBeTruthy();
  });

  it('should render modal panel', () => {
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.MODAL)).toBeTruthy();
  });

  it('should render 5 star buttons', () => {
    const stars = queryAll(AGENT_X_FEEDBACK_MODAL_TEST_IDS.STAR_BUTTON);
    expect(stars.length).toBe(5);
  });

  it('should render category select', () => {
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.CATEGORY_SELECT)).toBeTruthy();
  });

  it('should render text textarea', () => {
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.TEXTAREA)).toBeTruthy();
  });

  it('should render cancel and submit buttons', () => {
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_CANCEL)).toBeTruthy();
    expect(query(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_SUBMIT)).toBeTruthy();
  });

  // ─── defaultRating input ───────────────────────────────────────────────────

  it('should reset rating to defaultRating when input changes', () => {
    fixture.componentRef.setInput('defaultRating', 3);
    fixture.detectChanges();
    // Inspect active stars — stars with index < 3 should have active class
    const stars = Array.from(queryAll(AGENT_X_FEEDBACK_MODAL_TEST_IDS.STAR_BUTTON));
    const activeStars = stars.filter((s) => s.classList.contains('feedback-stars__btn--active'));
    expect(activeStars.length).toBe(3);
  });

  it('should also reset category and text when defaultRating changes', () => {
    fixture.componentRef.setInput('defaultRating', 5);
    fixture.detectChanges();
    const select = query<HTMLSelectElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.CATEGORY_SELECT)!;
    const textarea = query<HTMLTextAreaElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.TEXTAREA)!;
    expect(select.value).toBe('');
    expect(textarea.value).toBe('');
  });

  // ─── Submit output ─────────────────────────────────────────────────────────

  it('should emit submit with current rating (default 5)', () => {
    const spy = vi.fn<[AgentXFeedbackSubmitEvent]>();
    component.submit.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_SUBMIT)!.click();
    expect(spy).toHaveBeenCalledOnce();
    const payload = spy.mock.calls[0][0];
    expect(payload.rating).toBe(5);
    expect(payload.category).toBeUndefined();
    expect(payload.text).toBeUndefined();
  });

  it('should emit submit with rating 3 after clicking third star', () => {
    const stars = Array.from(
      queryAll(AGENT_X_FEEDBACK_MODAL_TEST_IDS.STAR_BUTTON)
    ) as HTMLButtonElement[];
    stars[2].click(); // 0-indexed → star 3
    fixture.detectChanges();

    const spy = vi.fn<[AgentXFeedbackSubmitEvent]>();
    component.submit.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_SUBMIT)!.click();
    expect(spy.mock.calls[0][0].rating).toBe(3);
  });

  // ─── Close output ──────────────────────────────────────────────────────────

  it('should emit close when overlay background clicked', () => {
    const spy = vi.fn();
    component.close.subscribe(spy);
    query<HTMLDivElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.OVERLAY)!.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('should emit close when cancel button clicked', () => {
    const spy = vi.fn();
    component.close.subscribe(spy);
    query<HTMLButtonElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_CANCEL)!.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('should NOT emit close when modal panel is clicked', () => {
    const spy = vi.fn();
    component.close.subscribe(spy);
    query<HTMLDivElement>(AGENT_X_FEEDBACK_MODAL_TEST_IDS.MODAL)!.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
