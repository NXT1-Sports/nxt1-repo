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

  it('does not strip trailing partial signed storage URLs from live deltas', () => {
    const repo = {
      allocateEventSeqRange: vi.fn().mockResolvedValue(1),
      writeJobEvent: vi.fn().mockResolvedValue(undefined),
    };
    const onLiveEvent = vi.fn();
    const writer = new DebouncedEventWriter(repo as never, 'op-1', 'user-1', 300, {
      onLiveEvent,
    });

    writer.emit({
      type: 'delta',
      agentId: 'router',
      text: '![Weekly Lead Volume](https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/abc123xyz/threads/opabc987/media/staged/image/chart',
    });

    expect(onLiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delta',
        text: expect.stringContaining(
          'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/abc123xyz/threads/opabc987/media/staged/image/chart'
        ),
      })
    );
  });
});
