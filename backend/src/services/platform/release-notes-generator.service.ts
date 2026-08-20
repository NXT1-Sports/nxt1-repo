import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Firestore } from 'firebase-admin/firestore';
import type { SystemReleaseNote } from '@nxt1/core';

const execFileAsync = promisify(execFile);

const COLLECTION = 'SystemReleaseNotes';
const MAX_LOOKBACK_NOTES = 20;
const MAX_COMMIT_RECORDS = 80;
const MAX_CATEGORY_ITEMS = 4;
const RELEVANT_PATHS = ['apps', 'backend', 'packages', 'package.json', 'docs/RELEASE_NOTES.md'];
const MAIN_REF_CANDIDATES = ['origin/main', 'main'] as const;

type StoredReleaseNote = SystemReleaseNote & {
  readonly sourceCommitSha?: string;
  readonly sourceGeneratedAt?: string;
  readonly sourceCommitCount?: number;
  readonly sourceType?: 'weekly_git_cron';
};

type CommitEntry = {
  readonly sha: string;
  readonly subject: string;
  readonly files: readonly string[];
};

type MutableReleaseNoteCategories = {
  features: string[];
  enhancements: string[];
  fixes: string[];
};

type ReleaseThemeCategory = keyof SystemReleaseNote['categories'];

type ReleaseThemeDefinition = {
  readonly key: string;
  readonly category: ReleaseThemeCategory;
  readonly summaryTopic: string;
  readonly userVisible: boolean;
  readonly matcher: (entry: CommitEntry) => boolean;
  readonly phrase: (entry: CommitEntry) => string;
};

type ReleaseThemeGroup = {
  readonly key: string;
  readonly category: ReleaseThemeCategory;
  readonly summaryTopic: string;
  readonly userVisible: boolean;
  readonly phrase: string;
};

interface GenerateWeeklyReleaseNotesOptions {
  readonly force?: boolean;
}

export interface GenerateWeeklyReleaseNotesResult {
  readonly status: 'created' | 'skipped';
  readonly reason?:
    'no_new_version' | 'no_git_changes' | 'head_already_processed' | 'no_commit_subjects';
  readonly version: string;
  readonly latestPublishedVersion: string | null;
  readonly commitCount: number;
  readonly sourceCommitSha: string | null;
  readonly noteId?: string;
}

function isStableSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version.trim());
}

function toLowerFiles(files: readonly string[]): readonly string[] {
  return files.map((file) => file.toLowerCase());
}

function subjectIncludes(entry: CommitEntry, pattern: RegExp): boolean {
  return pattern.test(entry.subject.toLowerCase());
}

function filesInclude(entry: CommitEntry, fragment: string): boolean {
  const normalized = fragment.toLowerCase();
  return toLowerFiles(entry.files).some((file) => file.includes(normalized));
}

