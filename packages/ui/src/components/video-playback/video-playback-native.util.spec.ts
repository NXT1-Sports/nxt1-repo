import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelQueuedMediaSeek,
  clampMediaSeekTarget,
  commitMediaSeek,
  flushQueuedMediaSeek,
  playMediaWhenReady,
  queueMediaSeek,
  waitForMediaCanPlay,
  waitForMediaSeekComplete,
} from './video-playback-native.util';

function createMockPlayer(
  overrides: Partial<{
    currentTime: number;
    duration: number;
    ended: boolean;
    seeking: boolean;
    readyState: number;
    play: () => Promise<void>;
  }> = {}
): HTMLVideoElement {
  const player = document.createElement('video');

  let currentTime = overrides.currentTime ?? 0;
  let duration = overrides.duration ?? 0;
  let ended = overrides.ended ?? false;
  let seeking = overrides.seeking ?? false;
  let readyState = overrides.readyState ?? HTMLMediaElement.HAVE_FUTURE_DATA;

  Object.defineProperty(player, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });

  Object.defineProperty(player, 'duration', {
    configurable: true,
    get: () => duration,
    set: (value: number) => {
      duration = value;
    },
  });

  Object.defineProperty(player, 'ended', {
    configurable: true,
    get: () => ended,
    set: (value: boolean) => {
      ended = value;
    },
  });

  Object.defineProperty(player, 'seeking', {
    configurable: true,
    get: () => seeking,
    set: (value: boolean) => {
      seeking = value;
    },
  });

  Object.defineProperty(player, 'readyState', {
    configurable: true,
    get: () => readyState,
    set: (value: number) => {
      readyState = value;
    },
  });

  Object.defineProperty(player, 'play', {
    configurable: true,
    value: overrides.play ?? vi.fn().mockResolvedValue(undefined),
  });

  return player as HTMLVideoElement;
}

describe('video playback native helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps seek targets to the loaded duration', () => {
    const player = createMockPlayer({ duration: 12 });

    expect(clampMediaSeekTarget(player, -4)).toBe(0);
    expect(clampMediaSeekTarget(player, 8)).toBe(8);
    expect(clampMediaSeekTarget(player, 30)).toBe(12);
  });

  it('clamps seek targets to the nearest browser-seekable range', () => {
    const player = createMockPlayer({ duration: 30 });
    Object.defineProperty(player, 'seekable', {
      configurable: true,
      value: {
        length: 2,
        start: (index: number) => (index === 0 ? 4 : 18),
        end: (index: number) => (index === 0 ? 10 : 24),
      },
    });

    expect(clampMediaSeekTarget(player, 6)).toBe(6);
    expect(clampMediaSeekTarget(player, 14)).toBe(10);
    expect(clampMediaSeekTarget(player, 16)).toBe(18);
  });

  it('nudges committed seeks off the hard end so replay can resume', () => {
    const player = createMockPlayer({ duration: 10, currentTime: 10, ended: true });

    expect(commitMediaSeek(player, 10)).toBe(9.9);
    expect(player.currentTime).toBe(9.9);
  });

  it('supports shared caller-provided seek constraints before committing', () => {
    const player = createMockPlayer({ duration: 20, currentTime: 0, ended: false });

    expect(
      commitMediaSeek(player, 17, {
        clamp: (time) => Math.max(4, Math.min(time, 9)),
      })
    ).toBe(9);
    expect(player.currentTime).toBe(9);
  });

  it('queues and flushes the latest pending seek exactly once', () => {
    const commit = vi.fn();
    const state = { frameId: 17, pendingTime: 9.25 };
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    flushQueuedMediaSeek(state, commit);

    expect(cancelFrame).toHaveBeenCalledWith(17);
    expect(commit).toHaveBeenCalledWith(9.25);
    expect(state).toEqual({ frameId: null, pendingTime: null });
  });

  it('cancels queued seeks without committing them', () => {
    const state = { frameId: 23, pendingTime: 4.5 };
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    cancelQueuedMediaSeek(state);

    expect(cancelFrame).toHaveBeenCalledWith(23);
    expect(state).toEqual({ frameId: null, pendingTime: null });
  });

  it('commits immediately when requestAnimationFrame is unavailable', () => {
    const commit = vi.fn();
    const state = { frameId: null, pendingTime: null };
    vi.stubGlobal('requestAnimationFrame', undefined);

    queueMediaSeek(state, 6.75, commit);

    expect(commit).toHaveBeenCalledWith(6.75);
    expect(state).toEqual({ frameId: null, pendingTime: null });
  });

  it('waits for seek completion events when the player is seeking', async () => {
    vi.useFakeTimers();
    const player = createMockPlayer({ seeking: true });
    const promise = waitForMediaSeekComplete(player, 1000);

    player.seeking = false;
    player.dispatchEvent(new Event('seeked'));
    await promise;
  });

  it('waits for canplay when future data is not yet available', async () => {
    vi.useFakeTimers();
    const player = createMockPlayer({ readyState: HTMLMediaElement.HAVE_CURRENT_DATA });
    const promise = waitForMediaCanPlay(player, 1000);

    player.readyState = HTMLMediaElement.HAVE_FUTURE_DATA;
    player.dispatchEvent(new Event('canplay'));
    await promise;
  });

  it('retries play after initial blocked playback while waiting for readiness again', async () => {
    vi.useFakeTimers();
    const play = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(undefined);
    const player = createMockPlayer({
      play,
      seeking: false,
      readyState: HTMLMediaElement.HAVE_FUTURE_DATA,
    });

    const promise = playMediaWhenReady(player, { retryDelayMs: 25 });
    await vi.runAllTimersAsync();
    await promise;

    expect(play).toHaveBeenCalledTimes(2);
  });
});
