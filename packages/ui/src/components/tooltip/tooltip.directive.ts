/**
 * @fileoverview NxtTooltip — Lightweight hover tooltip directive
 * @module @nxt1/ui/components/tooltip
 * @version 1.0.0
 *
 * A pure-CSS-positioned, programmatically-rendered tooltip that attaches to any
 * host element via an attribute directive.  Renders a small floating card on
 * mouseenter / focusin and hides on mouseleave / focusout.
 *
 * Features:
 * ─ Title + optional description + optional accent colour
 * ─ Configurable placement (top | bottom | left | right — default: top)
 * ─ Enter/leave delay for hover UX (150 ms / 100 ms)
 * ─ SSR-safe — no DOM access on the server
 * ─ Accessible — role="tooltip", aria-describedby wiring
 * ─ Uses design tokens for consistent theming
 * ─ Automatic cleanup on destroy
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <!-- Simple text tooltip -->
 * <button nxtTooltip="Save changes">💾</button>
 *
 * <!-- Rich tooltip with description -->
 * <div
 *   [nxtTooltip]="{ title: 'Profile Pro', description: 'Complete your full profile', accent: '#3b82f6' }"
 * >…</div>
 * ```
 */

import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  Renderer2,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { injectTooltipStyles } from './tooltip.styles';

/* ── Public Types ── */

/** Simple string OR rich config object — both are valid inputs. */
export type TooltipInput = string | TooltipConfig;

export interface TooltipConfig {
  /** Primary text (always shown). */
  readonly title: string;
  /** Secondary description line (optional). */
  readonly description?: string;
  /** Accent colour override (CSS value). Tints the title. */
  readonly accent?: string;
  /** Placement relative to host element. @default 'top' */
  readonly placement?: TooltipPlacement;
}

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/* ── Constants ── */

const TOOLTIP_ENTER_DELAY = 150; // ms
const TOOLTIP_LEAVE_DELAY = 100; // ms
const TOOLTIP_OFFSET = 8; // px gap between host & tooltip
const TOOLTIP_CLASS = 'nxt1-tooltip';
const VIEWPORT_PADDING = 8; // px from viewport edge

/** Unique incrementing ID for aria-describedby. */
let tooltipIdCounter = 0;

@Directive({
  selector: '[nxtTooltip]',
  standalone: true,
})
export class NxtTooltipDirective implements OnDestroy {
  /* ── Dependencies ── */
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly platformId = inject(PLATFORM_ID);

  /* ── Input ── */

  /**
   * Tooltip content — accepts a plain string or a `TooltipConfig` object.
   *
   * ```html
   * <div nxtTooltip="Simple text" />
   * <div [nxtTooltip]="{ title: 'Bold', description: 'Detail line', accent: '#ffd700' }" />
   * ```
   */
  readonly nxtTooltip = input.required<TooltipInput>();

  /* ── Internal State ── */

  private tooltipEl: HTMLElement | null = null;
  private enterTimer: ReturnType<typeof setTimeout> | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly tooltipId = `nxt1-tip-${++tooltipIdCounter}`;
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /* Event listener removal functions */
  private removeMouseEnter: (() => void) | null = null;
  private removeMouseLeave: (() => void) | null = null;
  private removeFocusIn: (() => void) | null = null;
  private removeFocusOut: (() => void) | null = null;

  constructor() {
    if (!this.isBrowser) return;

    const host = this.el.nativeElement;

    this.removeMouseEnter = this.renderer.listen(host, 'mouseenter', () => this.scheduleShow());
    this.removeMouseLeave = this.renderer.listen(host, 'mouseleave', () => this.scheduleHide());
    this.removeFocusIn = this.renderer.listen(host, 'focusin', () => this.scheduleShow());
    this.removeFocusOut = this.renderer.listen(host, 'focusout', () => this.scheduleHide());
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.hide();
    this.removeMouseEnter?.();
    this.removeMouseLeave?.();
    this.removeFocusIn?.();
    this.removeFocusOut?.();
  }

  /* ── Show / Hide Logic ── */

  private scheduleShow(): void {
    this.clearTimers();
    this.enterTimer = setTimeout(() => this.show(), TOOLTIP_ENTER_DELAY);
  }

