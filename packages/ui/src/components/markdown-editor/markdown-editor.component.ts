import { CommonModule, isPlatformBrowser } from '@angular/common';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  PLATFORM_ID,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

import { NxtMarkdownComponent } from '../markdown';

export type NxtMarkdownEditorSaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

type ToolbarAction =
  | 'heading-1'
  | 'heading-2'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'link'
  | 'table';

interface ToolbarItem {
  readonly action: ToolbarAction;
  readonly label: string;
  readonly ariaLabel: string;
}

@Component({
  selector: 'nxt1-markdown-editor',
  standalone: true,
  imports: [CommonModule, OverlayModule, NxtMarkdownComponent],
  template: `
    <section
      class="nxt-markdown-editor"
      [class.nxt-markdown-editor--readonly]="readOnly()"
      [class.nxt-markdown-editor--ready]="editorReady()"
      [attr.aria-label]="ariaLabel()"
    >
      <div class="nxt-markdown-editor__top-bar">
        @if (!readOnly()) {
          <div class="nxt-markdown-editor__toolbar" aria-label="Document formatting">
            @for (item of primaryToolbarItems; track item.action) {
              <button
                type="button"
                class="nxt-markdown-editor__tool"
                [class.nxt-markdown-editor__tool--active]="isActionActive(item.action)"
                [attr.aria-label]="item.ariaLabel"
                [attr.title]="item.ariaLabel"
                (mousedown)="$event.preventDefault()"
                (click)="runToolbarAction(item.action)"
              >
                <span class="nxt-markdown-editor__icon" aria-hidden="true">
                  @switch (item.action) {
                    @case ('heading-1') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M4 12h7m-7 6V6m7 12V6" />
                        <path d="m15 9 3-2v11" />
                      </svg>
                    }
                    @case ('heading-2') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M4 12h7m-7 6V6m7 12V6" />
                        <path d="M15 9c.5-1.5 1.5-2 3-2a3 3 0 0 1 3 3c0 1.5-1 2.5-3 4.5L15 18h6" />
                      </svg>
                    }
                    @case ('bold') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zm0 8h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
                        />
                      </svg>
                    }
                    @case ('italic') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <line x1="19" y1="4" x2="10" y2="4" />
                        <line x1="14" y1="20" x2="5" y2="20" />
                        <line x1="15" y1="4" x2="9" y2="20" />
                      </svg>
                    }
                    @case ('bullet-list') {
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <line x1="9" y1="6" x2="20" y2="6" />
                        <line x1="9" y1="12" x2="20" y2="12" />
                        <line x1="9" y1="18" x2="20" y2="18" />
                        <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                        <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    }
                  }
                </span>
              </button>
            }

            <button
              type="button"
              class="nxt-markdown-editor__tool nxt-markdown-editor__tool--more"
              cdkOverlayOrigin
              #moreMenuOrigin="cdkOverlayOrigin"
              [class.nxt-markdown-editor__tool--active]="isMoreMenuOpen()"
              aria-label="More formatting options"
              title="More formatting options"
              [attr.aria-expanded]="isMoreMenuOpen()"
              aria-haspopup="menu"
              (mousedown)="$event.preventDefault()"
              (click)="toggleMoreMenu()"
            >
              <span class="nxt-markdown-editor__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>

            <ng-template
              cdkConnectedOverlay
              [cdkConnectedOverlayOrigin]="moreMenuOrigin"
              [cdkConnectedOverlayOpen]="isMoreMenuOpen()"
              [cdkConnectedOverlayPositions]="menuPositions"
              (overlayOutsideClick)="closeMoreMenu()"
            >
              <div
                class="nxt-markdown-editor__menu"
                role="menu"
                aria-label="More formatting options"
              >
                @for (item of overflowToolbarItems; track item.action) {
                  <button
                    type="button"
                    class="nxt-markdown-editor__menu-item"
                    [class.nxt-markdown-editor__menu-item--active]="isActionActive(item.action)"
                    role="menuitem"
                    (mousedown)="$event.preventDefault()"
                    (click)="onMenuActionClick(item.action)"
                  >
                    <span class="nxt-markdown-editor__menu-icon" aria-hidden="true">
                      @switch (item.action) {
                        @case ('strike') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                            <path d="M14 12a4 4 0 0 1 0 8H6" />
                            <line x1="4" y1="12" x2="20" y2="12" />
                          </svg>
                        }
                        @case ('ordered-list') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <line x1="10" y1="6" x2="21" y2="6" />
                            <line x1="10" y1="12" x2="21" y2="12" />
                            <line x1="10" y1="18" x2="21" y2="18" />
                            <path d="M4 6h1v4m-1 0h2m-2 8h2c0-1 2-2 2-3s-1-1.5-2-1" />
                          </svg>
                        }
                        @case ('task-list') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <rect x="3" y="5" width="6" height="6" rx="1" />
                            <path d="m5 8 1 1 2-2" />
                            <line x1="13" y1="6" x2="21" y2="6" />
                            <rect x="3" y="15" width="6" height="6" rx="1" />
                            <line x1="13" y1="18" x2="21" y2="18" />
                          </svg>
                        }
                        @case ('blockquote') {
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path
                              d="M4.58 17.32C3.55 16.23 3 15 3 13.01c0-3.5 2.46-6.64 6.03-8.19l.89 1.38c-3.33 1.8-3.99 4.14-4.25 5.62.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 0 1-3.5 3.5c-1.07 0-2.1-.49-2.75-1.18zm10 0c-1.03-1.09-1.58-2.32-1.58-4.31 0-3.5 2.46-6.64 6.03-8.19l.89 1.38c-3.33 1.8-3.99 4.14-4.25 5.62.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 0 1-3.5 3.5c-1.07 0-2.1-.49-2.75-1.18z"
                            />
                          </svg>
                        }
                        @case ('code-block') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                          </svg>
                        }
                        @case ('link') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path
                              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                            />
                          </svg>
                        }
                        @case ('table') {
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="3" y1="15" x2="21" y2="15" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                            <line x1="15" y1="3" x2="15" y2="21" />
                          </svg>
                        }
                      }
                    </span>
                    <span class="nxt-markdown-editor__menu-label">{{ item.label }}</span>
                  </button>
                }
              </div>
            </ng-template>
          </div>
        }

        <span
          class="nxt-markdown-editor__status"
          [class.nxt-markdown-editor__status--dirty]="saveStatus() === 'dirty'"
          [class.nxt-markdown-editor__status--saving]="saveStatus() === 'saving'"
          [class.nxt-markdown-editor__status--error]="saveStatus() === 'error'"
          aria-live="polite"
        >
          {{ saveStatusLabel() }}
        </span>
      </div>

      <div
        #editorHost
        class="nxt-markdown-editor__surface"
        [hidden]="!editorReady()"
        (keydown.meta.s)="onSaveShortcut($event)"
        (keydown.control.s)="onSaveShortcut($event)"
      ></div>
      @if (!editorReady()) {
        <div class="nxt-markdown-editor__surface nxt-markdown-editor__surface--fallback">
          @if (fallbackEditing()) {
            <textarea
              #fallbackTextarea
              class="nxt-markdown-editor__fallback-input"
              [value]="content()"
              [placeholder]="placeholder()"
              [attr.aria-label]="ariaLabel()"
              (input)="onFallbackInput($event)"
              (blur)="saveRequested.emit(content())"
              (keydown.meta.s)="onSaveShortcut($event)"
              (keydown.control.s)="onSaveShortcut($event)"
            ></textarea>
          } @else {
            <div
              [class.nxt-markdown-editor__fallback-action]="!readOnly()"
              (click)="startFallbackEditing()"
            >
              @if (content().trim().length > 0) {
                <nxt1-markdown [content]="content()" />
              } @else {
                <p class="nxt-markdown-editor__empty">{{ placeholder() }}</p>
              }
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      nxt1-markdown-editor {
        display: block;
        width: 100%;
        min-width: 0;
      }

      .nxt-markdown-editor {
        display: grid;
        gap: 12px;
        width: 100%;
        min-width: 0;
      }

      .nxt-markdown-editor__top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        min-width: 0;
      }

      .nxt-markdown-editor__status {
        margin-left: auto;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 62%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 68%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
      }

      .nxt-markdown-editor__status--dirty,
      .nxt-markdown-editor__status--saving {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 28%, transparent);
        color: var(--nxt1-color-text-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
      }

      .nxt-markdown-editor__status--error {
        border-color: color-mix(in srgb, var(--nxt1-color-error, #ff5f57) 42%, transparent);
        color: var(--nxt1-color-error, #ff5f57);
        background: color-mix(in srgb, var(--nxt1-color-error, #ff5f57) 12%, transparent);
      }

      .nxt-markdown-editor__toolbar {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        width: fit-content;
        max-width: 100%;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }

      .nxt-markdown-editor__toolbar::-webkit-scrollbar {
        display: none;
      }

      .nxt-markdown-editor__tool {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition:
          background-color 150ms ease,
          color 150ms ease,
          box-shadow 150ms ease;
      }

      .nxt-markdown-editor__tool:hover,
      .nxt-markdown-editor__tool:focus-visible,
      .nxt-markdown-editor__tool--active {
        color: var(--nxt1-color-text-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        outline: none;
      }

      .nxt-markdown-editor__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
      }

      .nxt-markdown-editor__icon svg {
        width: 16px;
        height: 16px;
      }

      .nxt-markdown-editor__menu {
        display: grid;
        gap: 2px;
        min-width: 180px;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 95%,
          var(--nxt1-color-surface-200) 5%
        );
        box-shadow: var(--nxt1-navigation-dropdown, 0 12px 32px rgba(0, 0, 0, 0.45));
        z-index: 50;
      }

      .nxt-markdown-editor__menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 34px;
        padding: 6px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        transition:
          background-color 140ms ease,
          color 140ms ease;
      }

      .nxt-markdown-editor__menu-item:hover,
      .nxt-markdown-editor__menu-item:focus-visible,
      .nxt-markdown-editor__menu-item--active {
        color: var(--nxt1-color-text-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        outline: none;
      }

      .nxt-markdown-editor__menu-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .nxt-markdown-editor__menu-icon svg {
        width: 16px;
        height: 16px;
      }

      .nxt-markdown-editor__menu-label {
        flex: 1 1 auto;
      }

      .nxt-markdown-editor__surface {
        min-height: 420px;
        max-height: min(64vh, 680px);
        overflow: auto;
        overscroll-behavior: contain;
        background: transparent;
      }

      .nxt-markdown-editor__surface--fallback {
        padding: 0;
      }

      .nxt-markdown-editor__fallback-action {
        min-height: 360px;
        cursor: text;
      }

      .nxt-markdown-editor__fallback-input {
        display: block;
        width: 100%;
        min-height: 360px;
        border: 0;
        outline: none;
        resize: vertical;
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font: inherit;
        font-size: 14px;
        line-height: 1.7;
      }

      .nxt-markdown-editor__empty {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.6;
      }

      .nxt-markdown-editor .ProseMirror {
        min-height: 420px;
        padding: 0;
        color: var(--nxt1-color-text-primary);
        font-size: 14px;
        line-height: 1.7;
        outline: none;
      }

      .nxt-markdown-editor .ProseMirror p,
      .nxt-markdown-editor .ProseMirror ul,
      .nxt-markdown-editor .ProseMirror ol,
      .nxt-markdown-editor .ProseMirror blockquote,
      .nxt-markdown-editor .ProseMirror pre,
      .nxt-markdown-editor .ProseMirror table {
        margin: 0 0 14px;
      }

      .nxt-markdown-editor .ProseMirror h1,
      .nxt-markdown-editor .ProseMirror h2,
      .nxt-markdown-editor .ProseMirror h3 {
        margin: 22px 0 12px;
        color: var(--nxt1-color-text-primary);
        line-height: 1.15;
        letter-spacing: 0;
      }

      .nxt-markdown-editor .ProseMirror h1:first-child,
      .nxt-markdown-editor .ProseMirror h2:first-child,
      .nxt-markdown-editor .ProseMirror h3:first-child,
      .nxt-markdown-editor .ProseMirror p:first-child {
        margin-top: 0;
      }

      .nxt-markdown-editor .ProseMirror h1 {
        font-size: 28px;
        font-weight: 850;
      }

      .nxt-markdown-editor .ProseMirror h2 {
        font-size: 21px;
        font-weight: 800;
      }

      .nxt-markdown-editor .ProseMirror h3 {
        font-size: 17px;
        font-weight: 780;
      }

      .nxt-markdown-editor .ProseMirror ul,
      .nxt-markdown-editor .ProseMirror ol {
        padding-left: 22px;
      }

      .nxt-markdown-editor .ProseMirror ul:not([data-type='taskList']) {
        list-style-type: disc;
      }

      .nxt-markdown-editor .ProseMirror ol {
        list-style-type: decimal;
      }

      .nxt-markdown-editor .ProseMirror li {
        margin: 4px 0;
        padding-left: 2px;
      }

      .nxt-markdown-editor .ProseMirror ul[data-type='taskList'] {
        padding-left: 0;
        list-style: none;
      }

      .nxt-markdown-editor .ProseMirror li[data-checked] {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: start;
        column-gap: 9px;
        padding-left: 0;
      }

      .nxt-markdown-editor .ProseMirror li[data-checked] > label {
        display: inline-flex;
        grid-column: 1;
        grid-row: 1;
        align-items: flex-start;
        justify-content: center;
        padding-top: 2px;
      }

      .nxt-markdown-editor .ProseMirror li[data-checked] > div {
        min-width: 0;
        grid-column: 2;
        grid-row: 1;
      }

      .nxt-markdown-editor .ProseMirror li[data-checked] > div > p:first-child {
        margin-top: 0;
      }

      .nxt-markdown-editor .ProseMirror li[data-checked] > div > p:last-child {
        margin-bottom: 0;
      }

      .nxt-markdown-editor .ProseMirror blockquote {
        padding: 10px 14px;
        border-left: 3px solid var(--nxt1-color-primary);
        border-radius: 0 12px 12px 0;
        background: color-mix(in srgb, var(--nxt1-color-primary) 9%, transparent);
        color: var(--nxt1-color-text-primary);
      }

      .nxt-markdown-editor .ProseMirror code {
        padding: 2px 5px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--nxt1-color-surface-300, #232323) 88%, transparent);
        font-family: var(--nxt1-font-family-mono, 'SFMono-Regular', Consolas, monospace);
        font-size: 0.92em;
      }

      .nxt-markdown-editor .ProseMirror pre {
        padding: 14px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--nxt1-color-surface-300, #111827) 86%, #000 14%);
        overflow-x: auto;
      }

      .nxt-markdown-editor .ProseMirror pre code {
        padding: 0;
        background: transparent;
      }

      .nxt-markdown-editor .ProseMirror a {
        color: var(--nxt1-color-primary);
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .nxt-markdown-editor .ProseMirror table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
      }

      .nxt-markdown-editor .ProseMirror th,
      .nxt-markdown-editor .ProseMirror td {
        min-width: 88px;
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 70%, transparent);
        vertical-align: top;
      }

      .nxt-markdown-editor .ProseMirror th {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 75%, transparent);
        font-weight: 800;
      }

      .nxt-markdown-editor .ProseMirror p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        color: var(--nxt1-color-text-tertiary, var(--nxt1-color-text-secondary));
        pointer-events: none;
      }

      .nxt-markdown-editor--readonly .ProseMirror {
        cursor: default;
      }

      @media (max-width: 720px) {
        .nxt-markdown-editor__surface,
        .nxt-markdown-editor .ProseMirror {
          min-height: 360px;
          max-height: min(68vh, 620px);
        }

        .nxt-markdown-editor .ProseMirror {
          padding: 18px;
          font-size: 15px;
        }
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMarkdownEditorComponent implements OnDestroy {
  readonly content = input('');
  readonly placeholder = input('Start writing...');
  readonly readOnly = input(false);
  readonly saveStatus = input<NxtMarkdownEditorSaveStatus>('saved');
  readonly ariaLabel = input('Markdown document editor');

  readonly contentChange = output<string>();
  readonly saveRequested = output<string>();

  protected readonly editorReady = signal(false);
  protected readonly fallbackEditing = signal(false);
  protected readonly isMoreMenuOpen = signal(false);
  protected readonly activeActions = signal<ReadonlySet<ToolbarAction>>(new Set());
  protected readonly saveStatusLabel = computed(() => {
    switch (this.saveStatus()) {
      case 'dirty':
        return 'Editing';
      case 'saving':
        return 'Saving...';
      case 'error':
        return 'Retry needed';
      case 'saved':
      default:
        return 'Saved';
    }
  });

  protected readonly primaryToolbarItems: readonly ToolbarItem[] = [
    { action: 'heading-1', label: 'H1', ariaLabel: 'Heading 1' },
    { action: 'heading-2', label: 'H2', ariaLabel: 'Heading 2' },
    { action: 'bold', label: 'Bold', ariaLabel: 'Bold' },
    { action: 'italic', label: 'Italic', ariaLabel: 'Italic' },
    { action: 'bullet-list', label: 'Bullet list', ariaLabel: 'Bullet list' },
  ];

  protected readonly overflowToolbarItems: readonly ToolbarItem[] = [
    { action: 'strike', label: 'Strikethrough', ariaLabel: 'Strikethrough' },
    { action: 'ordered-list', label: 'Numbered list', ariaLabel: 'Numbered list' },
    { action: 'task-list', label: 'Checklist', ariaLabel: 'Checklist' },
    { action: 'blockquote', label: 'Quote', ariaLabel: 'Quote' },
    { action: 'code-block', label: 'Code block', ariaLabel: 'Code block' },
    { action: 'link', label: 'Link', ariaLabel: 'Link' },
    { action: 'table', label: 'Table', ariaLabel: 'Insert table' },
  ];

  protected readonly menuPositions: ConnectedPosition[] = [
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ];

  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private readonly editorHost = viewChild<ElementRef<HTMLElement>>('editorHost');
  private readonly fallbackTextarea =
    viewChild<ElementRef<HTMLTextAreaElement>>('fallbackTextarea');
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private editor: Editor | null = null;
  private lastEmittedMarkdown = '';

  constructor() {
    effect(() => {
      if (!this.isBrowser || !this.editorHost()) return;
      afterNextRender(() => this.createEditor(), { injector: this.injector });
    });

    effect(() => {
      const content = this.content();
      const editor = this.editor;
      if (!editor || content === this.lastEmittedMarkdown) {
        return;
      }

      editor.commands.setContent(content, {
        contentType: 'markdown',
        emitUpdate: false,
      });
      this.lastEmittedMarkdown = content;
      this.syncActiveActions();
    });

    effect(() => {
      this.editor?.setEditable(!this.readOnly());
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  protected isActionActive(action: ToolbarAction): boolean {
    return this.activeActions().has(action);
  }

  protected toggleMoreMenu(): void {
    if (this.readOnly()) return;
    this.isMoreMenuOpen.update((open) => !open);
  }

  protected closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  protected onMenuActionClick(action: ToolbarAction): void {
    this.closeMoreMenu();
    this.runToolbarAction(action);
  }

  protected runToolbarAction(action: ToolbarAction): void {
    if (this.readOnly()) return;
    const editor = this.editor;
    if (!editor) return;

    const chain = editor.chain().focus();
    switch (action) {
      case 'heading-1':
        chain.toggleHeading({ level: 1 }).run();
        break;
      case 'heading-2':
        chain.toggleHeading({ level: 2 }).run();
        break;
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'bullet-list':
        chain.toggleBulletList().run();
        break;
      case 'ordered-list':
        chain.toggleOrderedList().run();
        break;
      case 'task-list':
        chain.toggleTaskList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'code-block':
        chain.toggleCodeBlock().run();
        break;
      case 'link':
        this.setLink();
        break;
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
    }

    this.syncActiveActions();
  }

  protected onSaveShortcut(event: Event): void {
    event.preventDefault();
    const markdown = this.editor?.getMarkdown() ?? this.content();
    this.saveRequested.emit(markdown);
  }

  protected startFallbackEditing(): void {
    if (this.readOnly() || this.editorReady()) return;
    this.fallbackEditing.set(true);
    afterNextRender(() => this.fallbackTextarea()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected onFallbackInput(event: Event): void {
    this.contentChange.emit((event.target as HTMLTextAreaElement).value);
  }

  private createEditor(): void {
    if (!this.isBrowser || this.editor || this.fallbackEditing()) {
      return;
    }

    const element = this.editorHost()?.nativeElement;
    if (!element) {
      return;
    }

    this.lastEmittedMarkdown = this.content();
    this.editor = new Editor({
      element,
      content: this.content(),
      contentType: 'markdown',
      editable: !this.readOnly(),
      extensions: [
        StarterKit.configure({
          link: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: this.placeholder() }),
        Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      ],
      onUpdate: ({ editor }: { editor: Editor }) => {
        const markdown = editor.getMarkdown();
        this.lastEmittedMarkdown = markdown;
        this.contentChange.emit(markdown);
        this.syncActiveActions();
      },
      onSelectionUpdate: () => this.syncActiveActions(),
      onBlur: ({ editor, event }: { editor: Editor; event: FocusEvent }) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof HTMLElement &&
          nextTarget.closest('.nxt-markdown-editor__top-bar, .nxt-markdown-editor__menu')
        ) {
          return;
        }

        this.saveRequested.emit(editor.getMarkdown());
      },
    });

    this.editorReady.set(true);
    this.syncActiveActions();
  }

  private setLink(): void {
    const editor = this.editor;
    if (!editor || !this.isBrowser) return;

    const previousUrl = editor.getAttributes('link')['href'];
    const url = window.prompt('Link URL', typeof previousUrl === 'string' ? previousUrl : '');
    if (url === null) {
      return;
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedUrl }).run();
  }

  private syncActiveActions(): void {
    const editor = this.editor;
    if (!editor) {
      this.activeActions.set(new Set());
      return;
    }

    const active = new Set<ToolbarAction>();
    if (editor.isActive('heading', { level: 1 })) active.add('heading-1');
    if (editor.isActive('heading', { level: 2 })) active.add('heading-2');
    if (editor.isActive('bold')) active.add('bold');
    if (editor.isActive('italic')) active.add('italic');
    if (editor.isActive('strike')) active.add('strike');
    if (editor.isActive('bulletList')) active.add('bullet-list');
    if (editor.isActive('orderedList')) active.add('ordered-list');
    if (editor.isActive('taskList')) active.add('task-list');
    if (editor.isActive('blockquote')) active.add('blockquote');
    if (editor.isActive('codeBlock')) active.add('code-block');
    if (editor.isActive('link')) active.add('link');
    if (editor.isActive('table')) active.add('table');
    this.activeActions.set(active);
  }
}
