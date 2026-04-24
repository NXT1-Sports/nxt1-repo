import type {
  AgentIdentifier,
  AgentProgressMetadata,
  AgentProgressStage,
  OperationOutcomeCode,
  AgentXRichCard,
  AgentXToolStep,
  AgentXToolStepIcon,
} from '@nxt1/core/ai';

type AgentTheme = {
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentBorder: string;
  readonly surface: string;
};

const VALID_TOOL_STEP_ICONS: ReadonlySet<string> = new Set([
  'default',
  'delete',
  'upload',
  'download',
  'search',
  'processing',
  'document',
  'media',
  'database',
  'email',
  'approval',
]);

const AGENT_LABELS: Record<AgentIdentifier, string> = {
  router: 'Agent X',
  admin_coordinator: 'Admin Coordinator',
  brand_coordinator: 'Brand Coordinator',
  data_coordinator: 'Data Coordinator',
  strategy_coordinator: 'Strategy Coordinator',
  recruiting_coordinator: 'Recruiting Coordinator',
  performance_coordinator: 'Performance Coordinator',
};

const AGENT_THEMES: Record<AgentIdentifier, AgentTheme> = {
  router: {
    accent: '#ccff00',
    accentSoft: 'rgba(204, 255, 0, 0.12)',
    accentBorder: 'rgba(204, 255, 0, 0.24)',
    surface: 'rgba(204, 255, 0, 0.06)',
  },
  admin_coordinator: {
    accent: '#22c55e',
    accentSoft: 'rgba(34, 197, 94, 0.12)',
    accentBorder: 'rgba(34, 197, 94, 0.26)',
    surface: 'rgba(34, 197, 94, 0.06)',
  },
  brand_coordinator: {
    accent: '#fb7185',
    accentSoft: 'rgba(251, 113, 133, 0.12)',
    accentBorder: 'rgba(251, 113, 133, 0.26)',
    surface: 'rgba(251, 113, 133, 0.06)',
  },
  data_coordinator: {
    accent: '#38bdf8',
    accentSoft: 'rgba(56, 189, 248, 0.12)',
    accentBorder: 'rgba(56, 189, 248, 0.26)',
    surface: 'rgba(56, 189, 248, 0.06)',
  },
  strategy_coordinator: {
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.12)',
    accentBorder: 'rgba(245, 158, 11, 0.26)',
    surface: 'rgba(245, 158, 11, 0.06)',
  },
  recruiting_coordinator: {
    accent: '#818cf8',
    accentSoft: 'rgba(129, 140, 248, 0.12)',
    accentBorder: 'rgba(129, 140, 248, 0.26)',
    surface: 'rgba(129, 140, 248, 0.06)',
  },
  performance_coordinator: {
    accent: '#f97316',
    accentSoft: 'rgba(249, 115, 22, 0.12)',
    accentBorder: 'rgba(249, 115, 22, 0.26)',
    surface: 'rgba(249, 115, 22, 0.06)',
  },
};

const SUB_AGENT_LABELS: Readonly<Record<string, string>> = {
  'athlete-specialist': 'Athlete Specialist',
  'org-specialist': 'Organization Specialist',
  'media-specialist': 'Media Specialist',
};

const VALID_AGENT_IDENTIFIERS: ReadonlySet<AgentIdentifier> = new Set(
  Object.keys(AGENT_LABELS) as AgentIdentifier[]
);

const STAGE_LABELS: Partial<Record<AgentProgressStage, string>> = {
  building_context: 'Building context',
  decomposing_intent: 'Planning the approach',
  routing_to_agent: 'Routing to the right agent',
  agent_thinking: 'Thinking',
  resuming_user_input: 'Processing your reply',
  summarizing_memory: 'Summarizing prior context',
  fetching_data: 'Fetching data',
  processing_media: 'Processing media',
  uploading_assets: 'Uploading assets',
  submitting_job: 'Submitting a job',
  checking_status: 'Checking status',
  persisting_result: 'Saving results',
  deleting_resource: 'Deleting a resource',
  invoking_sub_agent: 'Calling a sub-agent',
};

const OUTCOME_LABELS: Partial<Record<OperationOutcomeCode, string>> = {
  success_default: 'Completed',
  routing_failed: 'Routing failed',
  context_build_failed: 'Context loading failed',
  planning_failed: 'Planning failed',
  task_failed: 'Step failed',
  approval_required: 'Awaiting approval',
  input_required: 'Awaiting your reply',
  cancelled: 'Cancelled',
};

function titleCaseToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function metadataActorName(metadata?: AgentProgressMetadata): string | null {
  const targetAgentId = metadata?.['targetAgentId'];
  if (typeof targetAgentId === 'string') {
    return getAgentDisplayName(targetAgentId as AgentIdentifier);
  }

  const subAgentId = metadata?.['subAgentId'];
  if (typeof subAgentId === 'string') {
    return SUB_AGENT_LABELS[subAgentId] ?? titleCaseToken(subAgentId);
  }

  return null;
}

function stageLabelFromMetadata(
  stage: AgentProgressStage,
  metadata?: AgentProgressMetadata
): string | null {
  const source = typeof metadata?.['source'] === 'string' ? metadata['source'] : null;
  const phase = typeof metadata?.['phase'] === 'string' ? metadata['phase'] : null;

  if (source === 'scrape_and_index_profile') {
    const hostname =
      typeof metadata?.['hostname'] === 'string' ? (metadata['hostname'] as string) : null;
    const total = typeof metadata?.['total'] === 'number' ? (metadata['total'] as number) : null;
    const completed =
      typeof metadata?.['completed'] === 'number' ? (metadata['completed'] as number) : null;

    if (phase === 'main_page' && hostname) {
      return `Scraping ${hostname}`;
    }

    if (phase === 'stats_subpages') {
      if (completed !== null && total !== null) {
        return `Fetching stats sub-pages (${completed}/${total})`;
      }
      if (total !== null) {
        return `Fetching ${total} stats sub-page${total === 1 ? '' : 's'}`;
      }
    }

    if (phase === 'ai_extraction') {
      const characterCount =
        typeof metadata?.['characterCount'] === 'number'
          ? (metadata['characterCount'] as number)
          : null;
      return characterCount !== null
        ? `Running AI extraction (${formatCompactNumber(characterCount)} chars)`
        : 'Running AI extraction';
    }

    if (phase === 'cache_distilled_profile') {
      return 'Saving distilled profile';
    }

    if (phase === 'cache_raw_profile') {
      return 'Saving raw scrape data';
    }
  }

  if (source === 'firebase_mcp') {
    const view = typeof metadata?.['view'] === 'string' ? titleCaseToken(metadata['view']) : null;

    if (phase === 'resolve_scope') return 'Resolving NXT1 access';
    if (phase === 'list_views') return 'Loading NXT1 data views';
    if (phase === 'prepare_views') return 'Preparing NXT1 data views';
    if (phase === 'query_view' && view) return `Querying ${view}`;
  }

  if (source === 'google_workspace') {
    const service =
      typeof metadata?.['service'] === 'string'
        ? titleCaseToken(metadata['service'] as string)
        : 'Google Workspace';

    if (phase === 'inspect_tools') return 'Inspecting Google Workspace capabilities';
    if (phase === 'connect_session') return 'Connecting to Google Workspace';
    if (phase === 'refresh_access') return 'Refreshing Google Workspace access';
    if (phase === 'read_data') return `Reading from Google ${service}`;
    if (phase === 'execute_action') return `Executing Google ${service} action`;
  }

  if (source === 'tool_registry' && phase === 'generate_intel_from_updates') {
    const entityType =
      typeof metadata?.['entityType'] === 'string' ? (metadata['entityType'] as string) : null;
    return entityType === 'team'
      ? 'Generating Intel from the latest team updates'
      : 'Generating Intel from the latest profile updates';
  }

  if (stage === 'fetching_data') {
    const scannedCount =
      typeof metadata?.['scannedCount'] === 'number' ? (metadata['scannedCount'] as number) : null;
    if (scannedCount !== null) {
      return `Fetching data (${formatCompactNumber(scannedCount)} scanned)`;
    }
  }

  return null;
}

function ensureEllipsis(label: string): string {
  return /[.!?…]$/.test(label) ? label : `${label}...`;
}

export function normalizeToolStepIcon(icon?: string): AgentXToolStepIcon | undefined {
  if (!icon || !VALID_TOOL_STEP_ICONS.has(icon)) return undefined;
  return icon as AgentXToolStepIcon;
}

export function normalizeAgentIdentifier(agentId?: string): AgentIdentifier | undefined {
  if (!agentId || !VALID_AGENT_IDENTIFIERS.has(agentId as AgentIdentifier)) {
    return undefined;
  }
  return agentId as AgentIdentifier;
}

export function getAgentDisplayName(agentId?: AgentIdentifier | string): string {
  if (!agentId) return 'Agent X';
  return AGENT_LABELS[agentId as AgentIdentifier] ?? 'Agent X';
}

