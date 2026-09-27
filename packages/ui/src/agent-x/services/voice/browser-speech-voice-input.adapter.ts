import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  calculateVoiceWaveLevel,
  createIdleVoiceLevels,
  joinVoicePromptParts,
  type AgentXVoiceInputAdapter,
  type AgentXVoiceInputStartOptions,
} from './agent-x-voice-input.types';

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
}

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionResultEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
}

@Injectable({ providedIn: 'root' })
export class BrowserSpeechVoiceInputAdapter implements AgentXVoiceInputAdapter {
  private readonly platformId = inject(PLATFORM_ID);

  private recognition: SpeechRecognitionLike | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private waveSampleData: Uint8Array<ArrayBuffer> | null = null;
  private waveHistory = createIdleVoiceLevels();
  private waveFrameId: number | null = null;

  readonly available = signal(false);
  readonly listening = signal(false);
  readonly levels = signal<readonly number[]>(createIdleVoiceLevels());
  readonly partialTranscript = signal('');
  readonly finalTranscript = signal('');

  initialize(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.available.set(false);
      return;
    }

    this.available.set(this.resolveSpeechRecognitionConstructor() !== null);
  }

  start(options: AgentXVoiceInputStartOptions = {}): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const SpeechRecognitionCtor = this.resolveSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      this.available.set(false);
      return;
    }

    this.stop({ abort: true });

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = options.language ?? this.resolveSpeechRecognitionLanguage();

    this.recognition = recognition;
    this.partialTranscript.set('');
    this.finalTranscript.set('');
    this.listening.set(true);

    recognition.onresult = (event) => this.handleRecognitionResult(event);
    recognition.onerror = () => this.handleRecognitionFinished();
    recognition.onend = () => this.handleRecognitionFinished();

    try {
      recognition.start();
      void this.startWaveform();
    } catch {
      this.handleRecognitionFinished();
    }
  }

  stop(options: { readonly abort?: boolean } = {}): void {
    this.stopWaveform();

    const recognition = this.recognition;
    this.recognition = null;
    this.listening.set(false);

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      if (options.abort) {
        recognition.abort();
      } else {
        recognition.stop();
      }
    } catch {
      // Browser speech engines can throw when already inactive.
    }
  }

  destroy(): void {
    this.stop({ abort: true });
  }

  private handleRecognitionResult(event: SpeechRecognitionResultEventLike): void {
    let interimTranscript = '';
    let finalTranscript = this.finalTranscript();

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim() ?? '';
      if (!transcript) {
        continue;
      }

      if (result?.isFinal) {
        finalTranscript = joinVoicePromptParts(finalTranscript, transcript);
      } else {
        interimTranscript = joinVoicePromptParts(interimTranscript, transcript);
      }
    }

    this.finalTranscript.set(finalTranscript);
    this.partialTranscript.set(interimTranscript);
  }

  private handleRecognitionFinished(): void {
    this.listening.set(false);
    this.recognition = null;
    this.stopWaveform();
  }

  private resolveSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    const win = globalThis.window as
      | (Window & {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        })
      | undefined;

    return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null;
  }

  private resolveSpeechRecognitionLanguage(): string {
    const navigatorLanguage = globalThis.navigator?.language?.trim();
    return navigatorLanguage || 'en-US';
  }

  private resolveAudioContextConstructor(): typeof AudioContext | null {
    const win = globalThis.window as
      | (Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      | undefined;

    return win?.AudioContext ?? win?.webkitAudioContext ?? null;
  }

  private async startWaveform(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const mediaDevices = globalThis.navigator?.mediaDevices;
    const AudioContextCtor = this.resolveAudioContextConstructor();
    if (!mediaDevices?.getUserMedia || !AudioContextCtor) {
      return;
    }

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }

    if (!this.listening()) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      this.audioContext = audioContext;
      this.analyser = analyser;
      this.mediaStreamSource = source;
      this.mediaStream = stream;
      this.waveSampleData = new Uint8Array(analyser.fftSize);
      this.waveHistory = createIdleVoiceLevels();

      this.scheduleWaveFrame();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  private scheduleWaveFrame(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }

    this.waveFrameId = requestAnimationFrame(() => this.readWaveFrame());
  }

  private readWaveFrame(): void {
    const analyser = this.analyser;
    const data = this.waveSampleData;

    if (!analyser || !data || !this.listening()) {
      return;
    }

    analyser.getByteTimeDomainData(data);
    const currentLevel = calculateVoiceWaveLevel(data);
    this.waveHistory = [...this.waveHistory.slice(1), currentLevel];
    this.levels.set(this.waveHistory);
    this.scheduleWaveFrame();
  }

  private stopWaveform(): void {
    if (this.waveFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.waveFrameId);
    }
    this.waveFrameId = null;

    this.mediaStreamSource?.disconnect();
    this.mediaStreamSource = null;
    this.analyser = null;
    this.waveSampleData = null;
    this.waveHistory = createIdleVoiceLevels();

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;

    this.levels.set(createIdleVoiceLevels());
  }
}
