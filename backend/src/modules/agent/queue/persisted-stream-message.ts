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

function metadataForStep(event: StreamEvent): AgentProgressMetadata | undefined {
  const merged: Record<string, unknown> = {
    ...(event.metadata ?? {}),
  };

  if (event.toolName) merged['toolName'] = event.toolName;

  return Object.keys(merged).length > 0
    ? (sanitizeAgentPayload(merged) as AgentProgressMetadata)
    : undefined;
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

  const coordinatorObservation = result['coordinator_observation'];
  if (typeof coordinatorObservation === 'string' && coordinatorObservation.trim().length > 0) {
    return 'Coordinator response received';
  }

  const planObservation = result['plan_observation'];
  if (typeof planObservation === 'string' && planObservation.trim().length > 0) {
    return 'Coordinator response received';
  }

  const keys = Object.keys(result);
  return keys.length > 0 ? 'Processed tool output' : 'Processed';
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
  private readonly steps: AgentXToolStep[] = [];
  private readonly parts: AgentXMessagePart[] = [];
  private readonly partAgentIds: Array<string | undefined> = [];
  private readonly failedCoordinatorAgentIds = new Set<string>();
  private readonly pendingStepIds = new Map<string, string[]>();
  private stepSeq = 0;

  process(event: StreamEvent): void {
    switch (event.type) {
      case 'thinking': {
        if (!event.thinkingText) return;
        const text = sanitizeAgentOutputText(event.thinkingText);
        const last = this.parts[this.parts.length - 1];
        const lastAgentId = this.partAgentIds[this.partAgentIds.length - 1];
        if (last?.type === 'thinking' && lastAgentId === event.agentId) {
          this.parts[this.parts.length - 1] = { type: 'thinking', content: last.content + text };
        } else {
          this.parts.push({ type: 'thinking', content: text });
          this.partAgentIds.push(event.agentId);
        }
        return;
      }

      case 'delta': {
        if (!event.text) return;
        const text = sanitizeAgentOutputText(event.text);
        const last = this.parts[this.parts.length - 1];
        const lastAgentId = this.partAgentIds[this.partAgentIds.length - 1];
        if (last?.type === 'text' && lastAgentId === event.agentId) {
          this.parts[this.parts.length - 1] = { type: 'text', content: last.content + text };
        } else {
          this.parts.push({ type: 'text', content: text });
          this.partAgentIds.push(event.agentId);
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
        this.recordFailedCoordinatorFromToolResult(event);
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
        const card = toRichCard(event.cardData, event.agentId);
        if (card) {
          this.parts.push({ type: 'card', card });
          this.partAgentIds.push(event.agentId);
        }
        return;
      }

      default:
        return;
    }
  }

  snapshot(): PersistedAssistantStreamSnapshot {
    // Step 1: drop draft text/thinking emitted by coordinators that later
    // reported failure — those drafts must not leak into the persisted body.
    const survivingIndices: number[] = [];
    for (let i = 0; i < this.parts.length; i += 1) {
      const part = this.parts[i];
      if (!part) continue;
      if (part.type !== 'text' && part.type !== 'thinking') {
        survivingIndices.push(i);
        continue;
      }
      const agentId = this.partAgentIds[i];
      if (!agentId || !this.failedCoordinatorAgentIds.has(agentId)) {
        survivingIndices.push(i);
      }
    }

    // Step 2: collapse re-emitted answer bodies.
    //
    // After a tool call (e.g. ffmpeg merge → card emit), the underlying LLM
    // commonly restates its full final answer in the next streaming pass —
    // verbatim or with the previous text wholly contained in the new one.
    // Without this pass the persisted message body ends up containing the
    // same answer twice (matching what the user reported: a single Mongo
    // message rendering the table + video card + "What's in it" section
    // back-to-back). Keep only the most-complete text per agent.
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
    const dropped = new Set<number>();
    for (let a = 0; a < survivingIndices.length; a += 1) {
      const idxA = survivingIndices[a]!;
      const partA = this.parts[idxA]!;
      if (partA.type !== 'text') continue;
      const normalizedA = normalize(partA.content);
      // Skip trivial fragments (handoff prose, single-token transitions);
      // they're rarely duplicated and dropping them risks losing context.
      if (normalizedA.length < 24) continue;
      const agentA = this.partAgentIds[idxA];
      for (let b = a + 1; b < survivingIndices.length; b += 1) {
        const idxB = survivingIndices[b]!;
        const partB = this.parts[idxB]!;
        if (partB.type !== 'text') continue;
        if (this.partAgentIds[idxB] !== agentA) continue;
        const normalizedB = normalize(partB.content);
        if (normalizedB.length === 0) continue;
        if (normalizedB.includes(normalizedA)) {
          dropped.add(idxA);
          break;
        }
      }
    }

    const parts = survivingIndices
      .filter((idx) => !dropped.has(idx))
      .map((idx) => this.parts[idx]!);
    const content = parts
      .filter((part): part is Extract<AgentXMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.content)
      .join('');

    return {
      content,
      steps: [...this.steps],
      parts,
    };
  }

  /**
   * Mark any currently-active steps as `success`. Used on yield checkpoints
   * (e.g. `ask_user` throws an `AgentYieldException` instead of returning a
   * `tool_result`, so the step would otherwise stay in `active` state and
   * spin forever after the user has already replied).
   *
   * No filtering is applied — when the agent yields, every active step in the
   * snapshot is by definition resolved from the worker's point of view: the
   * agent has paused and is awaiting user input. Subsequent activity will
   * arrive on the resumed run.
   */
  finalizeActiveSteps(): void {
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (step.status !== 'active') continue;
      const next: AgentXToolStep = { ...step, status: 'success' };
      this.steps[i] = next;

      for (let p = 0; p < this.parts.length; p++) {
        const part = this.parts[p];
        if (part.type !== 'tool-steps') continue;
        const idx = part.steps.findIndex((c) => c.id === step.id);
        if (idx < 0) continue;
        const nextSteps = [...part.steps];
        nextSteps[idx] = next;
        this.parts[p] = { type: 'tool-steps', steps: nextSteps };
      }
    }
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
      metadata: metadataForStep(event),
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
    this.partAgentIds.push(step.agentId);
  }

  private recordFailedCoordinatorFromToolResult(event: StreamEvent): void {
    if (event.type !== 'tool_result') return;
    if (event.toolName !== 'delegate_to_coordinator') return;
    if (event.toolSuccess !== false) return;
    const result = event.toolResult;
    if (!result || typeof result !== 'object') return;

    const data =
      result['data'] && typeof result['data'] === 'object'
        ? (result['data'] as Record<string, unknown>)
        : result;
    const coordinatorId = data['coordinator_id'];
    const followUpRequired = data['follow_up_required'];
    const userAlreadyReceivedResponse = data['user_already_received_response'];

    if (
      typeof coordinatorId === 'string' &&
      followUpRequired === true &&
      userAlreadyReceivedResponse !== true
    ) {
      this.failedCoordinatorAgentIds.add(coordinatorId);
    }
  }
}
