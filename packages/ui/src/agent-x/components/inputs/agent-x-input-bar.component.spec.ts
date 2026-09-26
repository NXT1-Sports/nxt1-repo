import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentXInputBarComponent } from './agent-x-input-bar.component';
import { ElementRef, signal } from '@angular/core';
import type { AgentXSelectedContext } from '@nxt1/core/ai';
import { AgentXVoiceInputService } from '../../services/voice/agent-x-voice-input.service';

interface TestSignal<T> {
  set(value: T): void;
}

interface VoiceServiceMock {
  readonly available: TestSignal<boolean> & (() => boolean);
  readonly listening: TestSignal<boolean> & (() => boolean);
  readonly levels: TestSignal<readonly number[]> & (() => readonly number[]);
  readonly composedPrompt: TestSignal<string> & (() => string);
  readonly initialize: ReturnType<typeof vi.fn>;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

function createVoiceServiceMock(): VoiceServiceMock {
  return {
    available: signal(false),
    listening: signal(false),
    levels: signal([0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12]),
    composedPrompt: signal(''),
    initialize: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('AgentXInputBarComponent', () => {
  let fixture: ComponentFixture<AgentXInputBarComponent>;
  let component: AgentXInputBarComponent;
  let voiceService: VoiceServiceMock;
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

    voiceService = createVoiceServiceMock();

    await TestBed.configureTestingModule({
      imports: [AgentXInputBarComponent],
      providers: [{ provide: AgentXVoiceInputService, useValue: voiceService }],
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

  it('falls back to a Cloudflare poster when the selected context thumbnail fails', () => {
    const context: AgentXSelectedContext = {
      id: 'film-play:review-1:play-1',
      kind: 'film_play',
      title: 'Play 1',
      media: {
        videoUrl: 'https://cdn.example.com/source-1.mp4',
        thumbnailUrl: 'https://cdn.example.com/source-1.jpg',
        cloudflareVideoId: 'source-1-cf',
      },
    };

    expect(getContextPreviewUrl(component, context)).toBe('https://cdn.example.com/source-1.jpg');

    markContextPreviewFailed(component, context, 'https://cdn.example.com/source-1.jpg');

    expect(getContextPreviewUrl(component, context)).toBe(
      'https://videodelivery.net/source-1-cf/thumbnails/thumbnail.jpg'
    );
  });

  it('drops to the video fallback when every image candidate fails', () => {
    const context: AgentXSelectedContext = {
      id: 'film-play:review-1:play-1',
      kind: 'film_play',
      title: 'Play 1',
      media: {
        videoUrl: 'https://cdn.example.com/source-1.mp4',
        thumbnailUrl: 'https://cdn.example.com/source-1.jpg',
        cloudflareVideoId: 'source-1-cf',
      },
    };

    markContextPreviewFailed(component, context, 'https://cdn.example.com/source-1.jpg');
    markContextPreviewFailed(
      component,
      context,
      'https://videodelivery.net/source-1-cf/thumbnails/thumbnail.jpg'
    );

    expect(getContextPreviewUrl(component, context)).toBeNull();
    expect(getContextVideoUrl(component, context)).toBe('https://cdn.example.com/source-1.mp4');
  });

  it('fills the prompt with voice dictation from the input bar button', () => {
    const emittedMessages: string[] = [];
    const subscription = component.messageChange.subscribe((message) => {
      emittedMessages.push(message);
    });

    try {
      setVoiceInputAvailable(voiceService, true);
      fixture.detectChanges();

      const voiceButton = fixture.nativeElement.querySelector(
        'button[aria-label="Start voice input"]'
      ) as HTMLButtonElement | null;
      expect(voiceButton).not.toBeNull();

      voiceButton?.click();
      fixture.detectChanges();

      expect(voiceService.start).toHaveBeenCalledWith({ basePrompt: '' });

      voiceService.composedPrompt.set('for varsity receivers');
      fixture.detectChanges();

      expect(emittedMessages).toEqual(['for varsity receivers']);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('shows only the voice button while the idle composer has no sendable text', () => {
    setVoiceInputAvailable(voiceService, true);
    fixture.detectChanges();

    const voiceButton = fixture.nativeElement.querySelector(
      'button[aria-label="Start voice input"]'
    ) as HTMLButtonElement | null;
    const sendButton = fixture.nativeElement.querySelector(
      'button[aria-label="Send"]'
    ) as HTMLButtonElement | null;

    expect(voiceButton).not.toBeNull();
    expect(sendButton).toBeNull();
  });

  it('renders the voice waveform bars only while actively listening', () => {
    setVoiceInputAvailable(voiceService, true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-voice-wave')).toBeNull();

    setVoiceInputListening(voiceService, true);
    fixture.detectChanges();

    const bars = fixture.nativeElement.querySelectorAll('.input-voice-wave__bar');
    expect(bars.length).toBe(7);

    setVoiceInputListening(voiceService, false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.input-voice-wave')).toBeNull();
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

function getContextPreviewUrl(
  component: AgentXInputBarComponent,
  context: AgentXSelectedContext
): string | null {
  return (
    component as unknown as {
      contextPreviewUrl: (context: AgentXSelectedContext) => string | null;
    }
  ).contextPreviewUrl(context);
}

function getContextVideoUrl(
  component: AgentXInputBarComponent,
  context: AgentXSelectedContext
): string | null {
  return (
    component as unknown as {
      contextVideoUrl: (context: AgentXSelectedContext) => string | null;
    }
  ).contextVideoUrl(context);
}

function setVoiceInputAvailable(service: VoiceServiceMock, available: boolean): void {
  service.available.set(available);
}

function setVoiceInputListening(service: VoiceServiceMock, listening: boolean): void {
  service.listening.set(listening);
}

function markContextPreviewFailed(
  component: AgentXInputBarComponent,
  context: AgentXSelectedContext,
  previewUrl: string
): void {
  (
    component as unknown as {
      onContextPreviewError: (context: AgentXSelectedContext, previewUrl: string) => void;
    }
  ).onContextPreviewError(context, previewUrl);
}