export function getStageLabel(
  stage?: AgentProgressStage,
  metadata?: AgentProgressMetadata
): string | null {
  if (!stage) return null;

  const metadataLabel = stageLabelFromMetadata(stage, metadata);
  if (metadataLabel) return metadataLabel;

  if (stage === 'routing_to_agent' || stage === 'invoking_sub_agent') {
    const targetAgentName = metadataActorName(metadata);
    if (targetAgentName) {
      return stage === 'routing_to_agent'
        ? `Routing to ${targetAgentName}`
        : `Calling ${targetAgentName}`;
    }
  }

  return STAGE_LABELS[stage] ?? null;
}

export function getOutcomeLabel(outcomeCode?: OperationOutcomeCode): string | null {
  if (!outcomeCode) return null;
  return OUTCOME_LABELS[outcomeCode] ?? null;
}

export function getToolStepDisplayLabel(
  step: Pick<AgentXToolStep, 'label' | 'stage' | 'metadata' | 'outcomeCode' | 'status'>
): string {
  const stageLabel = getStageLabel(step.stage, step.metadata);
  if (stageLabel) return stageLabel;

  if (step.status !== 'active') {
    const outcomeLabel = getOutcomeLabel(step.outcomeCode);
    if (outcomeLabel) return outcomeLabel;
  }

  if (step.label) {
    return step.label;
  }

  return step.status === 'error' ? 'Step failed' : 'Working';
}

export function getThinkingLabel(step?: AgentXToolStep | null): string {
  if (!step) return 'Agent X is thinking...';

  const agentName = getAgentDisplayName(step.agentId);
  const stageLabel = getStageLabel(step.stage, step.metadata);

  if (step.stage === 'agent_thinking') {
    return `${agentName} is thinking...`;
  }

  if (stageLabel) {
    return `${agentName} is ${stageLabel.toLowerCase()}...`;
  }

  const label = getToolStepDisplayLabel(step);
  if (label) {
    return ensureEllipsis(label);
  }

  return `${agentName} is working...`;
}

export function getToolStepContextLabel(step: AgentXToolStep): string | null {
  const agentName = step.agentId ? getAgentDisplayName(step.agentId) : null;
  const stageLabel = getStageLabel(step.stage, step.metadata);
  const outcomeLabel = getOutcomeLabel(step.outcomeCode);

  if (agentName && stageLabel) {
    return `${agentName} • ${stageLabel}`;
  }

  if (agentName && outcomeLabel) {
    return `${agentName} • ${outcomeLabel}`;
  }

  return agentName ?? stageLabel ?? outcomeLabel;
}

export function getToolStepsSummaryLabel(steps: readonly AgentXToolStep[]): string {
  const activeSteps = steps.filter((step) => step.status === 'active');
  if (activeSteps.length === 1) {
    return getThinkingLabel(activeSteps[0]);
  }

  if (activeSteps.length > 1) {
    return getThinkingLabel(activeSteps[activeSteps.length - 1]);
  }

  const lastMeaningfulStep = [...steps].reverse().find((step) => step.status !== 'pending');

  if (!lastMeaningfulStep) {
    return 'Agent X update';
  }

  if (lastMeaningfulStep.status === 'error') {
    return getToolStepDisplayLabel(lastMeaningfulStep);
  }

  const stageLabel = getStageLabel(lastMeaningfulStep.stage, lastMeaningfulStep.metadata);
  if (stageLabel) {
    return stageLabel;
  }

  if (lastMeaningfulStep.label) {
    return lastMeaningfulStep.label;
  }

  const outcomeLabel = getOutcomeLabel(lastMeaningfulStep.outcomeCode);
  return outcomeLabel ?? 'Completed';
}

export function buildAgentCardThemeStyle(card: Pick<AgentXRichCard, 'agentId'>): string {
  const theme = AGENT_THEMES[card.agentId];
  return [
    `--nxt1-color-primary: ${theme.accent}`,
    `--nxt1-color-primary-hover: ${theme.accent}`,
    `--nxt1-color-primary-active: ${theme.accent}`,
    `--nxt1-color-primary-subtle: ${theme.accentSoft}`,
    `--nxt1-color-warning: ${theme.accent}`,
    `--nxt1-color-border: ${theme.accentBorder}`,
    `--nxt1-color-surface-200: ${theme.surface}`,
    `--agent-card-accent: ${theme.accent}`,
    `--agent-card-border: ${theme.accentBorder}`,
    `--agent-card-surface: ${theme.surface}`,
  ].join('; ');
}
