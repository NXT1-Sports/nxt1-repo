/**
 * @fileoverview Create Post Editor Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Rich text editor for post content with character count and mentions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Auto-expanding textarea
 * - Character count with visual indicator
 * - Placeholder with tips
 * - Focus styles with primary accent
 * - Mention/tag support (@username)
 * - Hashtag detection
 *
 * @example
 * ```html
 * <nxt1-create-post-editor
 *   [(content)]="content"
 *   [maxCharacters]="2000"
 *   [placeholder]="'What\'s on your mind?'"
 *   (mentionTriggered)="showMentionSuggestions($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  model,
  ElementRef,
  viewChild,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { POST_MAX_CHARACTERS } from '@nxt1/core';

@Component({
  selector: 'nxt1-create-post-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="editor"
      [class.editor--focused]="isFocused()"
      [class.editor--has-content]="hasContent()"
      [class.editor--near-limit]="isNearLimit()"
      [class.editor--over-limit]="isOverLimit()"
      [class.editor--disabled]="disabled()"
    >
      <!-- Textarea -->
      <div class="editor__input-wrapper">
        <textarea
          #textareaRef
          class="editor__textarea"
          [value]="content()"
          (input)="onInput($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          (keydown)="onKeyDown($event)"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [attr.maxlength]="maxCharacters()"
          rows="1"
          aria-label="Post content"
        ></textarea>
      </div>

      <!-- Character count -->
      <div class="editor__footer">
        <div class="editor__char-count">
          <div
            class="editor__char-ring"
            [style.--progress]="characterProgress()"
            [style.--ring-color]="ringColor()"
          >
            <svg viewBox="0 0 36 36">
              <path
                class="editor__char-ring-bg"
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="editor__char-ring-fill"
                [attr.stroke-dasharray]="characterProgress() + ', 100'"
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
          </div>

          @if (showExactCount()) {
            <span
              class="editor__char-text"
              [class.editor__char-text--warning]="isNearLimit()"
              [class.editor__char-text--error]="isOverLimit()"
            >
              {{ remainingCharacters() }}
            </span>
          }
        </div>

        <!-- Formatting hints (hidden for now, could be expanded) -->
        @if (showFormattingHints()) {
          <div class="editor__hints">
            <span class="editor__hint">&#64;mention</span>
            <span class="editor__hint">#hashtag</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         EDITOR - Theme-aware Design
         ============================================ */

      :host {
        display: block;
      }

      .editor {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .editor--disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ============================================
         TEXTAREA
         ============================================ */

      .editor__input-wrapper {
        position: relative;
      }

      .editor__textarea {
        width: 100%;
        min-height: 120px;
        max-height: 400px;
        padding: 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-family: inherit;
        line-height: 1.5;
        resize: none;
        outline: none;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        overflow-y: auto;
      }

      .editor__textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Focus state */
      .editor--focused .editor__textarea {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      /* Near limit */
      .editor--near-limit .editor__textarea {
        border-color: var(--nxt1-color-warning, #f59e0b);
      }

      .editor--near-limit.editor--focused .editor__textarea {
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
      }

      /* Over limit */
      .editor--over-limit .editor__textarea {
        border-color: var(--nxt1-color-error, #ef4444);
      }

      .editor--over-limit.editor--focused .editor__textarea {
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
      }

      /* ============================================
         FOOTER
         ============================================ */

      .editor__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px;
      }

      /* ============================================
         CHARACTER COUNT
         ============================================ */

      .editor__char-count {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .editor__char-ring {
        --progress: 0;
        --ring-color: var(--nxt1-color-primary, #ccff00);
        width: 24px;
        height: 24px;
      }

      .editor__char-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .editor__char-ring-bg {
        fill: none;
        stroke: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        stroke-width: 3;
      }

      .editor__char-ring-fill {
        fill: none;
        stroke: var(--ring-color);
        stroke-width: 3;
        stroke-linecap: round;
        transition:
          stroke-dasharray 0.3s ease,
          stroke 0.2s ease;
      }

      .editor__char-text {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-variant-numeric: tabular-nums;
        min-width: 36px;
        text-align: right;
      }

      .editor__char-text--warning {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .editor__char-text--error {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
         HINTS
         ============================================ */

      .editor__hints {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .editor__hint {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-quaternary, rgba(255, 255, 255, 0.3));
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 640px) {
        .editor__textarea {
          min-height: 100px;
          padding: 12px;
          font-size: var(--nxt1-fontSize-base, 1rem);
        }

        .editor__hints {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostEditorComponent {
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textareaRef');

  /** Post content (two-way binding) */
  readonly content = model('');

  /** Maximum characters allowed */
  readonly maxCharacters = input(POST_MAX_CHARACTERS);

  /** Placeholder text */
  readonly placeholder = input("What's on your mind?");

  /** Whether editor is disabled */
  readonly disabled = input(false);

  /** Show formatting hints */
  readonly showFormattingHints = input(true);

  /** Emitted when @ mention is triggered */
  readonly mentionTriggered = output<string>();

  /** Emitted when # hashtag is triggered */
  readonly hashtagTriggered = output<string>();

  /** Emitted when content changes */
  readonly contentChange = output<string>();

  /** Emitted when user presses Enter */
  readonly submitRequested = output<void>();

  /** Focus state */
  protected readonly isFocused = signal(false);

  /** Whether has content */
  protected readonly hasContent = computed(() => this.content().length > 0);

  /** Remaining characters */
  protected readonly remainingCharacters = computed(
    () => this.maxCharacters() - this.content().length
  );

  /** Character progress percentage */
  protected readonly characterProgress = computed(() => {
    const progress = (this.content().length / this.maxCharacters()) * 100;
    return Math.min(progress, 100);
  });

  /** Whether near character limit */
  protected readonly isNearLimit = computed(() => {
    const remaining = this.remainingCharacters();
    return remaining <= 100 && remaining > 0;
  });

  /** Whether over character limit */
  protected readonly isOverLimit = computed(() => this.remainingCharacters() < 0);

  /** Whether to show exact count */
  protected readonly showExactCount = computed(() => {
    const remaining = this.remainingCharacters();
    return remaining <= 200;
  });

  /** Ring color based on state */
  protected readonly ringColor = computed(() => {
    if (this.isOverLimit()) {
      return 'var(--nxt1-color-error, #ef4444)';
    }
    if (this.isNearLimit()) {
      return 'var(--nxt1-color-warning, #f59e0b)';
    }
    return 'var(--nxt1-color-primary, #ccff00)';
  });

  constructor() {
    // Auto-resize textarea on render
    afterNextRender(() => {
      this.autoResize();
    });
  }

  /**
   * Handle input change.
   */
  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const value = target.value;

    this.content.set(value);
    this.contentChange.emit(value);
    this.autoResize();

    // Check for mentions
    this.checkForMention(value);

    // Check for hashtags
    this.checkForHashtag(value);
  }

  /**
   * Handle focus.
   */
  protected onFocus(): void {
    this.isFocused.set(true);
  }

  /**
   * Handle blur.
   */
  protected onBlur(): void {
    this.isFocused.set(false);
  }

  /**
   * Handle key down.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    // Cmd/Ctrl + Enter to submit
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.submitRequested.emit();
    }
  }

  /**
   * Auto-resize textarea based on content.
   */
  private autoResize(): void {
    const textarea = this.textareaRef()?.nativeElement;
    if (!textarea) return;

    // Reset height to calculate proper scrollHeight
    textarea.style.height = 'auto';
    // Set to scrollHeight (content height)
    textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`;
  }

  /**
   * Check for @ mention trigger.
   */
  private checkForMention(text: string): void {
    const match = text.match(/@(\w*)$/);
    if (match) {
      this.mentionTriggered.emit(match[1]);
    }
  }

  /**
   * Check for # hashtag trigger.
   */
  private checkForHashtag(text: string): void {
    const match = text.match(/#(\w*)$/);
    if (match) {
      this.hashtagTriggered.emit(match[1]);
    }
  }

  /**
   * Public method to focus the editor.
   */
  focus(): void {
    this.textareaRef()?.nativeElement?.focus();
  }

  /**
   * Public method to insert text at cursor.
   */
  insertText(text: string): void {
    const textarea = this.textareaRef()?.nativeElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = this.content();

    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    this.content.set(newValue);
    this.contentChange.emit(newValue);

    // Move cursor to end of inserted text
    requestAnimationFrame(() => {
      const newPosition = start + text.length;
      textarea.setSelectionRange(newPosition, newPosition);
      textarea.focus();
    });
  }
}
