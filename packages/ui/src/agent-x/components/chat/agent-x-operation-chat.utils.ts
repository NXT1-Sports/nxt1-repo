import type { OperationQuickAction } from './agent-x-operation-chat.types';

const COORDINATOR_ACTION_ID_SUFFIX = '_coordinator';

export function chunkOperationActions<T>(actions: readonly T[], size = 4): T[][] {
  if (size <= 0 || actions.length === 0) return [];

  const rows: T[][] = [];
  for (let index = 0; index < actions.length; index += size) {
    rows.push(actions.slice(index, index + size));
  }

  return rows;
}

export function resolveCoordinatorActionId(
  action: Pick<OperationQuickAction, 'id' | 'selectedAction'> | string
): string | null {
  if (typeof action !== 'string') {
    const selectedCoordinatorId = action.selectedAction?.coordinatorId?.trim();
    if (selectedCoordinatorId) {
      return selectedCoordinatorId;
    }
  }

  const actionId = typeof action === 'string' ? action : action.id;
  if (!actionId) return null;

  if (actionId.startsWith('coord-coord-')) {
    return actionId.slice('coord-'.length);
  }

  if (actionId.startsWith('coord-') || actionId.endsWith(COORDINATOR_ACTION_ID_SUFFIX)) {
    return actionId;
  }

  return null;
}

export function resolveCoordinatorChipId(
  action: Pick<OperationQuickAction, 'id' | 'selectedAction'> | string
): string | null {
  const coordinatorId = resolveCoordinatorActionId(action);
  if (!coordinatorId) return null;

  if (coordinatorId.startsWith('coord-')) {
    return coordinatorId;
  }

  return `coord-${coordinatorId.slice(0, -COORDINATOR_ACTION_ID_SUFFIX.length).replace(/_/g, '-')}`;
}

export function buildOperationChatInputPlaceholder(inputRecipientLabel?: string): string {
  const recipientLabel = inputRecipientLabel?.trim();
  return recipientLabel ? `Message ${recipientLabel}` : 'Message Agent X';
}

export function normalizeOperationChatMediaUrl(value: string): string {
  const trimmed = value.trim().replace(/[),.;!?]+$/g, '');
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (/^#t=\d+(?:\.\d+)?$/i.test(url.hash)) {
      url.hash = '';
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function collectOperationChatMediaUrlsFromText(content: string): Set<string> {
  const urls = new Set<string>();
  const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;

  for (const match of content.match(urlPattern) ?? []) {
    const normalized = normalizeOperationChatMediaUrl(match);
    if (normalized) urls.add(normalized);
  }

  return urls;
}

const DISTILLED_SECTION_TRANSITION_LINE_PATTERN =
  /^\s*(?:Identity|Academic|Sport|Team|Coach|Combine metrics|Season stats|Schedule|Recruiting activity|Career awards|Imported profile details)\s+(?:details\s+)?loaded; preparing [^.]+\.\s*$/i;

export function stripDistilledSectionTransitionLines(content: string): string {
  if (!content.trim()) return content;

  const lines = content.split(/\r?\n/);
  const filtered = lines.filter((line) => !DISTILLED_SECTION_TRANSITION_LINE_PATTERN.test(line));
  if (filtered.length === lines.length) return content;

  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toSentence(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildCoordinatorActionPrompt(params: {
  readonly coordinatorLabel: string;
  readonly coordinatorDescription?: string;
  readonly actionLabel: string;
  readonly actionDescription?: string;
  readonly surface: 'command' | 'scheduled';
}): string {
  const actionLabel = params.actionLabel.trim() || 'this action';
  const coordinatorLabel = params.coordinatorLabel.trim() || 'this coordinator';
  const detail = toSentence(params.actionDescription) || toSentence(params.coordinatorDescription);
  const opening =
    params.surface === 'scheduled'
      ? `Please handle ${actionLabel} with the ${coordinatorLabel} and frame it as a recurring workflow for me.`
      : `Please handle ${actionLabel} with the ${coordinatorLabel}.`;
  const closing =
    params.surface === 'scheduled'
      ? 'Give me the execution plan, timing, checkpoints, and follow-up actions I should run with.'
      : 'Give me the clearest deliverable, priorities, and next steps to act on immediately.';

  return [opening, detail, closing].filter((part) => part.length > 0).join(' ');
}
