function attachmentUrlComparisonKeys(url: string): readonly string[] {
  const trimmed = url.trim().replace(/[),.;!?]+$/g, '');
  if (!trimmed) return [];

  const keys = new Set<string>([trimmed]);
  const withoutPoster = trimmed.replace(/#poster=.*/i, '');
  if (withoutPoster) keys.add(withoutPoster);

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    keys.add(parsed.toString());
  } catch {
    // Raw string keys above still cover non-URL values.
  }

  return [...keys];
}

export function isUserAttachmentUrl(
  candidateUrl: string | null | undefined,
  urls: ReadonlySet<string>
): boolean {
  if (typeof candidateUrl !== 'string' || urls.size === 0) return false;
  const candidateKeys = attachmentUrlComparisonKeys(candidateUrl);
  if (candidateKeys.length === 0) return false;

  for (const userUrl of urls) {
    for (const key of attachmentUrlComparisonKeys(userUrl)) {
      if (candidateKeys.includes(key)) return true;
    }
  }

  return false;
}
