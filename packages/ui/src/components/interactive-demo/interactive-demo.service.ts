import { Injectable, OnDestroy, computed, signal } from '@angular/core';

export type NxtInteractiveDemoPhase =
  | 'coordinator'
  | 'action-plan'
  | 'hook'
  | 'prompt'
  | 'opening'
  | 'typing'
  | 'phone'
  | 'cascade'
  | 'outro'
  | 'finale';

export interface NxtInteractiveDemoCue {
  readonly id: NxtInteractiveDemoPhase;
  readonly startsAtMs: number;
  readonly label: string;
}

export interface NxtInteractiveDemoPendingSource {
  readonly platform: string;
  readonly profileUrl: string;
  readonly faviconUrl?: string;
}

export interface NxtInteractiveDemoCascadeBeat {
  readonly role: string;
  readonly unit: string;
  readonly prompt: string;
  readonly outputKind: 'performance' | 'recruiting' | 'brand' | 'data' | 'strategy';
  readonly outputMeta: string;
  readonly outputTitle: string;
  readonly outputDetail: string;
}

export interface NxtInteractiveDemoCascadeRow extends NxtInteractiveDemoCascadeBeat {
  readonly userMessage: string;
  readonly active: boolean;
  readonly next: boolean;
  readonly back: boolean;
  readonly hidden: boolean;
  readonly complete: boolean;
  readonly canSend: boolean;
  readonly sendSelected: boolean;
  readonly outputVisible: boolean;
}

const COORDINATOR_END_MS = 2_100;
const ACTION_PLAN_START_MS = COORDINATOR_END_MS;
const ACTION_PLAN_REASONING_REVEAL_MS = ACTION_PLAN_START_MS + 2_000;
const ACTION_PLAN_TITLE_MESSAGE =
  "I'll start by reviewing your profile and creating an action plan.";
const ACTION_PLAN_TITLE_TYPE_START_MS = ACTION_PLAN_REASONING_REVEAL_MS + 220;
const ACTION_PLAN_TITLE_CHARACTER_INTERVAL_MS = 18;
const ACTION_PLAN_TITLE_TYPE_END_MS =
  ACTION_PLAN_TITLE_TYPE_START_MS +
  ACTION_PLAN_TITLE_MESSAGE.length * ACTION_PLAN_TITLE_CHARACTER_INTERVAL_MS;
const ACTION_PLAN_TOOL_STEPS_REVEAL_START_MS = ACTION_PLAN_TITLE_TYPE_END_MS + 120;
const ACTION_PLAN_TOOL_STEP_STAGGER_MS = 220;
const ACTION_PLAN_TOOL_STEPS_COMPLETE_MS =
  ACTION_PLAN_TOOL_STEPS_REVEAL_START_MS + ACTION_PLAN_TOOL_STEP_STAGGER_MS * 3 + 200;
const ACTION_PLAN_FOLLOWUP_MESSAGE =
  "Reviewed profile. I'll create your action plan then start executing.";
const ACTION_PLAN_FOLLOWUP_TYPE_START_MS = ACTION_PLAN_TOOL_STEPS_COMPLETE_MS + 180;
const ACTION_PLAN_FOLLOWUP_CHARACTER_INTERVAL_MS = 16;
const ACTION_PLAN_FOLLOWUP_TYPE_END_MS =
  ACTION_PLAN_FOLLOWUP_TYPE_START_MS +
  ACTION_PLAN_FOLLOWUP_MESSAGE.length * ACTION_PLAN_FOLLOWUP_CHARACTER_INTERVAL_MS;
const ACTION_PLAN_CARDS_REVEAL_START_MS = ACTION_PLAN_FOLLOWUP_TYPE_END_MS + 220;
const ACTION_PLAN_CARD_REVEAL_INTERVAL_MS = 2_600;
const ACTION_PLAN_CARD_OPERATION_LOG_OFFSET_MS = 2_300;
const ACTION_PLAN_SESSION_ENTER_DURATION_MS = 320;
const ACTION_PLAN_CARD_COUNT = 3;
const ACTION_PLAN_PHONE_REVEAL_DELAY_AFTER_SESSIONS_MS = 420;
const ACTION_PLAN_PHONE_REVEAL_START_MS =
  ACTION_PLAN_CARDS_REVEAL_START_MS +
  ACTION_PLAN_CARD_REVEAL_INTERVAL_MS * (ACTION_PLAN_CARD_COUNT - 1) +
  ACTION_PLAN_CARD_OPERATION_LOG_OFFSET_MS +
  ACTION_PLAN_SESSION_ENTER_DURATION_MS +
  ACTION_PLAN_PHONE_REVEAL_DELAY_AFTER_SESSIONS_MS;
