import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  getTeamFilmReviewSportTagDefinitions,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewPlayTagValue,
  type TeamFilmReviewSportTagDefinition,
} from '@nxt1/core';

export interface HudlBreakdownParseInput {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sport?: string | null;
}

export interface HudlBreakdownParseResult {
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
  readonly sheetName?: string;
  readonly rowCount: number;
  readonly warnings: readonly string[];
}

type HeaderField = 'number' | 'label' | 'startSec' | 'endSec' | 'durationSec';

type HeaderMatch = {
  readonly index: number;
  readonly header: string;
};

const MAX_BREAKDOWN_ROWS = 2_000;
const DEFAULT_PLAY_DURATION_SEC = 8;
const LEGACY_EXCEL_BINARY_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const CORE_FIELD_ALIASES: Record<HeaderField, readonly string[]> = {
  number: ['#', 'no', 'number', 'play', 'play #', 'play no', 'play number', 'clip', 'clip #'],
  label: [
    'label',
    'title',
    'description',
    'play name',
    'play call',
    'play type',
    'off play',
    'offensive play',
    'action',
  ],
  startSec: [
    'start',
    'start time',
    'start sec',
    'start seconds',
    'clip start',
    'video start',
    'timeline start',
    'in',
    'mark in',
  ],
  endSec: [
    'end',
    'end time',
    'end sec',
    'end seconds',
    'clip end',
    'video end',
    'timeline end',
    'out',
    'mark out',
  ],
  durationSec: ['duration', 'length', 'clip length', 'seconds', 'duration sec', 'duration seconds'],
};

const TAG_FIELD_ALIASES: Record<string, readonly string[]> = {
  odk: ['odk', 'o/d/k', 'off def kick', 'offense defense kicking'],
  down: ['dn', 'down'],
  distance: ['dist', 'distance', 'yds to go', 'yards to go'],
  yardLine: ['yard ln', 'yard line', 'field position', 'spot'],
  hash: ['hash'],
  offForm: ['off form', 'offensive formation', 'formation'],
  offStr: ['off str', 'offensive strength', 'strength'],
  backfield: ['backfield', 'back field'],
  offPlay: ['off play', 'offensive play', 'play call', 'play'],
  playType: ['play type', 'type'],
  playDir: ['play dir', 'play direction', 'direction'],
  result: ['result', 'outcome'],
  gainLoss: ['gn/ls', 'gain/loss', 'gain loss', 'gain', 'yards', 'yardage'],
  eff: ['eff', 'efficient', 'efficiency'],
  defFront: ['def front', 'defensive front', 'front'],
  defStr: ['def str', 'defensive strength'],
  blitz: ['blitz', 'pressure'],
  coverage: ['coverage', 'cov'],
  quarter: ['qtr', 'quarter'],
  period: ['period', 'prd'],
  clock: ['clock', 'game clock'],
  possession: ['poss', 'possession'],
  transition: ['trans', 'transition'],
  setName: ['set', 'set name'],
  action: ['action'],
  shotType: ['shot', 'shot type'],
  points: ['pts', 'points'],
  inning: ['inn', 'inning'],
  half: ['half', 'top/bot', 'top bottom'],
  outs: ['outs'],
  count: ['count'],
  runners: ['runners', 'base runners'],
  pitchType: ['pitch', 'pitch type'],
  location: ['location', 'loc'],
  battedBall: ['contact', 'batted ball'],
  rbi: ['rbi'],
  minute: ['min', 'minute'],
  phase: ['phase'],
  zone: ['zone'],
  channel: ['channel'],
  service: ['service'],
  chanceQuality: ['chance', 'chance quality'],
  formation: ['form', 'formation'],
  clearRide: ['clr/ride', 'clear ride'],
  set: ['set'],
  rotation: ['rot', 'rotation'],
  serveType: ['serve', 'serve type'],
  attackZone: ['att zone', 'attack zone'],
  rallyLength: ['rally', 'rally length'],
  position: ['position'],
  scoreChange: ['pts', 'score change'],
  manSituation: ['man', 'man situation'],
  advantage: ['adv', 'advantage'],
};

