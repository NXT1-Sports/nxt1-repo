export const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
export const TEAMS_COLLECTION = 'Teams';
const PLAY_BREAKDOWN_MAX_CHARS = 900;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stableHash(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizePlayBreakdown(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const firstParagraph = value
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)[0]
    ?.trim();

  if (!firstParagraph) return null;

  const normalized = firstParagraph.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  if (normalized.length <= PLAY_BREAKDOWN_MAX_CHARS) return normalized;
  return `${normalized.slice(0, PLAY_BREAKDOWN_MAX_CHARS).trimEnd()}...`;
}

export function createPlayKey(play: Record<string, unknown>): string {
  const series = slugify(normalizeToken(play['series']));
  const name = slugify(normalizeToken(play['name']));
  return `${series}:${name}`;
}

export function ensurePlayId(play: Record<string, unknown>, fallbackSeed: string): string {
  const existingPlayId = normalizeToken(play['playId']);
  if (existingPlayId) {
    play['playId'] = existingPlayId;
    return existingPlayId;
  }

  const sourcePlayId = normalizeToken(play['sourcePlayId']);
  if (sourcePlayId) {
    const nextId = `src_${slugify(sourcePlayId).slice(0, 64) || stableHash(sourcePlayId)}`;
    play['playId'] = nextId;
    return nextId;
  }

  const series = slugify(normalizeToken(play['series'])) || 'core';
  const name = slugify(normalizeToken(play['name'])) || 'play';
  const hash = stableHash(`${series}:${name}:${fallbackSeed}`);
  const nextId = `play_${series}_${name}_${hash}`.slice(0, 96);
  play['playId'] = nextId;
  return nextId;
}

export function findPlayIndexById(
  plays: readonly Record<string, unknown>[],
  playId: string
): number {
  const normalizedPlayId = playId.trim();
  if (!normalizedPlayId) return -1;
  return plays.findIndex(
    (play) => typeof play['playId'] === 'string' && play['playId'] === normalizedPlayId
  );
}

export function buildPlayIndexes(
  plays: readonly Record<string, unknown>[]
): Record<string, string[]> {
  const concepts = new Set<string>();
  const formations = new Set<string>();
  const personnel = new Set<string>();
  const categories = new Set<string>();

  for (const play of plays) {
    const formation = play['formation'];
    const pers = play['personnel'];
    const cat = play['category'];
    const tags = play['conceptTags'];
    if (typeof formation === 'string' && formation.trim()) formations.add(formation.trim());
    if (typeof pers === 'string' && pers.trim()) personnel.add(pers.trim());
    if (typeof cat === 'string' && cat.trim()) categories.add(cat.trim());
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === 'string' && t.trim()) concepts.add(t.trim());
      }
    }
  }

  return {
    conceptTagIndex: [...concepts].sort(),
    formationIndex: [...formations].sort(),
    personnelIndex: [...personnel].sort(),
    categoryIndex: [...categories].sort(),
  };
}