const ACTION_PLAN_NOTIFICATION_PILL_START_MS = ACTION_PLAN_PHONE_REVEAL_START_MS + 4_450;
const ACTION_PLAN_NOTIFICATION_CLICK_START_MS = ACTION_PLAN_NOTIFICATION_PILL_START_MS + 1_050;
const ACTION_PLAN_COMMAND_CENTER_START_MS = ACTION_PLAN_NOTIFICATION_CLICK_START_MS + 620;
const ACTION_PLAN_END_MS = ACTION_PLAN_COMMAND_CENTER_START_MS + 7_000;
const HOOK_START_MS = ACTION_PLAN_END_MS;
const HOOK_END_MS = HOOK_START_MS + 3_450;
const PROMPT_END_MS = HOOK_END_MS + 2_500;
const PROMPT_CINEMATIC_HOLD_MS = 1_000;
const PROMPT_TYPE_START_MS = HOOK_END_MS + PROMPT_CINEMATIC_HOLD_MS;
const PROMPT_TYPE_END_MS = PROMPT_TYPE_START_MS + 1_050;
const PROMPT_SEND_SELECT_START_MS = PROMPT_TYPE_END_MS + 120;
const HOOK_PROMPT_MESSAGE = 'Get me recruited';
const HOOK_PROMPT_TYPE_START_MS = HOOK_START_MS + 1_020;
const HOOK_PROMPT_CHARACTER_INTERVAL_MS = 88;
const HOOK_PROMPT_TYPE_END_MS =
  HOOK_PROMPT_TYPE_START_MS + HOOK_PROMPT_MESSAGE.length * HOOK_PROMPT_CHARACTER_INTERVAL_MS;
const HOOK_PROMPT_SEND_SELECT_START_MS = HOOK_PROMPT_TYPE_END_MS + 120;
const TYPE_START_MS = PROMPT_END_MS + 9_000;
const PHONE_START_MS = PROMPT_END_MS;
const OUTRO_START_MS = 10_500;
const CASCADE_START_MS = OUTRO_START_MS + 2_500;
const CASCADE_BEAT_DURATION_MS = 2_000;
const CASCADE_TYPE_START_MS = 180;
const CASCADE_TYPE_END_MS = 860;
const CASCADE_SEND_SELECT_START_MS = 900;
const CASCADE_OUTPUT_START_MS = 1_050;
const FINALE_DURATION_MS = 7_200;

const HUDL_COMMAND = '/hudl';
const HUDL_COMMAND_SUFFIX = ` ${HUDL_COMMAND}`;
const HUDL_URL = 'https://www.hudl.com';
const HUDL_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=hudl.com&sz=64';
const DEMO_PROMPT_MESSAGE =
  "Analyze Riverview's last defensive breakdown. Provide 3 counter-plays with diagrams.";
const DEMO_PROMPT = `${DEMO_PROMPT_MESSAGE}${HUDL_COMMAND_SUFFIX}`;

