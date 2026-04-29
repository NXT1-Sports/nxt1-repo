export interface RunwayTaskDetails {
  readonly taskId: string | null;
  readonly status: string;
  readonly debugKeys: readonly string[];
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function extractRunwayTaskDetails(payload: unknown): RunwayTaskDetails {
  const result = asObject(payload);
  if (!result) {
    return {
      taskId: null,
      status: 'PENDING',
      debugKeys: [],
    };
  }

  const data = asObject(result['data']);
  const task = asObject(result['task']);

  const taskId =
    readString(result['taskId']) ??
    readString(result['id']) ??
    readString(result['uuid']) ??
    readString(data?.['taskId']) ??
    readString(data?.['id']) ??
    readString(data?.['uuid']) ??
    readString(task?.['taskId']) ??
    readString(task?.['id']) ??
    readString(task?.['uuid']) ??
    null;

  const status =
    readString(result['status']) ??
    readString(data?.['status']) ??
    readString(task?.['status']) ??
    'PENDING';

  const debugKeys = Array.from(
    new Set([
      ...Object.keys(result),
      ...(data ? Object.keys(data).map((key) => `data.${key}`) : []),
      ...(task ? Object.keys(task).map((key) => `task.${key}`) : []),
    ])
  ).sort();

  return {
    taskId,
    status,
    debugKeys,
  };
}
