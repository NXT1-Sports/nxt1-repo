import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtInteractiveDemoTimelineService } from './interactive-demo.service';

describe('NxtInteractiveDemoTimelineService', () => {
  let service: NxtInteractiveDemoTimelineService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    service = new NxtInteractiveDemoTimelineService();
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  it('types /hudl at the end before converting it into a source pill', () => {
    service.seek((4525 / service.durationMs) * 100);

    expect(service.phase()).toBe('prompt');
    expect(service.typedPrompt()).toContain('/');
    expect(service.hudlSourceActive()).toBe(false);
    expect(service.pendingSources()).toHaveLength(0);
  });

  it('types the prompt during the prompt window', () => {
    service.seek((3900 / service.durationMs) * 100);

    expect(service.phase()).toBe('prompt');
    expect(service.hudlSourceActive()).toBe(false);
    expect(service.pendingSources()).toHaveLength(0);
    expect(service.typedPrompt().length).toBeGreaterThan(0);
    expect(service.typedPrompt().length).toBeLessThan(service.prompt.length);
    expect(service.typedPrompt()).not.toContain('/hudl');
  });

  it('activates and selects send near the end of the prompt', () => {
    service.seek((4800 / service.durationMs) * 100);

    expect(service.phase()).toBe('prompt');
    expect(service.typedPrompt()).toBe(
      "Analyze Riverview's last defensive breakdown. Provide 3 counter-plays with diagrams."
    );
    expect(service.hudlSourceActive()).toBe(true);
    expect(service.pendingSources()).toHaveLength(1);
    expect(service.introCanSend()).toBe(true);
    expect(service.introSendSelected()).toBe(true);
  });

  it('starts with the hook phase before the prompt appears', () => {
    service.seek((875 / service.durationMs) * 100);

    expect(service.phase()).toBe('hook');
    expect(service.showHook()).toBe(true);
    expect(service.showPhone()).toBe(false);
  });

  it('reveals the centered phone slide after the prompt slide', () => {
    service.seek((4_900 / service.durationMs) * 100);
    expect(service.showPhone()).toBe(false);
    expect(service.phase()).toBe('prompt');

    service.seek((5_250 / service.durationMs) * 100);
    expect(service.showPhone()).toBe(true);
    expect(service.phase()).toBe('phone');
  });

  it('switches from the phone reveal into the closing hook slide and role cascade', () => {
    service.seek((9_000 / service.durationMs) * 100);

    expect(service.showPhone()).toBe(true);
    expect(service.showCascade()).toBe(false);
    expect(service.showOutro()).toBe(false);
    expect(service.phase()).toBe('phone');

    service.seek((10_800 / service.durationMs) * 100);

    expect(service.showPhone()).toBe(false);
    expect(service.showCascade()).toBe(false);
    expect(service.showOutro()).toBe(true);
    expect(service.phase()).toBe('outro');
    expect(service.activeCue().label).toBe('Brand close');

    service.seek((13_400 / service.durationMs) * 100);

    expect(service.showPhone()).toBe(false);
    expect(service.showCascade()).toBe(true);
    expect(service.showOutro()).toBe(false);
    expect(service.phase()).toBe('cascade');
    expect(service.activeCue().label).toBe('Role cascade');
  });

  it('finishes with the NXT1 close after the prompt cascade', () => {
    service.seek((22_900 / service.durationMs) * 100);

    expect(service.showCascade()).toBe(true);
    expect(service.showFinale()).toBe(false);
    expect(service.phase()).toBe('cascade');

    service.seek((23_100 / service.durationMs) * 100);

    expect(service.showCascade()).toBe(false);
    expect(service.showFinale()).toBe(true);
    expect(service.phase()).toBe('finale');
    expect(service.activeCue().label).toBe('NXT1 close');
  });

  it('types and advances role-specific Agent X prompts during the cascade', () => {
    service.seek((13_450 / service.durationMs) * 100);

    expect(service.phase()).toBe('cascade');
    expect(service.activeCascadeBeat().role).toBe('Performance Coordinator');
    expect(service.cascadeRows()).toHaveLength(5);
    expect(service.cascadeTypedPrompt().length).toBeGreaterThan(0);
    expect(service.cascadeTypedPrompt().length).toBeLessThan(
      service.activeCascadeBeat().prompt.length
    );
    expect(service.cascadeRows()[0]?.active).toBe(true);

    service.seek((15_250 / service.durationMs) * 100);

    expect(service.activeCascadeBeat().role).toBe('Recruiting Coordinator');
    expect(service.cascadeRows()[0]?.complete).toBe(true);
    expect(service.cascadeRows()[1]?.active).toBe(true);
  });

  it('holds the phone scene until the phone video is explicitly completed', () => {
    service.setHoldPhoneUntilComplete(true);
    service.seek((9_000 / service.durationMs) * 100);
    service.play();
    vi.advanceTimersByTime(2_500);

    expect(service.showPhone()).toBe(true);
    expect(service.showCascade()).toBe(false);
    expect(service.showOutro()).toBe(false);
    expect(service.phase()).toBe('phone');

    service.completePhoneScene();

    expect(service.showPhone()).toBe(false);
    expect(service.showCascade()).toBe(false);
    expect(service.showOutro()).toBe(true);
    expect(service.phase()).toBe('outro');

    vi.advanceTimersByTime(2_600);

    expect(service.showCascade()).toBe(true);
    expect(service.showOutro()).toBe(false);
    expect(service.phase()).toBe('cascade');
  });

  it('resets playback state', () => {
    service.seek(50);
    service.play();

    service.reset();

    expect(service.elapsedMs()).toBe(0);
    expect(service.progress()).toBe(0);
    expect(service.playing()).toBe(false);
  });
});
