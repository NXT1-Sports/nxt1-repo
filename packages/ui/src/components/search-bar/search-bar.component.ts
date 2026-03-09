/**
 * @fileoverview NxtSearchBarComponent - Shared Search Bar
 * @module @nxt1/ui/components/search-bar
 * @version 1.0.0
 *
 * Single source of truth for the NXT1 search bar UI across all contexts.
 * Uses native HTML `<input>` (NOT ion-searchbar) to avoid Ionic shadow DOM
 * height/padding conflicts inside toolbars.
 *
 * Variants:
 * - `mobile`           – Compact pill (40px, 320px max, solid surface bg, nxt1 brand icon)
 * - `desktop`          – Actions-area bar (glass bg, aiSearch icon, narrower)
 * - `desktop-centered` – Centered nav bar (glass bg, nxt1 brand icon, wider)
 *
 * Styling is driven by shared CSS classes from `navigation.css` scoped through
 * the `.nxt1-nav-search` host class. Mobile variant overrides are applied via
 * component-scoped CSS using `:host(.mobile)`.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <!-- Mobile (Explore page) -->
 * <nxt1-search-bar
 *   variant="mobile"
 *   placeholder="Search"
 *   [value]="searchValue()"
 *   (searchInput)="onSearch($event)"
 *   (searchSubmit)="onSubmit($event)"
 *   (searchClear)="onClear()"
 * />
 *
 * <!-- Desktop centered (Top Nav sidebar mode) -->
 * <nxt1-search-bar
 *   variant="desktop-centered"
 *   placeholder="Search anything..."
 *   [value]="searchQuery()"
 *   (searchInput)="onSearch($event)"
 *   (searchSubmit)="onSubmit($event)"
 *   (searchClear)="onClear()"
 * />
 *
 * <!-- Desktop actions area -->
 * <nxt1-search-bar
 *   variant="desktop"
 *   [value]="searchQuery()"
 *   (searchInput)="onSearch($event)"
 *   (searchSubmit)="onSubmit($event)"
 *   (searchClear)="onClear()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  ElementRef,
  viewChild,
} from '@angular/core';
import { NxtIconComponent } from '../icon';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../../agent-x/fab/agent-x-logo.constants';

/** Search bar visual variant */
export type SearchBarVariant = 'mobile' | 'desktop' | 'desktop-centered';

/** Emitted on search submit */
export interface SearchBarSubmitEvent {
  readonly query: string;
  readonly timestamp: number;
}

