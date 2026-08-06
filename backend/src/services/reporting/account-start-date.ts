function getPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (typeof value === 'object' && value) {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') {
      const parsed = candidate.toDate();
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : undefined;

    if (typeof seconds === 'number') {
      const parsed = new Date(seconds * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return undefined;
}

function getLifecycleDate(record: Record<string, unknown>, path: string): Date | undefined {
  return coerceDate(getPath(record, path));
}

export function getReportingAccountStartDate(record: Record<string, unknown>): Date | undefined {
  return (
    coerceDate(record['createdAt']) ??
    getLifecycleDate(record, 'lifecycle.signup.notionDashboard.createdAt') ??
    getLifecycleDate(record, 'lifecycle.b2cUsers.accountStarted.createdAt')
  );
}