function listToSentence(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const RELEASE_THEME_DEFINITIONS: readonly ReleaseThemeDefinition[] = [
  {
    key: 'gamma-exports',
    category: 'features',
    summaryTopic: 'smoother exports',
    userVisible: true,
    matcher: (entry) =>
      subjectIncludes(entry, /gamma|export/) ||
      filesInclude(entry, 'gamma-client') ||
      filesInclude(entry, 'dynamic-export'),
    phrase: () =>
      'Exports now move through the new Gamma delivery flow for a cleaner, more reliable handoff.',
  },
  {
    key: 'agent-refresh',
    category: 'features',
    summaryTopic: 'fresher Agent X panels',
    userVisible: true,
    matcher: (entry) => subjectIncludes(entry, /background-refresh|background refresh/),
    phrase: () =>
      'Agent X panels now refresh in the background so information stays current while you keep working.',
  },
  {
    key: 'zip-uploads',
    category: 'features',
    summaryTopic: 'more reliable large uploads',
    userVisible: true,
    matcher: (entry) => subjectIncludes(entry, /zip file uploads|lazy-extraction|lazy extraction/),
    phrase: () =>
      'Large ZIP uploads now process more smoothly with better handling behind the scenes.',
  },
  {
    key: 'foundation-branding',
    category: 'enhancements',
    summaryTopic: 'marketing presentation updates',
    userVisible: false,
    matcher: (entry) => subjectIncludes(entry, /foundation 50 partner logos|partner logos/),
    phrase: () => 'Updated partner logo presentation across Foundation 50 web surfaces.',
  },
  {
    key: 'agent-job-uploads',
    category: 'fixes',
    summaryTopic: 'more dependable Agent X work',
    userVisible: true,
    matcher: (entry) =>
      subjectIncludes(entry, /spillover|large uploads|notes preservation/) ||
      filesInclude(entry, 'agent-media-lifecycle') ||
      filesInclude(entry, 'job.repository'),
    phrase: () =>
      'Large uploads and long-running Agent X tasks are now more reliable, with better preservation of in-progress notes.',
  },
  {
    key: 'usage-multiplier',
    category: 'fixes',
    summaryTopic: 'usage and billing coordination',
    userVisible: false,
    matcher: (entry) => subjectIncludes(entry, /usage multiplier|delegated coordinator/),
    phrase: () => 'Corrected delegated coordinator selection in usage multiplier processing.',
  },
  {
    key: 'marketing-automation',
    category: 'fixes',
    summaryTopic: 'marketing automation reliability',
    userVisible: false,
    matcher: (entry) =>
      subjectIncludes(entry, /marketing dispatch|b2b outbound automation/) ||
      filesInclude(entry, 'marketing-email-dispatch') ||
      filesInclude(entry, 'b2b-outbound-automation'),
    phrase: () => 'Stabilized B2B outbound automation and the marketing dispatch pipeline.',
  },
  {
    key: 'firecrawl-json',
    category: 'fixes',
    summaryTopic: 'web research integrations',
    userVisible: false,
    matcher: (entry) => subjectIncludes(entry, /firecrawl/) || filesInclude(entry, 'firecrawl'),
    phrase: () => 'Updated Firecrawl integrations to the supported JSON scrape workflow.',
  },
  {
    key: 'settings-access',
    category: 'fixes',
    summaryTopic: 'more reliable settings access',
    userVisible: true,
    matcher: (entry) =>
      subjectIncludes(entry, /protect settings route|email link/) ||
      filesInclude(entry, '/settings/'),
    phrase: () => 'Settings access and related email links are now more reliable.',
  },
  {
    key: 'video-thumbnails',
    category: 'fixes',
    summaryTopic: 'steadier media handling',
    userVisible: true,
    matcher: (entry) =>
      subjectIncludes(entry, /video thumbnail|thumbnail generation/) ||
      filesInclude(entry, 'video-thumbnail'),
    phrase: () =>
      'Video thumbnail generation now fails fast instead of hanging the browser during slow processing.',
  },
  {
    key: 'film-review-panel',
    category: 'fixes',
    summaryTopic: 'smoother film review',
    userVisible: true,
    matcher: (entry) => subjectIncludes(entry, /film review panel|chat interactions/),
    phrase: () =>
      'Film review stays smoother during chat interactions with fewer unnecessary rerenders.',
  },
  {
    key: 'thread-history',
    category: 'fixes',
    summaryTopic: 'more reliable thread history',
    userVisible: true,
    matcher: (entry) => subjectIncludes(entry, /resumed thread history|thread history/),
    phrase: () => 'Resumed Agent X threads now restore conversation history more reliably.',
  },
];

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }

  return 0;
}

