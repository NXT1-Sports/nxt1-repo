import { randomUUID } from 'node:crypto';
import type {
  AgentIdentifier,
  AgentJobUpdate,
  AgentProgressMetadata,
  AgentProgressStage,
  AgentRouterStage,
  OperationOutcomeCode,
} from '@nxt1/core';
import type { OnStreamEvent } from '../queue/event-writer.js';
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';
import { logger } from '../../../utils/logger.js';

export class AgentRouterTelemetryService {
  private readonly phaseLatencySamples = new Map<string, number[]>();
  private readonly metricSamples = new Map<string, number[]>();

  async emitStreamedTextChunks(
    onStreamEvent: OnStreamEvent,
    payload: {
      readonly operationId: string;
      readonly agentId: AgentIdentifier;
      readonly text: string;
      readonly targetChunkSize?: number;
      readonly cadenceMs?: number;
      readonly signal?: AbortSignal;
    }
  ): Promise<void> {
    const chunks = this.chunkTextForStreaming(payload.text, payload.targetChunkSize ?? 24);
    const cadenceMs = Math.max(12, payload.cadenceMs ?? 24);

    for (let i = 0; i < chunks.length; i += 1) {
      if (payload.signal?.aborted) return;

      const chunk = chunks[i];
      if (!chunk) continue;

      onStreamEvent({
        type: 'delta',
        agentId: payload.agentId,
        operationId: payload.operationId,
        text: chunk,
        noBatch: true,
      });

      if (i < chunks.length - 1) {
        await this.waitForChunkCadence(cadenceMs, payload.signal);
      }
    }
  }

