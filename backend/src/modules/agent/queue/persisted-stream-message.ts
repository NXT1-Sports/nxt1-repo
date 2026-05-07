import type {
  AgentProgressMetadata,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXToolStep,
  AgentXToolStepStatus,
} from '@nxt1/core';
import { sanitizeStorageUrlsFromText } from '@nxt1/core';
import type { StreamEvent } from './event-writer.js';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';

export interface PersistedAssistantStreamSnapshot {
  readonly content: string;
  readonly steps: readonly AgentXToolStep[];
  readonly parts: readonly AgentXMessagePart[];
}

function sanitizeMetadata(metadata?: AgentProgressMetadata): AgentProgressMetadata | undefined {
  if (!metadata) return undefined;
  return sanitizeAgentPayload(metadata) as AgentProgressMetadata;
}

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function summarizeToolResult(result: Record<string, unknown>): string {
  if (Array.isArray(result['items'])) {
    return `Found ${result['items'].length} result(s)`;
  }
  if (Array.isArray(result['views'])) {
    return `Found ${result['views'].length} data view(s)`;
  }
  if (typeof result['count'] === 'number') {
    return `${result['count']} result(s)`;
  }
  if (typeof result['url'] === 'string') {
    return 'Generated successfully';
  }
  if (typeof result['imageUrl'] === 'string') {
    return 'Image generated';
  }
  const keys = Object.keys(result);
  return keys.length > 0 ? `Returned ${keys.length} field(s)` : 'Completed';
}

function toRichCard(value: unknown, fallbackAgentId?: string): AgentXRichCard | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as {
    type?: unknown;
    title?: unknown;
    payload?: unknown;
    agentId?: unknown;
  };

  if (typeof raw.type !== 'string') return null;
  if (typeof raw.title !== 'string') return null;
  if (raw.payload == null || typeof raw.payload !== 'object') return null;

  return {
    type: raw.type as AgentXRichCard['type'],
    title: raw.title,
    payload: raw.payload as AgentXRichCard['payload'],
    agentId:
      typeof raw.agentId === 'string'
        ? (raw.agentId as AgentXRichCard['agentId'])
        : ((fallbackAgentId ?? 'router') as AgentXRichCard['agentId']),
  };
}

export class PersistedAssistantStreamBuilder {
  private content = '';
  private readonly steps: AgentXToolStep[] = [];
  private readonly parts: AgentXMessagePart[] = [];
  private readonly pendingStepIds = new Map<string, string[]>();
  private stepSeq = 0;

  process(event: StreamEvent): void {
    switch (event.type) {
      case 'thinking': {
        if (!event.thinkingText) return;
        const text = sanitizeAgentOutputText(event.thinkingText);
        const last = this.parts[this.parts.length - 1];
        if (last?.type === 'thinking') {
          this.parts[this.parts.length - 1] = { type: 'thinking', content: last.content + text };
        } else {
          this.parts.push({ type: 'thinking', content: text });
        }
        return;
      }

      case 'delta': {
        if (!event.text) return;
        const text = sanitizeAgentOutputText(event.text);
        this.content += text;
        const last = this.parts[this.parts.length - 1];
        if (last?.type === 'text') {
          this.parts[this.parts.length - 1] = { type: 'text', content: last.content + text };
        } else {
          this.parts.push({ type: 'text', content: text });
        }
        return;
      }

      case 'step_active': {
        const label = this.resolveStepLabel(event);
        if (!label) return;
        const stepId = this.resolveStartedStepId(event, event.toolName ?? 'step');
        this.upsertStep(this.buildStep(event, stepId, 'active', label));
        return;
      }

      case 'tool_call': {
        return;
      }

      case 'tool_result': {
        const label = this.resolveStepLabel(event);
        if (!label) return;
        const stepId = this.resolveCompletedStepId(event, 'tool');
        this.upsertStep(
          this.buildStep(
            event,
            stepId,
            event.toolSuccess ? 'success' : 'error',
            label,
            event.toolResult ? summarizeToolResult(event.toolResult) : undefined
          )
        );
        return;
      }

      case 'step_done': {
        const label = this.resolveStepLabel(event);
        if (!label) return;
        const stepId = this.resolveCompletedStepId(event, 'step');
        this.upsertStep(this.buildStep(event, stepId, 'success', label));
        return;
      }

      case 'step_error': {
        const label = this.resolveStepLabel(event);
        if (!label) return;
        const stepId = this.resolveCompletedStepId(event, 'step');
        this.upsertStep(this.buildStep(event, stepId, 'error', label));
        return;
      }

      case 'card': {
        const rawCard = event.cardData
          ? sanitizeAgentPayload(event.cardData as unknown as Record<string, unknown>)
          : null;
        const card = toRichCard(rawCard, event.agentId);
        if (card) {
          this.parts.push({ type: 'card', card });
        }
        return;
      }

      default:
        return;
    }
  }

