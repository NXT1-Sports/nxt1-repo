import { describe, expect, it } from 'vitest';

import { extractRunwayTaskDetails } from '../runway-task-result.util.js';

describe('extractRunwayTaskDetails', () => {
  it('extracts taskId from top-level taskId field', () => {
    const result = extractRunwayTaskDetails({
      taskId: 'task-123',
      status: 'RUNNING',
    });

    expect(result.taskId).toBe('task-123');
    expect(result.status).toBe('RUNNING');
    expect(result.debugKeys).toEqual(['status', 'taskId']);
  });

  it('extracts taskId from nested data payload', () => {
    const result = extractRunwayTaskDetails({
      status: 'PENDING',
      data: {
        id: 'task-456',
      },
    });

    expect(result.taskId).toBe('task-456');
    expect(result.status).toBe('PENDING');
    expect(result.debugKeys).toContain('data.id');
  });

  it('falls back to nested task payload', () => {
    const result = extractRunwayTaskDetails({
      message: 'queued',
      task: {
        uuid: 'task-789',
        status: 'SUCCEEDED',
      },
    });

    expect(result.taskId).toBe('task-789');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.debugKeys).toContain('task.uuid');
  });

  it('returns null taskId when payload has no supported identifier field', () => {
    const result = extractRunwayTaskDetails({
      message: 'accepted',
      status: 'PENDING',
    });

    expect(result.taskId).toBeNull();
    expect(result.status).toBe('PENDING');
    expect(result.debugKeys).toEqual(['message', 'status']);
  });
});
