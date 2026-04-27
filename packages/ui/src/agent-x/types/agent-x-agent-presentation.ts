import type {
  AgentIdentifier,
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

const VALID_AGENT_IDENTIFIERS: ReadonlySet<AgentIdentifier> = new Set(
  Object.keys(AGENT_LABELS) as AgentIdentifier[]
);

export function titleCaseToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
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

export function getThinkingLabel(step?: AgentXToolStep | null): string {
  if (!step) return '';

  if (step.label.trim().length > 0) {
    return ensureEllipsis(step.label);
  }

  return '';
}

export function getToolStepContextLabel(step: AgentXToolStep): string | null {
  return step.agentId ? getAgentDisplayName(step.agentId) : null;
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
    return 'Update';
  }

  if (lastMeaningfulStep.label.trim().length > 0) {
    return lastMeaningfulStep.label;
  }

  return 'Update';
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
