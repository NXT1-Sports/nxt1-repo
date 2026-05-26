interface NormalizeFfmpegToolInputOptions {
  readonly defaultOutputBase?: string;
  readonly mapOutputFormatToOutputPath?: boolean;
  readonly coerceStringFields?: readonly string[];
}

function toStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry) => entry.length > 0);
          return normalized.length > 0 ? normalized : null;
        }
      } catch {
        // Fall through to comma-delimited parsing.
      }
    }

    const normalized = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

function coerceFieldToString(target: Record<string, unknown>, fieldName: string): void {
  const value = target[fieldName];
  if (value === null || value === undefined) return;
  if (typeof value === 'number' || typeof value === 'bigint') {
    target[fieldName] = String(value);
  }
}

function normalizeBooleanAlias(target: Record<string, unknown>, canonical: string): void {
  const aliases = [canonical, canonical.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)];
  for (const alias of aliases) {
    const value = target[alias];
    if (value === undefined || value === null) continue;
    target[canonical] = value;
    return;
  }
}

function normalizeNumberAlias(target: Record<string, unknown>, canonical: string): void {
  const aliases = [canonical, canonical.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)];
  for (const alias of aliases) {
    const value = target[alias];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number') {
      target[canonical] = value;
      return;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        target[canonical] = parsed;
        return;
      }
    }
  }
}

export function normalizeFfmpegToolInput(
  input: Record<string, unknown>,
  options: NormalizeFfmpegToolInputOptions = {}
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input };

  if (typeof normalized['inputPath'] !== 'string' && typeof normalized['inputUrl'] === 'string') {
    normalized['inputPath'] = normalized['inputUrl'];
  }

  if (!Array.isArray(normalized['inputPaths'])) {
    const inputPaths =
      toStringArray(normalized['inputPaths']) ?? toStringArray(normalized['inputUrls']);
    if (inputPaths) normalized['inputPaths'] = inputPaths;
  }

  if (
    typeof normalized['subtitlePath'] !== 'string' &&
    typeof normalized['subtitlesUrl'] === 'string'
  ) {
    normalized['subtitlePath'] = normalized['subtitlesUrl'];
  }

  if (typeof normalized['time'] !== 'string' && normalized['timestamp'] !== undefined) {
    normalized['time'] = normalized['timestamp'];
  }

  if (
    typeof normalized['extraArgs'] !== 'string' &&
    typeof normalized['customFlags'] === 'string'
  ) {
    normalized['extraArgs'] = normalized['customFlags'];
  }

  normalizeBooleanAlias(normalized, 'addSilentAudio');
  normalizeNumberAlias(normalized, 'maxIntroSeconds');

  if (options.mapOutputFormatToOutputPath && typeof normalized['outputPath'] !== 'string') {
    const outputFormat = normalized['outputFormat'];
    if (typeof outputFormat === 'string' && outputFormat.trim().length > 0) {
      const cleaned = outputFormat.trim().replace(/^\./, '');
      if (cleaned.length > 0) {
        const baseName = options.defaultOutputBase ?? 'output';
        normalized['outputPath'] = `${baseName}.${cleaned}`;
      }
    }
  }

  if (options.coerceStringFields) {
    for (const fieldName of options.coerceStringFields) {
      coerceFieldToString(normalized, fieldName);
    }
  }

  return normalized;
}