function normalizeHeader(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeHeaderKey(input: string): string {
  return normalizeHeader(input).replace(/\s+/g, '');
}

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value))
    return value
      .map((entry) => cellValueToString(entry))
      .join(' ')
      .trim();

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record['text'] !== undefined) return cellValueToString(record['text']);
    if (record['result'] !== undefined) return cellValueToString(record['result']);
    if (Array.isArray(record['richText'])) {
      return record['richText']
        .map((entry) => cellValueToString(entry))
        .join(' ')
        .trim();
    }
  }

  return String(value).trim();
}

function parseSecondsValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value > 0 && value < 1) return Math.round(value * 86_400 * 100) / 100;
    return Math.max(0, Math.round(value * 100) / 100);
  }

  if (value instanceof Date) {
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  }

  const raw = cellValueToString(value)
    .replace(/\b(seconds?|secs?)\b/gi, '')
    .trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric * 100) / 100);

  const timeMatch = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
  if (!timeMatch) return null;

  const hours = Number(timeMatch[1] ?? 0);
  const minutes = Number(timeMatch[2] ?? 0);
  const seconds = Number(timeMatch[3] ?? 0);
  const fractional = Number(`0.${timeMatch[4] ?? '0'}`);
  if (![hours, minutes, seconds, fractional].every(Number.isFinite)) return null;
  return Math.round((hours * 3600 + minutes * 60 + seconds + fractional) * 100) / 100;
}

function findColumn(headers: readonly string[], aliases: readonly string[]): HeaderMatch | null {
  const normalizedAliases = aliases.map(normalizeHeaderKey).filter(Boolean);
  for (const alias of normalizedAliases) {
    const exactIndex = headers.findIndex((header) => normalizeHeaderKey(header) === alias);
    if (exactIndex >= 0) return { index: exactIndex, header: headers[exactIndex] ?? '' };
  }

  for (const alias of normalizedAliases) {
    const fuzzyIndex = headers.findIndex((header) => {
      const key = normalizeHeaderKey(header);
      return key.length >= 3 && alias.length >= 3 && key.includes(alias);
    });
    if (fuzzyIndex >= 0) return { index: fuzzyIndex, header: headers[fuzzyIndex] ?? '' };
  }

  return null;
}

function buildTagColumnMap(
  headers: readonly string[],
  sport?: string | null
): ReadonlyMap<string, HeaderMatch> {
  const columns = new Map<string, HeaderMatch>();
  const definitions = getTeamFilmReviewSportTagDefinitions(sport);

  for (const definition of definitions) {
    const aliases = [definition.id, definition.label, ...(TAG_FIELD_ALIASES[definition.id] ?? [])];
    const match = findColumn(headers, aliases);
    if (match) columns.set(definition.id, match);
  }

  return columns;
}

function coerceTagValue(
  value: unknown,
  definition: TeamFilmReviewSportTagDefinition
): TeamFilmReviewPlayTagValue | undefined {
  const text = cellValueToString(value);
  if (!text) return undefined;

  if (definition.valueType === 'number') {
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const numeric = Number(match[0]);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  if (definition.valueType === 'boolean') {
    const normalized = text.toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(normalized)) return true;
    if (['no', 'n', 'false', '0'].includes(normalized)) return false;
    return text;
  }

  return text;
}

function rowHasContent(row: readonly unknown[]): boolean {
  return row.some((cell) => cellValueToString(cell).length > 0);
}

function hasBufferSignature(buffer: Buffer, signature: Buffer): boolean {
  return (
    buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte)
  );
}

function stripUtf8Bom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function decodeHtmlEntities(input: string): string {
  const decodeCodePoint = (codePoint: number): string => {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '';
    return String.fromCodePoint(codePoint);
  };

  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => {
      const parsed = Number(codePoint);
      return decodeCodePoint(parsed);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => {
      const parsed = Number.parseInt(codePoint, 16);
      return decodeCodePoint(parsed);
    });
}

function stripHtmlTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtmlTableRows(text: string): readonly (readonly unknown[])[] | null {
  if (!text.slice(0, 10_000).toLowerCase().includes('<table')) return null;

  const rows: unknown[][] = [];
  const rowMatches = text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1] ?? '';
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
      stripHtmlTags(cellMatch[1] ?? '')
    );
    if (cells.some((cell) => cell.length > 0)) {
      rows.push(cells);
    }
    if (rows.length >= MAX_BREAKDOWN_ROWS + 20) break;
  }

  return rows.length > 0 ? rows : null;
}

