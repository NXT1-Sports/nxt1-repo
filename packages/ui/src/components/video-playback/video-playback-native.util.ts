export type PlayMediaWhenReadyOptions = {
  readonly initialSeekTimeoutMs?: number;
  readonly canPlayTimeoutMs?: number;
  readonly retryCount?: number;
  readonly retrySeekTimeoutMs?: number;
  readonly retryCanPlayTimeoutMs?: number;
  readonly retryDelayMs?: number;
};

export type QueuedMediaSeekState = {
  frameId: number | null;
  pendingTime: number | null;
};

export function clampMediaSeekTarget(player: HTMLVideoElement, nextTime: number): number {
  const duration = Number.isFinite(player.duration) ? player.duration : Infinity;
  return Math.max(0, Math.min(nextTime, duration));
}

export function commitMediaSeek(
  player: HTMLVideoElement,
  nextTime: number,
  options: {
    readonly replayThresholdOffsetSec?: number;
    readonly clamp?: (time: number) => number;
  } = {}
): number {
  const targetTime = clampMediaSeekTarget(
    player,
    options.clamp ? options.clamp(nextTime) : nextTime
  );
  const duration = Number.isFinite(player.duration) ? player.duration : Infinity;

  player.currentTime = targetTime;
  let committedTime = Number.isFinite(player.currentTime) ? player.currentTime : targetTime;

  if (player.ended && duration > 0 && committedTime >= duration) {
    const replayTarget = Math.max(0, duration - (options.replayThresholdOffsetSec ?? 0.1));
    player.currentTime = replayTarget;
    committedTime = Number.isFinite(player.currentTime) ? player.currentTime : replayTarget;
  }

  return committedTime;
}

export function queueMediaSeek(
  state: QueuedMediaSeekState,
  nextTime: number,
  commit: (time: number) => void
): void {
  state.pendingTime = nextTime;

  if (state.frameId === null && typeof requestAnimationFrame !== 'undefined') {
    state.frameId = requestAnimationFrame(() => {
      state.frameId = null;
      if (state.pendingTime === null) return;

      const pendingTime = state.pendingTime;
      state.pendingTime = null;
      commit(pendingTime);
    });
    return;
  }

  if (typeof requestAnimationFrame === 'undefined') {
    state.pendingTime = null;
    commit(nextTime);
  }
}

export function flushQueuedMediaSeek(
  state: QueuedMediaSeekState,
  commit: (time: number) => void
): void {
  if (state.frameId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(state.frameId);
  }

  state.frameId = null;
  if (state.pendingTime === null) return;

  const pendingTime = state.pendingTime;
  state.pendingTime = null;
  commit(pendingTime);
}

export function cancelQueuedMediaSeek(state: QueuedMediaSeekState): void {
  if (state.frameId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(state.frameId);
  }

  state.frameId = null;
  state.pendingTime = null;
}

export async function playMediaWhenReady(
  player: HTMLVideoElement,
  options: PlayMediaWhenReadyOptions = {}
): Promise<void> {
  const initialSeekTimeoutMs = options.initialSeekTimeoutMs ?? 1200;
  const canPlayTimeoutMs = options.canPlayTimeoutMs ?? 1200;
  const retryCount = options.retryCount ?? 3;
  const retrySeekTimeoutMs = options.retrySeekTimeoutMs ?? 500;
  const retryCanPlayTimeoutMs = options.retryCanPlayTimeoutMs ?? 500;
  const retryDelayMs = options.retryDelayMs ?? 120;

  await waitForMediaSeekComplete(player, initialSeekTimeoutMs);

  if (player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    await waitForMediaCanPlay(player, canPlayTimeoutMs);
  }

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      await player.play();
      return;
    } catch {
      if (attempt >= retryCount - 1) {
        throw new Error('Unable to resume playback after seek');
      }

      await waitForMediaSeekComplete(player, retrySeekTimeoutMs);
      await waitForMediaCanPlay(player, retryCanPlayTimeoutMs);
      await delay(retryDelayMs);
    }
  }
}

export async function waitForMediaSeekComplete(
  player: HTMLVideoElement,
  timeoutMs: number
): Promise<void> {
  if (!player.seeking) return;

  await new Promise<void>((resolve) => {
    const onSeeked = (): void => {
      clearTimeout(timeout);
      player.removeEventListener('seeked', onSeeked);
      resolve();
    };

    const timeout = setTimeout(() => {
      player.removeEventListener('seeked', onSeeked);
      resolve();
    }, timeoutMs);

    player.addEventListener('seeked', onSeeked, { once: true });
  });
}

export async function waitForMediaCanPlay(
  player: HTMLVideoElement,
  timeoutMs: number
): Promise<void> {
  if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;

  await new Promise<void>((resolve) => {
    const onCanPlay = (): void => {
      clearTimeout(timeout);
      player.removeEventListener('canplay', onCanPlay);
      resolve();
    };

    const timeout = setTimeout(() => {
      player.removeEventListener('canplay', onCanPlay);
      resolve();
    }, timeoutMs);

    player.addEventListener('canplay', onCanPlay, { once: true });
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
