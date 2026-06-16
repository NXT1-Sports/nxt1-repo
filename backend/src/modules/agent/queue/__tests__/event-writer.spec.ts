import { describe, expect, it, vi } from 'vitest';
import { DebouncedEventWriter } from '../event-writer.js';

describe('DebouncedEventWriter', () => {
  it('leases event seq numbers and reuses the lease across immediate writes', async () => {
    const repo = {
      allocateEventSeqRange: vi.fn().mockResolvedValue(40),
      writeJobEvent: vi.fn().mockResolvedValue(undefined),
    };

    const writer = new DebouncedEventWriter(repo as never, 'op-1', 'user-1', 300);

    writer.emit({ type: 'step_active', agentId: 'router', message: 'Routing...' });
    writer.emit({ type: 'progress_stage', agentId: 'router', message: 'Dispatching...' });

    await writer.flush();

    expect(repo.allocateEventSeqRange).toHaveBeenCalledTimes(1);
    expect(repo.allocateEventSeqRange).toHaveBeenCalledWith('op-1', 32);
    expect(repo.writeJobEvent).toHaveBeenNthCalledWith(
      1,
      'op-1',
      expect.objectContaining({ seq: 40, type: 'step_active', message: 'Routing...' })
    );
    expect(repo.writeJobEvent).toHaveBeenNthCalledWith(
      2,
      'op-1',
      expect.objectContaining({ seq: 41, type: 'progress_stage', message: 'Dispatching...' })
    );
  });
});