async function resolveRepoRoot(): Promise<string> {
  const cwd = process.cwd();
  const candidates =
    basename(cwd) === 'backend' ? [resolve(cwd, '..'), cwd] : [cwd, resolve(cwd, '..')];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(resolve(candidate, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as { workspaces?: unknown; name?: unknown };
      if (Array.isArray(pkg.workspaces) || pkg.name === 'nxt1-workspace') {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return candidates[0] ?? cwd;
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
  return stdout.trim();
}

async function resolveMainRef(repoRoot: string): Promise<string> {
  for (const ref of MAIN_REF_CANDIDATES) {
    try {
      await runGit(repoRoot, ['rev-parse', '--verify', ref]);
      return ref;
    } catch {
      // Try the next ref candidate.
    }
  }

  throw new Error(`Unable to resolve a main branch ref from: ${MAIN_REF_CANDIDATES.join(', ')}`);
}

async function readWorkspaceVersionFromMain(repoRoot: string, mainRef: string): Promise<string> {
  const raw = await runGit(repoRoot, ['show', `${mainRef}:package.json`]);
  const pkg = JSON.parse(raw) as { version?: unknown };
  const version = typeof pkg.version === 'string' ? pkg.version.trim() : '';

  if (!isStableSemver(version)) {
    throw new Error(`Workspace version must be stable semver, received: ${version || 'empty'}`);
  }

  return version;
}

async function readLatestStablePublishedNote(db: Firestore): Promise<StoredReleaseNote | null> {
  const snapshot = await db
    .collection(COLLECTION)
    .orderBy('releaseDate', 'desc')
    .limit(MAX_LOOKBACK_NOTES)
    .get();

  return (
    snapshot.docs
      .map((doc) => doc.data() as StoredReleaseNote)
      .find((note) => note.isPublished && isStableSemver(note.version)) ?? null
  );
}

async function readHeadCommitSha(repoRoot: string, mainRef: string): Promise<string> {
  return runGit(repoRoot, ['rev-parse', mainRef]);
}

function parseReleaseVersionFromSubject(subject: string): string | null {
  const match = subject.match(/^chore\(release\):\s*v?(\d+\.\d+\.\d+)/i);
  return match?.[1] ?? null;
}

async function readPreviousReleaseBoundarySha(
  repoRoot: string,
  mainRef: string,
  currentVersion: string
): Promise<string | null> {
  const output = await runGit(repoRoot, [
    'log',
    '--no-merges',
    '--format=%H%x1f%s',
    mainRef,
    '--grep',
    '^chore(release): v',
    '-n',
    '30',
  ]);

  if (!output) return null;

  for (const line of output
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const [sha, subject] = line.split('\u001f');
    const releaseVersion = parseReleaseVersionFromSubject(subject ?? '');
    if (!sha || !releaseVersion) continue;
    if (compareVersions(releaseVersion, currentVersion) < 0) {
      return sha.trim();
    }
  }

  return null;
}

async function readCommitEntries(
  repoRoot: string,
  mainRef: string,
  sinceCommitSha: string | null
): Promise<readonly CommitEntry[]> {
  const args = ['log', '--no-merges', '--format=%H%x1f%s', '--name-only'];

  if (sinceCommitSha) {
    args.push(`${sinceCommitSha}..${mainRef}`);
  } else {
    args.push(mainRef);
    args.push('-n', String(MAX_COMMIT_RECORDS));
  }

  args.push('--', ...RELEVANT_PATHS);

  const output = await runGit(repoRoot, args);
  if (!output) return [];

  const entries: CommitEntry[] = [];
  let current: { sha: string; subject: string; files: string[] } | null = null;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.includes('\u001f')) {
      if (current && current.sha.length > 0 && current.subject.length > 0) {
        entries.push(current);
      }

      const [sha, subject] = line.split('\u001f');
      current = {
        sha: sha?.trim() ?? '',
        subject: subject?.trim() ?? '',
        files: [],
      };
      continue;
    }

    current?.files.push(line);
  }

  if (current && current.sha.length > 0 && current.subject.length > 0) {
    entries.push(current);
  }

  return entries;
}

function isLowSignalCommit(entry: CommitEntry): boolean {
  const lower = entry.subject.toLowerCase();

  if (/\[skip ci\]/.test(lower)) return true;
  if (/^chore\(release\):/.test(lower)) return true;
  if (/^chore: trigger functions build/.test(lower)) return true;
  if (/^release\b/.test(lower)) return true;
  if (/^v?\d+\.\d+\.\d+/.test(lower)) return true;
  if (/(test coverage|typecheck|lint|formatting|format|build only|ci only)/.test(lower))
    return true;

  const files = toLowerFiles(entry.files);
  if (files.length > 0 && files.every((file) => /(?:\.spec\.|\.test\.|__tests__)/.test(file))) {
    return true;
  }

  return false;
}

function normalizeSubject(subject: string): string {
  const withoutPrefix = subject.replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, '').trim();
  if (!withoutPrefix) return 'Platform updates';
  return withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
}