  emitUpdate(
    onUpdate: ((update: AgentJobUpdate) => void) | undefined,
    operationId: string,
    status: AgentJobUpdate['status'],
    message: string,
    payload?: Record<string, unknown>,
    structured?: {
      readonly agentId?: AgentIdentifier;
      readonly stage?: AgentRouterStage;
      readonly outcomeCode?: OperationOutcomeCode;
      readonly metadata?: AgentProgressMetadata;
    }
  ): void {
    if (!onUpdate) return;
    onUpdate({
      operationId,
      status,
      agentId: structured?.agentId,
      stageType: structured?.stage ? 'router' : undefined,
      stage: structured?.stage,
      outcomeCode: structured?.outcomeCode,
      metadata: structured?.metadata,
      step: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        status,
        message,
        agentId: structured?.agentId,
        stageType: structured?.stage ? 'router' : undefined,
        stage: structured?.stage,
        outcomeCode: structured?.outcomeCode,
        metadata: structured?.metadata,
        payload,
      },
    });
  }

  emitProgressOperation(
    onStreamEvent: OnStreamEvent | undefined,
    payload: {
      readonly operationId: string;
      readonly message: string;
      readonly stage?: AgentProgressStage;
      readonly status?:
        | 'queued'
        | 'running'
        | 'paused'
        | 'awaiting_input'
        | 'awaiting_approval'
        | 'complete'
        | 'failed'
        | 'cancelled';
      readonly metadata?: AgentProgressMetadata;
    }
  ): void {
    if (!onStreamEvent) return;

    const metadataEventType =
      typeof payload.metadata?.['eventType'] === 'string'
        ? (payload.metadata['eventType'] as string)
        : undefined;
    const progressEventType =
      metadataEventType === 'progress_stage' ||
      metadataEventType === 'progress_subphase' ||
      metadataEventType === 'metric'
        ? metadataEventType
        : undefined;
    const messageKey = this.buildProgressMessageKey(
      payload.stage ?? 'agent_thinking',
      payload.metadata
    );

    onStreamEvent({
      type: 'operation',
      operationId: payload.operationId,
      status: payload.status ?? 'running',
      agentId: 'router',
      messageKey,
      stageType: 'router',
      stage: payload.stage ?? 'agent_thinking',
      message: payload.message,
      metadata: payload.metadata,
      timestamp: new Date().toISOString(),
    });

    if (!progressEventType) return;

    onStreamEvent({
      type: progressEventType,
      operationId: payload.operationId,
      status: payload.status ?? 'running',
      agentId: 'router',
      messageKey,
      stageType: 'router',
      stage: payload.stage ?? 'agent_thinking',
      message: payload.message,
      metadata: payload.metadata,
      timestamp: new Date().toISOString(),
    });
  }

  recordPhaseLatency(
    phase: string,
    durationMs: number,
    context?: Readonly<Record<string, unknown>>
  ): void {
    if (!Number.isFinite(durationMs)) return;

    const safeDurationMs = Math.max(0, Math.round(durationMs));
    const samples = this.phaseLatencySamples.get(phase) ?? [];
    samples.push(safeDurationMs);
    if (samples.length > 100) {
      samples.shift();
    }
    this.phaseLatencySamples.set(phase, samples);

    const averageMs = Math.round(samples.reduce((acc, value) => acc + value, 0) / samples.length);

    logger.info('[AgentRouter] Phase latency sample', {
      phase,
      durationMs: safeDurationMs,
      averageMs,
      sampleCount: samples.length,
      ...(context ?? {}),
    });
  }

  emitMetricSample(
    onStreamEvent: OnStreamEvent | undefined,
    payload: {
      readonly operationId: string;
      readonly stage: AgentProgressStage;
      readonly metricName: string;
      readonly value: number;
      readonly message: string;
      readonly metadata?: AgentProgressMetadata;
      readonly sampleContext?: Readonly<Record<string, unknown>>;
    }
  ): void {
    if (!Number.isFinite(payload.value)) return;

    const safeValue = Math.max(0, Math.round(payload.value));
    this.recordOperationMetric(payload.metricName, safeValue, payload.sampleContext);

    this.emitProgressOperation(onStreamEvent, {
      operationId: payload.operationId,
      stage: payload.stage,
      message: payload.message,
      metadata: {
        eventType: 'metric',
        metricName: payload.metricName,
        value: safeValue,
        ...(payload.metadata ?? {}),
      },
    });
  }

  private async waitForChunkCadence(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);

      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };

      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private chunkTextForStreaming(text: string, targetChunkSize = 24): readonly string[] {
    const normalized = sanitizeAgentOutputText(text).trim();
    if (!normalized) return [];

    const words = normalized.split(/\s+/).filter((word) => word.length > 0);
    if (words.length <= 1) return [normalized];

    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (candidate.length > targetChunkSize && current.length > 0) {
        chunks.push(`${current} `);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  private buildProgressMessageKey(
    stage: AgentProgressStage,
    metadata?: AgentProgressMetadata
  ): string {
    const explicitMessageKey =
      typeof metadata?.['messageKey'] === 'string' ? metadata['messageKey'] : undefined;
    if (explicitMessageKey) {
      return explicitMessageKey;
    }

    const eventType =
      typeof metadata?.['eventType'] === 'string' ? metadata['eventType'] : undefined;
    const metricName =
      typeof metadata?.['metricName'] === 'string' ? metadata['metricName'] : undefined;
    const phase = typeof metadata?.['phase'] === 'string' ? metadata['phase'] : undefined;
    const status = typeof metadata?.['status'] === 'string' ? metadata['status'] : undefined;

    if (eventType === 'metric' && metricName) {
      return `agent.metric.${this.toMessageKeySegment(metricName)}`;
    }

    if (phase && status) {
      return `agent.progress.${this.toMessageKeySegment(phase)}.${this.toMessageKeySegment(status)}`;
    }

    if (phase) {
      return `agent.progress.${this.toMessageKeySegment(phase)}`;
    }

    return `agent.progress.${this.toMessageKeySegment(stage)}`;
  }

  private toMessageKeySegment(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private recordOperationMetric(
    metricName: string,
    value: number,
    context?: Readonly<Record<string, unknown>>
  ): void {
    if (!Number.isFinite(value)) return;

    const safeValue = Math.max(0, Math.round(value));
    const samples = this.metricSamples.get(metricName) ?? [];
    samples.push(safeValue);
    if (samples.length > 100) {
      samples.shift();
    }
    this.metricSamples.set(metricName, samples);

    const averageValue = Math.round(
      samples.reduce((acc, sample) => acc + sample, 0) / samples.length
    );

    logger.info('[AgentRouter] Metric sample', {
      metricName,
      value: safeValue,
      averageValue,
      sampleCount: samples.length,
      ...(context ?? {}),
    });
  }
}
