import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from '../agent-x-job.service';
import {
  calculateVoiceWaveLevel,
  createIdleVoiceLevels,
  type AgentXVoiceInputAdapter,
  type AgentXVoiceInputStartOptions,
} from './agent-x-voice-input.types';

const BACKEND_VOICE_MAX_RECORDING_MS = 30_000;

type MediaRecorderConstructor = typeof MediaRecorder;

interface VoiceTranscriptionResponse {
  readonly success: boolean;
  readonly data?: { readonly text?: string };
  readonly error?: string;
}

@Injectable({ providedIn: 'root' })
export class BackendVoiceTranscriptionAdapter implements AgentXVoiceInputAdapter {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL, { optional: true });
  private readonly authTokenFactory = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordingMimeType = 'audio/webm';
  private recordingTimeoutId: ReturnType<typeof setTimeout> | null = null;
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
    if (!isPlatformBrowser(this.platformId) || !this.baseUrl) {
      this.available.set(false);
      return;
    }

    const mediaRecorder = this.resolveMediaRecorderConstructor();
    this.available.set(!!globalThis.navigator?.mediaDevices?.getUserMedia && !!mediaRecorder);
  }

  async start(_options: AgentXVoiceInputStartOptions = {}): Promise<void> {
    if (!this.available()) {
      return;
    }

    this.stop({ abort: true });
    this.chunks = [];
    this.partialTranscript.set('');
    this.finalTranscript.set('');

    let stream: MediaStream;
    try {
      stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.listening.set(false);
      return;
    }

    const MediaRecorderCtor = this.resolveMediaRecorderConstructor();
    if (!MediaRecorderCtor) {
      stream.getTracks().forEach((track) => track.stop());
      this.available.set(false);
      return;
    }

    this.recordingMimeType = this.resolveRecordingMimeType(MediaRecorderCtor);
    const recorder = new MediaRecorderCtor(stream, { mimeType: this.recordingMimeType });
    this.recorder = recorder;
    this.mediaStream = stream;
    this.listening.set(true);
    this.startWaveform(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const chunks = [...this.chunks];
      const mimeType = this.recordingMimeType;
      this.cleanupRecording();
      if (chunks.length > 0) {
        void this.transcribe(chunks, mimeType);
      }
    };
    recorder.onerror = () => {
      this.cleanupRecording();
    };

    recorder.start();
    this.recordingTimeoutId = setTimeout(() => this.stop(), BACKEND_VOICE_MAX_RECORDING_MS);
  }

  stop(options: { readonly abort?: boolean } = {}): void {
    if (this.recordingTimeoutId) {
      clearTimeout(this.recordingTimeoutId);
      this.recordingTimeoutId = null;
    }

    const recorder = this.recorder;
    if (!recorder) {
      this.cleanupRecording();
      return;
    }

    if (options.abort) {
      recorder.onstop = null;
      this.cleanupRecording();
      return;
    }

    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {
      this.cleanupRecording();
    }
  }

  destroy(): void {
    this.stop({ abort: true });
  }

  private async transcribe(chunks: Blob[], mimeType: string): Promise<void> {
    if (!this.baseUrl) return;

    const blob = new Blob(chunks, { type: mimeType });
    const formData = new FormData();
    formData.set('audio', blob, this.resolveFileName(mimeType));

    const token = await this.authTokenFactory?.();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/agent-x/voice/transcribe`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const payload = (await response.json()) as VoiceTranscriptionResponse;
      const text = payload.success ? payload.data?.text?.trim() : '';
      if (text) {
        this.finalTranscript.set(text);
      }
    } catch {
      // The input bar remains usable even if fallback transcription fails.
    }
  }

  private resolveMediaRecorderConstructor(): MediaRecorderConstructor | null {
    const win = globalThis.window as
      | (Window & { MediaRecorder?: MediaRecorderConstructor })
      | undefined;
    return win?.MediaRecorder ?? null;
  }

  private resolveRecordingMimeType(mediaRecorder: MediaRecorderConstructor): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => mediaRecorder.isTypeSupported(candidate)) ?? 'audio/webm';
  }

  private resolveFileName(mimeType: string): string {
    return mimeType.includes('mp4') ? 'voice.m4a' : 'voice.webm';
  }

  private startWaveform(stream: MediaStream): void {
    const AudioContextCtor = this.resolveAudioContextConstructor();
    if (!AudioContextCtor) return;

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
      this.waveSampleData = new Uint8Array(analyser.fftSize);
      this.waveHistory = createIdleVoiceLevels();
      this.scheduleWaveFrame();
    } catch {
      // Recording can continue without the visualizer.
    }
  }

  private resolveAudioContextConstructor(): typeof AudioContext | null {
    const win = globalThis.window as
      | (Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      | undefined;
    return win?.AudioContext ?? win?.webkitAudioContext ?? null;
  }

  private scheduleWaveFrame(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    this.waveFrameId = requestAnimationFrame(() => this.readWaveFrame());
  }

  private readWaveFrame(): void {
    const analyser = this.analyser;
    const data = this.waveSampleData;
    if (!analyser || !data || !this.listening()) return;

    analyser.getByteTimeDomainData(data);
    this.waveHistory = [...this.waveHistory.slice(1), calculateVoiceWaveLevel(data)];
    this.levels.set(this.waveHistory);
    this.scheduleWaveFrame();
  }

  private cleanupRecording(): void {
    this.listening.set(false);
    this.recorder = null;
    this.chunks = [];

    if (this.recordingTimeoutId) {
      clearTimeout(this.recordingTimeoutId);
      this.recordingTimeoutId = null;
    }

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
