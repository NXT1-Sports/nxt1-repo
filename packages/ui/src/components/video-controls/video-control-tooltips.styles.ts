/**
 * Shared hover tooltip skin for compact video control actions.
 */
export const VIDEO_CONTROL_TOOLTIP_STYLES = `
  @media (hover: hover) and (pointer: fine) {
    .video-controls__tooltip-host[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      z-index: 40;
      max-width: min(180px, calc(100vw - 24px));
      padding: 5px 7px;
      border-radius: var(--nxt1-border-radius-sm, 6px);
      background: color-mix(in srgb, var(--nxt1-color-bg-primary) 92%, transparent);
      border: 1px solid var(--nxt1-color-border-default);
      color: var(--nxt1-color-text-primary);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      font-size: 10px;
      font-weight: 700;
      line-height: 1.1;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      text-overflow: ellipsis;
      transform: translate(calc(-50% + var(--video-tooltip-offset-x, 0px)), 4px);
      transition:
        opacity 0.14s ease,
        transform 0.14s ease;
      white-space: nowrap;
    }

    .video-controls__tooltip-host[data-tooltip]:hover::after,
    .video-controls__tooltip-host[data-tooltip]:focus-visible::after {
      opacity: 1;
      transform: translate(calc(-50% + var(--video-tooltip-offset-x, 0px)), 0);
    }
  }
`;
