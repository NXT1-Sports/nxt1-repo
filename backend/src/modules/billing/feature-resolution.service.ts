/**
 * @fileoverview Dynamic Billing Feature Resolution
 * @module @nxt1/backend/modules/billing
 *
 * Resolves a billable feature label from what Agent X actually did.
 * Tool execution takes precedence, then explicit fixed-flow features,
 * then coordinator-level fallbacks.
 */

export interface BillableFeatureResolutionInput {
  readonly feature?: string;
  readonly coordinatorId?: string;
  readonly agentTools?: readonly string[];
  readonly successfulTools?: readonly string[];
}

const PASSIVE_TOOL_PREFIXES = ['get_', 'list_', 'read_', 'search_', 'query_', 'check_'] as const;

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function dedupeNormalized(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const slug = normalizeSlug(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }

  return normalized;
}

function selectRepresentativeTool(tools: readonly string[]): string | null {
  if (tools.length === 0) {
    return null;
  }

  for (let index = tools.length - 1; index >= 0; index -= 1) {
    const tool = tools[index];
    if (!PASSIVE_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix))) {
      return tool;
    }
  }

  return tools[tools.length - 1] ?? null;
}

export function resolveBillableFeature(input: BillableFeatureResolutionInput): string {
  const successfulTool = selectRepresentativeTool(dedupeNormalized(input.successfulTools));
  if (successfulTool) {
    return successfulTool;
  }

  const attemptedTool = selectRepresentativeTool(dedupeNormalized(input.agentTools));
  if (attemptedTool) {
    return attemptedTool;
  }

  const explicitFeature = typeof input.feature === 'string' ? normalizeSlug(input.feature) : '';
  if (explicitFeature) {
    return explicitFeature;
  }

  const coordinatorSlug =
    typeof input.coordinatorId === 'string' ? normalizeSlug(input.coordinatorId) : '';
  if (coordinatorSlug) {
    return `${coordinatorSlug}-execution`;
  }

  return 'agent-execution';
}
