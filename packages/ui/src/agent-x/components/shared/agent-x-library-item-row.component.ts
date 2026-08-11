import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-library-item-row',
  standalone: true,
  template: ` <ng-content></ng-content> `,
  host: {
    class: 'film-list-item-row',
    '[class.film-list-item-row--menu-open]': 'menuOpen',
  },
  styles: [
    `
      .film-list-item-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
        padding-left: 30px;
        z-index: 1;
      }

      .film-list-item__selection {
        width: 24px;
        min-width: 24px;
        min-height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .film-list-item__reorder-handle {
        width: 28px;
        height: 28px;
        min-width: 28px;
        min-height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        cursor: grab;
        transition:
          background 0.16s ease,
          color 0.16s ease;
      }

      .film-list-item__reorder-handle:hover,
      .film-list-item__reorder-handle:focus-visible {
        background: color-mix(in srgb, var(--nxt1-color-text-primary) 8%, transparent);
        color: var(--nxt1-color-primary);
        outline: none;
      }

      .film-list-item__reorder-handle:active {
        cursor: grabbing;
      }

      .film-reorder-grip {
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-auto-rows: 3px;
        gap: 2px;
      }

      .film-reorder-grip span {
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.72;
      }

      .film-list-item-row--menu-open {
        z-index: 260;
      }

      .film-list-item__menu-btn {
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        border-radius: 50%;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        z-index: 5;
      }

      .film-list-item__menu-btn:active {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 10%,
          transparent
        );
      }

      .film-list-item__menu-btn[aria-expanded='true'] {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
      }

      .film-list-item__menu-btn:hover,
      .film-list-item__menu-btn:focus-visible {
        background: color-mix(
          in srgb,
          var(--log-text-primary, var(--nxt1-color-text-primary)) 8%,
          transparent
        );
        color: var(--log-primary, var(--nxt1-color-primary));
        outline: none;
      }

      .film-list-item__menu-backdrop {
        position: fixed;
        inset: 0;
        background: transparent;
        border: 0;
        margin: 0;
        padding: 0;
        z-index: 2;
      }

      .film-list-item__menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: var(--nxt1-spacing-52, 13rem);
        max-width: min(22rem, calc(100vw - 24px));
        max-height: min(70vh, 34rem);
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--nxt1-spacing-1, 4px);
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
        z-index: 320;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .film-list-item__menu--open-up {
        top: auto;
        bottom: calc(100% + 6px);
      }

      .film-list-item__menu-section {
        display: grid;
        gap: 2px;
        padding: 4px 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .film-list-item__menu-action {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        border: 0;
        background: transparent;
        color: var(--nxt1-nav-text);
        text-align: left;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1.25;
        cursor: pointer;
        transition: background-color var(--nxt1-nav-transition-fast, 0.15s ease);
        -webkit-tap-highlight-color: transparent;
      }

      .film-list-item__menu-action:hover,
      .film-list-item__menu-action:focus-visible {
        background: var(--nxt1-nav-hover-bg);
        outline: none;
      }

      .film-list-item__menu-action:active {
        background: var(--nxt1-nav-hover-bg);
      }

      .film-list-item__menu-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .film-list-item__menu-action--danger {
        color: var(--nxt1-color-error, #ff4c4c);
      }

      .film-list-item__menu-action--primary {
        color: var(--log-primary, var(--nxt1-color-primary));
      }

      .film-list-item__menu-rename,
      .film-list-item__menu-confirm {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .film-list-item__menu-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--log-text-secondary, var(--nxt1-color-text-secondary));
        display: block;
        padding: 2px 4px 0;
      }

      .film-list-item__menu-input {
        width: 100%;
        border-radius: var(--nxt1-radius-md, 10px);
        border: 1px solid var(--log-border, var(--nxt1-color-border-default));
        background: var(--log-surface, var(--nxt1-color-surface-100));
        color: var(--log-text-primary, var(--nxt1-color-text-primary));
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        outline: none;
      }

      .film-list-item__menu-input:focus {
        border-color: color-mix(
          in srgb,
          var(--log-primary, var(--nxt1-color-primary)) 65%,
          var(--log-border, var(--nxt1-color-border-default))
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--log-primary, var(--nxt1-color-primary)) 15%, transparent);
      }

      .film-list-item__menu-row,
      .film-list-item__menu-actions {
        display: flex;
        gap: 4px;
      }

      .film-list-item__menu-row .film-list-item__menu-action,
      .film-list-item__menu-actions .film-list-item__menu-action {
        justify-content: center;
      }

      .film-list-item__menu-confirm-text {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
      }

      .film-list-item {
        width: 100%;
        min-height: 54px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        padding-right: 48px;
        flex: 1 1 auto;
        min-width: 0;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        transition:
          background 0.18s ease,
          border-color 0.18s ease;
        cursor: grab;
        text-align: left;
      }

      .film-list-item:active {
        cursor: grabbing;
      }

      .film-list-item:hover {
        background: var(--nxt1-color-surface-200);
      }

      .film-list-item--active {
        border-color: var(--nxt1-color-border-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .film-list-item__thumbnail {
        position: relative;
        width: 64px;
        height: 38px;
        background: var(--nxt1-color-bg-primary);
        overflow: hidden;
        border-radius: 6px;
        flex-shrink: 0;
      }

      .film-list-item__thumbnail-loader {
        position: absolute;
        inset: 0;
        display: block;
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        z-index: 1;
      }

      .film-list-item__thumbnail-shimmer {
        display: block;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 50%,
          var(--nxt1-color-surface-100) 100%
        );
        background-size: 200% 100%;
        animation: film-thumbnail-shimmer 1.2s ease-in-out infinite;
      }

      @keyframes film-thumbnail-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      .film-list-item__video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        opacity: 0;
        transition: opacity 0.16s ease;
      }

      .film-list-item__video--ready {
        opacity: 1;
      }

      .film-list-item__thumb-image {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .film-list-item__thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: color-mix(in srgb, white 88%, var(--nxt1-color-text-primary));
        background: linear-gradient(
          140deg,
          color-mix(in srgb, var(--nxt1-color-text-primary) 22%, var(--nxt1-color-surface-100)) 0%,
          color-mix(in srgb, var(--nxt1-color-text-primary) 10%, var(--nxt1-color-surface-200)) 100%
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, white 12%, transparent);
      }

      .film-list-item__thumb-placeholder--pdf {
        background: linear-gradient(
          145deg,
          color-mix(in srgb, var(--nxt1-color-error, #ff5a5a) 78%, #3a0d16) 0%,
          color-mix(in srgb, var(--nxt1-color-error, #ff5a5a) 34%, #0f0f14) 100%
        );
      }

      .film-list-item__thumb-placeholder--csv {
        background: linear-gradient(
          145deg,
          color-mix(in srgb, var(--nxt1-color-success, #2ec27e) 82%, #0a2a1f) 0%,
          color-mix(in srgb, var(--nxt1-color-success, #2ec27e) 32%, #0f1412) 100%
        );
      }

      .film-list-item__thumb-placeholder--doc {
        background: linear-gradient(
          145deg,
          color-mix(in srgb, var(--nxt1-color-primary) 76%, #10233f) 0%,
          color-mix(in srgb, var(--nxt1-color-primary) 28%, #10141c) 100%
        );
      }

      .film-list-item__thumb-placeholder--app {
        background: linear-gradient(
          145deg,
          color-mix(in srgb, #f4c95d 76%, #473411) 0%,
          color-mix(in srgb, #f4c95d 30%, #15120d) 100%
        );
      }

      .film-list-item__content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .film-list-item__title {
        display: inline-block;
        padding: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .film-list-item__meta {
        display: inline-block;
        padding: 0;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary);
      }

      .cdk-drag-preview.film-list-item-row {
        box-sizing: border-box;
        border-radius: 10px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .cdk-drag-placeholder {
        opacity: 0.24;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXLibraryItemRowComponent {
  @Input() menuOpen = false;
}