const CASCADE_BEATS: readonly NxtInteractiveDemoCascadeBeat[] = [
  {
    role: 'Performance Coordinator',
    unit: 'Film breakdown',
    prompt: 'Give me play diagram ideas and break down how to beat a cover 2 defense.',
    outputKind: 'performance',
    outputMeta: 'Scout report',
    outputTitle: '15 tendencies mapped via film',
    outputDetail: 'Biometric comparison, pass-rush lanes, and personnel matchup notes finalized.',
  },
  {
    role: 'Recruiting Coordinator',
    unit: 'Email campaign',
    prompt: 'Draft personalized emails to 40 D1 coaches.',
    outputKind: 'recruiting',
    outputMeta: 'Outreach pipeline',
    outputTitle: '40 custom coach emails queued',
    outputDetail:
      'Staff directories crossed-referenced, subject lines optimized, and smart follow-up sequences scheduled.',
  },
  {
    role: 'Brand Coordinator',
    unit: 'Content',
    prompt: 'Turn Friday clips into a game day graphic package.',
    outputKind: 'brand',
    outputMeta: 'Creative kit',
    outputTitle: 'Graphics, captions, and cuts queued',
    outputDetail: 'Social-ready assets packaged for the athlete, team, and program channels.',
  },
  {
    role: 'Data Coordinator',
    unit: 'Automation',
    prompt: 'Schedule a weekly extraction of MaxPreps.',
    outputKind: 'data',
    outputMeta: 'Scheduled task',
    outputTitle: 'Weekly recurring sync activated',
    outputDetail:
      'Data ingestion running automatically. Player identities mapped and roster stats updating in the background.',
  },
  {
    role: 'Recruiting Coordinator',
    unit: 'Game plan',
    prompt: "Map out a call sheet for Hoover's red zone defense.",
    outputKind: 'strategy',
    outputMeta: 'Playbook schema',
    outputTitle: '3rd-down strategies prepared',
    outputDetail:
      'Passing route trees, progression goals, and weekly execution points mapped for install.',
  },
] as const;

const FINALE_START_MS = CASCADE_START_MS + CASCADE_BEAT_DURATION_MS * CASCADE_BEATS.length;
const DEMO_DURATION_MS = FINALE_START_MS + FINALE_DURATION_MS;

