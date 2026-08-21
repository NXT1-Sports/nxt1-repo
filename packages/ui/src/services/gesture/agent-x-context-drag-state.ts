import type { AgentXSelectedContext } from '@nxt1/core/ai';

const FALLBACK_TTL_MS = 15000;

let pendingContextDrag: {
  readonly contexts: readonly AgentXSelectedContext[];
  readonly startedAt: number;
} | null = null;

export function rememberAgentXContextDragFallback(
  contexts: readonly AgentXSelectedContext[]
): void {
  if (contexts.length === 0) {
    pendingContextDrag = null;
    return;
  }

  pendingContextDrag = {
    contexts: [...contexts],
    startedAt: Date.now(),
  };
}

export function readAgentXContextDragFallback(): readonly AgentXSelectedContext[] | null {
  if (!pendingContextDrag) {
    return null;
  }

  if (Date.now() - pendingContextDrag.startedAt > FALLBACK_TTL_MS) {
    pendingContextDrag = null;
    return null;
  }

  return pendingContextDrag.contexts;
}

export function consumeAgentXContextDragFallback(): readonly AgentXSelectedContext[] | null {
  const contexts = readAgentXContextDragFallback();
  pendingContextDrag = null;
  return contexts;
}

export function clearAgentXContextDragFallback(): void {
  pendingContextDrag = null;
}
