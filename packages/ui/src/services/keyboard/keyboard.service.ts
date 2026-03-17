import { Injectable, signal } from '@angular/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

/**
 * Type definition for ion-content element with its methods
 */
interface HTMLIonContentElement extends HTMLElement {
  getScrollElement?: () => Promise<HTMLElement>;
}

/**
 * KeyboardService - Handle keyboard behavior cho Capacitor apps (iOS/Android)
 *
 * Features:
 * - Auto resize viewport when keyboard shows/hides
 * - Scroll input into view on iOS
 * - Configure keyboard appearance and behavior
 * - Expose keyboard height as reactive signal
 *
 * Usage in component:
 * ```typescript
 * constructor(private keyboardService: KeyboardService) {}
 *
 * ngOnInit() {
 *   this.keyboardService.initialize();
 * }
 *
 * // Use keyboard height in effect
 * effect(() => {
 *   const height = this.keyboardService.keyboardHeight();
 *   // Update UI based on keyboard height
 * });
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class KeyboardService {
  private isNative = Capacitor.isNativePlatform();
  private listeners: (() => void)[] = [];
  private lastHandledInput: HTMLElement | null = null;
  private lastHandledAt = 0;

  /**
   * Reactive keyboard height signal (in pixels)
   * Updates automatically when keyboard shows/hides
   */
  private _keyboardHeight = signal<number>(0);
  public keyboardHeight = this._keyboardHeight.asReadonly();

  /**
   * Initialize keyboard configuration for iOS/Android
   * Should be called in AppComponent or pages with form inputs
   */
  async initialize(): Promise<void> {
    if (!this.isNative) {
      console.debug('[KeyboardService] Not on native platform, skipping');
      return;
    }

    try {
      // Configure keyboard resize mode
      await Keyboard.setResizeMode({ mode: KeyboardResize.Ionic });

      // Enable auto-scroll when input is focused
      await Keyboard.setScroll({ isDisabled: false });

      // Listen to keyboard events
      await this.setupListeners();
    } catch (error) {
      console.error('[KeyboardService] Failed to configure keyboard:', error);
    }
  }

  /**
   * Setup event listeners for keyboard show/hide
   */
  private async setupListeners(): Promise<void> {
    // Keyboard will show event
    const showListener = await Keyboard.addListener('keyboardWillShow', async (info) => {
      try {
        const height = info?.keyboardHeight ?? 0;

        // Update signal for reactive components
        this._keyboardHeight.set(height);

        const focused = document.activeElement as HTMLElement | null;
        document.documentElement.style.setProperty('--keyboard-offset', `${height}px`);

        let ionContent = focused?.closest('ion-content') as HTMLIonContentElement | null;
        if (!ionContent) {
          ionContent = document.querySelector('ion-content') as HTMLIonContentElement | null;
        }

        // Prefer applying padding to the actual scrollable element inside ion-content
        if (ionContent && typeof ionContent.getScrollElement === 'function') {
          try {
            const scrollEl: HTMLElement | null = await ionContent.getScrollElement();
            if (scrollEl) {
              scrollEl.style.setProperty('--keyboard-offset', `${height}px`);
              scrollEl.style.paddingBottom = `${height}px`;
              return;
            }
          } catch (inner) {
            console.debug('[KeyboardService] getScrollElement() failed', inner);
          }
        }

        if (ionContent) {
          (ionContent as HTMLElement).style.setProperty('--keyboard-offset', `${height}px`);
          (ionContent as HTMLElement).style.paddingBottom = `${height}px`;
          return;
        }

        document.body.style.paddingBottom = `${height}px`;
      } catch (e) {
        console.debug('[KeyboardService] Failed to apply keyboard padding', e);
      }
    });

    const didShowListener = await Keyboard.addListener('keyboardDidShow', (_) => {
      this.scrollActiveInputIntoView();
    });

    const hideListener = await Keyboard.addListener('keyboardWillHide', async () => {
      try {
        // Reset signal to 0
        this._keyboardHeight.set(0);

        document.documentElement.style.removeProperty('--keyboard-offset');

        const ionContents = Array.from(
          document.querySelectorAll('ion-content')
        ) as HTMLIonContentElement[];
        for (const ic of ionContents) {
          try {
            if (typeof ic.getScrollElement === 'function') {
              const scrollEl: HTMLElement | null = await ic.getScrollElement();
              if (scrollEl) {
                scrollEl.style.removeProperty('--keyboard-offset');
                scrollEl.style.removeProperty('padding-bottom');
              }
            }
          } catch (inner) {
            console.debug('[KeyboardService] Failed to clean scrollEl for ion-content', inner);
          }

          try {
            (ic as HTMLElement).style.removeProperty('--keyboard-offset');
            (ic as HTMLElement).style.removeProperty('padding-bottom');
          } catch {
            console.log('Error');
          }
        }

        document.body.style.removeProperty('padding-bottom');
      } catch (e) {
        console.debug('[KeyboardService] Failed to remove keyboard padding', e);
      }
    });

    this.listeners.push(
      () => showListener.remove(),
      () => didShowListener.remove(),
      () => hideListener.remove()
    );
  }

  /**
   * Scroll the focused input into view
   * Especially useful on iOS when the keyboard covers the input
   */
  private async scrollActiveInputIntoView(): Promise<void> {
    // small delay to wait for keyboard animation / viewport resize
    // increase delay for iOS keyboard animations
    await new Promise((res) => setTimeout(res, 500));

    // Try to get the focused native input element, handling ion-input shadow DOM
    const activeElement = document.activeElement as HTMLElement | null;
    const findNativeInput = (
      el: HTMLElement | null
    ): HTMLInputElement | HTMLTextAreaElement | null => {
      if (!el) return null;
      // If the active element is a native input/textarea
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return el as HTMLInputElement | HTMLTextAreaElement;
      }

      // If it's an ion-input or similar, try shadowRoot
      try {
        const root = (el as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
        if (root) {
          const native = root.querySelector('input, textarea') as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null;
          if (native) return native;
        }
      } catch {
        // Ignore cross-origin shadow root errors
      }

      // Try to find descendant input elements (for wrappers)
      const desc =
        el.querySelector &&
        (el.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);
      if (desc) return desc;

      return null;
    };

    let nativeInput = findNativeInput(activeElement);

    // If activeElement is not the input, try to locate any focused input in document
    if (!nativeInput) {
      nativeInput = document.querySelector('input:focus, textarea:focus') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    }

    if (!nativeInput) {
      console.debug('[KeyboardService] No focused native input found');
      return;
    }

    let ionContentEl = nativeInput.closest('ion-content') as HTMLIonContentElement | null;
    if (!ionContentEl) {
      ionContentEl = document.querySelector('ion-content') as HTMLIonContentElement | null;
    }

    if (ionContentEl) {
      try {
        const scrollEl: HTMLElement | null =
          typeof ionContentEl.getScrollElement === 'function'
            ? await ionContentEl.getScrollElement()
            : (ionContentEl as HTMLElement);

        if (scrollEl) {
          const inputRect = nativeInput.getBoundingClientRect();
          const scrollRect = scrollEl.getBoundingClientRect();

          const currentScrollTop = (scrollEl.scrollTop as number) || 0;
          const offsetInScroll = inputRect.top - scrollRect.top + currentScrollTop;

          // Respect any padding-bottom applied for the keyboard
          const paddingBottomRaw = getComputedStyle(scrollEl).paddingBottom || '0px';
          const paddingBottom = parseFloat(paddingBottomRaw) || 0;

          // Visible area inside scrollEl (excluding keyboard padding)
          const visibleArea = Math.max(0, scrollRect.height - paddingBottom);

          // Compute where the input bottom should sit so it's visible above the keyboard
          const inputBottomInScroll = offsetInScroll + inputRect.height;
          const margin = 16; // visual breathing room above keyboard
          const visibleBottom = currentScrollTop + visibleArea;

          // If the input bottom is already above the visible bottom (with margin), skip scrolling
          if (inputBottomInScroll <= visibleBottom - margin) {
            this.lastHandledInput = nativeInput;
            this.lastHandledAt = Date.now();
            return;
          }

          const targetScroll = Math.max(0, inputBottomInScroll - visibleArea + margin);

          const timeSince = Date.now() - this.lastHandledAt;
          const smallDelta = Math.abs((scrollEl.scrollTop || 0) - targetScroll) <= 4;
          if (this.lastHandledInput === nativeInput && timeSince < 1500 && smallDelta) {
            return;
          }

          const scrollElWithIonic = scrollEl as HTMLElement & {
            scrollToPoint?: (x: number, y: number, duration: number) => void;
          };
          if (typeof scrollElWithIonic.scrollToPoint === 'function') {
            scrollElWithIonic.scrollToPoint(0, targetScroll, 300);
            setTimeout(() => {
              try {
                if (Math.abs((scrollEl.scrollTop as number) - targetScroll) > 4) {
                  scrollEl.scrollTop = targetScroll;
                }
              } catch {
                // Ignore - scrollTop may be read-only in some contexts
              }
            }, 350);
            this.lastHandledInput = nativeInput;
            this.lastHandledAt = Date.now();
            return;
          }

          scrollEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
          setTimeout(() => {
            try {
              if (Math.abs((scrollEl.scrollTop as number) - targetScroll) > 4) {
                scrollEl.scrollTop = targetScroll;
              }
            } catch {
              // Ignore - scrollTop may be read-only in some contexts
            }
          }, 350);
          this.lastHandledInput = nativeInput;
          this.lastHandledAt = Date.now();
          return;
        }
      } catch (e) {
        console.debug('[KeyboardService] ion-content scroll attempt failed, falling back', e);
      }
    }

    // Final fallback: native scrollIntoView
    try {
      nativeInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (e) {
      console.debug('[KeyboardService] scrollIntoView failed', e);
    }
  }

  /**
   * Show keyboard programmatically (if hidden)
   */
  async show(): Promise<void> {
    if (!this.isNative) return;
    try {
      await Keyboard.show();
    } catch (error) {
      console.error('[KeyboardService] Failed to show keyboard:', error);
    }
  }

  /**
   * Hide keyboard programmatically
   */
  async hide(): Promise<void> {
    if (!this.isNative) return;
    try {
      await Keyboard.hide();
    } catch (error) {
      console.error('[KeyboardService] Failed to hide keyboard:', error);
    }
  }

  /**
   * Cleanup listeners (gọi khi app terminate hoặc service destroy)
   */
  cleanup(): void {
    this.listeners.forEach((remove) => remove());
    this.listeners = [];
  }
}
