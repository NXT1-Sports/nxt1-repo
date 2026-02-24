/**
 * @fileoverview NxtTooltip global styles
 * @module @nxt1/ui/components/tooltip
 *
 * Injected once into the document head. Because the tooltip is appended to
 * `document.body` (to escape overflow:hidden ancestors), component-scoped
 * styles can't reach it. These global styles use a unique class prefix to
 * avoid collisions.
 *
 * Design tokens are used wherever granularity is sufficient.
 */

/** CSS injected into <head> once when the first tooltip is rendered. */
export const TOOLTIP_GLOBAL_STYLES = `
/* ============================================
   NXT1 TOOLTIP — Global Styles (appended to body)
   ============================================ */

.nxt1-tooltip {
  --tip-accent: var(--nxt1-color-primary, #d4ff00);
  --tip-bg: var(--nxt1-color-surface-200, rgba(28, 28, 30, 0.96));
  --tip-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
  --tip-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);

  position: fixed;
  z-index: 10000;
  max-width: 260px;
  padding: 10px 14px;
  background: var(--tip-bg);
  border: 1px solid var(--tip-border);
  border-radius: 10px;
  box-shadow: var(--tip-shadow);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 3px;

  /* Animation: start hidden */
  opacity: 0;
  transform: translateY(4px) scale(0.97);
  transition:
    opacity 0.18s cubic-bezier(0.2, 0, 0, 1),
    transform 0.18s cubic-bezier(0.2, 0, 0, 1);
}

.nxt1-tooltip--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Placement-aware entry animation */
.nxt1-tooltip[data-placement='bottom'] {
  transform: translateY(-4px) scale(0.97);
}
.nxt1-tooltip[data-placement='bottom'].nxt1-tooltip--visible {
  transform: translateY(0) scale(1);
}
.nxt1-tooltip[data-placement='left'] {
  transform: translateX(4px) scale(0.97);
}
.nxt1-tooltip[data-placement='left'].nxt1-tooltip--visible {
  transform: translateX(0) scale(1);
}
.nxt1-tooltip[data-placement='right'] {
  transform: translateX(-4px) scale(0.97);
}
.nxt1-tooltip[data-placement='right'].nxt1-tooltip--visible {
  transform: translateX(0) scale(1);
}

/* ── Title ── */
.nxt1-tooltip__title {
  font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--tip-accent);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* ── Description ── */
.nxt1-tooltip__desc {
  font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
}

/* ── Arrow ── */
.nxt1-tooltip__arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--tip-bg);
  border: 1px solid var(--tip-border);
  transform: rotate(45deg);
}

/* Arrow placement on bottom edge → tooltip is above host */
.nxt1-tooltip[data-placement='top'] .nxt1-tooltip__arrow {
  bottom: -5px;
  left: 50%;
  margin-left: -4px;
  border-top: none;
  border-left: none;
}

/* Arrow placement on top edge → tooltip is below host */
.nxt1-tooltip[data-placement='bottom'] .nxt1-tooltip__arrow {
  top: -5px;
  left: 50%;
  margin-left: -4px;
  border-bottom: none;
  border-right: none;
}

/* Arrow on right edge → tooltip is left of host */
.nxt1-tooltip[data-placement='left'] .nxt1-tooltip__arrow {
  right: -5px;
  top: 50%;
  margin-top: -4px;
  border-bottom: none;
  border-left: none;
}

/* Arrow on left edge → tooltip is right of host */
.nxt1-tooltip[data-placement='right'] .nxt1-tooltip__arrow {
  left: -5px;
  top: 50%;
  margin-top: -4px;
  border-top: none;
  border-right: none;
}
`;

/** Inject tooltip styles into document head (idempotent). */
let stylesInjected = false;

export function injectTooltipStyles(): void {
  if (stylesInjected) return;
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.setAttribute('data-nxt1-tooltip', '');
  style.textContent = TOOLTIP_GLOBAL_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}
