import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentXInputBarComponent } from './agent-x-input-bar.component';
import { ElementRef } from '@angular/core';

describe('AgentXInputBarComponent', () => {
  let fixture: ComponentFixture<AgentXInputBarComponent>;
  let component: AgentXInputBarComponent;
  let rafQueue: FrameRequestCallback[];
  let originalInnerHeight: PropertyDescriptor | undefined;
  let originalInnerWidth: PropertyDescriptor | undefined;
  let originalVisualViewport: PropertyDescriptor | undefined;

  beforeEach(async () => {
    rafQueue = [];
    originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      rafQueue[handle - 1] = () => 0;
    });

    await TestBed.configureTestingModule({
      imports: [AgentXInputBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentXInputBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushAnimationFrames();
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }

    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    }

    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewport);
    }
  });

  it('opens the effort menu downward when there is more space below the trigger', () => {
    setViewportSize({ width: 390, height: 640 });

    const layout = measureMenuLayout(component, {
      pickerRect: createRect({ left: 16, top: 72, width: 100, height: 36 }),
      triggerRect: createRect({ left: 16, top: 72, width: 100, height: 36 }),
      menuRect: createRect({ left: 16, top: 118, width: 236, height: 162 }),
      scrollHeight: 162,
    });

    expect(layout.placement).toBe('below');
    expect(layout.maxHeight).toBe(510);
    expect(layout.offsetX).toBe(0);
  });

  it('limits the effort menu height instead of letting it overflow above the viewport', () => {
    setViewportSize({ width: 390, height: 640 });

    const layout = measureMenuLayout(component, {
      pickerRect: createRect({ left: 16, top: 560, width: 100, height: 36 }),
      triggerRect: createRect({ left: 16, top: 560, width: 100, height: 36 }),
      menuRect: createRect({ left: 16, top: 388, width: 236, height: 280 }),
      scrollHeight: 620,
    });

    expect(layout.placement).toBe('above');
    expect(layout.maxHeight).toBe(538);
  });

  it('keeps the menu inside a narrow viewport by shifting it horizontally', () => {
    setViewportSize({ width: 220, height: 640 });

    const layout = measureMenuLayout(component, {
      pickerRect: createRect({ left: 120, top: 420, width: 100, height: 36 }),
      triggerRect: createRect({ left: 120, top: 420, width: 100, height: 36 }),
      menuRect: createRect({ left: 120, top: 248, width: 180, height: 162 }),
      scrollHeight: 162,
    });

    expect(layout.offsetX).toBe(-92);
  });

  function flushAnimationFrames(): void {
    while (rafQueue.length > 0) {
      const callbacks = [...rafQueue];
      rafQueue = [];
      callbacks.forEach((callback) => callback(0));
    }
  }

  function setViewportSize({ width, height }: { width: number; height: number }): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        width,
        height,
        offsetLeft: 0,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  }
});

function createRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function measureMenuLayout(
  component: AgentXInputBarComponent,
  {
    pickerRect,
    triggerRect,
    menuRect,
    scrollHeight,
  }: {
    pickerRect: DOMRect;
    triggerRect: DOMRect;
    menuRect: DOMRect;
    scrollHeight: number;
  }
): { placement: 'above' | 'below'; offsetX: number; maxHeight: number | null } {
  const pickerElement = createMeasuredElement(pickerRect, 0);
  const triggerElement = createMeasuredElement(triggerRect, 0);
  const menuElement = createMeasuredElement(menuRect, scrollHeight);

  return (
    component as unknown as {
      measureMenuLayout: (
        pickerRef: ElementRef<HTMLElement>,
        triggerRef: ElementRef<HTMLElement>,
        menuRef: ElementRef<HTMLElement>
      ) => { placement: 'above' | 'below'; offsetX: number; maxHeight: number | null };
    }
  ).measureMenuLayout(
    new ElementRef(pickerElement),
    new ElementRef(triggerElement),
    new ElementRef(menuElement)
  );
}

function createMeasuredElement(rect: DOMRect, scrollHeight: number): HTMLElement {
  return {
    style: {
      left: '',
      maxHeight: '',
    },
    scrollHeight,
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}