@Component({
  selector: 'nxt1-search-bar',
  standalone: true,
  imports: [NxtIconComponent],
  host: {
    '[class.nxt1-nav-search]': 'true',
    '[class.mobile]': "variant() === 'mobile'",
    '[class.desktop]': "variant() === 'desktop'",
    '[class.desktop-centered]': "variant() === 'desktop-centered'",
    '[class.mobile--focused]': "variant() === 'mobile' && focused()",
    '[class.mobile--expanded]': "variant() === 'mobile' && expanded()",
  },
  template: `
    <form
      class="search-form nxt1-shared-animated-glass-input relative flex items-center"
      (submit)="onSubmit($event)"
    >
      <!-- Search Icon -->
      @if (showAgentXLogo()) {
        <svg
          [class]="agentXIconClass()"
          viewBox="0 0 612 792"
          width="32"
          height="32"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="8"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path [attr.d]="agentXLogoPath" />
          <polygon [attr.points]="agentXLogoPolygon" />
        </svg>
      } @else {
        <nxt1-icon [name]="iconName()" [class]="iconClass()" [size]="iconSize()" />
      }

      <!-- Native search input (NOT ion-searchbar — avoids shadow DOM conflicts) -->
      <input
        #searchInput
        type="search"
        [class]="inputClass()"
        [placeholder]="placeholder()"
        [value]="value()"
        autocomplete="off"
        spellcheck="false"
        (input)="onInput($event)"
        (focus)="onFocus()"
        (blur)="onBlur()"
      />

      <!-- Clear / Cancel button -->
      @if (isMobileFocused()) {
        <button
          type="button"
          class="mobile-cancel"
          aria-label="Cancel search"
          (mousedown)="onCancel($event)"
        >
          Cancel
        </button>
      } @else if (value()) {
        <button type="button" [class]="clearClass()" aria-label="Clear search" (click)="onClear()">
          <nxt1-icon name="close" [size]="clearIconSize()" />
        </button>
      }
    </form>
  `,
  styles: [
    `
      /* ============================================
         SEARCH BAR — Variant-specific overrides
         Base styles come from navigation.css via .nxt1-nav-search
         ============================================ */

      :host {
        display: block;
      }

      /* Remove native browser/WebKit input box in ALL states (inactive + active) */
      :host .search-input {
        border: 0 !important;
        outline: none !important;
        box-shadow: none !important;
        background: transparent !important;
        -webkit-appearance: none !important;
        appearance: none !important;
      }

      /* Remove native browser/WebKit search focus box in all variants */
      :host .search-input:focus,
      :host .search-input:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        border: 0 !important;
      }

      :host .search-input::-webkit-search-decoration,
      :host .search-input::-webkit-search-cancel-button,
      :host .search-input::-webkit-search-results-button,
      :host .search-input::-webkit-search-results-decoration {
        -webkit-appearance: none;
        appearance: none;
      }

      /* --- MOBILE variant overrides --- */

      /* Host is always full-width so the page header layout never shifts */
      :host(.mobile) {
        width: 100%;
        --nxt1-ui-btn-height-md: 40px;
        --nxt1-ui-radius-2xl: 20px;
      }

      :host(.mobile) .search-form {
        width: clamp(162px, 44vw, 210px);
        max-width: 100%;
        margin: 0 auto;
        height: var(--nxt1-ui-btn-height-md);
        padding: 0 var(--nxt1-spacing-3, 12px);
        justify-content: center;
        gap: 0;
        background: var(--nxt1-color-surface-200, #1f1f1f);
        border: none;
        transition:
          width 0.25s var(--nxt1-ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
          max-width 0.25s var(--nxt1-ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
          margin 0.25s var(--nxt1-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
      }

      /* Focused: fill entire available width */
      :host(.mobile.mobile--focused) .search-form,
      :host(.mobile.mobile--expanded) .search-form {
        width: 100%;
        max-width: 100%;
        margin: 0;
        justify-content: flex-start;
      }

      /* Input: natural width so icon + placeholder stay together as a centered unit */
      :host(.mobile) .search-input {
        min-width: 0;
        flex: 0 1 auto;
        width: 8ch;
        font-size: var(--nxt1-fontSize-sm, 0.9375rem);
        text-align: left;
        padding: 0;
        letter-spacing: var(--nxt1-letterSpacing-tight, 0.01em);
        -webkit-appearance: none;
        appearance: none;
      }

      /* Focused: expand input to fill available space */
      :host(.mobile.mobile--focused) .search-input,
      :host(.mobile.mobile--expanded) .search-input {
        flex: 1 1 auto;
        width: auto;
        text-align: left;
      }

      :host(.mobile) .search-input:focus {
        outline: none !important;
        box-shadow: none !important;
        border: 0 !important;
      }

      :host(.mobile) .search-input:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        border: 0 !important;
      }

      :host(.mobile) .search-input::-webkit-search-decoration,
      :host(.mobile) .search-input::-webkit-search-cancel-button,
      :host(.mobile) .search-input::-webkit-search-results-button,
      :host(.mobile) .search-input::-webkit-search-results-decoration {
        -webkit-appearance: none;
        appearance: none;
      }

      :host(.mobile) .search-icon {
        position: static !important;
        left: auto !important;
        transform: none !important;
        margin: 0;
        flex-shrink: 0;
      }

      /* Cancel button (shown on focus) */
      .mobile-cancel {
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        padding: 0 var(--nxt1-spacing-1, 4px);
        cursor: pointer;
        white-space: nowrap;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSearchBarComponent {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  // ─── Inputs ───────────────────────────────────────────────
  /** Visual variant */
  readonly variant = input<SearchBarVariant>('mobile');

  /** Force mobile variant to stay fully expanded (full-width input) */
  readonly expanded = input(false);

  /** Placeholder text */
  readonly placeholder = input('Search');

  /** Current search value (two-way via value + searchInput) */
  readonly value = input('');

  // ─── Outputs ──────────────────────────────────────────────
  /** Fires on every keystroke with the current input value */
  readonly searchInput = output<string>();

  /** Fires on form submit (Enter key) */
  readonly searchSubmit = output<SearchBarSubmitEvent>();

  /** Fires when user clicks the clear button */
  readonly searchClear = output<void>();

  /** Fires on input focus */
  readonly searchFocus = output<void>();

  /** Fires on input blur */
  readonly searchBlur = output<void>();

  /** Fires when mobile cancel is tapped */
  readonly searchCancel = output<void>();

  /** Whether the mobile variant is currently focused (drives expand animation) */
  readonly focused = input(false);

  /** Reference to native input for programmatic focus */
  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Internal focused state for mobile (tracks actual input focus) */
  protected readonly isMobileFocused = computed(
    () => this.variant() === 'mobile' && this.focused()
  );

  // ─── Computed helpers ─────────────────────────────────────
  /** Determine which icon to show based on variant */
  protected readonly iconName = computed(() => {
    const v = this.variant();
    return v === 'desktop' ? 'aiSearch' : 'nxt1';
  });

  /** Use Agent X logo SVG for AI-centric search variants */
  protected readonly showAgentXLogo = computed(() => {
    const v = this.variant();
    return v === 'desktop-centered' || v === 'mobile';
  });

  /** Agent X logo classes per variant */
  protected readonly agentXIconClass = computed(() => {
    const v = this.variant();
    if (v === 'mobile') {
      return 'search-icon search-icon--brand pointer-events-none shrink-0';
    }
    return 'search-icon search-icon--brand pointer-events-none absolute left-3';
  });

  /** Icon CSS classes */
  protected readonly iconClass = computed(() => {
    const v = this.variant();
    if (v === 'mobile') {
      return 'search-icon search-icon--brand pointer-events-none shrink-0';
    }
    const base = 'search-icon pointer-events-none absolute';
    if (v === 'desktop') {
      return `${base} search-icon--ai left-3`;
    }
    // desktop-centered uses brand icon
    return `${base} search-icon--brand left-3`;
  });

  /** Icon size per variant */
  protected readonly iconSize = computed(() => {
    const v = this.variant();
    if (v === 'desktop-centered') return '20';
    return '18';
  });

  /** Input CSS classes */
  protected readonly inputClass = computed(() => {
    const v = this.variant();
    const base = 'search-input';
    return v === 'desktop' ? base : `${base} search-input--centered`;
  });

  /** Clear button CSS classes */
  protected readonly clearClass = computed(() => {
    const v = this.variant();
    const base = 'search-clear absolute flex items-center justify-center rounded-full p-0';
    if (v === 'desktop-centered') {
      return `${base} right-3 h-7 w-7`;
    }
    return `${base} right-2 h-6 w-6`;
  });

  /** Clear icon size */
  protected readonly clearIconSize = computed(() => {
    return this.variant() === 'desktop-centered' ? '18' : '16';
  });

  // ─── Event handlers ───────────────────────────────────────
  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchInput.emit(input.value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const query = this.value().trim();
    if (query) {
      this.searchSubmit.emit({ query, timestamp: Date.now() });
    }
  }

  protected onClear(): void {
    this.searchClear.emit();
  }

  protected onFocus(): void {
    this.searchFocus.emit();
  }

  protected onBlur(): void {
    this.searchBlur.emit();
  }

  /** Cancel search on mobile — blur the input first, then fire cancel */
  protected onCancel(event: Event): void {
    event.preventDefault(); // Prevent default mousedown behavior
    // Blur the input to dismiss keyboard and remove focus
    this.inputRef()?.nativeElement.blur();
    this.searchCancel.emit();
  }
}