function classifySubject(subject: string): 'features' | 'enhancements' | 'fixes' {
  const lower = subject.toLowerCase();

  if (/(^|\b)(fix|bug|patch|resolve|correct|repair)(\b|:)/.test(lower)) {
    return 'fixes';
  }

  if (
    /(^|\b)(improve|optimization|optimize|performance|refactor|polish|cleanup|tune)(\b|:)/.test(
      lower
    )
  ) {
    return 'enhancements';
  }

  return 'features';
}

function dedupePush(target: string[], value: string): void {
  if (target.includes(value)) return;
  target.push(value);
}

function buildGenericPhrase(entry: CommitEntry): string {
  const subject = normalizeSubject(entry.subject);
  const lowerFiles = toLowerFiles(entry.files);

  if (lowerFiles.some((file) => file.startsWith('apps/web/'))) {
    return `${subject} in the web experience.`;
  }
  if (lowerFiles.some((file) => file.startsWith('apps/mobile/'))) {
    return `${subject} in the mobile app.`;
  }
  if (lowerFiles.some((file) => file.startsWith('backend/'))) {
    return `${subject} across backend workflows.`;
  }
  if (lowerFiles.some((file) => file.startsWith('packages/ui/'))) {
    return `${subject} in shared UI components.`;
  }

  return `${subject}.`;
}

function isUserFacingGenericEntry(entry: CommitEntry): boolean {
  const lower = entry.subject.toLowerCase();
  const lowerFiles = toLowerFiles(entry.files);

  if (
    /(pptxgenjs|angular 22|brokeractivity|safebrokeractivity|dependency|dependencies|deprecated tool|dispatch typecheck|usage multiplier)/.test(
      lower
    )
  ) {
    return false;
  }

  if (
    lowerFiles.some((file) =>
      /package\.json$|environment\.|document_generation_protocol|\.md$/i.test(file)
    )
  ) {
    return false;
  }

  return /(upload|export|panel|history|settings|thumbnail|review|agent x|thread|chat|video|profile|team|feed|message)/.test(
    lower
  );
}

function inferTheme(entry: CommitEntry): ReleaseThemeGroup {
  const definition = RELEASE_THEME_DEFINITIONS.find((candidate) => candidate.matcher(entry));
  if (definition) {
    return {
      key: definition.key,
      category: definition.category,
      summaryTopic: definition.summaryTopic,
      userVisible: definition.userVisible,
      phrase: definition.phrase(entry),
    };
  }

  return {
    key: `generic:${normalizeSubject(entry.subject).toLowerCase()}`,
    category: classifySubject(entry.subject),
    summaryTopic: 'platform improvements',
    userVisible: isUserFacingGenericEntry(entry),
    phrase: buildGenericPhrase(entry),
  };
}

function buildCategories(entries: readonly CommitEntry[]): {
  readonly categories: SystemReleaseNote['categories'];
  readonly themes: readonly ReleaseThemeGroup[];
} {
  const categories: MutableReleaseNoteCategories = {
    features: [],
    enhancements: [],
    fixes: [],
  };

  const themes: ReleaseThemeGroup[] = [];
  const seenThemes = new Set<string>();

  for (const entry of entries) {
    if (isLowSignalCommit(entry)) continue;

    const theme = inferTheme(entry);
    if (!theme.userVisible) continue;

    if (!seenThemes.has(theme.key)) {
      themes.push(theme);
      seenThemes.add(theme.key);
    }

    const bucket = categories[theme.category];
    if (bucket.length >= MAX_CATEGORY_ITEMS) continue;
    dedupePush(bucket, theme.phrase);
  }

  if (
    categories.features.length === 0 &&
    categories.enhancements.length === 0 &&
    categories.fixes.length === 0
  ) {
    for (const entry of entries
      .filter((candidate) => !isLowSignalCommit(candidate))
      .slice(0, MAX_CATEGORY_ITEMS)) {
      dedupePush(categories.features, buildGenericPhrase(entry));
    }
  }

  return { categories, themes };
}

