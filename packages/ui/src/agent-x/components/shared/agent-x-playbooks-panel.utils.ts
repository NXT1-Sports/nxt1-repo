import type { PlaybookSituationFilter, TeamGamePlanDoc } from '@nxt1/core';
import type { GamePlan, PlaybookDetail, PlaybookPlay } from './agent-x-playbooks-panel.types';

export const INSTALL_STAGES = ['install', 'rep', 'game-ready'] as const;

export function buildFilteredCallsheetPlays(
  playbook: PlaybookDetail | null,
  filters: Record<string, string>,
  rankings: Map<string, { score: number; reasoning: string }>
): PlaybookPlay[] {
  if (!playbook?.plays) return [];

  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim().length > 0);

  const basePlays =
    activeFilters.length === 0
      ? [...playbook.plays]
      : playbook.plays.filter((play) => {
          const situations = (play.situations ?? []).map((entry) => entry.toLowerCase());
          const searchable = [
            ...(play.situations ?? []),
            ...(play.conceptTags ?? []),
            ...(play.tags ?? []),
            play.objective ?? '',
          ]
            .join(' ')
            .toLowerCase();

          return activeFilters.every(([, value]) => {
            const normalizedValue = value.trim().toLowerCase();
            if (!normalizedValue) return true;

            return (
              situations.includes(normalizedValue) ||
              situations.some((entry) => entry.includes(normalizedValue)) ||
              searchable.includes(normalizedValue)
            );
          });
        });

  return [...basePlays].sort((left, right) => {
    const leftName = (left.name ?? left.title ?? '').trim();
    const rightName = (right.name ?? right.title ?? '').trim();
    const leftAi = leftName ? (rankings.get(leftName)?.score ?? -1) : -1;
    const rightAi = rightName ? (rankings.get(rightName)?.score ?? -1) : -1;
    if (leftAi !== rightAi) return rightAi - leftAi;
    return (right.successRate ?? 0) - (left.successRate ?? 0);
  });
}

export function hasActiveCallsheetFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

export function buildCallsheetSituationText(
  filters: Record<string, string>,
  situationFilters: readonly PlaybookSituationFilter[]
): string {
  const activeFilters = Object.entries(filters)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value.length > 0);

  if (activeFilters.length === 0) return 'all situations';

  const labelByKey = new Map<string, string>(
    situationFilters.map((filter) => [filter.key, filter.label])
  );

  return activeFilters
    .map(([key, value]) => `${labelByKey.get(key) ?? key}: ${value}`)
    .join(' | ');
}

export function formatDateValue(value?: string): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isImageAssetUrl(url?: string): boolean {
  if (!url) return false;
  return /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);
}

export function resolveImageExtension(mimeType: string, sourceUrl: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';

  const urlMatch = sourceUrl.match(/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i);
  if (!urlMatch?.[1]) return 'png';
  return urlMatch[1].toLowerCase().replace('jpeg', 'jpg');
}

export function extractGamePlanNotes(gamePlan: TeamGamePlanDoc): string | undefined {
  if (
    typeof gamePlan.specialSituations === 'string' &&
    gamePlan.specialSituations.trim().length > 0
  ) {
    return gamePlan.specialSituations.trim();
  }

  if (!gamePlan.customSections?.length) return undefined;

  const notesSection = gamePlan.customSections.find(
    (section) =>
      section.key.toLowerCase().includes('note') || section.title.toLowerCase().includes('note')
  );
  const fallbackSection = notesSection ?? gamePlan.customSections[0];
  return fallbackSection?.content?.trim() || undefined;
}

export function mapGamePlanToUi(gamePlan: TeamGamePlanDoc): GamePlan {
  return {
    id: gamePlan.id,
    teamId: gamePlan.teamId,
    sport: gamePlan.sport,
    title: gamePlan.title,
    opponent: gamePlan.opponentName?.trim() || gamePlan.title,
    plays: (gamePlan.linkedPlays ?? []).map((play) => play.playName).filter((name) => !!name),
    notes: extractGamePlanNotes(gamePlan),
    createdAt: typeof gamePlan.createdAt === 'string' ? gamePlan.createdAt : undefined,
    updatedAt: typeof gamePlan.updatedAt === 'string' ? gamePlan.updatedAt : undefined,
  };
}

export function getStageDisplayNameValue(stage: (typeof INSTALL_STAGES)[number]): string {
  if (stage === 'install') return 'Teaching';
  if (stage === 'rep') return 'Repetition';
  return 'Game Ready';
}