  snapshot(): PersistedAssistantStreamSnapshot {
    // Strip any storage URLs from the full accumulated content before persisting.
    // URLs may arrive across multiple delta chunks making them undetectable
    // per-chunk; the full accumulation is the only reliable sanitization point.
    const sanitizedContent = sanitizeStorageUrlsFromText(this.content);

    // Mirror sanitization in the text parts so the parts array matches content.
    const sanitizedParts = this.parts.map((part) =>
      part.type === 'text' ? { ...part, content: sanitizeStorageUrlsFromText(part.content) } : part
    );

    return {
      content: sanitizedContent,
      steps: [...this.steps],
      parts: sanitizedParts,
    };
  }

  private nextStepId(prefix: string): string {
    const id = `${prefix}-${this.stepSeq}`;
    this.stepSeq += 1;
    return id;
  }

  private resolveStartedStepId(event: StreamEvent, prefix: string): string {
    if (typeof event.stepId === 'string' && event.stepId.trim().length > 0) {
      return event.stepId;
    }

    const stepId = this.nextStepId(prefix);
    if (event.toolName) {
      const queue = this.pendingStepIds.get(event.toolName) ?? [];
      queue.push(stepId);
      this.pendingStepIds.set(event.toolName, queue);
    }
    return stepId;
  }

  private resolveCompletedStepId(event: StreamEvent, fallbackPrefix: string): string {
    if (typeof event.stepId === 'string' && event.stepId.trim().length > 0) {
      return event.stepId;
    }

    if (event.toolName) {
      const pending = this.pendingStepIds.get(event.toolName)?.shift();
      if (pending) return pending;
      return this.nextStepId(event.toolName);
    }

    return this.nextStepId(fallbackPrefix);
  }

  private buildStep(
    event: StreamEvent,
    id: string,
    status: AgentXToolStepStatus,
    label: string,
    detail?: string
  ): AgentXToolStep {
    return {
      id,
      label: sanitizeAgentOutputText(label),
      messageKey: event.messageKey,
      agentId: event.agentId,
      stageType: event.stageType,
      stage: event.stage,
      outcomeCode: event.outcomeCode,
      metadata: sanitizeMetadata(event.metadata),
      status,
      icon: event.icon,
      ...(detail ? { detail: sanitizeAgentOutputText(detail) } : {}),
    };
  }

  private resolveStepLabel(event: StreamEvent): string | null {
    const explicitLabel =
      typeof event.message === 'string' ? sanitizeAgentOutputText(event.message).trim() : '';
    if (explicitLabel.length > 0) return explicitLabel;

    const fallback =
      typeof event.toolName === 'string' && event.toolName.trim().length > 0
        ? humanizeToolName(event.toolName)
        : '';

    return fallback.length > 0 ? fallback : null;
  }

  private upsertStep(step: AgentXToolStep): void {
    const index = this.steps.findIndex((candidate) => candidate.id === step.id);
    if (index >= 0) {
      this.steps[index] = step;
    } else {
      this.steps.push(step);
    }

    // Search ALL tool-steps groups for an existing step with this id. When a
    // tool_result arrives after intervening text deltas, we must update the
    // original step in place rather than create a duplicate in a new group.
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      if (part.type !== 'tool-steps') continue;
      const existingIndex = part.steps.findIndex((candidate) => candidate.id === step.id);
      if (existingIndex < 0) continue;
      const nextSteps = [...part.steps];
      nextSteps[existingIndex] = step;
      this.parts[i] = { type: 'tool-steps', steps: nextSteps };
      return;
    }

    const last = this.parts[this.parts.length - 1];
    if (last?.type === 'tool-steps') {
      this.parts[this.parts.length - 1] = {
        type: 'tool-steps',
        steps: [...last.steps, step],
      };
      return;
    }

    this.parts.push({ type: 'tool-steps', steps: [step] });
  }
}
