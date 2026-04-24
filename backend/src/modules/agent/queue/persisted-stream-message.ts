import type {
  AgentProgressMetadata,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXToolStep,
  AgentXToolStepStatus,
} from '@nxt1/core';
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
        const stepId = this.nextStepId(event.toolName ?? 'step');
        if (event.toolName) {
          const queue = this.pendingStepIds.get(event.toolName) ?? [];
          queue.push(stepId);
          this.pendingStepIds.set(event.toolName, queue);
        }
        this.upsertStep(
          this.buildStep(
            event,
            stepId,
            'active',
            event.message ?? event.toolName ?? 'Processing...'
          )
        );
        return;
      }

      case 'tool_call': {
        const stepId = this.nextStepId(event.toolName ?? 'tool');
        if (event.toolName) {
          const queue = this.pendingStepIds.get(event.toolName) ?? [];
          queue.push(stepId);
          this.pendingStepIds.set(event.toolName, queue);
        }
        this.upsertStep(
          this.buildStep(event, stepId, 'active', `Running ${event.toolName ?? 'tool'}...`)
        );
        return;
      }

      case 'tool_result': {
        const stepId = event.toolName
          ? (this.pendingStepIds.get(event.toolName)?.shift() ?? this.nextStepId(event.toolName))
          : this.nextStepId('tool');
        this.upsertStep(
          this.buildStep(
            event,
            stepId,
            event.toolSuccess ? 'success' : 'error',
            event.message ??
              `${event.toolName ?? 'Tool'} ${event.toolSuccess ? 'completed' : 'failed'}`,
            event.toolResult ? summarizeToolResult(event.toolResult) : undefined
          )
        );
        return;
      }

      case 'step_done': {
        const stepId = event.toolName
          ? (this.pendingStepIds.get(event.toolName)?.shift() ?? this.nextStepId(event.toolName))
          : this.nextStepId('step');
        this.upsertStep(
          this.buildStep(event, stepId, 'success', event.message ?? 'Step completed')
        );
        return;
      }

      case 'step_error': {
        const stepId = event.toolName
          ? (this.pendingStepIds.get(event.toolName)?.shift() ?? this.nextStepId(event.toolName))
          : this.nextStepId('step');
        this.upsertStep(
          this.buildStep(event, stepId, 'error', event.message ?? event.error ?? 'Step failed')
        );
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
    return {
      content: this.content,
      steps: [...this.steps],
      parts: [...this.parts],
    };
  }

  private nextStepId(prefix: string): string {
    const id = `${prefix}-${this.stepSeq}`;
    this.stepSeq += 1;
    return id;
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

  private upsertStep(step: AgentXToolStep): void {
    const index = this.steps.findIndex((candidate) => candidate.id === step.id);
    if (index >= 0) {
      this.steps[index] = step;
    } else {
      this.steps.push(step);
    }

    const last = this.parts[this.parts.length - 1];
    if (last?.type === 'tool-steps') {
      const nextSteps = [...last.steps];
      const existingIndex = nextSteps.findIndex((candidate) => candidate.id === step.id);
      if (existingIndex >= 0) {
        nextSteps[existingIndex] = step;
      } else {
        nextSteps.push(step);
      }
      this.parts[this.parts.length - 1] = { type: 'tool-steps', steps: nextSteps };
      return;
    }

    this.parts.push({ type: 'tool-steps', steps: [step] });
  }
}