  private scheduleHide(): void {
    this.clearTimers();
    this.leaveTimer = setTimeout(() => this.hide(), TOOLTIP_LEAVE_DELAY);
  }

  private clearTimers(): void {
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
      this.enterTimer = null;
    }
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }

  private show(): void {
    if (this.tooltipEl) return; // already visible

    const config = this.normalise(this.nxtTooltip());
    if (!config.title.trim()) return; // nothing to show

    /* Ensure global CSS is available (idempotent) */
    injectTooltipStyles();

    /* Build tooltip DOM */
    const tip = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setAttribute(tip, 'id', this.tooltipId);
    this.renderer.setAttribute(tip, 'role', 'tooltip');
    this.renderer.addClass(tip, TOOLTIP_CLASS);

    /* Accent CSS variable */
    if (config.accent) {
      this.renderer.setStyle(tip, '--tip-accent', config.accent);
    }

    /* Title */
    const titleEl = this.renderer.createElement('span') as HTMLElement;
    this.renderer.addClass(titleEl, `${TOOLTIP_CLASS}__title`);
    const titleText = this.renderer.createText(config.title);
    this.renderer.appendChild(titleEl, titleText);
    this.renderer.appendChild(tip, titleEl);

    /* Optional description */
    if (config.description?.trim()) {
      const descEl = this.renderer.createElement('span') as HTMLElement;
      this.renderer.addClass(descEl, `${TOOLTIP_CLASS}__desc`);
      const descText = this.renderer.createText(config.description);
      this.renderer.appendChild(descEl, descText);
      this.renderer.appendChild(tip, descEl);
    }

    /* Arrow */
    const arrow = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(arrow, `${TOOLTIP_CLASS}__arrow`);
    this.renderer.appendChild(tip, arrow);

    /* Append to body so it's never clipped by overflow:hidden ancestors */
    this.renderer.appendChild(document.body, tip);
    this.tooltipEl = tip;

    /* Aria */
    this.renderer.setAttribute(this.el.nativeElement, 'aria-describedby', this.tooltipId);

    /* Position after paint so dimensions are available */
    requestAnimationFrame(() => this.position(config.placement ?? 'top'));
  }

  private hide(): void {
    if (!this.tooltipEl) return;
    this.renderer.removeChild(document.body, this.tooltipEl);
    this.tooltipEl = null;
    this.renderer.removeAttribute(this.el.nativeElement, 'aria-describedby');
  }

  /* ── Positioning ── */

  private position(placement: TooltipPlacement): void {
    const tip = this.tooltipEl;
    if (!tip) return;

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0;
    let left = 0;
    let arrowPlacement: TooltipPlacement = placement;

    switch (placement) {
      case 'top':
        top = hostRect.top - tipRect.height - TOOLTIP_OFFSET;
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
        break;
      case 'bottom':
        top = hostRect.bottom + TOOLTIP_OFFSET;
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
        break;
      case 'left':
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        left = hostRect.left - tipRect.width - TOOLTIP_OFFSET;
        break;
      case 'right':
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        left = hostRect.right + TOOLTIP_OFFSET;
        break;
    }

    /* Flip vertically if out-of-viewport */
    if (placement === 'top' && top < VIEWPORT_PADDING) {
      top = hostRect.bottom + TOOLTIP_OFFSET;
      arrowPlacement = 'bottom';
    } else if (placement === 'bottom' && top + tipRect.height > vh - VIEWPORT_PADDING) {
      top = hostRect.top - tipRect.height - TOOLTIP_OFFSET;
      arrowPlacement = 'top';
    }

    /* Clamp horizontally */
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tipRect.width - VIEWPORT_PADDING));
    top = Math.max(VIEWPORT_PADDING, top);

    this.renderer.setStyle(tip, 'top', `${top}px`);
    this.renderer.setStyle(tip, 'left', `${left}px`);
    this.renderer.setAttribute(tip, 'data-placement', arrowPlacement);

    /* Trigger enter animation */
    requestAnimationFrame(() => {
      if (this.tooltipEl) {
        this.renderer.addClass(this.tooltipEl, `${TOOLTIP_CLASS}--visible`);
      }
    });
  }

  /* ── Helpers ── */

  private normalise(value: TooltipInput): TooltipConfig {
    if (typeof value === 'string') {
      return { title: value };
    }
    return value;
  }
}
