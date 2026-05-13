const DELEGATED_TO_ROUTER_PREFIX = 'Delegated back to router:';
const BLOCKED_DEPENDENCY_PREFIX = 'Blocked by failed dependency:';
const COORDINATOR_HANDOFF_FAILURE =
  'Coordinator handoff failed. Router could not reassign this task.';
const MAX_GENERIC_NOTE_LENGTH = 160;
const RAW_DELEGATION_PATTERNS = [
  /^Agent\s+"[^"]+"\s+delegated:/i,
  /\[(?:Prior Work|Prior Artifacts) from [^\]]+\]/i,
] as const;

export function formatPlannerItemNote(note?: string | null): string | null {
  if (typeof note !== 'string') return null;

  const trimmed = note.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(DELEGATED_TO_ROUTER_PREFIX)) {
    return COORDINATOR_HANDOFF_FAILURE;
  }

  if (RAW_DELEGATION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return COORDINATOR_HANDOFF_FAILURE;
  }

  if (trimmed.startsWith(BLOCKED_DEPENDENCY_PREFIX)) {
    const dependencyId = collapseWhitespace(trimmed.slice(BLOCKED_DEPENDENCY_PREFIX.length).trim());
    return dependencyId
      ? `Blocked because step ${dependencyId} failed.`
      : 'Blocked by a failed step.';
  }

  const firstParagraph = trimmed.split(/\n\s*\n/, 1)[0] ?? trimmed;
  return truncate(collapseWhitespace(firstParagraph), MAX_GENERIC_NOTE_LENGTH);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
