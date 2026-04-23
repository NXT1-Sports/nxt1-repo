import { isPlatformBrowser } from '@angular/common';
import type { PluginListenerHandle } from '@capacitor/core';

export interface AgentXKeyboardOffsetBinding {
  teardown(): void;
}

export interface BindAgentXKeyboardOffsetOptions {
  readonly platformId: object;
  readonly hostElement: HTMLElement;
  readonly offsetCssVar: string;
  readonly safeAreaCssVar?: string;
  readonly keyboardOffsetTrimPx?: number;
}

/**
 * Binds Capacitor keyboard show/hide events to host CSS variables used by
 * floating input footers. This keeps shell and operation chat behavior identical.
 */
export async function bindAgentXKeyboardOffset(
  options: BindAgentXKeyboardOffsetOptions
): Promise<AgentXKeyboardOffsetBinding> {
  const trim = options.keyboardOffsetTrimPx ?? 10;
  const teardownNoop = (): void => {
    options.hostElement.style.setProperty(options.offsetCssVar, '0px');
    if (options.safeAreaCssVar) {
      options.hostElement.style.removeProperty(options.safeAreaCssVar);
    }
  };

  if (!isPlatformBrowser(options.platformId)) {
    return { teardown: teardownNoop };
  }

  try {
    const { Keyboard } = await import('@capacitor/keyboard');

    const showListener: PluginListenerHandle = await Keyboard.addListener(
      'keyboardWillShow',
      (info) => {
        const offset = Math.max(0, info.keyboardHeight - trim);
        options.hostElement.style.setProperty(options.offsetCssVar, `${offset}px`);
        if (options.safeAreaCssVar) {
          options.hostElement.style.setProperty(options.safeAreaCssVar, '0px');
        }
      }
    );

    const hideListener: PluginListenerHandle = await Keyboard.addListener(
      'keyboardWillHide',
      () => {
        options.hostElement.style.setProperty(options.offsetCssVar, '0px');
        if (options.safeAreaCssVar) {
          options.hostElement.style.removeProperty(options.safeAreaCssVar);
        }
      }
    );

    return {
      teardown: (): void => {
        void showListener.remove();
        void hideListener.remove();
        teardownNoop();
      },
    };
  } catch {
    return { teardown: teardownNoop };
  }
}
