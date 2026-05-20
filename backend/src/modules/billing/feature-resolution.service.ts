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

const PASSIVE_TOOL_PREFIXES = [
  'get-',
  'list-',
  'read-',
  'search-',
  'query-',
  'check-',
  'track-',
  'register-',
] as const;

const SYSTEM_OR_ROUTING_TOOLS = new Set<string>([
  'delegate-to-coordinator',
  'delegate-task',
  'create-plan',
  'execute-saved-plan',
  'plan-and-execute',
  'whoami-capabilities',
  'ask-user',
]);

function isSystemOrRoutingSlug(value: string): boolean {
  return SYSTEM_OR_ROUTING_TOOLS.has(value);
}

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

function isPassiveToolSlug(value: string): boolean {
  return PASSIVE_TOOL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isMeaningfulBillableToolSlug(value: string): boolean {
  return !isSystemOrRoutingSlug(value) && !isPassiveToolSlug(value);
}

function selectBillableTools(tools: readonly string[]): string[] {
  return tools.filter((tool) => isMeaningfulBillableToolSlug(tool));
}

export function resolveBillableFeatures(input: BillableFeatureResolutionInput): string[] {
  const normalizedSuccessfulTools = dedupeNormalized(input.successfulTools);
  if (input.successfulTools !== undefined) {
    const successfulTools = selectBillableTools(normalizedSuccessfulTools);
    if (successfulTools.length > 0) {
      return successfulTools;
    }
  }

  if (input.successfulTools === undefined) {
    const attemptedTools = selectBillableTools(dedupeNormalized(input.agentTools));
    if (attemptedTools.length > 0) {
      return attemptedTools;
    }
  }

  const explicitFeature = typeof input.feature === 'string' ? normalizeSlug(input.feature) : '';
  if (explicitFeature && !isSystemOrRoutingSlug(explicitFeature)) {
    return [explicitFeature];
  }

  const coordinatorSlug =
    typeof input.coordinatorId === 'string' ? normalizeSlug(input.coordinatorId) : '';
  if (coordinatorSlug) {
    return [`${coordinatorSlug}-execution`];
  }

  return ['agent-execution'];
}

export function resolveBillableFeature(input: BillableFeatureResolutionInput): string {
  return resolveBillableFeatures(input)[0] ?? 'agent-execution';
}
