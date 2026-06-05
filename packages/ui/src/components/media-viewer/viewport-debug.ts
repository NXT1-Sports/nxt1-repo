export function dumpViewportState(source: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = document.documentElement;
  const body = document.body;
  const visualViewport = window.visualViewport;
  const htmlStyles = window.getComputedStyle(html);
  const overlayHost = document.querySelector<HTMLElement>('nxt1-overlay');
  const overlayPanel = document.querySelector<HTMLElement>('.nxt1-overlay-panel');
  const overlayContent = document.querySelector<HTMLElement>('.nxt1-overlay-content');

  const rect = (element: HTMLElement | null) => {
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    return {
      clientHeight: element.clientHeight,
      offsetHeight: element.offsetHeight,
      scrollHeight: element.scrollHeight,
      rectHeight: bounds.height,
      inlineHeight: element.style.height,
      computedHeight: window.getComputedStyle(element).height,
    };
  };

  console.log(`[viewport-debug] ${source}`, {
    viewport: {
      windowInnerHeight: window.innerHeight,
      windowOuterHeight: window.outerHeight,
      documentElementClientHeight: html.clientHeight,
      bodyClientHeight: body.clientHeight,
      visualViewportHeight: visualViewport?.height,
      visualViewportOffsetTop: visualViewport?.offsetTop,
    },
    styles: {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyHeight: body.style.height,
      htmlHeight: html.style.height,
    },
    overlay: {
      host: rect(overlayHost),
      panel: rect(overlayPanel),
      content: rect(overlayContent),
    },
    safeAreaCssVars: {
      '--nxt1-safe-area-top': htmlStyles.getPropertyValue('--nxt1-safe-area-top').trim(),
      '--nxt1-safe-area-bottom': htmlStyles.getPropertyValue('--nxt1-safe-area-bottom').trim(),
      '--nxt1-safe-area-left': htmlStyles.getPropertyValue('--nxt1-safe-area-left').trim(),
      '--nxt1-safe-area-right': htmlStyles.getPropertyValue('--nxt1-safe-area-right').trim(),
      '--ion-safe-area-top': htmlStyles.getPropertyValue('--ion-safe-area-top').trim(),
      '--ion-safe-area-bottom': htmlStyles.getPropertyValue('--ion-safe-area-bottom').trim(),
      '--safe-area-top': htmlStyles.getPropertyValue('--safe-area-top').trim(),
      '--safe-area-bottom': htmlStyles.getPropertyValue('--safe-area-bottom').trim(),
    },
  });
}
