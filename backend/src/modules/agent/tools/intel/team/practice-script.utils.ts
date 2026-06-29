import { z } from 'zod';

export const TEAMS_COLLECTION = 'Teams';

export const PracticeScriptPeriodSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(1),
  clock: z.string().trim().min(1),
  reps: z.number().int().min(0).max(99),
  callType: z.string().trim().min(1),
  playName: z.string().trim().min(1),
  coachingPoint: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type PracticeScriptPeriod = {
  id: string;
  label: string;
  clock: string;
  reps: number;
  callType: string;
  playName: string;
  coachingPoint?: string;
  notes?: string;
};

export type PracticeScriptDoc = {
  id?: string;
  teamId: string;
  sourceDocumentId: string;
  playbookId: string;
  sport: string;
  title: string;
  focus: string;
  tempo: string;
  scriptDate?: string;
  opponent?: string;
  objectives?: readonly string[];
  periods?: readonly PracticeScriptPeriod[];
  notes?: string;
  archived?: boolean;
  updatedAt?: string;
  createdAt?: string;
};

export function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeObjectives(value: readonly string[] | undefined): string[] {
  return (value ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export function normalizePeriods(
  value: readonly z.infer<typeof PracticeScriptPeriodSchema>[]
): PracticeScriptPeriod[] {
  return value.map((period, index) => ({
    id: normalizeOptionalText(period.id) ?? `period_${index + 1}`,
    label: period.label.trim(),
    clock: period.clock.trim(),
    reps: Math.max(0, Math.min(99, Math.round(period.reps))),
    callType: period.callType.trim(),
    playName: period.playName.trim(),
    coachingPoint: normalizeOptionalText(period.coachingPoint),
    notes: normalizeOptionalText(period.notes),
  }));
}

export function buildPracticeScriptSummary(
  docId: string,
  data: PracticeScriptDoc
): {
  id: string;
  teamId: string;
  sourceDocumentId: string;
  playbookId: string;
  sport: string;
  title: string;
  focus: string;
  tempo: string;
  scriptDate?: string;
  opponent?: string;
  totalPeriods: number;
  totalReps: number;
  archived: boolean;
  updatedAt?: string;
  createdAt?: string;
} {
  const periods = data.periods ?? [];
  const totalReps = periods.reduce((sum, period) => sum + period.reps, 0);

  return {
    id: docId,
    teamId: data.teamId,
    sourceDocumentId: data.sourceDocumentId,
    playbookId: data.playbookId,
    sport: data.sport,
    title: data.title,
    focus: data.focus,
    tempo: data.tempo,
    scriptDate: data.scriptDate,
    opponent: data.opponent,
    totalPeriods: periods.length,
    totalReps,
    archived: data.archived === true,
    updatedAt: data.updatedAt,
    createdAt: data.createdAt,
  };
}

function normalizePlayName(play: Record<string, unknown>, fallbackIndex: number): string {
  const name = normalizeOptionalText(typeof play['name'] === 'string' ? play['name'] : undefined);
  if (name) return name;

  const title = normalizeOptionalText(
    typeof play['title'] === 'string' ? play['title'] : undefined
  );
  if (title) return title;

  return `Play ${fallbackIndex + 1}`;
}

export function buildFallbackPracticeScript(
  playbook: Record<string, unknown>,
  focus: string
): {
  title: string;
  focus: string;
  tempo: string;
  objectives: string[];
  periods: PracticeScriptPeriod[];
  notes: string;
} {
  const plays = Array.isArray(playbook['plays'])
    ? (playbook['plays'] as Record<string, unknown>[])
    : [];
  const selected = plays.slice(0, 12);

  const periods = selected.map((play, index) => {
    const coachingPoint =
      Array.isArray(play['coachingPoints']) && typeof play['coachingPoints'][0] === 'string'
        ? normalizeOptionalText(play['coachingPoints'][0])
        : undefined;

    return {
      id: `period_${index + 1}`,
      label: `Period ${index + 1}`,
      clock: `${String(7 + (index % 4)).padStart(2, '0')}:00`,
      reps: index < 4 ? 6 : 4,
      callType: index < 4 ? 'Install' : index < 8 ? 'Team' : 'Situational',
      playName: normalizePlayName(play, index),
      coachingPoint: coachingPoint ?? 'Execute fundamentals with tempo and communication.',
      notes: index % 3 === 0 ? 'Coach script emphasis and substitutions.' : undefined,
    };
  });

  return {
    title: `${normalizeOptionalText(typeof playbook['name'] === 'string' ? playbook['name'] : undefined) ?? 'Practice'} Script`,
    focus: focus.trim() || 'Weekly install and execution',
    tempo: 'Game Tempo',
    objectives: [
      'Script high-leverage reps for core calls.',
      'Reinforce communication and assignment integrity.',
      'Finish with situational execution under pressure.',
    ],
    periods:
      periods.length > 0
        ? periods
        : [
            {
              id: 'period_1',
              label: 'Period 1',
              clock: '10:00',
              reps: 8,
              callType: 'Install',
              playName: 'Base Install',
              coachingPoint: 'Set baseline alignments and communication.',
            },
          ],
    notes:
      'Coach script generated from current playbook inventory. Adjust personnel and tempo per practice calendar.',
  };
}