function detectDelimitedTextDelimiter(text: string): string | readonly string[] {
  const sampleLines = stripUtf8Bom(text)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 20);
  const delimiters = [',', '\t', ';', '|'] as const;
  const scores = delimiters.map((delimiter) => ({
    delimiter,
    score: sampleLines.reduce((sum, line) => sum + line.split(delimiter).length - 1, 0),
  }));
  const best = scores.reduce((winner, candidate) =>
    candidate.score > winner.score ? candidate : winner
  );

  if (best.score > 0) return best.delimiter;
  // Let csv-parse try common delimiters when a one-line export has no obvious separator.
  return delimiters;
}

function parseDelimitedTextRows(buffer: Buffer): readonly (readonly unknown[])[] {
  const text = stripUtf8Bom(buffer.toString('utf-8'));
  const htmlRows = parseHtmlTableRows(text);
  if (htmlRows) return htmlRows;

  return parseCsv(text, {
    delimiter: detectDelimitedTextDelimiter(text),
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
    trim: true,
  }) as readonly (readonly unknown[])[];
}

function scoreHeaderRow(row: readonly unknown[], sport?: string | null): number {
  const headers = row.map(cellValueToString);
  let score = 0;

  for (const aliases of Object.values(CORE_FIELD_ALIASES)) {
    if (findColumn(headers, aliases)) score += 4;
  }

  const definitions = getTeamFilmReviewSportTagDefinitions(sport);
  for (const definition of definitions) {
    const aliases = [definition.id, definition.label, ...(TAG_FIELD_ALIASES[definition.id] ?? [])];
    if (findColumn(headers, aliases)) score += 2;
  }

  return score + Math.min(headers.filter(Boolean).length, 8);
}