function buildSummary(version: string, themes: readonly ReleaseThemeGroup[]): string {
  const topics = Array.from(new Set(themes.map((theme) => theme.summaryTopic))).slice(0, 3);

  if (topics.length === 0) {
    return `In v${version}, NXT1 delivers a focused set of product improvements.`;
  }

  return `In v${version}, NXT1 brings ${listToSentence(topics)}.`;
}

export async function generateWeeklyReleaseNotes(
  db: Firestore,
  options: GenerateWeeklyReleaseNotesOptions = {}
): Promise<GenerateWeeklyReleaseNotesResult> {
  const repoRoot = await resolveRepoRoot();
  const mainRef = await resolveMainRef(repoRoot);
  const version = await readWorkspaceVersionFromMain(repoRoot, mainRef);
  const latestPublished = await readLatestStablePublishedNote(db);
  const latestPublishedVersion = latestPublished?.version ?? null;
  const force = options.force === true;
  const previousReleaseBoundarySha = await readPreviousReleaseBoundarySha(
    repoRoot,
    mainRef,
    version
  );

  if (!force && latestPublishedVersion && compareVersions(version, latestPublishedVersion) <= 0) {
    return {
      status: 'skipped',
      reason: 'no_new_version',
      version,
      latestPublishedVersion,
      commitCount: 0,
      sourceCommitSha: latestPublished?.sourceCommitSha ?? null,
    };
  }

  const headCommitSha = await readHeadCommitSha(repoRoot, mainRef);
  if (!force && latestPublished?.sourceCommitSha === headCommitSha) {
    return {
      status: 'skipped',
      reason: 'head_already_processed',
      version,
      latestPublishedVersion,
      commitCount: 0,
      sourceCommitSha: headCommitSha,
    };
  }

  const commitSinceSha =
    previousReleaseBoundarySha ??
    (force && latestPublishedVersion === version
      ? null
      : (latestPublished?.sourceCommitSha ?? null));

  const commitEntries = await readCommitEntries(repoRoot, mainRef, commitSinceSha);
  if (commitEntries.length === 0) {
    return {
      status: 'skipped',
      reason: 'no_git_changes',
      version,
      latestPublishedVersion,
      commitCount: 0,
      sourceCommitSha: headCommitSha,
    };
  }

  const { categories, themes } = buildCategories(commitEntries);
  const totalItems =
    categories.features.length + categories.enhancements.length + categories.fixes.length;

  if (totalItems === 0) {
    return {
      status: 'skipped',
      reason: 'no_commit_subjects',
      version,
      latestPublishedVersion,
      commitCount: commitEntries.length,
      sourceCommitSha: headCommitSha,
    };
  }

  const timestamp = new Date().toISOString();
  const noteId = `v${version}`;
  const note: StoredReleaseNote = {
    id: noteId,
    version,
    title: 'NXT1 Platform Updates',
    summary: buildSummary(version, themes),
    releaseDate: timestamp,
    categories,
    ctaLabel: 'Got It',
    isPublished: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceCommitSha: headCommitSha,
    sourceGeneratedAt: timestamp,
    sourceCommitCount: commitEntries.length,
    sourceType: 'weekly_git_cron',
  };

  await db.collection(COLLECTION).doc(noteId).set(note, { merge: true });

  return {
    status: 'created',
    version,
    latestPublishedVersion,
    commitCount: commitEntries.length,
    sourceCommitSha: headCommitSha,
    noteId,
  };
}
