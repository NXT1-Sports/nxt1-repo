type SportFamily = 'football' | 'basketball' | 'soccer' | 'baseball_softball' | 'other';

type QualityDisposition = 'accept' | 'review_required' | 'reject';

export interface PlaybookExtractionQualityCheck {
  readonly key: string;
  readonly actual: number;
  readonly target: number;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly passed: boolean;
}

export interface PlaybookExtractionQualityAssessment {
  readonly version: '2026.1';
  readonly sportFamily: SportFamily;
  readonly disposition: QualityDisposition;
  readonly score: number;
  readonly playCount: number;
  readonly checks: readonly PlaybookExtractionQualityCheck[];
  readonly summary: string;
}

interface CoverageMetrics {
  readonly hasName: number;
  readonly hasCategoryOrPlayType: number;
  readonly hasTacticalDescriptor: number;
  readonly hasFormation: number;
  readonly hasPersonnel: number;
  readonly hasConceptTags: number;
  readonly hasBreakdown: number;
}

interface ThresholdProfile {
  readonly hasCategoryOrPlayType: number;
  readonly hasTacticalDescriptor: number;
  readonly hasFormation: number;
  readonly hasPersonnel: number;
  readonly hasConceptTags: number;
  readonly hasBreakdown: number;
}

const VERSION = '2026.1' as const;

const PROFILE_BY_SPORT: Record<SportFamily, ThresholdProfile> = {
  football: {
    hasCategoryOrPlayType: 0.85,
    hasTacticalDescriptor: 0.9,
    hasFormation: 0.7,
    hasPersonnel: 0.7,
    hasConceptTags: 0.45,
    hasBreakdown: 0.6,
  },
  basketball: {
    hasCategoryOrPlayType: 0.75,
    hasTacticalDescriptor: 0.85,
    hasFormation: 0.45,
    hasPersonnel: 0.2,
    hasConceptTags: 0.45,
    hasBreakdown: 0.55,
  },
  soccer: {
    hasCategoryOrPlayType: 0.7,
    hasTacticalDescriptor: 0.85,
    hasFormation: 0.35,
    hasPersonnel: 0.15,
    hasConceptTags: 0.45,
    hasBreakdown: 0.55,
  },
  baseball_softball: {
    hasCategoryOrPlayType: 0.7,
    hasTacticalDescriptor: 0.8,
    hasFormation: 0.2,
    hasPersonnel: 0.1,
    hasConceptTags: 0.4,
    hasBreakdown: 0.5,
  },
  other: {
    hasCategoryOrPlayType: 0.7,
    hasTacticalDescriptor: 0.8,
    hasFormation: 0.2,
    hasPersonnel: 0.1,
    hasConceptTags: 0.35,
    hasBreakdown: 0.5,
  },
};

function normalizeSportFamily(sport: string): SportFamily {
  const normalized = sport.trim().toLowerCase();
  if (normalized.includes('football')) return 'football';
  if (normalized.includes('basketball')) return 'basketball';
  if (normalized.includes('soccer')) return 'soccer';
  if (normalized.includes('baseball') || normalized.includes('softball')) {
    return 'baseball_softball';
  }
  return 'other';
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => hasNonEmptyString(item));
}

function ratio(value: number, total: number): number {
  if (total <= 0) return 0;
  return Number((value / total).toFixed(4));
}

function safePercent(value: number): number {
  return Number((Math.max(0, Math.min(1, value)) * 100).toFixed(1));
}

function countCoverage(
  plays: readonly Record<string, unknown>[],
  predicate: (play: Record<string, unknown>) => boolean
): number {
  let hits = 0;
  for (const play of plays) {
    if (predicate(play)) hits += 1;
  }
  return hits;
}

function buildCoverageMetrics(plays: readonly Record<string, unknown>[]): CoverageMetrics {
  const total = plays.length;

  const nameHits = countCoverage(plays, (play) => hasNonEmptyString(play['name']));
  const categoryOrTypeHits = countCoverage(
    plays,
    (play) => hasNonEmptyString(play['category']) || hasNonEmptyString(play['playType'])
  );
  const tacticalDescriptorHits = countCoverage(
    plays,
    (play) =>
      hasNonEmptyString(play['formation']) ||
      hasNonEmptyString(play['personnel']) ||
      hasNonEmptyArray(play['conceptTags']) ||
      hasNonEmptyString(play['playBreakdown']) ||
      hasNonEmptyString(play['description']) ||
      hasNonEmptyArray(play['assignments'])
  );
  const formationHits = countCoverage(plays, (play) => hasNonEmptyString(play['formation']));
  const personnelHits = countCoverage(plays, (play) => hasNonEmptyString(play['personnel']));
  const conceptHits = countCoverage(plays, (play) => hasNonEmptyArray(play['conceptTags']));
  const breakdownHits = countCoverage(
    plays,
    (play) => hasNonEmptyString(play['playBreakdown']) || hasNonEmptyString(play['description'])
  );

  return {
    hasName: ratio(nameHits, total),
    hasCategoryOrPlayType: ratio(categoryOrTypeHits, total),
    hasTacticalDescriptor: ratio(tacticalDescriptorHits, total),
    hasFormation: ratio(formationHits, total),
    hasPersonnel: ratio(personnelHits, total),
    hasConceptTags: ratio(conceptHits, total),
    hasBreakdown: ratio(breakdownHits, total),
  };
}