const DEMO_CUES: readonly NxtInteractiveDemoCue[] = [
  { id: 'coordinator', startsAtMs: 0, label: 'Recruiting Coordinator' },
  { id: 'action-plan', startsAtMs: ACTION_PLAN_START_MS, label: 'Agent X Review' },
  { id: 'hook', startsAtMs: HOOK_START_MS, label: 'Recruiting Prompt' },
  { id: 'prompt', startsAtMs: HOOK_END_MS, label: 'Agent Command' },
  { id: 'opening', startsAtMs: PROMPT_END_MS, label: 'Staff room' },
  { id: 'typing', startsAtMs: TYPE_START_MS, label: 'Typing' },
  { id: 'phone', startsAtMs: PHONE_START_MS, label: 'iPhone reveal' },
  { id: 'outro', startsAtMs: OUTRO_START_MS, label: 'Brand close' },
  { id: 'cascade', startsAtMs: CASCADE_START_MS, label: 'Role cascade' },
  { id: 'finale', startsAtMs: FINALE_START_MS, label: 'NXT1 close' },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

@Injectable()
export class NxtInteractiveDemoTimelineService implements OnDestroy {
  readonly durationMs = DEMO_DURATION_MS;
  readonly prompt = DEMO_PROMPT;
  readonly cues = DEMO_CUES;
  readonly cascadeBeats = CASCADE_BEATS;

  private readonly _elapsedMs = signal(0);
  private readonly _playing = signal(false);
  private readonly _holdPhoneUntilComplete = signal(false);
  private readonly _phoneSceneCompleted = signal(false);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickMs = 0;

  readonly elapsedMs = computed(() => this._elapsedMs());
  readonly playing = computed(() => this._playing());
  readonly progress = computed(() => Math.round((this._elapsedMs() / DEMO_DURATION_MS) * 100));
  readonly phase = computed<NxtInteractiveDemoPhase>(() => {
    const elapsedMs = this._elapsedMs();
    const holdPhoneUntilComplete = this._holdPhoneUntilComplete();
    const phoneSceneCompleted = this._phoneSceneCompleted();

    if (holdPhoneUntilComplete && !phoneSceneCompleted) {
      if (elapsedMs >= PHONE_START_MS) return 'phone';
    }

    if (elapsedMs >= FINALE_START_MS) return 'finale';
    if (elapsedMs >= CASCADE_START_MS) return 'cascade';
    if (elapsedMs >= OUTRO_START_MS) return 'outro';
    if (elapsedMs >= PHONE_START_MS) return 'phone';
    if (elapsedMs >= TYPE_START_MS) return 'typing';
    if (elapsedMs >= PROMPT_END_MS) return 'opening';
    if (elapsedMs >= HOOK_END_MS) return 'prompt';
    if (elapsedMs >= HOOK_START_MS) return 'hook';
    if (elapsedMs >= ACTION_PLAN_START_MS) return 'action-plan';
    return 'coordinator';
  });
  readonly activeCue = computed(() => {
    const phase = this.phase();
    return DEMO_CUES.find((cue) => cue.id === phase) ?? DEMO_CUES[0];
  });
  readonly typedPromptRaw = computed(() => {
    const elapsedMs = this._elapsedMs();
    const typingProgress = clamp(
      (elapsedMs - PROMPT_TYPE_START_MS) / (PROMPT_TYPE_END_MS - PROMPT_TYPE_START_MS),
      0,
      1
    );
    const characterCount = Math.round(DEMO_PROMPT.length * typingProgress);

    return DEMO_PROMPT.slice(0, characterCount);
  });
  readonly hookPromptRaw = computed(() => {
    const elapsedMs = this._elapsedMs();
    const characterCount = clamp(
      Math.floor((elapsedMs - HOOK_PROMPT_TYPE_START_MS) / HOOK_PROMPT_CHARACTER_INTERVAL_MS) + 1,
      0,
      HOOK_PROMPT_MESSAGE.length
    );

    return HOOK_PROMPT_MESSAGE.slice(0, characterCount);
  });
  readonly hookPrompt = computed(() => this.hookPromptRaw());
  readonly showActionPlanThinking = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= ACTION_PLAN_START_MS && elapsedMs < ACTION_PLAN_REASONING_REVEAL_MS;
  });
  readonly showActionPlanReasoning = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_REASONING_REVEAL_MS
  );
  readonly actionPlanTitle = computed(() => {
    const elapsedMs = this._elapsedMs();
    const characterCount = clamp(
      Math.floor(
        (elapsedMs - ACTION_PLAN_TITLE_TYPE_START_MS) / ACTION_PLAN_TITLE_CHARACTER_INTERVAL_MS
      ) + 1,
      0,
      ACTION_PLAN_TITLE_MESSAGE.length
    );

    return ACTION_PLAN_TITLE_MESSAGE.slice(0, characterCount);
  });
  readonly actionPlanTitleComplete = computed(
    () => this.actionPlanTitle().length >= ACTION_PLAN_TITLE_MESSAGE.length
  );
  readonly actionPlanToolStepCount = computed(() => {
    if (!this.showActionPlan()) {
      return 0;
    }

    const elapsedMs = this._elapsedMs();
    if (elapsedMs < ACTION_PLAN_TOOL_STEPS_REVEAL_START_MS) {
      return 0;
    }

    return clamp(
      Math.floor(
        (elapsedMs - ACTION_PLAN_TOOL_STEPS_REVEAL_START_MS) / ACTION_PLAN_TOOL_STEP_STAGGER_MS
      ) + 1,
      0,
      3
    );
  });
  readonly actionPlanToolStepsComplete = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_TOOL_STEPS_COMPLETE_MS
  );
  readonly showActionPlanToolSteps = computed(() => this.actionPlanToolStepCount() > 0);
  readonly actionPlanFollowup = computed(() => {
    if (!this.showActionPlan() || this._elapsedMs() < ACTION_PLAN_FOLLOWUP_TYPE_START_MS) {
      return '';
    }

    const characterCount = clamp(
      Math.floor(
        (this._elapsedMs() - ACTION_PLAN_FOLLOWUP_TYPE_START_MS) /
          ACTION_PLAN_FOLLOWUP_CHARACTER_INTERVAL_MS
      ) + 1,
      0,
      ACTION_PLAN_FOLLOWUP_MESSAGE.length
    );

    return ACTION_PLAN_FOLLOWUP_MESSAGE.slice(0, characterCount);
  });
  readonly actionPlanFollowupComplete = computed(
    () => this.actionPlanFollowup().length >= ACTION_PLAN_FOLLOWUP_MESSAGE.length
  );
  readonly showActionPlanFollowup = computed(() => this.actionPlanFollowup().length > 0);
  readonly showActionPlanCards = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_CARDS_REVEAL_START_MS
  );
  readonly actionPlanVisibleCardCount = computed(() => {
    if (!this.showActionPlanCards()) {
      return 0;
    }

    const elapsedSinceCards = this._elapsedMs() - ACTION_PLAN_CARDS_REVEAL_START_MS;
    return clamp(
      Math.floor(elapsedSinceCards / ACTION_PLAN_CARD_REVEAL_INTERVAL_MS) + 1,
      0,
      ACTION_PLAN_CARD_COUNT
    );
  });
  readonly actionPlanRunningSessionCount = computed(() => {
    if (!this.showActionPlanCards()) {
      return 0;
    }

    const elapsedSinceCards =
      this._elapsedMs() -
      ACTION_PLAN_CARDS_REVEAL_START_MS -
      ACTION_PLAN_CARD_OPERATION_LOG_OFFSET_MS;

    return clamp(
      Math.floor(elapsedSinceCards / ACTION_PLAN_CARD_REVEAL_INTERVAL_MS) + 1,
      0,
      ACTION_PLAN_CARD_COUNT
    );
  });
  readonly showActionPlanPhoneReveal = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_PHONE_REVEAL_START_MS
  );
  readonly showActionPlanNotificationPill = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_NOTIFICATION_PILL_START_MS
  );
  readonly showActionPlanNotificationClick = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_NOTIFICATION_CLICK_START_MS
  );
  readonly showActionPlanCommandCenter = computed(
    () => this.showActionPlan() && this._elapsedMs() >= ACTION_PLAN_COMMAND_CENTER_START_MS
  );
  readonly hookPromptCanSend = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= HOOK_PROMPT_TYPE_END_MS && elapsedMs < HOOK_END_MS;
  });
  readonly hookPromptSendSelected = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= HOOK_PROMPT_SEND_SELECT_START_MS && elapsedMs < HOOK_END_MS;
  });
  readonly hudlSourceActive = computed(() => this.typedPromptRaw().length >= DEMO_PROMPT.length);
  readonly typedPrompt = computed(() => {
    const rawPrompt = this.typedPromptRaw();

    if (!this.hudlSourceActive()) {
      return rawPrompt;
    }

    return rawPrompt.slice(0, -HUDL_COMMAND_SUFFIX.length);
  });
  readonly pendingSources = computed<readonly NxtInteractiveDemoPendingSource[]>(() =>
    this.hudlSourceActive()
      ? [
          {
            platform: 'Hudl',
            profileUrl: HUDL_URL,
            faviconUrl: HUDL_FAVICON_URL,
          },
        ]
      : []
  );
  readonly activeCascadeIndex = computed(() => {
    const elapsedMs = this._elapsedMs();
    const rawIndex = Math.floor((elapsedMs - CASCADE_START_MS) / CASCADE_BEAT_DURATION_MS);
    return clamp(rawIndex, 0, CASCADE_BEATS.length - 1);
  });
  readonly activeCascadeBeatElapsedMs = computed(() => {
    const elapsedMs = this._elapsedMs();
    const activeIndex = this.activeCascadeIndex();
    return clamp(
      elapsedMs - CASCADE_START_MS - activeIndex * CASCADE_BEAT_DURATION_MS,
      0,
      CASCADE_BEAT_DURATION_MS
    );
  });
  readonly activeCascadeBeat = computed(() => CASCADE_BEATS[this.activeCascadeIndex()]);
  readonly cascadeTypedPrompt = computed(() => {
    const beat = this.activeCascadeBeat();
    const elapsedMs = this.activeCascadeBeatElapsedMs();
    const typingProgress = clamp(
      (elapsedMs - CASCADE_TYPE_START_MS) / (CASCADE_TYPE_END_MS - CASCADE_TYPE_START_MS),
      0,
      1
    );
    const characterCount = Math.round(beat.prompt.length * typingProgress);

    return beat.prompt.slice(0, characterCount);
  });
  readonly cascadeCanSend = computed(() => {
    const elapsedMs = this.activeCascadeBeatElapsedMs();
    return elapsedMs >= CASCADE_TYPE_END_MS && elapsedMs < CASCADE_OUTPUT_START_MS;
  });
  readonly cascadeSendSelected = computed(() => {
    const elapsedMs = this.activeCascadeBeatElapsedMs();
    return elapsedMs >= CASCADE_SEND_SELECT_START_MS && elapsedMs < CASCADE_OUTPUT_START_MS;
  });
  readonly cascadeShowOutput = computed(
    () => this.activeCascadeBeatElapsedMs() >= CASCADE_OUTPUT_START_MS
  );
  readonly cascadeRows = computed<readonly NxtInteractiveDemoCascadeRow[]>(() => {
    const activeIndex = this.activeCascadeIndex();
    const typedPrompt = this.cascadeTypedPrompt();
    const canSend = this.cascadeCanSend();
    const sendSelected = this.cascadeSendSelected();
    const showOutput = this.cascadeShowOutput();

    return CASCADE_BEATS.map((beat, index) => {
      const carouselSlot = (index - activeIndex + CASCADE_BEATS.length) % CASCADE_BEATS.length;
      const active = carouselSlot === 0;
      const next = carouselSlot === 1;
      const back = carouselSlot === 2;
      const hidden = !(active || next || back);
      const complete = index < activeIndex;

      return {
        ...beat,
        active,
        next,
        back,
        hidden,
        complete,
        userMessage: complete ? beat.prompt : active ? typedPrompt : '',
        canSend: active && canSend,
        sendSelected: active && sendSelected,
        outputVisible: active && showOutput,
      };
    });
  });
  readonly introCanSend = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= PROMPT_TYPE_END_MS && elapsedMs < PROMPT_END_MS;
  });
  readonly introSendSelected = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= PROMPT_SEND_SELECT_START_MS && elapsedMs < PROMPT_END_MS;
  });
  readonly showPhone = computed(() => this.phase() === 'phone');
  readonly showPrompt = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= HOOK_END_MS && elapsedMs < PROMPT_END_MS;
  });
  readonly showCoordinator = computed(() => this._elapsedMs() < COORDINATOR_END_MS);
  readonly showActionPlan = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= ACTION_PLAN_START_MS && elapsedMs < ACTION_PLAN_END_MS;
  });
  readonly showHook = computed(() => {
    const elapsedMs = this._elapsedMs();
    return elapsedMs >= HOOK_START_MS && elapsedMs < HOOK_END_MS;
  });
  readonly showCascade = computed(() => this.phase() === 'cascade');
  readonly showOutro = computed(() => this.phase() === 'outro');
  readonly showFinale = computed(() => this.phase() === 'finale');

  setHoldPhoneUntilComplete(enabled: boolean): void {
    this._holdPhoneUntilComplete.set(enabled);

    if (!enabled) {
      this._phoneSceneCompleted.set(false);
    }
  }

  completePhoneScene(): void {
    if (this._elapsedMs() < PHONE_START_MS) {
      return;
    }

    this._phoneSceneCompleted.set(true);

    this._elapsedMs.set(OUTRO_START_MS);

    if (!this._playing()) {
      this.play();
    }
  }

  play(): void {
    if (this._playing()) return;

    if (this._elapsedMs() >= DEMO_DURATION_MS) {
      this._elapsedMs.set(0);
    }

    this._playing.set(true);
    this.lastTickMs = Date.now();
    this.intervalId = setInterval(() => this.tick(), 50);
  }

  pause(): void {
    this._playing.set(false);
    this.clearInterval();
  }

  reset(): void {
    this.pause();
    this._phoneSceneCompleted.set(false);
    this._elapsedMs.set(0);
  }

  restart(): void {
    this.reset();
    this.play();
  }

  seek(percent: number): void {
    const nextElapsedMs = Math.round(DEMO_DURATION_MS * clamp(percent, 0, 100) * 0.01);

    if (this._holdPhoneUntilComplete()) {
      this._phoneSceneCompleted.set(nextElapsedMs >= OUTRO_START_MS);
    }

    this._elapsedMs.set(nextElapsedMs);
  }

  ngOnDestroy(): void {
    this.clearInterval();
  }

  private tick(): void {
    if (!this._playing()) return;

    const currentTickMs = Date.now();
    const deltaMs = currentTickMs - this.lastTickMs;
    this.lastTickMs = currentTickMs;

    const holdingPhone =
      this._holdPhoneUntilComplete() &&
      !this._phoneSceneCompleted() &&
      this._elapsedMs() >= PHONE_START_MS;
    const nextElapsedMs = holdingPhone
      ? this._elapsedMs() + deltaMs
      : clamp(this._elapsedMs() + deltaMs, 0, DEMO_DURATION_MS);
    this._elapsedMs.set(nextElapsedMs);

    if (!holdingPhone && nextElapsedMs >= DEMO_DURATION_MS) {
      this.pause();
    }
  }

  private clearInterval(): void {
    if (this.intervalId === null) return;

    clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