function findHeaderRowIndex(rows: readonly (readonly unknown[])[], sport?: string | null): number {
  const scanLimit = Math.min(rows.length, 20);
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < scanLimit; index += 1) {
    const row = rows[index] ?? [];
    if (!rowHasContent(row)) continue;
    const score = scoreHeaderRow(row, sport);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function getCell(row: readonly unknown[], match: HeaderMatch | null): unknown {
  return match ? row[match.index] : undefined;
}

function buildPlayLabel(
  row: readonly unknown[],
  labelMatch: HeaderMatch | null,
  number: number,
  tags: Readonly<Record<string, TeamFilmReviewPlayTagValue>>
): string {
  const explicitLabel = cellValueToString(getCell(row, labelMatch));
  if (explicitLabel) return explicitLabel;

  const parts = [tags['offPlay'], tags['playType'], tags['action'], tags['result']]
    .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
    .filter((value) => value.length > 0);

  return parts.length > 0 ? parts.join(' - ') : `Play ${number}`;
}

function buildPlayId(number: number, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `hudl-play-${number}${slug ? `-${slug}` : ''}`;
}

function extractXlsxRows(worksheet: ExcelJS.Worksheet): readonly (readonly unknown[])[] {
  const rows: unknown[][] = [];
  const maxColumnCount = Math.max(worksheet.columnCount, 1);
  const maxRowCount = Math.min(worksheet.rowCount, MAX_BREAKDOWN_ROWS + 20);

  for (let rowNumber = 1; rowNumber <= maxRowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const row: unknown[] = [];
    for (let columnNumber = 1; columnNumber <= maxColumnCount; columnNumber += 1) {
      row.push(worksheetRow.getCell(columnNumber).value);
    }
    rows.push(row);
  }

  return rows;
}

export function parseHudlBreakdownRows(
  rows: readonly (readonly unknown[])[],
  sport?: string | null
): HudlBreakdownParseResult {
  if (!rows.length) {
    return { timeline: [], rowCount: 0, warnings: ['The uploaded breakdown sheet is empty.'] };
  }

  const headerIndex = findHeaderRowIndex(rows, sport);
  const headers = (rows[headerIndex] ?? []).map(cellValueToString);
  const numberMatch = findColumn(headers, CORE_FIELD_ALIASES.number);
  const labelMatch = findColumn(headers, CORE_FIELD_ALIASES.label);
  const startMatch = findColumn(headers, CORE_FIELD_ALIASES.startSec);
  const endMatch = findColumn(headers, CORE_FIELD_ALIASES.endSec);
  const durationMatch = findColumn(headers, CORE_FIELD_ALIASES.durationSec);
  const tagColumns = buildTagColumnMap(headers, sport);
  const tagDefinitions = getTeamFilmReviewSportTagDefinitions(sport);
  const warnings: string[] = [];
  const timeline: TeamFilmReviewPlaySegment[] = [];
  let cursorSec = 0;

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter(rowHasContent)
    .slice(0, MAX_BREAKDOWN_ROWS);

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index] ?? [];
    const parsedNumber = Number(
      cellValueToString(getCell(row, numberMatch)).replace(/[^0-9.-]+/g, '')
    );
    const number =
      Number.isFinite(parsedNumber) && parsedNumber > 0 ? Math.floor(parsedNumber) : index + 1;
    const tags: Record<string, TeamFilmReviewPlayTagValue> = {};

    for (const definition of tagDefinitions) {
      const match = tagColumns.get(definition.id) ?? null;
      const tagValue = coerceTagValue(getCell(row, match), definition);
      if (tagValue !== undefined) tags[definition.id] = tagValue;
    }

    const label = buildPlayLabel(row, labelMatch, number, tags);
    const durationSec = parseSecondsValue(getCell(row, durationMatch)) ?? DEFAULT_PLAY_DURATION_SEC;
    const parsedStartSec = parseSecondsValue(getCell(row, startMatch));
    const parsedEndSec = parseSecondsValue(getCell(row, endMatch));
    const usedFallbackTiming = parsedStartSec === null && parsedEndSec === null;
    const startSec = parsedStartSec ?? cursorSec;
    let endSec = parsedEndSec ?? startSec + Math.max(durationSec, 1);

    if (endSec <= startSec) {
      endSec = startSec + Math.max(durationSec, 1);
    }

    cursorSec = endSec;

    timeline.push({
      id: buildPlayId(number, label),
      number,
      label,
      startSec,
      endSec,
      confidence: usedFallbackTiming ? 0.55 : 0.9,
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
    });
  }

  if (!startMatch && !endMatch) {
    warnings.push(
      'No explicit video start/end columns were found; play timing was estimated from row order.'
    );
  }

  return {
    timeline,
    rowCount: dataRows.length,
    warnings,
  };
}

function isCsvLikeFile(fileName: string, mimeType: string): boolean {
  const normalizedName = fileName.toLowerCase();
  return (
    mimeType === 'text/csv' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/tab-separated-values' ||
    mimeType === 'application/vnd.ms-excel' ||
    normalizedName.endsWith('.csv') ||
    normalizedName.endsWith('.tsv') ||
    normalizedName.endsWith('.txt') ||
    normalizedName.endsWith('.xls')
  );
}

export async function parseHudlBreakdownBuffer(
  input: HudlBreakdownParseInput
): Promise<HudlBreakdownParseResult> {
  const normalizedFileName = input.fileName.toLowerCase();

  if (normalizedFileName.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(input.buffer as unknown as ExcelJS.Buffer);
    const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
    if (!worksheet) {
      return { timeline: [], rowCount: 0, warnings: ['The uploaded workbook has no rows.'] };
    }

    const result = parseHudlBreakdownRows(extractXlsxRows(worksheet), input.sport);
    return { ...result, sheetName: worksheet.name };
  }

  if (isCsvLikeFile(input.fileName, input.mimeType)) {
    if (hasBufferSignature(input.buffer, LEGACY_EXCEL_BINARY_SIGNATURE)) {
      throw new Error(
        'Legacy binary .xls breakdown files are not supported. Export the Hudl breakdown as CSV, tab-delimited .xls, or .xlsx.'
      );
    }

    const records = parseDelimitedTextRows(input.buffer);
    return parseHudlBreakdownRows(records, input.sport);
  }

  throw new Error(
    'Hudl breakdown imports support .xlsx, CSV, TSV, and text-based Hudl .xls files.'
  );
}