function assessDisposition(
  sportFamily: SportFamily,
  coverage: CoverageMetrics,
  checks: readonly PlaybookExtractionQualityCheck[]
): QualityDisposition {
  const criticalFailed = checks.some((check) => check.severity === 'critical' && !check.passed);
  if (criticalFailed) return 'reject';

  // Defensive hard fail for severe under-structured payloads regardless of sport.
  if (coverage.hasName < 1 || coverage.hasTacticalDescriptor < 0.55) return 'reject';

  if (sportFamily === 'football' && (coverage.hasFormation < 0.4 || coverage.hasPersonnel < 0.4)) {
    return 'reject';
  }

  const warningFailed = checks.some((check) => check.severity === 'warning' && !check.passed);
  if (warningFailed) return 'review_required';

  return 'accept';
}

function buildScore(checks: readonly PlaybookExtractionQualityCheck[]): number {
  if (checks.length === 0) return 0;
  const totalWeight = checks.reduce((sum, check) => {
    if (check.severity === 'critical') return sum + 3;
    if (check.severity === 'warning') return sum + 2;
    return sum + 1;
  }, 0);

  const earnedWeight = checks.reduce((sum, check) => {
    const weight = check.severity === 'critical' ? 3 : check.severity === 'warning' ? 2 : 1;
    return check.passed ? sum + weight : sum;
  }, 0);

  if (totalWeight <= 0) return 0;
  return Number(((earnedWeight / totalWeight) * 100).toFixed(1));
}

export function assessPlaybookExtractionQuality(
  sport: string,
  plays: readonly Record<string, unknown>[]
): PlaybookExtractionQualityAssessment {
  const sportFamily = normalizeSportFamily(sport);
  const profile = PROFILE_BY_SPORT[sportFamily];

  if (plays.length === 0) {
    return {
      version: VERSION,
      sportFamily,
      disposition: 'reject',
      score: 0,
      playCount: 0,
      checks: [
        {
          key: 'hasName',
          actual: 0,
          target: 1,
          severity: 'critical',
          passed: false,
        },
      ],
      summary: 'Rejected: extraction returned zero valid plays.',
    };
  }

  const coverage = buildCoverageMetrics(plays);

  const checks: PlaybookExtractionQualityCheck[] = [
    {
      key: 'hasName',
      actual: coverage.hasName,
      target: 1,
      severity: 'critical',
      passed: coverage.hasName >= 1,
    },
    {
      key: 'hasCategoryOrPlayType',
      actual: coverage.hasCategoryOrPlayType,
      target: profile.hasCategoryOrPlayType,
      severity: 'warning',
      passed: coverage.hasCategoryOrPlayType >= profile.hasCategoryOrPlayType,
    },
    {
      key: 'hasTacticalDescriptor',
      actual: coverage.hasTacticalDescriptor,
      target: profile.hasTacticalDescriptor,
      severity: sportFamily === 'football' ? 'critical' : 'warning',
      passed: coverage.hasTacticalDescriptor >= profile.hasTacticalDescriptor,
    },
    {
      key: 'hasFormation',
      actual: coverage.hasFormation,
      target: profile.hasFormation,
      severity: sportFamily === 'football' ? 'critical' : 'warning',
      passed: coverage.hasFormation >= profile.hasFormation,
    },
    {
      key: 'hasPersonnel',
      actual: coverage.hasPersonnel,
      target: profile.hasPersonnel,
      severity: sportFamily === 'football' ? 'critical' : 'warning',
      passed: coverage.hasPersonnel >= profile.hasPersonnel,
    },
    {
      key: 'hasConceptTags',
      actual: coverage.hasConceptTags,
      target: profile.hasConceptTags,
      severity: 'info',
      passed: coverage.hasConceptTags >= profile.hasConceptTags,
    },
    {
      key: 'hasBreakdown',
      actual: coverage.hasBreakdown,
      target: profile.hasBreakdown,
      severity: 'warning',
      passed: coverage.hasBreakdown >= profile.hasBreakdown,
    },
  ];

  const disposition = assessDisposition(sportFamily, coverage, checks);
  const score = buildScore(checks);

  const failed = checks.filter((check) => !check.passed);
  const failedSummary = failed
    .map((check) => `${check.key} ${safePercent(check.actual)}% < ${safePercent(check.target)}%`)
    .join('; ');

  const summary =
    disposition === 'accept'
      ? `Accepted extraction quality (${score} score).`
      : disposition === 'review_required'
        ? `Review required (${score} score): ${failedSummary}`
        : `Rejected extraction quality (${score} score): ${failedSummary}`;

  return {
    version: VERSION,
    sportFamily,
    disposition,
    score,
    playCount: plays.length,
    checks,
    summary,
  };
}
