import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-library-chrome',
  standalone: true,
  template: ` <ng-content></ng-content> `,
  host: {
    class: 'agent-x-library-chrome',
  },
  styles: [
    `
      .agent-x-library-chrome {
        display: contents;
      }

      .film-library-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .film-library-file-input {
        display: none;
      }

      .film-library-header__actions-primary,
      .film-library-header__actions-secondary {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .film-library-header__actions-primary {
        flex: 1 1 34rem;
        flex-wrap: wrap;
      }

      .film-library-header__actions-secondary {
        flex-wrap: wrap;
        justify-content: flex-end;
        margin-left: auto;
      }

      .film-library-search-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 21rem;
        min-width: 0;
      }

      .film-library-search-wrap nxt1-search-bar {
        flex: 1 1 auto;
        min-width: 0;
      }

      .film-library-search-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        border: 1px solid
          color-mix(in srgb, var(--nxt1-color-primary) 22%, var(--nxt1-color-border-subtle));
        background: color-mix(
          in srgb,
          var(--nxt1-color-alpha-primary10) 84%,
          var(--nxt1-color-surface-200)
        );
        color: color-mix(in srgb, var(--nxt1-color-primary) 78%, var(--nxt1-color-text-primary));
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
      }

      .film-upload-menu-anchor {
        position: relative;
        display: inline-flex;
      }

      .film-playlist-create {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
      }

      .film-playlist-create__input {
        min-width: 0;
        height: 34px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
        font: inherit;
        font-size: 13px;
        padding: 0 10px;
      }

      .film-playlist-create__input:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 1px;
      }

      .film-playlist-create__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: 12px;
        font-weight: 700;
        padding: 0 10px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .film-playlist-create__btn:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      .film-playlist-create__btn--primary {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
      }

      .film-playlist-create__btn--primary:hover:not(:disabled) {
        background: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
        border-color: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
      }

      .film-playbook-nav-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        padding: 8px 10px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 8px;
        background: var(--nxt1-color-surface-100);
        color: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .film-playbook-nav-btn:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-primary);
      }

      .film-playbook-nav-btn--attach {
        background: var(--nxt1-color-alpha-primary10);
        border-color: var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-primary);
      }

      .film-playbook-nav-btn--danger {
        border-color: var(--nxt1-color-error, #ef4444);
        color: var(--nxt1-color-error, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-error, #ef4444) 12%, transparent);
      }

      .film-playbook-nav-btn--danger:hover:not(:disabled) {
        border-color: var(--nxt1-color-error, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-error, #ef4444) 20%, transparent);
      }

      .film-playbook-nav-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .film-library-header__actions-secondary .film-playbook-nav-btn[aria-expanded='true'] {
        border-color: var(--nxt1-color-border-primary);
        background: color-mix(in srgb, var(--nxt1-color-alpha-primary10) 82%, transparent);
      }

      .film-playbook-checkbox {
        -webkit-appearance: none !important;
        appearance: none !important;
        background-image: none !important;
        position: relative;
        width: 16px;
        height: 16px;
        margin: 0;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 4px;
        background: var(--nxt1-color-surface-100);
        cursor: pointer;
        box-shadow: none !important;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }

      .film-playbook-checkbox:checked,
      .film-playbook-checkbox:indeterminate,
      .film-playbook-checkbox:checked:focus,
      .film-playbook-checkbox:checked:focus-visible,
      .film-playbook-checkbox:checked:active,
      .film-playbook-checkbox:indeterminate:focus,
      .film-playbook-checkbox:indeterminate:focus-visible,
      .film-playbook-checkbox:indeterminate:active {
        background: var(--nxt1-color-primary, #ccff00) !important;
        border-color: var(--nxt1-color-primary, #ccff00) !important;
      }

      .film-playbook-checkbox:checked::after {
        content: '';
        position: absolute;
        left: 4px;
        top: 1px;
        width: 5px;
        height: 9px;
        border: solid var(--nxt1-color-text-onPrimary);
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }

      .film-playbook-checkbox:indeterminate::after {
        content: '';
        position: absolute;
        left: 3px;
        right: 3px;
        top: 6px;
        height: 2px;
        border-radius: 2px;
        background: var(--nxt1-color-text-onPrimary);
      }

      .film-playbook-checkbox:focus,
      .film-playbook-checkbox:focus-visible,
      .film-playbook-checkbox:active,
      .film-playbook-checkbox:hover {
        outline: none !important;
        box-shadow: none !important;
      }

      .film-list-item__menu-btn,
      .film-playlist-folder__menu-btn {
        border: 0 !important;
        background: transparent !important;
        outline: none !important;
        box-shadow: none !important;
        -webkit-appearance: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
        border-radius: 999px !important;
      }

      .film-playbook-ask-agent {
        position: relative;
        flex-shrink: 0;
      }

      .film-playbook-ask-agent__caret {
        width: 12px;
        height: 12px;
        opacity: 0.72;
      }

      .film-playbook-download__icon {
        width: 14px;
        height: 14px;
        opacity: 0.9;
      }

      .film-playbook-ask-agent__logo {
        display: block;
        width: 18px;
        height: 18px;
      }

      .film-playbook-ask-agent__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.15rem;
        height: 1.15rem;
        padding: 0 0.32rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-text-primary) 82%, black);
        background: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-surface-100);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0.01em;
      }

      .film-playbook-ask-agent-menu {
        min-width: 240px;
        display: grid;
        gap: 4px;
        padding: 6px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: 10px;
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-navigation-dropdown);
      }

      .film-playbook-ask-agent-menu--prompts {
        width: min(700px, 86vw);
        max-width: min(700px, 86vw);
        max-height: min(58vh, 460px);
        overflow-y: auto;
        overflow-x: hidden;
        align-content: start;
        gap: 6px;
        padding: 5px;
        grid-template-columns: repeat(2, minmax(220px, 1fr));
      }

      .film-playbook-ask-agent-menu__empty {
        margin: 0;
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
        color: var(--nxt1-color-text-secondary);
      }

      .film-playbook-ask-agent-menu__option {
        display: grid;
        gap: 3px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        text-align: left;
        padding: 8px 10px;
        cursor: pointer;
      }

      .film-playbook-ask-agent-menu__option:hover,
      .film-playbook-ask-agent-menu__option:focus-visible {
        background: var(--nxt1-color-surface-200);
        outline: none;
      }

      .film-playbook-ask-agent-menu__label {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.3;
      }

      .film-playbook-ask-agent-menu__hint {
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.3;
      }

      @media (max-width: 1024px) {
        .film-library-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .film-library-header__actions-primary {
          flex-basis: 100%;
        }

        .film-library-header__actions-primary,
        .film-library-header__actions-secondary {
          width: 100%;
        }

        .film-library-search-wrap {
          min-width: 100%;
        }

        .film-library-header__actions-secondary .film-playbook-nav-btn {
          justify-content: center;
          width: 100%;
        }

        .film-playlist-create {
          grid-template-columns: 1fr 1fr;
        }

        .film-playlist-create__input {
          grid-column: 1 / -1;
        }

        .film-playlist-create__btn {
          width: 100%;
          justify-content: center;
        }
      }

      @media (max-width: 920px) {
        .film-playbook-ask-agent-menu--prompts {
          width: min(520px, 92vw);
          max-width: min(520px, 92vw);
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXLibraryChromeComponent {}
