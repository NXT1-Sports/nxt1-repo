declare module 'mobile-drag-drop' {
  export interface MobileDragDropConfig {
    readonly dragImageTranslateOverride?: (...args: readonly unknown[]) => unknown;
    readonly holdToDrag?: number;
  }

  export function polyfill(config?: MobileDragDropConfig): void;
}

declare module 'mobile-drag-drop/scroll-behaviour' {
  export function scrollBehaviourDragImageTranslateOverride(...args: readonly unknown[]): unknown;
}
