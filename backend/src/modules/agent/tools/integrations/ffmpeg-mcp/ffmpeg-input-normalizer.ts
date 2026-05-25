interface NormalizeFfmpegToolInputOptions {
  readonly defaultOutputBase?: string;
  readonly mapOutputFormatToOutputPath?: boolean;
  readonly coerceStringFields?: readonly string[];
}

/**
 * Extract a plain URL from a markdown link/image token if the LLM passes
 * `[View Video](https://…)` or `![Generated Image](https://…)` instead of
 * the raw URL. Returns the original value unchanged when it is not wrapped.
 */
function extractUrlFromMarkdown(value: string): string {
  const trimmed = value.trim();
  // Matches both `[text](url)` and `![text](url)` (image links).
  const match = /^!?\[[^\]]*\]\((.+)\)$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function toStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? extractUrlFromMarkdown(entry.trim()) : ''))
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
            .map((entry) => (typeof entry === 'string' ? extractUrlFromMarkdown(entry.trim()) : ''))
            .filter((entry) => entry.length > 0);
          return normalized.length > 0 ? normalized : null;
        }
      } catch {
        // Fall through to comma-delimited parsing.
      }
    }

    const normalized = trimmed
      .split(',')
      .map((entry) => extractUrlFromMarkdown(entry.trim()))
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

export function normalizeFfmpegToolInput(
  input: Record<string, unknown>,
  options: NormalizeFfmpegToolInputOptions = {}
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input };

  // Strip markdown link wrappers from path/URL fields — the LLM sometimes passes
  // `[View Video](https://…)` instead of the raw URL when it reads back a video
  // that was rendered as a markdown link in the conversation history.
  if (typeof normalized['inputPath'] === 'string') {
    normalized['inputPath'] = extractUrlFromMarkdown(normalized['inputPath']);
  }

  if (typeof normalized['inputPath'] !== 'string' && typeof normalized['inputUrl'] === 'string') {
    normalized['inputPath'] = extractUrlFromMarkdown(normalized['inputUrl']);
  }

  if (!Array.isArray(normalized['inputPaths'])) {
    const inputPaths =
      toStringArray(normalized['inputPaths']) ?? toStringArray(normalized['inputUrls']);
    if (inputPaths) normalized['inputPaths'] = inputPaths;
  } else {
    // inputPaths is already an array — still strip any markdown link wrappers.
    normalized['inputPaths'] = (normalized['inputPaths'] as unknown[]).map((entry) =>
      typeof entry === 'string' ? extractUrlFromMarkdown(entry.trim()) : entry
    );
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
