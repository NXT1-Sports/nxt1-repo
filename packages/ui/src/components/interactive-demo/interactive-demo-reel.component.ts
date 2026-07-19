import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import type { AgentXToolStep, ShellWeeklyPlaybookItem } from '@nxt1/core/ai';
import { AgentXInputBarComponent } from '../../agent-x/components/inputs/agent-x-input-bar.component';
import { NxtAgentXExtendedThinkingComponent } from '../../agent-x/components/chat/agent-x-extended-thinking.component';
import { AgentXOperationChatThinkingComponent } from '../../agent-x/components/chat/agent-x-operation-chat-thinking.component';
import { AgentXActionPlanCardComponent } from '../../agent-x/components/cards/agent-x-action-plan-card.component';
import { AgentXToolStepsComponent } from '../../agent-x/components/shared/agent-x-tool-steps.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtLogoComponent } from '../logo/logo.component';
import { NxtPlatformIconComponent } from '../platform-icon/platform-icon.component';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtInteractiveDemoTimelineService } from './interactive-demo.service';

const DESKTOP_HANDOFF_AUDIO_DELAY_MS = 4_150;
const DESKTOP_COMPLETION_HOLD_MS = 900;
const IOS_TYPING_CLICK_INTERVAL_SECONDS = 0.028;
const IOS_TYPING_CLICK_DURATION_SECONDS = 0.038;
const IOS_TYPING_CLICK_BACKLOG_LIMIT = 8;
const IOS_TYPING_SOUND_INTERVAL_MS = 28;
const IOS_TYPING_SOUND_CUTOFF_MS = 95;
const IOS_TYPING_SOUND_POOL_SIZE = 5;
const IOS_TYPING_SOUND_SRC = '/assets/shared/images/apple%20sound%20effect.MOV';
const DESKTOP_VIDEO_SRC = '/assets/shared/videos/desktop-video.mov';
const FINAL_SCORE_VIDEO_IMAGE_SRC = '/assets/shared/images/final-score-video.png';
const HIGHLIGHT_VIDEO_IMAGE_SRC = '/assets/shared/images/highlight-video.png';
const PDF_PLAYS_IMAGE_SRC = '/assets/shared/images/pdf-plays.png';
const PROSPECT_CARD_ATHLETE_IMAGE_SRC = '/assets/shared/images/prospect-card-athlete.png';
const STAT_CARD_VIDEO_IMAGE_SRC = '/assets/shared/images/stat-card-video.png';
const STRATEGY_CALL_SHEET_IMAGE_SRC = '/assets/shared/images/callsheet.png';
const ACTION_PLAN_PHONE_IMAGE_SRC = '/assets/shared/images/agent-image-1.png';
const ACTION_PLAN_PHONE_LEFT_IMAGE_SRC = '/assets/shared/images/agent-image-2.png';
const ACTION_PLAN_PHONE_RIGHT_IMAGE_SRC = '/assets/shared/images/agent-image-3.png';
const PROMO_ACTION_PLAN_ITEMS: readonly ShellWeeklyPlaybookItem[] = [
  {
    id: 'recruiting-send-list',
    weekLabel: 'This Week',
    title: '50 emails drafted and ready for your approval',
    summary: 'Your junior film and verified numbers have been packaged for SEC and ACC targets.',
    why: 'Your updated film and verified numbers give coaches a cleaner evaluation window before Friday.',
    details: 'Priority schools, attachment bundle, and coach notes are ready to send.',
    actionLabel: 'Review send list',
    status: 'pending',
    coordinator: {
      id: 'recruiting-coordinator',
      label: 'Recruiting Coordinator',
      icon: 'mail-open-outline',
    },
  },
  {
    id: 'agentx-follow-up-plan',
    weekLabel: 'Next Up',
    title: 'Your new highlight reel from Friday night is ready to view',
    summary:
      'Agent X analyzed your game film, clipped your best specific reps, and built a custom short-form reel.',
    why: 'Fast follow-up keeps momentum high when staffs finally open and reply to your film package.',
    details: 'Reply drafting, reminder timing, and visit logistics are staged in one workflow.',
    actionLabel: 'View highlight reel',
    status: 'pending',
    coordinator: {
      id: 'recruiting-coordinator',
      label: 'Recruiting Coordinator',
      icon: 'sparkles-outline',
    },
  },
  {
    id: 'visit-priority-sheet',
    weekLabel: 'Priority Window',
    title: 'New weekly stat graphic automatically generated from MaxPreps',
    summary:
      'Agent X grabbed your latest box score and matched it to your visual brand identity for coaches.',
    why: 'The right visit timing gives coaches a live reason to keep your file active after first contact.',
    details: 'Top campuses, travel order, and decision notes are ready.',
    actionLabel: 'Review graphic',
    status: 'pending',
    coordinator: {
      id: 'recruiting-coordinator',
      label: 'Recruiting Coordinator',
      icon: 'image-outline',
    },
  },
];

const ACTION_PLAN_TOOL_STEP_BLUEPRINTS: readonly Omit<AgentXToolStep, 'status'>[] = [
  {
    id: 'profile-review',
    label: 'Reviewing profile, film, and verified measurables',
    icon: 'search',
    detail: 'Film, transcript, metrics checked.',
  },
  {
    id: 'coach-list',
    label: 'Building the first-wave coach target list',
    icon: 'database',
    detail: 'Programs, staff fit, timing ranked.',
  },
  {
    id: 'plan-draft',
    label: 'Drafting your recruiting action plan',
    icon: 'document',
    detail: 'Plan timing and follow-ups packaged.',
  },
];

const ACTION_PLAN_REASONING_TEXT =
  'Reviewed profile, film, verified measurables, target-school fit, and first-wave follow-up timing before drafting the recruiting action plan.';

interface ActionPlanCommandCenterNotification {
  readonly title: string;
  readonly body: string;
  readonly time: string;
  readonly priority: 'normal' | 'high' | 'urgent';
  readonly collegeName: string;
  readonly collegeLogoUrl: string;
  readonly delayMs: number;
}

const ACTION_PLAN_COMMAND_CENTER_COLLEGE_LOGOS = [
  {
    collegeName: 'Alabama Crimson Tide',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
  },
  {
    collegeName: 'Ohio State Buckeyes',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',
  },
  {
    collegeName: 'USC Trojans',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png',
  },
  {
    collegeName: 'Michigan Wolverines',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png',
  },
  {
    collegeName: 'Notre Dame Fighting Irish',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png',
  },
  {
    collegeName: 'Texas Longhorns',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
  },
  {
    collegeName: 'Florida Gators',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/57.png',
  },
  {
    collegeName: 'LSU Tigers',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png',
  },
  {
    collegeName: 'Oregon Ducks',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png',
  },
  {
    collegeName: 'Clemson Tigers',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png',
  },
  {
    collegeName: 'Stanford Cardinal',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/24.png',
  },
  {
    collegeName: 'Auburn Tigers',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2.png',
  },
  {
    collegeName: 'Georgia Bulldogs',
    collegeLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png',
  },
] as const;

const ACTION_PLAN_COMMAND_NOTIFICATION_DELAYS_MS = [
  240, 650, 1_030, 1_380, 1_700, 1_990, 2_250, 2_490, 2_710, 2_920, 3_120, 3_310, 3_490, 3_660,
  3_820, 3_970, 4_110, 4_245, 4_375, 4_500, 4_620, 4_735, 4_845, 4_950, 5_050, 5_145, 5_235, 5_320,
  5_400, 5_475, 5_545, 5_610,
] as const;

const ACTION_PLAN_COMMAND_CENTER_NOTIFICATION_COPY: readonly {
  title: string;
  body: string;
  time: string;
  priority: 'normal' | 'high' | 'urgent';
}[] = [
  {
    title: 'Coach viewed your email',
    body: 'Alabama DB coach opened your outreach message and watched the first three clips.',
    time: 'now',
    priority: 'urgent',
  },
  {
    title: 'Camp invite matched',
    body: 'Ohio State invitation aligns with your travel radius and position focus.',
    time: 'now',
    priority: 'high',
  },
  {
    title: 'Link click detected',
    body: 'A staff member from USC clicked the link to your full highlight reel.',
    time: 'now',
    priority: 'normal',
  },
  {
    title: 'Follow-up suggested',
    body: 'Michigan went cold for 4 days. Agent X drafted a quick check-in.',
    time: 'now',
    priority: 'normal',
  },
  {
    title: 'Official offer sent',
    body: 'A verbal offer was logged from Notre Dame and the profile status was automatically updated.',
    time: 'now',
    priority: 'high',
  },
  {
    title: 'Coach saved your contact info',
    body: 'Texas staff member added your phone number and email to their recruiting CRM.',
    time: '1s',
    priority: 'urgent',
  },
  {
    title: 'New social follow',
    body: 'A Florida recruiter just followed you on Instagram and Twitter.',
    time: '1s',
    priority: 'high',
  },
  {
    title: 'Visit scheduled',
    body: 'Your unofficial visit window to LSU was confirmed and added to your calendar.',
    time: '1s',
    priority: 'normal',
  },
  {
    title: 'Profile forwarded',
    body: 'Your profile link was just forwarded from an Oregon area scout to the defensive coordinator.',
    time: '2s',
    priority: 'urgent',
  },
  {
    title: 'Game schedule requested',
    body: 'Clemson replied asking for your Friday night kickoff time. Response drafted.',
    time: '2s',
    priority: 'normal',
  },
  {
    title: 'Transcript received',
    body: 'Stanford confirmed your academic package meets early evaluation standards.',
    time: '2s',
    priority: 'normal',
  },
  {
    title: 'Roster need matched',
    body: 'Agent X found an opening for a 2026 DB at Auburn.',
    time: '2s',
    priority: 'high',
  },
  {
    title: 'Coach watched entire film',
    body: 'Georgia watched your 3-minute highlight tape to 100% completion.',
    time: '3s',
    priority: 'normal',
  },
  {
    title: 'Questionnaire completed',
    body: 'Agent X auto-filled the Alabama recruiting questionnaire.',
    time: '3s',
    priority: 'urgent',
  },
  {
    title: 'Direct Message received',
    body: 'Ohio State asked for your phone number. Agent X prepared the reply.',
    time: '3s',
    priority: 'normal',
  },
  {
    title: 'Evaluation period opened',
    body: 'The dead period ended and USC is now allowed to contact you.',
    time: '3s',
    priority: 'high',
  },
  {
    title: 'Evaluation notes updated',
    body: 'A Michigan analyst logged a new note about your footwork and closing speed.',
    time: '4s',
    priority: 'normal',
  },
  {
    title: 'Contact block triggered',
    body: 'Notre Dame hit your phone during school hours. Auto-reply text sent.',
    time: '4s',
    priority: 'normal',
  },
  {
    title: 'Call scheduled',
    body: 'Phone call locked in for 7:30 PM with the Texas wide receivers coach.',
    time: '4s',
    priority: 'urgent',
  },
  {
    title: 'Game film clipped',
    body: 'Florida HUDL film was analyzed and new priority clips were extracted.',
    time: '4s',
    priority: 'high',
  },
  {
    title: 'Combine stats verified',
    body: 'Your LSU laser 40-yard dash was verified and pushed to all target schools.',
    time: '5s',
    priority: 'normal',
  },
  {
    title: 'Graphic auto-generated',
    body: 'Oregon offer graphic designed, formatted, and ready for your social feed.',
    time: '5s',
    priority: 'normal',
  },
  {
    title: 'Priority target locked',
    body: 'Clemson moved to Top 5 based on persistent communication.',
    time: '5s',
    priority: 'high',
  },
  {
    title: 'Multiple coaches viewing',
    body: 'Three different staff members from Stanford are looking at your file right now.',
    time: '5s',
    priority: 'urgent',
  },
  {
    title: 'Weekly summary sent',
    body: 'Your parents were emailed the weekly breakdown of Auburn interactions.',
    time: '6s',
    priority: 'high',
  },
  {
    title: 'Second clip requested',
    body: 'Georgia asked for raw game film from last week. Package is queued.',
    time: '6s',
    priority: 'urgent',
  },
  {
    title: 'Junior Day invite',
    body: 'Agent X flagged an exclusive Alabama Junior Day invite.',
    time: '6s',
    priority: 'normal',
  },
  {
    title: 'Head Coach follow',
    body: 'The Ohio State Head Coach just followed your main account.',
    time: '6s',
    priority: 'high',
  },
  {
    title: 'Recruiting board jumped',
    body: 'You moved up 3 spots on the USC priority recruit board.',
    time: '7s',
    priority: 'urgent',
  },
  {
    title: 'Gameday visit confirmed',
    body: 'Sideline passes and ticket details secured for this Michigan matchup.',
    time: '7s',
    priority: 'normal',
  },
  {
    title: 'Offer list updated',
    body: 'New Notre Dame offer officially logged on your public profile.',
    time: '7s',
    priority: 'high',
  },
  {
    title: 'Recruiting pipeline active',
    body: 'Agent X is managing all outbound replies and capturing coach engagement live.',
    time: 'live',
    priority: 'urgent',
  },
];

const ACTION_PLAN_COMMAND_CENTER_NOTIFICATIONS: readonly ActionPlanCommandCenterNotification[] =
  ACTION_PLAN_COMMAND_CENTER_NOTIFICATION_COPY.map((notification, index) => {
    const collegeLogo =
      ACTION_PLAN_COMMAND_CENTER_COLLEGE_LOGOS[
        index % ACTION_PLAN_COMMAND_CENTER_COLLEGE_LOGOS.length
      ];

    return {
      ...notification,
      collegeName: collegeLogo?.collegeName ?? 'College Program',
      collegeLogoUrl: collegeLogo?.collegeLogoUrl ?? '',
      delayMs: ACTION_PLAN_COMMAND_NOTIFICATION_DELAYS_MS[index] ?? 4_240 + index * 50,
    };
  });

@Component({
  selector: 'nxt1-interactive-demo-reel',
  standalone: true,
  imports: [
    AgentXActionPlanCardComponent,
    AgentXInputBarComponent,
    NxtAgentXExtendedThinkingComponent,
    AgentXOperationChatThinkingComponent,
    AgentXToolStepsComponent,
    NxtIconComponent,
    NxtLogoComponent,
    NxtPlatformIconComponent,
  ],
  template: `
    <section
      class="launch-film"
      [class.launch-film--phone]="timeline.showPhone()"
      [class.launch-film--cascade]="timeline.showCascade()"
      aria-label="NXT1 reel launch film"
    >
      @if (timeline.showCoordinator()) {
        <div
          class="launch-film__slide launch-film__slide--coordinator-transition"
          aria-label="Recruiting Coordinator opener"
        >
          <div class="launch-film__coordinator-backdrop">
            <div class="launch-film__coordinator-mark">
              <div class="launch-film__coordinator-copy">
                <strong class="launch-film__coordinator-title">Recruiting Coordinator</strong>
              </div>

              <div class="launch-film__coordinator-loader" aria-hidden="true">
                <nxt1-agent-x-operation-chat-thinking
                  class="launch-film__coordinator-thinking"
                  [label]="'On it..'"
                />
              </div>
            </div>
          </div>
        </div>
      } @else if (timeline.showActionPlan()) {
        <div
          class="launch-film__slide launch-film__slide--action-plan-neon"
          aria-label="Agent X action plan"
        >
          <div class="launch-film__action-plan-neon-panel">
            <div
              class="launch-film__action-plan-motion"
              [class.launch-film__action-plan-motion--phone-reveal]="
                timeline.showActionPlanPhoneReveal()
              "
            >
              <div class="launch-film__action-plan-closing-headline">
                Your Custom Digital Assistants.<br />Recruiting on Autopilot.
              </div>
              <div
                class="launch-film__action-plan-stage"
                [class.launch-film__action-plan-stage--phone-reveal]="
                  timeline.showActionPlanPhoneReveal()
                "
              >
                @if (timeline.showActionPlanThinking()) {
                  <div class="launch-film__action-plan-thinking" aria-label="Agent X thinking">
                    <div class="launch-film__action-plan-thinking-shell">
                      <nxt1-agent-x-operation-chat-thinking
                        label="Thinking"
                        detail="Reviewing film, coach fit, and next recruiting actions."
                      />
                    </div>
                  </div>
                }

                @if (timeline.showActionPlanReasoning()) {
                  <div class="launch-film__action-plan-reasoning" aria-label="Agent X reasoning">
                    <div class="launch-film__action-plan-reasoning-shell">
                      <nxt1-agent-x-extended-thinking
                        [content]="actionPlanReasoningText"
                        [isStreaming]="false"
                      />
                    </div>
                  </div>
                }

                <div class="launch-film__action-plan-copy">
                  <strong
                    class="launch-film__action-plan-title"
                    [class.launch-film__action-plan-title--typing]="
                      !timeline.actionPlanTitleComplete()
                    "
                  >
                    {{ timeline.actionPlanTitle() }}
                  </strong>
                </div>

                @if (timeline.showActionPlanToolSteps()) {
                  <div class="launch-film__action-plan-tools" aria-label="Agent X tool activity">
                    <div class="launch-film__action-plan-tools-shell">
                      <nxt1-agent-x-tool-steps
                        [steps]="visibleActionPlanToolSteps()"
                        [alwaysOpen]="true"
                      />
                    </div>
                  </div>
                }

                @if (timeline.showActionPlanFollowup()) {
                  <div class="launch-film__action-plan-followup-wrap">
                    <strong
                      class="launch-film__action-plan-followup"
                      [class.launch-film__action-plan-followup--typing]="
                        !timeline.actionPlanFollowupComplete()
                      "
                    >
                      {{ timeline.actionPlanFollowup() }}
                    </strong>
                  </div>
                }

                @if (timeline.showActionPlanCards()) {
                  <div class="launch-film__action-plan-stack" aria-label="Weekly action plan cards">
                    @for (task of visiblePromoActionPlanItems(); track task.id; let i = $index) {
                      <div class="launch-film__action-plan-card-wrap" [style.--tap-delay]="'980ms'">
                        @if (i < timeline.actionPlanRunningSessionCount()) {
                          <div class="launch-film__action-plan-session log-entry log-entry--active">
                            <button
                              type="button"
                              class="log-entry-main"
                              aria-label="Running Agent X session"
                            >
                              <span class="log-entry-status log-entry-status--active">
                                <span class="log-entry-spinner">
                                  <nxt1-icon name="refresh" [size]="14" />
                                </span>
                              </span>

                              <div class="log-entry-content">
                                <h4 class="log-entry-title">{{ task.title }}</h4>
                                <div class="log-entry-meta">
                                  <span class="log-entry-time">Now</span>
                                  <span class="log-entry-duration">
                                    <nxt1-icon name="time" [size]="10" />
                                    In progress
                                  </span>
                                </div>
                              </div>
                            </button>

                            <div class="log-entry-actions">
                              <button
                                type="button"
                                class="log-entry-menu-trigger"
                                aria-label="Open session actions"
                              >
                                <nxt1-icon name="moreHorizontal" [size]="18" />
                              </button>
                            </div>
                          </div>
                        } @else {
                          <nxt1-agent-x-action-plan-card
                            class="launch-film__action-plan-card"
                            [task]="task"
                            [animationDelayMs]="0"
                            [animateIn]="true"
                            [featured]="i === 0"
                            [showWhy]="false"
                          />
                          <span class="launch-film__action-plan-cursor" aria-hidden="true">
                            <span class="launch-film__action-plan-cursor-mark"></span>
                            <span class="launch-film__action-plan-cursor-ring"></span>
                          </span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              <div
                class="launch-film__action-plan-phone"
                [class.launch-film__action-plan-phone--visible]="
                  timeline.showActionPlanPhoneReveal()
                "
                aria-hidden="true"
              >
                @for (variant of ['left', 'center', 'right']; track variant) {
                  <div
                    class="launch-film__action-plan-phone-copy"
                    [class]="'launch-film__action-plan-phone-copy--' + variant"
                  >
                    <div class="launch-film__action-plan-phone-device">
                      <div class="launch-film__action-plan-phone-island"></div>
                      <div class="launch-film__action-plan-phone-screen">
                        <img
                          class="launch-film__action-plan-phone-image"
                          [src]="actionPlanPhoneImageSrcByVariant[variant]"
                          alt="Athlete recruiting profile preview"
                        />
                      </div>
                    </div>
                  </div>
                }
              </div>

              @if (
                timeline.showActionPlanNotificationPill() && !timeline.showActionPlanCommandCenter()
              ) {
                <div
                  class="launch-film__notification-pill-wrap"
                  [class.launch-film__notification-pill-wrap--clicking]="
                    timeline.showActionPlanNotificationClick()
                  "
                  aria-label="Agent X notifications"
                >
                  <div class="launch-film__notification-pill">
                    <span class="launch-film__notification-bell" aria-hidden="true">
                      <nxt1-icon name="bell" [size]="22" />
                    </span>
                    <span class="launch-film__notification-copy">Agent X activity</span>
                    <span class="launch-film__notification-badge" aria-label="42 new notifications">
                      <span>3</span>
                      <span>11</span>
                      <span>27</span>
                      <span>42</span>
                    </span>
                    <span class="launch-film__notification-ripple" aria-hidden="true"></span>
                  </div>

                  @if (timeline.showActionPlanNotificationClick()) {
                    <span class="launch-film__notification-cursor" aria-hidden="true">
                      <span class="launch-film__notification-cursor-mark"></span>
                      <span class="launch-film__notification-cursor-ring"></span>
                    </span>
                  }
                </div>
              }
            </div>

            @if (timeline.showActionPlanCommandCenter()) {
              <div class="launch-film__command-overlay" aria-label="Agent X activity notifications">
                <div class="launch-film__command-scrim" aria-hidden="true"></div>

                <section class="launch-film__command-hud">
                  <div class="launch-film__command-camera">
                    <div class="launch-film__command-screen">
                      <div
                        class="launch-film__command-feed-window"
                        aria-label="Agent X activity notifications"
                      >
                        <h2 class="launch-film__command-title">Activity</h2>
                        <div class="launch-film__command-feed">
                          @for (
                            notification of commandCenterNotifications;
                            track notification.title
                          ) {
                            <article
                              class="launch-film__command-activity"
                              [class.launch-film__command-activity--urgent]="
                                notification.priority === 'urgent'
                              "
                              [class.launch-film__command-activity--high]="
                                notification.priority === 'high'
                              "
                              [style.--blast-delay]="notification.delayMs + 'ms'"
                            >
                              <div class="launch-film__command-activity-visual">
                                <div class="launch-film__command-activity-icon-circle">
                                  <img
                                    [src]="notification.collegeLogoUrl"
                                    [alt]="notification.collegeName + ' logo'"
                                    width="22"
                                    height="22"
                                    loading="eager"
                                    decoding="async"
                                  />
                                </div>
                              </div>

                              <div class="launch-film__command-activity-content">
                                <div class="launch-film__command-activity-header">
                                  <span class="launch-film__command-activity-title">{{
                                    notification.title
                                  }}</span>
                                  <span class="launch-film__command-activity-time">{{
                                    notification.time
                                  }}</span>
                                </div>
                                <p class="launch-film__command-activity-body">
                                  {{ notification.body }}
                                </p>
                              </div>

                              <div class="launch-film__command-activity-trailing">
                                <div class="launch-film__command-activity-unread-dot"></div>
                              </div>
                            </article>
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="launch-film__command-finale" aria-hidden="true">
                    <p>Focus on your game. We'll handle the rest.</p>
                  </div>
                </section>
              </div>
            }
          </div>
        </div>
      } @else if (timeline.showHook() || timeline.showOutro()) {
        <div class="launch-film__slide launch-film__slide--hook" aria-label="The Hook">
          <div class="launch-film__hook-mark launch-film__hook-mark--prompt">
            @if (timeline.showHook()) {
              <nxt1-agent-x-input-bar
                class="launch-film__prompt-real launch-film__hook-real launch-film__prompt-real--sendfx"
                [class.launch-film__prompt-real--selected]="timeline.hookPromptSendSelected()"
                [userMessage]="timeline.hookPrompt()"
                [placeholder]="'Message Agent X'"
                [isLoading]="false"
                [uploading]="false"
                [canSend]="timeline.hookPromptCanSend()"
                [pendingFiles]="[]"
                [pendingSources]="[]"
                [pendingContexts]="[]"
                [selectedTask]="null"
              />
            } @else {
              <div
                class="launch-film__hook-typewriter"
                aria-label="Not A Chatbot. A Real Work Engine."
              >
                <span class="launch-film__hook-line1">Not A Chatbot.</span>
                <span class="launch-film__hook-line2">A Real Work Engine.</span>
              </div>
            }
          </div>
        </div>
      } @else if (timeline.showPrompt()) {
        <div
          class="launch-film__slide launch-film__slide--prompt"
          aria-label="Agent X prompt intro"
        >
          <div class="launch-film__prompt-stage">
            <nxt1-agent-x-input-bar
              class="launch-film__prompt-real launch-film__cascade-real"
              [class.launch-film__prompt-real--selected]="timeline.introSendSelected()"
              [class.launch-film__prompt-real--source-active]="timeline.hudlSourceActive()"
              [userMessage]="timeline.typedPrompt()"
              [placeholder]="'Message Agent X'"
              [isLoading]="false"
              [uploading]="false"
              [canSend]="timeline.introCanSend()"
              [pendingFiles]="[]"
              [pendingSources]="timeline.pendingSources()"
              [pendingContexts]="[]"
              [selectedTask]="null"
            />
          </div>
        </div>
      } @else if (timeline.showCascade()) {
        <div
          class="launch-film__slide launch-film__slide--cascade"
          aria-label="Agent X role cascade"
        >
          <div class="launch-film__cascade-carousel" aria-label="Coordinator prompt carousel">
            @for (row of timeline.cascadeRows(); track row.role) {
              <article
                class="launch-film__cascade-card"
                [class.launch-film__cascade-card--active]="row.active"
                [class.launch-film__cascade-card--next]="row.next"
                [class.launch-film__cascade-card--back]="row.back"
                [class.launch-film__cascade-card--hidden]="row.hidden"
                [class.launch-film__cascade-card--complete]="row.complete"
              >
                <div class="launch-film__cascade-card-top">
                  <span>{{ row.role }}</span>
                  <strong>{{ row.unit }}</strong>
                </div>

                <nxt1-agent-x-input-bar
                  class="launch-film__prompt-real launch-film__cascade-real"
                  [class.launch-film__prompt-real--selected]="row.sendSelected"
                  [userMessage]="row.userMessage"
                  [placeholder]="'Message ' + row.role"
                  [isLoading]="false"
                  [uploading]="false"
                  [canSend]="row.canSend"
                  [pendingFiles]="[]"
                  [pendingSources]="[]"
                  [pendingContexts]="[]"
                  [selectedTask]="null"
                />

                <aside
                  class="launch-film__cascade-output"
                  [class.launch-film__cascade-output--visible]="row.outputVisible"
                  [class.launch-film__cascade-output--performance]="
                    row.outputKind === 'performance'
                  "
                  [class.launch-film__cascade-output--recruiting]="row.outputKind === 'recruiting'"
                  [class.launch-film__cascade-output--brand]="row.outputKind === 'brand'"
                  [class.launch-film__cascade-output--data]="row.outputKind === 'data'"
                  [class.launch-film__cascade-output--strategy]="row.outputKind === 'strategy'"
                  aria-label="Agent X generated output"
                >
                  @switch (row.outputKind) {
                    @case ('performance') {
                      <div class="launch-film__artifact-bar">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your PDF download is ready</strong>
                        </div>
                        <svg
                          class="launch-film__pdf-icon"
                          viewBox="0 0 48 56"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M8 2H30L44 16V50C44 52.2 42.2 54 40 54H8C5.8 54 4 52.2 4 50V6C4 3.8 5.8 2 8 2Z"
                          />
                          <path d="M30 2V15C30 16.1 30.9 17 32 17H44" />
                          <rect x="10" y="28" width="28" height="15" rx="3" />
                          <text x="24" y="39" text-anchor="middle">PDF</text>
                        </svg>
                      </div>
                      <div class="launch-film__pdf-preview" aria-hidden="true">
                        <div class="launch-film__pdf-image-placeholder">
                          <img class="launch-film__pdf-image" [src]="pdfPlaysImageSrc" alt="" />
                        </div>
                      </div>
                      <button type="button" class="launch-film__pdf-download" aria-hidden="true">
                        <nxt1-icon name="download" [size]="16" />
                        Download PDF
                      </button>
                    }
                    @case ('recruiting') {
                      <div class="launch-film__mail-card">
                        <div class="launch-film__mail-header">
                          <div class="launch-film__gmail-icon" aria-hidden="true">
                            <nxt1-platform-icon
                              icon="link"
                              faviconUrl="https://www.google.com/s2/favicons?domain=mail.google.com&sz=64"
                              [size]="24"
                              alt="Gmail"
                            />
                          </div>
                          <div>
                            <span>{{ row.outputMeta }}</span>
                            <strong>Your email draft is ready</strong>
                          </div>
                        </div>
                        <div class="launch-film__school-stack" aria-hidden="true">
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/194.png"
                            alt="Ohio State"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/150.png"
                            alt="Duke"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/61.png"
                            alt="Georgia"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                          <img
                            src="https://a.espncdn.com/i/teamlogos/ncaa/500/24.png"
                            alt="Stanford"
                            width="42"
                            height="42"
                            loading="lazy"
                          />
                        </div>
                        <p>{{ row.outputDetail }}</p>
                        <div class="confirm-card launch-film__approval-card">
                          <div class="confirm-card__header">
                            <svg class="confirm-card__icon" viewBox="0 0 20 20" fill="none">
                              <circle
                                cx="10"
                                cy="10"
                                r="8"
                                stroke="currentColor"
                                stroke-width="1.5"
                              />
                              <path
                                d="M10 6V11"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                              />
                              <circle cx="10" cy="14" r="1" fill="currentColor" />
                            </svg>
                            <span class="confirm-card__title">Review and Approve Email</span>
                          </div>
                          <p class="confirm-card__message">
                            Review the generated coach outreach before Agent X sends it.
                          </p>
                          <div
                            class="launch-film__email-draft-preview"
                            aria-label="Email draft preview"
                          >
                            <div class="launch-film__email-draft-row">
                              <span>Subject</span>
                              <strong>2026 DB film, transcript, and verified testing</strong>
                            </div>
                            <div class="launch-film__email-draft-body">
                              <span>Body</span>
                              <p>
                                Coach, I wanted to send my updated senior film, transcript, and
                                spring testing numbers. I also attached my academic profile and
                                next-game schedule for your staff to review.
                              </p>
                            </div>
                          </div>
                          <div class="confirm-card__actions">
                            <button type="button" class="confirm-btn confirm-btn--secondary">
                              Cancel
                            </button>
                            <button type="button" class="confirm-btn confirm-btn--primary">
                              Approve
                            </button>
                          </div>
                        </div>
                      </div>
                    }
                    @case ('brand') {
                      <div class="launch-film__artifact-bar">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your graphics package is ready</strong>
                        </div>
                      </div>
                      <div class="launch-film__graphic-grid" aria-hidden="true">
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--hero launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="finalScoreVideoImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Story graphic</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--clip launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="statCardVideoImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Game recap</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--poster launch-film__graphic-placeholder--image"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="prospectCardAthleteImageSrc"
                              alt=""
                            />
                          </div>
                          <figcaption>Athlete post</figcaption>
                        </figure>
                        <figure>
                          <div
                            class="launch-film__graphic-placeholder launch-film__graphic-placeholder--banner launch-film__graphic-placeholder--image launch-film__graphic-placeholder--video"
                          >
                            <img
                              class="launch-film__graphic-image"
                              [src]="highlightVideoImageSrc"
                              alt=""
                            />
                            <span class="launch-film__graphic-video-badge" aria-hidden="true">
                              <nxt1-icon name="play-circle-outline" [size]="18" />
                            </span>
                          </div>
                          <figcaption>Athlete video</figcaption>
                        </figure>
                      </div>
                    }
                    @case ('data') {
                      <div class="launch-film__artifact-bar launch-film__artifact-bar--schedule">
                        <span class="launch-film__schedule-icon" aria-hidden="true">
                          <nxt1-icon name="calendar-outline" [size]="22" />
                        </span>
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your scheduled sync is ready</strong>
                        </div>
                      </div>
                      <div class="launch-film__sync-list" aria-hidden="true">
                        <span><b>84</b>Profiles</span>
                        <span><b>12</b>Roster edits</span>
                        <span><b>6</b>Leaderboards</span>
                        <span><b>41</b>Stat lines</span>
                        <span><b>18</b>New rankings</span>
                        <span><b>9</b>Team pages</span>
                        <span><b>27</b>Player IDs</span>
                        <span><b>3</b>Alerts queued</span>
                      </div>
                    }
                    @default {
                      <div class="launch-film__strategy-card">
                        <div>
                          <span>{{ row.outputMeta }}</span>
                          <strong>Your call sheet is ready</strong>
                        </div>
                        <div class="launch-film__strategy-image-placeholder" aria-hidden="true">
                          <img
                            class="launch-film__strategy-image"
                            [src]="strategyCallSheetImageSrc"
                            alt=""
                          />
                        </div>
                        <p>{{ row.outputDetail }}</p>
                        <div class="launch-film__strategy-actions" aria-hidden="true">
                          <button type="button">Print</button>
                          <button type="button">Share</button>
                        </div>
                      </div>
                    }
                  }
                </aside>
              </article>
            }
          </div>
        </div>
      } @else if (timeline.showFinale()) {
        <div class="launch-film__slide launch-film__slide--finale" aria-label="NXT1 finale">
          <div
            class="launch-film__finale-copy"
            aria-label="BUILT FOR PERFORMANCE. BRAND. STRATEGY. ADMIN. DATA. RECRUITING."
          >
            <span class="launch-film__finale-kicker">BUILT FOR</span>
            <div class="launch-film__finale-words" aria-hidden="true">
              <span class="launch-film__finale-word launch-film__finale-word--performance"
                >PERFORMANCE.</span
              >
              <span class="launch-film__finale-word launch-film__finale-word--brand">BRAND.</span>
              <span class="launch-film__finale-word launch-film__finale-word--strategy"
                >STRATEGY.</span
              >
              <span class="launch-film__finale-word launch-film__finale-word--admin">ADMIN.</span>
              <span class="launch-film__finale-word launch-film__finale-word--data">DATA.</span>
              <span class="launch-film__finale-word launch-film__finale-word--recruiting"
                >RECRUITING.</span
              >
            </div>
          </div>

          <div class="launch-film__finale-url-panel" aria-label="nxt1sports.com NXT1 Sports">
            <div class="launch-film__finale-url-card">
              <span class="launch-film__finale-url-text">nxt1sports.com</span>
              <nxt1-logo
                class="launch-film__finale-logo"
                size="xl"
                variant="default"
                alt="NXT1 Sports"
              />
            </div>
          </div>
        </div>
      } @else {
        <div class="launch-film__slide launch-film__slide--phone" aria-label="Device handoff">
          <div class="launch-film__device-handoff">
            <div class="launch-film__iphone" aria-hidden="true">
              <div class="launch-film__island"></div>
              <div class="launch-film__screen">
                @if (phoneVideoSrc()) {
                  <video
                    class="launch-film__phone-video"
                    [src]="phoneVideoSrc()"
                    autoplay
                    [loop]="shouldLoopPhoneVideo"
                    muted
                    playsinline
                    preload="auto"
                    (ended)="handlePhoneVideoEnded()"
                  ></video>
                } @else {
                  <img
                    class="launch-film__phone-image"
                    [src]="actionPlanPhoneImageSrc"
                    alt="Athlete recruiting profile preview"
                  />
                }
              </div>
            </div>

            <div class="launch-film__desktop" aria-hidden="true">
              <div class="launch-film__desktop-glow"></div>
              <div class="launch-film__desktop-frame">
                <div class="launch-film__desktop-camera"></div>
                <div class="launch-film__desktop-screen">
                  @if (desktopVideoActive()) {
                    <video
                      class="launch-film__desktop-video"
                      [src]="desktopVideoSrc"
                      autoplay
                      muted
                      playsinline
                      preload="auto"
                      (ended)="handleDesktopVideoEnded()"
                    ></video>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        color: #f7f7f2;
      }

      .launch-film {
        container-type: size;
        isolation: isolate;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
        font-family: var(--nxt1-fontFamily-brand, Inter, sans-serif);
      }

      .launch-film::before,
      .launch-film::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .launch-film::before {
        z-index: 0;
        inset: -24%;
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 14%,
            rgba(204, 255, 0, 0.92) 30%,
            rgba(255, 255, 255, 0.88) 48%,
            rgba(204, 255, 0, 0.62) 66%,
            transparent 84%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(0, 0, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(0, 0, 0, 0.05) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.28) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(204, 255, 0, 0.2) 44%, transparent 78%);
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%;
        filter: blur(18px) saturate(1.06);
        opacity: 0.9;
        transform: translate3d(-2cqi, -1cqh, 0) rotate(-2deg);
        animation: launch-film-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film::after {
        z-index: 0;
        background:
          linear-gradient(
            128deg,
            transparent 0%,
            transparent 58%,
            rgba(0, 0, 0, 0.1) 74%,
            transparent 88%
          ),
          linear-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.026) 1px, transparent 1px);
        background-size:
          170% 170%,
          100% 5.2cqh,
          5.2cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.72;
        animation: launch-film-atmosphere 13s ease-in-out infinite alternate;
      }

      .launch-film--cascade {
        background: #050705;
      }

      .launch-film--cascade::before {
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 18%,
            rgba(204, 255, 0, 0.18) 31%,
            rgba(5, 7, 5, 0.94) 46%,
            rgba(10, 16, 12, 0.86) 58%,
            rgba(204, 255, 0, 0.12) 70%,
            transparent 88%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(204, 255, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(65, 184, 255, 0.08) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.12) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(65, 184, 255, 0.08) 44%, transparent 78%);
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%;
        filter: blur(18px) saturate(1.06);
        opacity: 0.78;
        transform: translate3d(-2cqi, -1cqh, 0) rotate(-2deg);
        animation: launch-film-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film--cascade::after {
        background:
          linear-gradient(
            128deg,
            transparent 0%,
            transparent 58%,
            rgba(255, 255, 255, 0.1) 74%,
            transparent 88%
          ),
          linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
        background-size:
          170% 170%,
          100% 5.2cqh,
          5.2cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.72;
        animation: launch-film-atmosphere 13s ease-in-out infinite alternate;
      }

      .launch-film__slide {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        place-items: center;
        padding: 8cqh 10cqi;
      }

      .launch-film__slide--hook {
        overflow: hidden;
        justify-items: center;
        align-items: center;
        padding: 0 8cqi;
        background: #ccff00;
      }

      .launch-film__slide--coordinator-transition {
        overflow: hidden;
        padding: 0;
        background: #ccff00;
      }

      .launch-film__slide--action-plan-neon {
        overflow: hidden;
        justify-items: stretch;
        align-items: stretch;
        padding: 0;
        background: transparent;
      }

      .launch-film__coordinator-backdrop {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 0 8cqi;
      }

      .launch-film__action-plan-neon-panel {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: grid;
        align-content: start;
        padding: 12cqh 6cqi 0;
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 14%,
            rgba(204, 255, 0, 0.92) 30%,
            rgba(255, 255, 255, 0.88) 48%,
            rgba(204, 255, 0, 0.62) 66%,
            transparent 84%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(0, 0, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(0, 0, 0, 0.05) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.28) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(204, 255, 0, 0.2) 44%, transparent 78%),
          #ffffff;
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%,
          100% 100%;
        animation: launch-film-action-plan-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite
          alternate;
        transform: none;
        opacity: 1;
        filter: none;
      }

      .launch-film__action-plan-motion {
        position: relative;
        display: grid;
        align-content: start;
        width: min(100%, 96cqi);
        min-height: 76cqh;
        box-sizing: border-box;
        padding-top: 0;
        margin: 0 auto;
        transform-origin: 50% 18%;
        perspective: 150cqh;
        will-change: transform, opacity;
        animation: none;
      }

      .launch-film__action-plan-stage {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 2.4cqh;
        justify-items: stretch;
        transform-origin: 50% 12%;
        will-change: transform;
        animation: none;
      }

      .launch-film__action-plan-stage--phone-reveal {
        pointer-events: none;
        animation: launch-film-action-plan-stage-exit 620ms cubic-bezier(0.18, 0.82, 0.16, 1) both;
      }

      .launch-film__action-plan-phone {
        position: absolute;
        left: 50%;
        top: 48%;
        z-index: 5;
        width: min(50cqi, 44cqh);
        aspect-ratio: 1179 / 2394;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(-50%, 76cqh, 0) rotateX(18deg) rotateZ(-5deg) scale(0.78);
        transform-origin: 50% 70%;
        transform-style: preserve-3d;
        filter: blur(1px) saturate(0.92);
      }

      .launch-film__action-plan-phone--visible {
        animation: launch-film-action-plan-phone-focus-tour 4260ms cubic-bezier(0.18, 0.82, 0.16, 1)
          both;
      }

      .launch-film__action-plan-closing-headline {
        position: absolute;
        left: 50%;
        top: -3.2cqh;
        z-index: 8;
        width: min(124cqi, 104cqh);
        margin: 0;
        color: rgba(7, 10, 7, 0.94);
        text-align: center;
        text-wrap: balance;
        font-size: clamp(30px, 4.2cqh, 58px);
        font-weight: 800;
        line-height: 0.96;
        letter-spacing: -0.05em;
        text-shadow: 0 1cqh 2.4cqh rgba(255, 255, 255, 0.24);
        opacity: 0;
        transform: translate3d(-50%, 3.2cqh, 0) scale(0.96);
        pointer-events: none;
      }

      .launch-film__action-plan-closing-headline {
        will-change: transform, opacity;
      }

      .launch-film__action-plan-motion--phone-reveal .launch-film__action-plan-closing-headline {
        animation: launch-film-action-plan-phone-headline-in 4260ms
          cubic-bezier(0.18, 0.82, 0.16, 1) both;
      }

      .launch-film__action-plan-phone-copy {
        position: absolute;
        inset: 0;
        opacity: 0;
        transform-origin: 50% 50%;
        transform-style: preserve-3d;
      }

      .launch-film__action-plan-phone-copy--center {
        opacity: 1;
      }

      .launch-film__action-plan-phone--visible .launch-film__action-plan-phone-copy--center {
        animation: launch-film-action-plan-phone-center-fan 4260ms cubic-bezier(0.18, 0.82, 0.16, 1)
          both;
      }

      .launch-film__action-plan-phone--visible .launch-film__action-plan-phone-copy--left {
        animation: launch-film-action-plan-phone-left-fan 4260ms cubic-bezier(0.18, 0.82, 0.16, 1)
          both;
      }

      .launch-film__action-plan-phone--visible .launch-film__action-plan-phone-copy--right {
        animation: launch-film-action-plan-phone-right-fan 4260ms cubic-bezier(0.18, 0.82, 0.16, 1)
          both;
      }

      .launch-film__notification-pill-wrap {
        position: absolute;
        left: 50%;
        top: min(7.1cqh, 66px);
        z-index: 12;
        display: grid;
        place-items: center;
        opacity: 0;
        transform: translate3d(-50%, 1.8cqh, 0) scale(0.92);
        pointer-events: none;
        animation: launch-film-notification-pill-in 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__notification-pill {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-height: 54px;
        padding: 9px 12px 9px 16px;
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.14));
        border-radius: 999px;
        background:
          radial-gradient(circle at 18% 0%, rgba(204, 255, 0, 0.18), transparent 48%),
          linear-gradient(180deg, rgba(10, 15, 12, 0.92), rgba(5, 7, 5, 0.94));
        box-shadow:
          var(--nxt1-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.45)),
          0 0 0 1px rgba(204, 255, 0, 0.1),
          0 0 32px rgba(204, 255, 0, 0.14);
        color: #ffffff;
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(18px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(18px));
      }

      .launch-film__notification-pill-wrap--clicking .launch-film__notification-pill {
        animation: launch-film-notification-pill-click 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__notification-bell {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: rgba(204, 255, 0, 0.12);
        color: #ccff00;
        box-shadow: inset 0 0 0 1px rgba(204, 255, 0, 0.2);
        transform-origin: 50% 4px;
        animation: launch-film-notification-bell-ring 760ms ease-in-out 220ms 3 both;
      }

      .launch-film__notification-copy {
        position: relative;
        z-index: 1;
        color: rgba(248, 255, 243, 0.92);
        font-size: clamp(14px, 1.7cqi, 18px);
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1;
        white-space: nowrap;
      }

      .launch-film__notification-badge {
        position: relative;
        z-index: 2;
        display: grid;
        place-items: center;
        width: 31px;
        height: 31px;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.92);
        border-radius: 999px;
        background: var(--nxt1-color-error, #ef4444);
        color: #ffffff;
        box-shadow:
          0 8px 18px rgba(239, 68, 68, 0.36),
          0 0 18px rgba(239, 68, 68, 0.3);
        animation: launch-film-notification-badge-pop 980ms cubic-bezier(0.16, 1, 0.3, 1) 180ms both;
      }

      .launch-film__notification-badge span {
        grid-area: 1 / 1;
        display: block;
        color: #ffffff;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        opacity: 0;
        transform: translate3d(0, 14px, 0) scale(0.8);
      }

      .launch-film__notification-badge span:nth-child(1) {
        animation: launch-film-notification-count-step 760ms ease-out 160ms both;
      }

      .launch-film__notification-badge span:nth-child(2) {
        animation: launch-film-notification-count-step 760ms ease-out 380ms both;
      }

      .launch-film__notification-badge span:nth-child(3) {
        animation: launch-film-notification-count-step 760ms ease-out 600ms both;
      }

      .launch-film__notification-badge span:nth-child(4) {
        animation: launch-film-notification-count-final 760ms ease-out 820ms both;
      }

      .launch-film__notification-ripple {
        position: absolute;
        inset: -8px;
        z-index: 0;
        border-radius: 999px;
        border: 1px solid rgba(204, 255, 0, 0.34);
        opacity: 0;
        transform: scale(0.86);
        animation: launch-film-notification-pill-ring 1280ms ease-out 260ms 2 both;
      }

      .launch-film__notification-cursor {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 4;
        width: clamp(42px, 5.6cqi, 56px);
        height: clamp(42px, 5.6cqi, 56px);
        pointer-events: none;
        transform-origin: 20% 20%;
        animation: launch-film-notification-cursor-click 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__notification-cursor-mark {
        position: absolute;
        inset: 0;
        display: block;
        filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.42))
          drop-shadow(0 0 10px rgba(255, 255, 255, 0.24));
      }

      .launch-film__notification-cursor-mark::before {
        content: '';
        position: absolute;
        left: 14%;
        top: 4%;
        width: 58%;
        height: 76%;
        background: #070707;
        clip-path: polygon(0 0, 0 100%, 28% 72%, 43% 100%, 60% 91%, 45% 64%, 82% 64%);
        border: 1px solid rgba(255, 255, 255, 0.78);
        border-radius: 3px;
      }

      .launch-film__notification-cursor-mark::after {
        content: '';
        position: absolute;
        left: 17%;
        top: 8%;
        width: 47%;
        height: 60%;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.18);
        clip-path: polygon(0 0, 0 100%, 28% 72%, 43% 100%, 60% 91%, 45% 64%, 82% 64%);
        transform: translate(1px, 1px);
      }

      .launch-film__notification-cursor-ring {
        position: absolute;
        left: -28%;
        top: -28%;
        width: 92%;
        height: 92%;
        border-radius: 999px;
        border: 2px solid rgba(204, 255, 0, 0.86);
        opacity: 0;
        transform: scale(0.34);
        animation: launch-film-notification-cursor-ring 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__command-overlay {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        padding: 0;
        overflow: hidden;
        color: var(--nxt1-color-text-primary, #ffffff);
        animation: launch-film-command-overlay-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__command-scrim {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 16%, rgba(204, 255, 0, 0.16), transparent 32%),
          linear-gradient(180deg, rgba(5, 7, 5, 0.78), rgba(5, 7, 5, 0.94));
        backdrop-filter: var(--nxt1-glass-backdropStrong, saturate(200%) blur(30px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdropStrong, saturate(200%) blur(30px));
      }

      .launch-film__command-hud {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 0;
        border-radius: 0;
        background:
          radial-gradient(circle at 50% -8%, rgba(204, 255, 0, 0.16), transparent 34%),
          linear-gradient(
            180deg,
            var(--nxt1-glass-bgSolid, rgba(22, 22, 22, 0.95)),
            rgba(6, 9, 7, 0.96)
          );
        box-shadow: inset 0 0 0 1px rgba(204, 255, 0, 0.08);
        padding: clamp(18px, 3cqh, 34px) clamp(14px, 3.2cqi, 36px);
        transform-origin: 50% 8%;
        animation: launch-film-command-hud-in 680ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both;
      }

      .launch-film__command-hud::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 34%),
          linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
        background-size:
          100% 100%,
          100% 34px,
          34px 100%;
        opacity: 0.72;
      }

      .launch-film__command-camera,
      .launch-film__command-screen,
      .launch-film__command-finale,
      .launch-film__command-feed-window,
      .launch-film__command-feed {
        position: relative;
        z-index: 1;
      }

      .launch-film__command-camera {
        align-self: stretch;
        min-height: 0;
        overflow: hidden;
      }

      .launch-film__command-screen {
        display: grid;
        grid-template-rows: auto;
        width: 100%;
        min-height: max-content;
        padding-bottom: 0;
        transform: translate3d(0, 0, 0);
        will-change: transform;
        animation: launch-film-command-camera-follow 5.8s linear 220ms both;
      }

      .launch-film__command-feed-window {
        display: grid;
        gap: clamp(10px, 1.8cqh, 18px);
        justify-self: center;
        align-self: start;
        width: min(100%, 720px);
        min-height: 0;
        overflow: visible;
        border: 0;
        border-radius: 0;
        background: transparent;
        animation: launch-film-command-feed-out 440ms ease 6s both;
      }

      .launch-film__command-title {
        margin: 0;
        color: rgba(248, 255, 243, 0.96);
        font-size: clamp(26px, 4.8cqi, 52px);
        font-weight: 900;
        letter-spacing: -0.05em;
        line-height: 0.9;
        text-shadow: 0 14px 38px rgba(0, 0, 0, 0.42);
      }

      .launch-film__command-feed {
        display: grid;
        align-content: start;
        padding: 0;
      }

      .launch-film__command-finale {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: clamp(28px, 6cqh, 80px);
        pointer-events: none;
      }

      .launch-film__command-finale p {
        margin: 0;
        max-width: min(84cqi, 820px);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: clamp(34px, 6.1cqi, 68px);
        font-weight: 900;
        letter-spacing: -0.05em;
        line-height: 0.92;
        text-align: center;
        text-wrap: balance;
        text-shadow: 0 18px 44px rgba(0, 0, 0, 0.46);
        opacity: 0;
        transform: translate3d(0, 3cqh, 0) scale(0.96);
        filter: blur(12px);
        animation: launch-film-command-finale-in 760ms cubic-bezier(0.16, 1, 0.3, 1) 6.16s both;
      }

      .launch-film__command-activity {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
        max-height: 0;
        padding: clamp(14px, 2cqh, 20px) clamp(16px, 2.6cqi, 26px);
        margin-top: 0;
        background: rgba(255, 255, 255, 0.04);
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        position: relative;
        overflow: hidden;
        opacity: 0;
        transform: translate3d(0, -14px, 0) scale(0.988);
        animation: launch-film-command-activity-blast 300ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--blast-delay) both;
      }

      .launch-film__command-activity:last-child {
        border-bottom: 0;
      }

      .launch-film__command-activity--urgent {
        border-left: 3px solid var(--nxt1-color-error, #ef4444);
      }

      .launch-film__command-activity--high {
        border-left: 3px solid var(--nxt1-color-warning, #f59e0b);
      }

      .launch-film__command-activity::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.16), transparent);
        opacity: 0;
        transform: translateX(-42%);
        animation: launch-film-command-activity-scan 640ms ease-out var(--blast-delay) both;
      }

      .launch-film__command-activity-visual {
        position: relative;
        flex-shrink: 0;
      }

      .launch-film__command-activity-icon-circle {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow:
          0 10px 18px rgba(0, 0, 0, 0.3),
          inset 0 1px 1px rgba(255, 255, 255, 0.14);
      }

      .launch-film__command-activity-icon-circle img {
        width: 30px;
        height: 30px;
        object-fit: contain;
        border-radius: 0;
      }

      .launch-film__command-activity-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .launch-film__command-activity-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .launch-film__command-activity-title {
        flex: 1;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: clamp(13px, 1.5cqi, 15px);
        font-weight: 700;
        line-height: 1.3;
      }

      .launch-film__command-activity-time {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 12px;
        line-height: 1.3;
        white-space: nowrap;
      }

      .launch-film__command-activity-body {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: clamp(12px, 1.4cqi, 14px);
        line-height: 1.4;
      }

      .launch-film__command-activity-trailing {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .launch-film__command-activity-unread-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
        box-shadow: 0 0 12px rgba(204, 255, 0, 0.72);
      }

      .launch-film__action-plan-phone-device {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 0.9cqi solid rgba(246, 248, 242, 0.98);
        border-radius: 6.4cqi;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(229, 235, 224, 0.96)), #f8faf5;
        box-shadow:
          0 5.4cqh 14cqh rgba(13, 18, 13, 0.32),
          0 0 0 1px rgba(255, 255, 255, 0.92),
          inset 0 0 0 1px rgba(15, 23, 42, 0.08);
      }

      .launch-film__action-plan-phone-island {
        position: absolute;
        top: 2.3%;
        left: 50%;
        z-index: 3;
        width: 34%;
        height: 3.4%;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.18);
        transform: translateX(-50%);
      }

      .launch-film__action-plan-phone-screen {
        position: absolute;
        top: 1.2%;
        right: 0.6%;
        bottom: 0;
        left: 0.6%;
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 1.4cqh;
        overflow: hidden;
        padding: 5.4cqh 2.4cqi 3cqh;
        border-radius: 5.2cqi;
        color: #0b0f0d;
        text-align: center;
        background:
          radial-gradient(circle at 50% 20%, rgba(204, 255, 0, 0.5), transparent 34%),
          linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(242, 247, 235, 0.94)), #f8faf5;
      }

      .launch-film__action-plan-phone-video {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #f8faf5;
      }

      .launch-film__action-plan-phone-image {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: fill;
        object-position: center top;
        background: #f8faf5;
      }

      .launch-film__action-plan-phone-orbit {
        position: absolute;
        inset: 12% -18% auto;
        height: 46%;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(204, 255, 0, 0.34), transparent 64%);
        filter: blur(12px);
        animation: launch-film-action-plan-phone-orbit 1800ms ease-in-out infinite alternate;
      }

      .launch-film__action-plan-phone-logo {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 9.4cqh;
        height: 9.4cqh;
        border-radius: 28%;
        background: #0b0f0d;
        box-shadow:
          0 1.8cqh 4.4cqh rgba(0, 0, 0, 0.24),
          0 0 0 1px rgba(204, 255, 0, 0.42);
      }

      .launch-film__action-plan-phone-kicker,
      .launch-film__action-plan-phone-title {
        position: relative;
        z-index: 1;
      }

      .launch-film__action-plan-phone-kicker {
        font-size: clamp(0.62rem, 1.8cqi, 0.82rem);
        font-weight: 850;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(11, 15, 13, 0.54);
      }

      .launch-film__action-plan-phone-title {
        max-width: 10ch;
        font-size: clamp(1.2rem, 4.2cqi, 2.1rem);
        font-weight: 950;
        line-height: 0.94;
        letter-spacing: 0;
      }

      .launch-film__action-plan-phone-bars {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 0.8cqh;
        width: 76%;
        margin-top: 1cqh;
      }

      .launch-film__action-plan-phone-bars span {
        display: block;
        height: 0.9cqh;
        border-radius: 999px;
        background: linear-gradient(90deg, #0b0f0d, rgba(204, 255, 0, 0.9));
        transform-origin: left center;
        animation: launch-film-action-plan-phone-bar 920ms ease-out both;
      }

      .launch-film__action-plan-phone-bars span:nth-child(2) {
        width: 72%;
        animation-delay: 160ms;
      }

      .launch-film__action-plan-phone-bars span:nth-child(3) {
        width: 88%;
        animation-delay: 320ms;
      }

      .launch-film__action-plan-copy {
        display: grid;
        gap: 1.4cqh;
        align-content: center;
        justify-items: start;
        text-align: left;
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__action-plan-thinking,
      .launch-film__action-plan-reasoning {
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__action-plan-thinking-shell,
      .launch-film__action-plan-reasoning-shell {
        position: relative;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background:
          linear-gradient(180deg, rgba(14, 20, 16, 0.9), rgba(8, 12, 10, 0.95)),
          radial-gradient(circle at top left, rgba(204, 255, 0, 0.1), transparent 54%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.06),
          0 16px 36px rgba(0, 0, 0, 0.18);
        overflow: hidden;
      }

      .launch-film__action-plan-thinking-shell {
        padding: 6px 4px;
      }

      .launch-film__action-plan-reasoning-shell {
        padding: 4px 2px;
      }

      .launch-film__action-plan-thinking-shell::before,
      .launch-film__action-plan-reasoning-shell::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(204, 255, 0, 0.08), transparent 38%);
      }

      .launch-film__action-plan-thinking-shell nxt1-agent-x-operation-chat-thinking,
      .launch-film__action-plan-reasoning-shell nxt1-agent-x-extended-thinking {
        position: relative;
        z-index: 1;
        display: block;
      }

      .launch-film__action-plan-thinking-shell ::ng-deep {
        --op-primary: #ccff00;
        --op-primary-glow: rgba(204, 255, 0, 0.16);
        --op-text: #f8fff3;
        --op-text-muted: rgba(248, 255, 243, 0.78);
        --op-text-secondary: rgba(236, 244, 236, 0.62);
        --op-border: transparent;
        --op-surface: transparent;
        --op-glass-bg: transparent;
      }

      .launch-film__action-plan-thinking-shell ::ng-deep .thinking-block {
        align-items: center;
        padding: 14px 18px;
      }

      .launch-film__action-plan-thinking-shell ::ng-deep .thinking-block__spinner {
        width: 16px;
        height: 16px;
      }

      .launch-film__action-plan-thinking-shell ::ng-deep .thinking-block__label {
        font-size: clamp(15px, 1.7cqi, 19px);
        font-weight: 700;
      }

      .launch-film__action-plan-thinking-shell ::ng-deep .thinking-block__detail {
        font-size: clamp(11px, 1.2cqi, 13px);
        line-height: 1.4;
      }

      .launch-film__action-plan-reasoning-shell ::ng-deep .ext-thinking {
        margin: 0;
        border-left-color: rgba(204, 255, 0, 0.28);
        color: rgba(236, 244, 236, 0.82);
      }

      .launch-film__action-plan-reasoning-shell ::ng-deep .ext-thinking__toggle {
        padding: 12px 16px;
      }

      .launch-film__action-plan-reasoning-shell ::ng-deep .ext-thinking__label {
        opacity: 0.92;
        font-size: clamp(13px, 1.5cqi, 16px);
        font-weight: 650;
      }

      .launch-film__action-plan-reasoning-shell ::ng-deep .ext-thinking__chevron {
        width: 15px;
        height: 15px;
      }

      .launch-film__action-plan-kicker {
        display: inline-flex;
        width: fit-content;
        padding: 0.72cqh 1.3cqi;
        border-radius: 999px;
        background: rgba(204, 255, 0, 0.1);
        border: 1px solid rgba(204, 255, 0, 0.2);
        color: #ccff00;
        font-size: clamp(11px, 1.55cqi, 14px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .launch-film__action-plan-title {
        position: relative;
        display: inline-flex;
        align-items: baseline;
        color: rgba(5, 7, 5, 0.88);
        font-size: clamp(18px, 2.4cqi, 26px);
        font-weight: 650;
        letter-spacing: -0.03em;
        line-height: 1.16;
        text-wrap: balance;
        text-shadow: 0 0.8cqh 2.8cqh rgba(5, 7, 5, 0.1);
      }

      .launch-film__action-plan-title--typing::after {
        content: none;
      }

      .launch-film__action-plan-summary {
        max-width: 48cqi;
        margin: 0;
        color: rgba(232, 240, 232, 0.72);
        font-size: clamp(14px, 1.9cqi, 18px);
        line-height: 1.52;
      }

      .launch-film__action-plan-tools {
        width: min(100%, 94cqi);
        margin: 0 auto;
        filter: drop-shadow(0 1.4cqh 3.4cqh rgba(0, 0, 0, 0.18));
      }

      .launch-film__action-plan-tools-shell {
        position: relative;
        display: block;
        padding: clamp(16px, 2.1cqh, 22px) clamp(18px, 2.4cqi, 28px);
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background:
          linear-gradient(180deg, rgba(14, 20, 16, 0.92), rgba(8, 12, 10, 0.96)),
          radial-gradient(circle at top left, rgba(204, 255, 0, 0.12), transparent 52%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.06),
          0 18px 44px rgba(0, 0, 0, 0.24);
        overflow: hidden;
      }

      .launch-film__action-plan-tools-shell::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(204, 255, 0, 0.08), transparent 38%);
      }

      .launch-film__action-plan-tools nxt1-agent-x-tool-steps {
        display: block;
        position: relative;
        z-index: 1;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-steps {
        padding: 8px 0;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-steps__summary {
        gap: 10px;
        font-size: clamp(16px, 2cqi, 22px);
        line-height: 1.3;
        padding: 6px 0;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-steps__summary-icon,
      .launch-film__action-plan-tools ::ng-deep .tool-steps__chevron {
        width: 20px;
        height: 20px;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-steps__list {
        gap: 8px;
        padding: 10px 0 4px 28px;
        margin-left: 10px;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-step {
        gap: 10px;
        font-size: clamp(15px, 1.75cqi, 20px);
        line-height: 1.35;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-step__icon {
        width: 20px;
        height: 20px;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-step__spinner,
      .launch-film__action-plan-tools ::ng-deep .tool-step__check,
      .launch-film__action-plan-tools ::ng-deep .tool-step__error-icon,
      .launch-film__action-plan-tools ::ng-deep .tool-step__glyph {
        width: 20px;
        height: 20px;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-step__content {
        gap: 4px;
      }

      .launch-film__action-plan-tools ::ng-deep .tool-step__context,
      .launch-film__action-plan-tools ::ng-deep .tool-step__detail {
        font-size: clamp(12px, 1.35cqi, 15px);
        line-height: 1.35;
      }

      .launch-film__action-plan-followup-wrap {
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__action-plan-followup {
        position: relative;
        display: inline-flex;
        align-items: baseline;
        color: rgba(5, 7, 5, 0.88);
        font-size: clamp(18px, 2.4cqi, 26px);
        font-weight: 650;
        letter-spacing: -0.03em;
        line-height: 1.16;
        text-wrap: balance;
      }

      .launch-film__action-plan-followup--typing::after {
        content: none;
      }

      .launch-film__action-plan-stack {
        --agent-surface: rgba(11, 16, 13, 0.94);
        --agent-surface-hover: rgba(16, 24, 19, 0.98);
        --agent-border: rgba(255, 255, 255, 0.08);
        --agent-primary: #ccff00;
        --agent-primary-glow: rgba(204, 255, 0, 0.14);
        --agent-text-primary: #f8fff3;
        --agent-text-secondary: rgba(236, 244, 236, 0.68);
        --log-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --log-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --log-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --log-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --log-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --log-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --log-primary: var(--nxt1-color-primary, #ccff00);
        --log-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --log-success: var(--nxt1-color-success, #4caf50);
        --log-error: var(--nxt1-color-error, #f44336);
        --log-warning: var(--nxt1-color-warning, #ffb020);
        --agent-action-card-padding: 18px;
        --agent-action-card-avatar-size: 52px;
        --agent-action-card-mark-size: 30px;
        --agent-action-card-button-padding: 8px 14px;
        --agent-action-card-primary-width: 100%;
        --agent-action-card-actions-direction: row;
        --agent-action-card-actions-align: center;
        --agent-action-card-actions-justify: stretch;
        --agent-action-card-actions-wrap: nowrap;
        --agent-action-card-button-align-self: stretch;
        --agent-action-card-button-width: 100%;
        --agent-action-card-secondary-width: 100%;
        display: grid;
        gap: 1.3cqh;
        justify-items: stretch;
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__action-plan-card {
        --agent-action-card-actions-justify: stretch;
      }

      .launch-film__action-plan-card-wrap {
        position: relative;
        isolation: isolate;
        min-width: 0;
      }

      .launch-film__action-plan-session {
        animation: launch-film-action-plan-session-enter 320ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .log-entry {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        min-height: 72px;
        padding: 14px 12px;
        border: 1px solid var(--log-border);
        border-radius: var(--nxt1-radius-lg, 14px);
        background: var(--log-surface);
        margin-bottom: 0;
        text-align: left;
        font-family: inherit;
        position: relative;
        z-index: 1;
        isolation: isolate;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .log-entry-main {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex: 1;
        min-width: 0;
        background: transparent;
        border: 0;
        padding: 0;
        margin: 0;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }

      .log-entry-actions {
        position: relative;
        display: flex;
        align-items: flex-start;
        flex-shrink: 0;
        min-width: 0;
        z-index: 3;
        padding-top: 1px;
      }

      .log-entry-menu-trigger {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 50%;
        background: transparent;
        padding: 0;
        color: var(--log-text-secondary);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
        flex-shrink: 0;
      }

      .log-entry-content {
        flex: 1;
        min-width: 0;
      }

      .log-entry-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--log-text-primary);
        margin: 1px 0 5px;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .log-entry-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        margin-top: 1px;
      }

      .log-entry-status--active {
        color: var(--log-primary);
      }

      .log-entry-spinner {
        display: inline-flex;
        transform: scale(1.08);
        animation: log-spin 1.2s linear infinite;
      }

      .log-entry-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 16px;
        flex-wrap: wrap;
      }

      .log-entry-time {
        font-size: 11px;
        font-weight: 500;
        color: var(--log-text-muted);
      }

      .log-entry-duration {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        font-weight: 500;
        color: var(--log-text-muted);
      }

      .log-entry--active {
        border-color: color-mix(in srgb, var(--log-primary) 50%, transparent);
        background: color-mix(in srgb, var(--log-primary) 4%, var(--log-surface));
        animation: log-glow-pulse 2s ease-in-out infinite;
      }

      .launch-film__action-plan-card-wrap::after {
        content: '';
        position: absolute;
        left: 14%;
        right: 53%;
        bottom: clamp(18px, 2.6cqh, 26px);
        height: clamp(28px, 4.2cqh, 40px);
        border-radius: 999px;
        pointer-events: none;
        opacity: 0;
        z-index: 2;
        background: radial-gradient(circle, rgba(204, 255, 0, 0.22) 0 34%, transparent 68%);
        filter: blur(0.2px);
        transform: scale(0.78);
        animation: launch-film-action-card-button-pulse 560ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--tap-delay) both;
      }

      .launch-film__action-plan-card .card-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        align-items: stretch;
        gap: 12px;
      }

      .launch-film__action-plan-card .card-secondary-actions {
        width: 100%;
      }

      .launch-film__action-plan-card .primary-btn,
      .launch-film__action-plan-card .snooze-btn {
        width: 100%;
      }

      .launch-film__action-plan-card {
        display: block;
        filter: drop-shadow(0 1.6cqh 4cqh rgba(0, 0, 0, 0.26));
      }

      .launch-film__action-plan-cursor {
        position: absolute;
        left: 32%;
        bottom: clamp(24px, 3.4cqh, 34px);
        width: clamp(38px, 5.4cqi, 52px);
        height: clamp(38px, 5.4cqi, 52px);
        pointer-events: none;
        z-index: 3;
        opacity: 1;
        transform: translate3d(-10px, -8px, 0) scale(0.96) rotate(-11deg);
        transform-origin: 20% 20%;
        animation: launch-film-action-card-cursor-tap 620ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--tap-delay) both;
      }

      .launch-film__action-plan-cursor-mark {
        position: absolute;
        inset: 0;
        display: block;
        filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.38))
          drop-shadow(0 0 10px rgba(255, 255, 255, 0.2));
      }

      .launch-film__action-plan-cursor-mark::before {
        content: '';
        position: absolute;
        left: 14%;
        top: 4%;
        width: 58%;
        height: 76%;
        background: #070707;
        clip-path: polygon(0 0, 0 100%, 28% 72%, 43% 100%, 60% 91%, 45% 64%, 82% 64%);
        border: 1px solid rgba(255, 255, 255, 0.78);
        border-radius: 3px;
      }

      .launch-film__action-plan-cursor-mark::after {
        content: '';
        position: absolute;
        left: 17%;
        top: 8%;
        width: 47%;
        height: 60%;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.18);
        clip-path: polygon(0 0, 0 100%, 28% 72%, 43% 100%, 60% 91%, 45% 64%, 82% 64%);
        transform: translate(1px, 1px);
      }

      .launch-film__action-plan-card-wrap ::ng-deep .primary-btn {
        position: relative;
        overflow: hidden;
        transform-origin: center center;
        animation: launch-film-action-card-primary-click 500ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--tap-delay) both;
      }

      .launch-film__action-plan-card-wrap ::ng-deep .primary-btn::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: radial-gradient(circle at center, rgba(255, 255, 255, 0.42), transparent 62%);
        opacity: 0;
        transform: scale(0.4);
        animation: launch-film-action-card-primary-flash 500ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--tap-delay) both;
        pointer-events: none;
      }

      .launch-film__action-plan-cursor-ring {
        position: absolute;
        left: -28%;
        top: -28%;
        width: 92%;
        height: 92%;
        border-radius: 999px;
        border: 2px solid rgba(204, 255, 0, 0.86);
        opacity: 0;
        transform: scale(0.34);
        animation: launch-film-action-card-cursor-ring 620ms cubic-bezier(0.16, 1, 0.3, 1)
          var(--tap-delay) both;
      }

      @keyframes launch-film-action-card-cursor-tap {
        0% {
          opacity: 1;
          transform: translate3d(34px, -28px, 0) scale(0.82) rotate(-11deg);
        }
        24% {
          opacity: 1;
          transform: translate3d(6px, -8px, 0) scale(1) rotate(-11deg);
        }
        42% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(0.84) rotate(-11deg);
        }
        58% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(0.93) rotate(-11deg);
        }
        82% {
          opacity: 1;
          transform: translate3d(-7px, -5px, 0) scale(0.98) rotate(-11deg);
        }
        100% {
          opacity: 1;
          transform: translate3d(-10px, -8px, 0) scale(0.96) rotate(-11deg);
        }
      }

      @keyframes launch-film-action-card-cursor-ring {
        0%,
        34% {
          opacity: 0;
          transform: scale(0.28);
        }
        46% {
          opacity: 0.88;
          transform: scale(0.46);
        }
        100% {
          opacity: 0;
          transform: scale(1.65);
        }
      }

      @keyframes launch-film-action-plan-session-enter {
        0% {
          opacity: 0;
          transform: translate3d(0, 1cqh, 0) scale(0.985);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-action-plan-stage-exit {
        0% {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
        18% {
          opacity: 0.96;
          transform: translate3d(0, -36cqh, 0);
        }
        62% {
          opacity: 0.18;
          transform: translate3d(0, -96cqh, 0);
        }
        100% {
          opacity: 0;
          transform: translate3d(0, -124cqh, 0);
        }
      }

      @keyframes launch-film-action-plan-phone-focus-tour {
        0% {
          opacity: 0;
          filter: blur(1px) saturate(0.92);
          transform: translate3d(-50%, 76cqh, 0) rotateX(18deg) rotateZ(-5deg) scale(0.78);
        }
        16% {
          opacity: 1;
          filter: blur(0) saturate(1.08);
          transform: translate3d(-50%, -50%, 0) rotateX(0deg) rotateZ(0deg) scale(1);
        }
        38% {
          opacity: 1;
          filter: blur(0) saturate(1.04);
          transform: translate3d(-50%, -30%, 0) rotateX(0deg) rotateZ(0deg) scale(1.72);
        }
        72% {
          opacity: 1;
          filter: blur(0) saturate(1.02);
          transform: translate3d(-50%, -70%, 0) rotateX(0deg) rotateZ(0deg) scale(1.72);
        }
        100% {
          opacity: 1;
          filter: blur(0) saturate(1);
          transform: translate3d(-50%, -50%, 0) rotateX(0deg) rotateZ(0deg) scale(0.48);
        }
      }

      @keyframes launch-film-action-plan-phone-center-fan {
        0%,
        72% {
          opacity: 1;
          transform: translate3d(0, 0, 0) rotateZ(0deg) scale(1);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, -24cqh, 0) rotateZ(0deg) scale(0.94);
        }
      }

      @keyframes launch-film-action-plan-phone-left-fan {
        0%,
        72% {
          opacity: 0;
          transform: translate3d(0, 0, -8cqh) rotateZ(0deg) scale(0.96);
        }
        82% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translate3d(-64cqi, 24cqh, -2cqh) rotateZ(-10deg) scale(0.9);
        }
      }

      @keyframes launch-film-action-plan-phone-right-fan {
        0%,
        72% {
          opacity: 0;
          transform: translate3d(0, 0, -8cqh) rotateZ(0deg) scale(0.96);
        }
        82% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translate3d(64cqi, 24cqh, -2cqh) rotateZ(10deg) scale(0.9);
        }
      }

      @keyframes launch-film-action-plan-phone-headline-in {
        0%,
        72% {
          opacity: 0;
          transform: translate3d(-50%, 2.8cqh, 0) scale(0.96);
        }
        86% {
          opacity: 1;
          transform: translate3d(-50%, 0.6cqh, 0) scale(1);
        }
        100% {
          opacity: 1;
          transform: translate3d(-50%, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-action-plan-phone-orbit {
        from {
          opacity: 0.62;
          transform: translate3d(-6%, -2%, 0) scale(0.96);
        }
        to {
          opacity: 0.9;
          transform: translate3d(6%, 2%, 0) scale(1.05);
        }
      }

      @keyframes launch-film-action-plan-phone-bar {
        from {
          opacity: 0;
          transform: scaleX(0.28);
        }
        to {
          opacity: 1;
          transform: scaleX(1);
        }
      }

      @keyframes launch-film-notification-pill-in {
        0% {
          opacity: 0;
          transform: translate3d(-50%, 1.8cqh, 0) scale(0.92);
          filter: blur(8px);
        }
        62% {
          opacity: 1;
          transform: translate3d(-50%, -0.35cqh, 0) scale(1.04);
          filter: blur(0);
        }
        100% {
          opacity: 1;
          transform: translate3d(-50%, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-notification-pill-click {
        0%,
        40% {
          transform: scale(1);
          filter: brightness(1);
        }
        54% {
          transform: scale(0.94);
          filter: brightness(0.9);
        }
        74% {
          transform: scale(1.05);
          filter: brightness(1.12);
        }
        100% {
          transform: scale(1);
          filter: brightness(1);
        }
      }

      @keyframes launch-film-notification-bell-ring {
        0%,
        100% {
          transform: rotate(0deg);
        }
        16% {
          transform: rotate(-13deg);
        }
        32% {
          transform: rotate(12deg);
        }
        48% {
          transform: rotate(-9deg);
        }
        64% {
          transform: rotate(7deg);
        }
        80% {
          transform: rotate(-3deg);
        }
      }

      @keyframes launch-film-notification-badge-pop {
        0% {
          opacity: 0;
          transform: translate3d(-6px, 7px, 0) scale(0.18);
        }
        58% {
          opacity: 1;
          transform: translate3d(0, -1px, 0) scale(1.18);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-notification-count-step {
        0% {
          opacity: 0;
          transform: translate3d(0, 14px, 0) scale(0.8);
        }
        24%,
        52% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate3d(0, -14px, 0) scale(0.8);
        }
      }

      @keyframes launch-film-notification-count-final {
        0% {
          opacity: 0;
          transform: translate3d(0, 14px, 0) scale(0.8);
        }
        36%,
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-notification-pill-ring {
        0% {
          opacity: 0;
          transform: scale(0.88);
        }
        32% {
          opacity: 0.75;
        }
        100% {
          opacity: 0;
          transform: scale(1.24);
        }
      }

      @keyframes launch-film-notification-cursor-click {
        0% {
          opacity: 0;
          transform: translate3d(18cqi, 14cqh, 0) scale(0.82) rotate(-11deg);
        }
        28% {
          opacity: 1;
          transform: translate3d(3.2cqi, 1.8cqh, 0) scale(1) rotate(-11deg);
        }
        50% {
          opacity: 1;
          transform: translate3d(1.4cqi, 0.5cqh, 0) scale(0.84) rotate(-11deg);
        }
        70% {
          opacity: 1;
          transform: translate3d(1.4cqi, 0.5cqh, 0) scale(0.98) rotate(-11deg);
        }
        100% {
          opacity: 0;
          transform: translate3d(1.4cqi, 0.5cqh, 0) scale(1.04) rotate(-11deg);
        }
      }

      @keyframes launch-film-notification-cursor-ring {
        0%,
        42% {
          opacity: 0;
          transform: scale(0.28);
        }
        54% {
          opacity: 0.88;
          transform: scale(0.46);
        }
        100% {
          opacity: 0;
          transform: scale(1.65);
        }
      }

      @keyframes launch-film-command-overlay-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes launch-film-command-hud-in {
        0% {
          opacity: 0;
          transform: translate3d(0, -4cqh, 0) scale(0.96, 0.92);
          filter: blur(10px);
        }
        56% {
          opacity: 1;
          transform: translate3d(0, 0.8cqh, 0) scale(1.01, 1.01);
          filter: blur(0);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-command-camera-follow {
        0% {
          transform: translate3d(0, 0, 0);
        }
        54% {
          transform: translate3d(0, 0, 0);
        }
        60% {
          transform: translate3d(0, -18cqh, 0);
        }
        66% {
          transform: translate3d(0, -48cqh, 0);
        }
        72% {
          transform: translate3d(0, -82cqh, 0);
        }
        78% {
          transform: translate3d(0, -116cqh, 0);
        }
        84% {
          transform: translate3d(0, -148cqh, 0);
        }
        90% {
          transform: translate3d(0, -174cqh, 0);
        }
        96% {
          transform: translate3d(0, -190cqh, 0);
        }
        100% {
          transform: translate3d(0, -198cqh, 0);
        }
      }

      @keyframes launch-film-command-activity-blast {
        0% {
          opacity: 0;
          max-height: 0;
          margin-top: 0;
          padding-top: 0;
          padding-bottom: 0;
          transform: translate3d(0, -14px, 0) scale(0.988);
        }
        52% {
          opacity: 1;
          max-height: 92px;
          margin-top: 0;
          padding-top: clamp(14px, 2cqh, 20px);
          padding-bottom: clamp(14px, 2cqh, 20px);
          transform: translate3d(0, 2px, 0) scale(1.004);
        }
        100% {
          opacity: 1;
          max-height: 92px;
          margin-top: 0;
          padding-top: clamp(14px, 2cqh, 20px);
          padding-bottom: clamp(14px, 2cqh, 20px);
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-command-activity-scan {
        0%,
        28% {
          opacity: 0;
          transform: translateX(-46%);
        }
        48% {
          opacity: 0.9;
        }
        100% {
          opacity: 0;
          transform: translateX(54%);
        }
      }

      @keyframes launch-film-command-feed-out {
        0% {
          opacity: 1;
          transform: scale(1);
          filter: blur(0);
        }
        100% {
          opacity: 0;
          transform: scale(0.985);
          filter: blur(10px);
        }
      }

      @keyframes launch-film-command-finale-in {
        0% {
          opacity: 0;
          transform: translate3d(0, 3cqh, 0) scale(0.96);
          filter: blur(12px);
        }
        58% {
          opacity: 1;
          transform: translate3d(0, -0.6cqh, 0) scale(1.012);
          filter: blur(0);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes log-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes log-glow-pulse {
        0%,
        100% {
          border-color: color-mix(in srgb, var(--log-primary) 50%, transparent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--log-primary) 15%, transparent);
        }
        50% {
          border-color: var(--log-primary);
          box-shadow: 0 0 12px color-mix(in srgb, var(--log-primary) 30%, transparent);
        }
      }

      @keyframes launch-film-action-card-button-pulse {
        0%,
        34% {
          opacity: 0;
          transform: scale(0.78);
        }
        48% {
          opacity: 1;
          transform: scale(1.04);
        }
        100% {
          opacity: 0;
          transform: scale(1.22);
        }
      }

      @keyframes launch-film-action-card-primary-click {
        0%,
        34% {
          transform: scale(1);
          filter: brightness(1);
        }
        46% {
          transform: scale(0.94);
          filter: brightness(0.92);
          box-shadow: 0 0 0 0 rgba(204, 255, 0, 0.5);
        }
        64% {
          transform: scale(1.03);
          filter: brightness(1.08);
          box-shadow: 0 0 0 10px rgba(204, 255, 0, 0);
        }
        100% {
          transform: scale(1);
          filter: brightness(1);
          box-shadow: 0 0 0 0 rgba(204, 255, 0, 0);
        }
      }

      @keyframes launch-film-action-card-primary-flash {
        0%,
        40% {
          opacity: 0;
          transform: scale(0.4);
        }
        52% {
          opacity: 0.48;
          transform: scale(1.02);
        }
        100% {
          opacity: 0;
          transform: scale(1.42);
        }
      }

      .launch-film__coordinator-mark {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: clamp(12px, 2.4cqh, 24px);
        width: min(100%, 86cqi);
        transform-origin: center center;
        will-change: transform, opacity, filter;
        animation: launch-film-coordinator-zoom 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
        transition:
          transform 720ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 560ms ease,
          filter 720ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .launch-film__coordinator-copy {
        display: grid;
        justify-items: center;
        text-align: center;
      }

      .launch-film__coordinator-title {
        color: #050705;
        font-size: clamp(28px, 6.1cqi, 74px);
        font-weight: 820;
        letter-spacing: -0.05em;
        line-height: 0.92;
        white-space: nowrap;
        text-shadow: 0 1.2cqh 4.5cqh rgba(5, 7, 5, 0.16);
        opacity: 0;
        transform: translate3d(0, 3.5cqh, 0);
        filter: blur(10px);
        animation: launch-film-word-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 160ms forwards;
      }

      .launch-film__coordinator-loader {
        display: flex;
        justify-content: center;
        width: min(100%, 52cqi);
        max-width: 520px;
        opacity: 0;
        transform: translate3d(0, 2.6cqh, 0) scale(0.9);
        animation: launch-film-coordinator-loader-in 650ms cubic-bezier(0.16, 1, 0.3, 1) 360ms
          forwards;
      }

      .launch-film__coordinator-thinking {
        --op-primary: #050705;
        --op-text: #050705;
        --op-text-muted: rgba(5, 7, 5, 0.54);
        --op-text-secondary: rgba(5, 7, 5, 0.62);
        --op-border: transparent;
        --op-surface: transparent;
        --op-glass-bg: transparent;
        transform: scale(1.75);
        transform-origin: center center;
      }

      .launch-film__coordinator-loader ::ng-deep .thinking-block {
        align-items: center;
        padding: 14px 18px;
      }

      .launch-film__coordinator-loader ::ng-deep .thinking-block__spinner {
        width: 18px;
        height: 18px;
      }

      .launch-film__coordinator-loader ::ng-deep .thinking-block__label {
        font-size: 16px;
        font-weight: 700;
      }

      .launch-film__hook-mark {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: 1.8cqh;
        width: min(100%, 72cqi);
        animation: launch-film-intro-in 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__hook-mark--prompt {
        width: min(100%, 88cqi);
        gap: 0;
        animation: launch-film-prompt-push-in 900ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__hook-real {
        width: min(100%, 88cqi);
        --input-bg: #050705;
        --input-surface: rgba(8, 12, 10, 0.92);
        --input-border: rgba(255, 255, 255, 0.13);
        --input-text: #ffffff;
        --input-muted: rgba(255, 255, 255, 0.58);
        --input-attach-fg: rgba(255, 255, 255, 0.72);
        --input-primary: #ccff00;
        --input-primary-glow: rgba(204, 255, 0, 0.14);
        --input-caret: #ccff00;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
        --input-surface-hover: rgba(255, 255, 255, 0.1);
        --input-chip-remove-bg: rgba(10, 10, 10, 0.88);
        --input-chip-remove-fg: #ffffff;
        --input-chip-remove-border: rgba(255, 255, 255, 0.55);
        --input-chip-remove-icon: #ffffff;
      }

      .launch-film__hook-real ::ng-deep .input-card {
        background: rgba(8, 12, 10, 0.94) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        box-shadow:
          0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .launch-film__hook-typewriter {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.06em;
        text-align: center;
      }

      .launch-film__hook-line1,
      .launch-film__hook-line2 {
        color: #050705;
        font-size: clamp(38px, 10cqi, 84px);
        font-weight: 780;
        letter-spacing: -0.045em;
        line-height: 0.92;
        text-shadow: 0 1.2cqh 4.5cqh rgba(5, 7, 5, 0.18);
        white-space: nowrap;
        opacity: 0;
        transform: translateY(3.5cqh);
        filter: blur(10px);
      }

      .launch-film__hook-line1 {
        display: block;
        animation: launch-film-word-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
      }

      .launch-film__hook-line2 {
        display: inline-flex;
        align-items: center;
        animation: launch-film-word-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 600ms forwards;
      }

      .launch-film__slide--finale {
        overflow: hidden;
        padding: 0 8cqi;
        background: #41b8ff;
        animation: launch-film-finale-background 5.65s cubic-bezier(0.45, 0, 0.25, 1) both;
      }

      .launch-film__finale-copy {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        gap: clamp(10px, 2.4cqh, 22px);
        width: min(100%, 86cqi);
        color: #050705;
        text-align: center;
        animation: launch-film-finale-copy-out 7.2s ease both;
      }

      .launch-film__finale-kicker {
        display: block;
        font-size: clamp(26px, 6.3cqi, 54px);
        font-weight: 760;
        letter-spacing: 0;
        line-height: 1;
        opacity: 0;
        transform: translate3d(0, 2cqh, 0);
        animation: launch-film-finale-kicker-in 720ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
      }

      .launch-film__finale-words {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        min-height: clamp(76px, 17cqi, 148px);
      }

      .launch-film__finale-word {
        position: absolute;
        inset: auto 0;
        display: block;
        color: #050705;
        font-size: clamp(54px, 13cqi, 124px);
        font-weight: 880;
        letter-spacing: 0;
        line-height: 0.92;
        text-shadow:
          0 1.5cqh 5.5cqh rgba(5, 7, 5, 0.2),
          0 0 3.8cqh rgba(255, 255, 255, 0.16);
        opacity: 0;
        transform: translate3d(0, 5cqh, 0) scale(0.94);
        filter: blur(10px);
      }

      .launch-film__finale-word--performance {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-word--brand {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 820ms both;
      }

      .launch-film__finale-word--strategy {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 1.64s both;
      }

      .launch-film__finale-word--admin {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 2.46s both;
      }

      .launch-film__finale-word--data {
        animation: launch-film-finale-word-cycle 5.65s cubic-bezier(0.16, 1, 0.3, 1) 3.28s both;
      }

      .launch-film__finale-word--recruiting {
        animation: launch-film-finale-word-win 5.65s cubic-bezier(0.16, 1, 0.3, 1) 4.1s both;
      }

      .launch-film__finale-url-panel {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: grid;
        place-items: center;
        background:
          linear-gradient(
            112deg,
            transparent 0%,
            transparent 14%,
            rgba(204, 255, 0, 0.92) 30%,
            rgba(255, 255, 255, 0.88) 48%,
            rgba(204, 255, 0, 0.62) 66%,
            transparent 84%,
            transparent 100%
          ),
          linear-gradient(
            34deg,
            rgba(0, 0, 0, 0.08) 0%,
            transparent 22%,
            transparent 68%,
            rgba(0, 0, 0, 0.05) 100%
          ),
          linear-gradient(72deg, transparent 8%, rgba(204, 255, 0, 0.28) 28%, transparent 54%),
          linear-gradient(156deg, transparent 10%, rgba(204, 255, 0, 0.2) 44%, transparent 78%),
          #ffffff;
        background-size:
          210% 210%,
          150% 150%,
          120% 120%,
          130% 130%,
          100% 100%;
        transform: translate3d(0, 100%, 0);
        animation:
          launch-film-finale-url-rise 7.2s cubic-bezier(0.2, 0.82, 0.18, 1) both,
          launch-film-finale-url-gradient 10.5s cubic-bezier(0.45, 0, 0.25, 1) infinite alternate;
      }

      .launch-film__finale-url-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(0, 0, 0, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.026) 1px, transparent 1px);
        background-size:
          100% 5.4cqh,
          5.4cqh 100%;
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 74%);
        opacity: 0.56;
        pointer-events: none;
      }

      .launch-film__finale-url-card {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: min(76cqi, 760px);
        min-height: clamp(96px, 17cqh, 168px);
        opacity: 0;
        transform: translate3d(0, 2cqh, 0) scale(0.98);
        animation: launch-film-finale-card-in 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-url-text,
      .launch-film__finale-logo {
        grid-area: 1 / 1;
      }

      .launch-film__finale-url-text {
        color: #050705;
        font-size: clamp(38px, 8.8cqi, 92px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-shadow:
          0 1.6cqh 5.6cqh rgba(0, 0, 0, 0.18),
          0 0 5.2cqh rgba(255, 255, 255, 0.18);
        transform: translate3d(0, 0, 0) scale(1);
        animation: launch-film-finale-url-text-out 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      .launch-film__finale-logo {
        width: min(48cqi, 520px);
        opacity: 0;
        transform: translate3d(0, 2cqh, 0) scale(0.86);
        filter: drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
          drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        animation: launch-film-finale-logo-in 7.2s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      @keyframes launch-film-finale-background {
        0%,
        14% {
          background-color: #41b8ff;
        }
        17%,
        29% {
          background-color: #ff7a45;
        }
        32%,
        44% {
          background-color: #9d7bff;
        }
        47%,
        59% {
          background-color: #3fa3ff;
        }
        62%,
        74% {
          background-color: #2fd39a;
        }
        77%,
        100% {
          background-color: #ccff00;
        }
      }

      @keyframes launch-film-finale-kicker-in {
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes launch-film-finale-word-cycle {
        0% {
          opacity: 0;
          transform: translate3d(0, 5cqh, 0) scale(0.94);
          filter: blur(10px);
        }
        9%,
        17% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        25%,
        100% {
          opacity: 0;
          transform: translate3d(0, -4cqh, 0) scale(1.04);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-word-win {
        0% {
          opacity: 0;
          transform: translate3d(0, 5cqh, 0) scale(0.94);
          filter: blur(10px);
        }
        12%,
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-finale-copy-out {
        0%,
        75% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        84%,
        100% {
          opacity: 0;
          transform: translate3d(0, -4cqh, 0) scale(0.98);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-url-rise {
        0%,
        76% {
          transform: translate3d(0, 100%, 0);
        }
        88%,
        100% {
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes launch-film-finale-url-gradient {
        from {
          background-position:
            0% 50%,
            18% 26%,
            0% 0%,
            100% 100%,
            0 0;
        }
        to {
          background-position:
            100% 50%,
            82% 74%,
            22% 18%,
            78% 84%,
            0 0;
        }
      }

      @keyframes launch-film-finale-card-in {
        0%,
        84% {
          opacity: 0;
          transform: translate3d(0, 2cqh, 0) scale(0.98);
          filter: blur(8px);
        }
        91%,
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-finale-url-text-out {
        0%,
        92% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        96%,
        100% {
          opacity: 0;
          transform: translate3d(0, -2cqh, 0) scale(0.92);
          filter: blur(8px);
        }
      }

      @keyframes launch-film-finale-logo-in {
        0%,
        93% {
          opacity: 0;
          transform: translate3d(0, 2cqh, 0) scale(0.86);
          filter: blur(8px) drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        }
        97% {
          opacity: 1;
          transform: translate3d(0, -0.5cqh, 0) scale(1.07);
          filter: blur(0) drop-shadow(0 2.4cqh 5.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 4.6cqh rgba(204, 255, 0, 0.44));
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0) drop-shadow(0 2cqh 4.8cqh rgba(0, 0, 0, 0.2))
            drop-shadow(0 0 2.4cqh rgba(204, 255, 0, 0.28));
        }
      }

      @keyframes launch-film-hook-drift {
        0% {
          transform: scale(1.08) translate3d(-1.2%, -0.8%, 0);
        }
        50% {
          transform: scale(1.11) translate3d(0.6%, 0.9%, 0);
        }
        100% {
          transform: scale(1.09) translate3d(1.4%, -0.4%, 0);
        }
      }

      @keyframes launch-film-hook-sheen {
        0% {
          transform: translate3d(-32%, 0, 0) skewX(-12deg);
          opacity: 0;
        }
        18% {
          opacity: 0.38;
        }
        52% {
          opacity: 0.54;
        }
        100% {
          transform: translate3d(28%, 0, 0) skewX(-12deg);
          opacity: 0;
        }
      }

      @keyframes launch-film-coordinator-zoom {
        0% {
          opacity: 0;
          transform: translate3d(0, 3.5cqh, 0) scale(0.78);
          filter: blur(14px) saturate(1.12);
        }
        18% {
          opacity: 1;
          transform: translate3d(0, 0.5cqh, 0) scale(0.98);
          filter: blur(2px) saturate(1.08);
        }
        62% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1.16);
          filter: blur(0) saturate(1.04);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, -0.5cqh, 0) scale(1.08);
          filter: blur(0) saturate(1.02);
        }
      }

      @keyframes launch-film-coordinator-loader-in {
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      @keyframes launch-film-action-plan-neon-slide-down {
        0% {
          opacity: 0;
          transform: translate3d(0, 1.2cqh, 0);
          filter: blur(10px);
        }
        62% {
          opacity: 1;
          transform: translate3d(0, 0.14cqh, 0);
          filter: blur(0);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
        }
      }

      @keyframes launch-film-action-plan-content-zoom {
        0% {
          transform: scale(0.84);
        }
        58% {
          transform: scale(1.05);
        }
        100% {
          transform: scale(1.03);
        }
      }

      @keyframes launch-film-action-plan-output-scroll {
        0% {
          transform: translate3d(0, 0, 0);
        }
        3%,
        11% {
          transform: translate3d(0, -16.4cqh, 0);
        }
        13%,
        34% {
          transform: translate3d(0, -30.4cqh, 0);
        }
        37%,
        46% {
          transform: translate3d(0, -46.8cqh, 0);
        }
        49%,
        58% {
          transform: translate3d(0, -55.4cqh, 0);
        }
        61%,
        100% {
          transform: translate3d(0, -63.8cqh, 0);
        }
      }

      @keyframes launch-film-input-card-wave {
        0% {
          transform: translate3d(0, 0, 0) scale(1);
          filter: saturate(1) brightness(1);
          border-radius: 28px;
          background-position:
            0% 0%,
            0% 0%,
            0 0;
          box-shadow:
            0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 rgba(204, 255, 0, 0);
        }
        24% {
          transform: translate3d(0, -0.22cqh, 0) scale(1.012, 1.018);
          filter: saturate(1.12) brightness(1.04);
          border-radius: 27px 31px 29px 33px;
          background-position:
            24% 0%,
            18% 0%,
            0 0;
          box-shadow:
            0 2.8cqh 9cqh rgba(0, 0, 0, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            inset 0 0 2.2cqh rgba(204, 255, 0, 0.12),
            0 0 4.8cqh rgba(204, 255, 0, 0.16);
        }
        52% {
          transform: translate3d(0, 0.08cqh, 0) scale(1.018, 0.986);
          filter: saturate(1.18) brightness(1.06);
          border-radius: 32px 27px 33px 28px;
          background-position:
            56% 0%,
            52% 0%,
            0 0;
          box-shadow:
            0 2.6cqh 8.6cqh rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 0 2.6cqh rgba(110, 248, 255, 0.1),
            0 0 5.6cqh rgba(110, 248, 255, 0.14);
        }
        78% {
          transform: translate3d(0, -0.12cqh, 0) scale(1.008, 1.01);
          filter: saturate(1.08) brightness(1.03);
          border-radius: 29px 33px 28px 31px;
          background-position:
            88% 0%,
            84% 0%,
            0 0;
          box-shadow:
            0 2.2cqh 7.6cqh rgba(0, 0, 0, 0.32),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 0 1.6cqh rgba(204, 255, 0, 0.08),
            0 0 3.6cqh rgba(204, 255, 0, 0.12);
        }
        100% {
          transform: translate3d(0, 0, 0) scale(1);
          filter: saturate(1) brightness(1);
          border-radius: 28px;
          background-position:
            120% 0%,
            108% 0%,
            0 0;
          box-shadow:
            0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 0 rgba(204, 255, 0, 0);
        }
      }

      @keyframes launch-film-input-inner-wave {
        0% {
          transform: translate3d(0, 0, 0);
          filter: brightness(1);
        }
        20% {
          transform: translate3d(0.14cqh, -0.12cqh, 0);
          filter: brightness(1.03);
        }
        50% {
          transform: translate3d(-0.12cqh, 0.12cqh, 0);
          filter: brightness(1.06);
        }
        78% {
          transform: translate3d(0.08cqh, -0.06cqh, 0);
          filter: brightness(1.02);
        }
        100% {
          transform: translate3d(0, 0, 0);
          filter: brightness(1);
        }
      }

      @keyframes launch-film-input-actions-wave {
        0% {
          transform: translate3d(0, 0, 0);
        }
        22% {
          transform: translate3d(-0.12cqh, 0.08cqh, 0);
        }
        52% {
          transform: translate3d(0.18cqh, -0.1cqh, 0);
        }
        100% {
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes launch-film-input-wave-band {
        0% {
          opacity: 0;
          clip-path: inset(0 0 0 78% round 2cqh);
          transform: translate3d(0, 8%, 0) rotate(4deg) scaleX(0.28);
        }
        18% {
          opacity: 0.42;
        }
        48% {
          opacity: 0.94;
        }
        100% {
          opacity: 0;
          clip-path: inset(0 78% 0 0 round 2cqh);
          transform: translate3d(0, -8%, 0) rotate(-4deg) scaleX(1.08);
        }
      }

      @keyframes launch-film-input-node-flow {
        0% {
          opacity: 0;
          clip-path: inset(0 0 0 72% round 2cqh);
          transform: translate3d(0, 0.2cqh, 0) scaleY(0.96);
          filter: drop-shadow(0 0 0 rgba(204, 255, 0, 0));
          background-position:
            0 0,
            2.4cqh 2.2cqh,
            100% 0,
            0 100%;
        }
        22% {
          opacity: 0.5;
        }
        56% {
          opacity: 0.9;
          transform: translate3d(0, -0.1cqh, 0) scaleY(1.03);
          filter: drop-shadow(0 0 1.7cqh rgba(204, 255, 0, 0.3));
        }
        100% {
          opacity: 0;
          clip-path: inset(0 72% 0 0 round 2cqh);
          transform: translate3d(0, 0, 0) scaleY(1.05);
          filter: drop-shadow(0 0 0 rgba(204, 255, 0, 0));
          background-position:
            8.2cqh 0,
            11.6cqh 2.2cqh,
            0 0,
            0 0;
        }
      }

      .launch-film__slide--prompt {
        perspective: 180cqh;
        padding: 0 0.8cqi;
      }

      .launch-film__prompt-stage {
        display: grid;
        place-items: center;
        width: 100%;
        transform-origin: 62% 58%;
        will-change: transform, opacity, filter;
        animation: launch-film-prompt-push-in 1000ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real {
        width: min(100%, 86cqi);
        margin: 0 auto;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
      }

      .launch-film__prompt-real--intro-light {
        --input-bg: #ffffff;
        --input-surface: var(--nxt1-color-light-100, #f5f5f5);
        --input-border: rgba(0, 0, 0, 0.12);
        --input-text: var(--nxt1-color-light-900, #212121);
        --input-muted: var(--nxt1-color-light-600, #757575);
        --input-primary: #a3cc00;
        --input-primary-glow: rgba(163, 204, 0, 0.12);
        --input-caret: #a3cc00;
        --input-selection-bg: rgba(163, 204, 0, 0.12);
        --input-surface-hover: var(--nxt1-color-light-150, #f0f0f0);
        --input-chip-remove-bg: rgba(240, 240, 240, 0.96);
        --input-chip-remove-fg: #1a1a1a;
        --input-chip-remove-border: rgba(0, 0, 0, 0.3);
        --input-chip-remove-icon: #1a1a1a;
      }

      .launch-film__prompt-real--intro-light ::ng-deep .input-card {
        box-shadow:
          0 2.2cqh 7cqh rgba(0, 0, 0, 0.16),
          0 0 0 1px rgba(255, 255, 255, 0.9);
      }

      .launch-film__cascade-real {
        --input-bg: #050705;
        --input-surface: rgba(8, 12, 10, 0.92);
        --input-border: rgba(255, 255, 255, 0.13);
        --input-text: #ffffff;
        --input-muted: rgba(255, 255, 255, 0.58);
        --input-primary: #ccff00;
        --input-primary-glow: rgba(204, 255, 0, 0.14);
        --input-caret: #ccff00;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
        --input-surface-hover: rgba(255, 255, 255, 0.1);
        --input-chip-remove-bg: rgba(10, 10, 10, 0.88);
        --input-chip-remove-fg: #ffffff;
        --input-chip-remove-border: rgba(255, 255, 255, 0.55);
        --input-chip-remove-icon: #ffffff;
      }

      .launch-film__cascade-real ::ng-deep .input-card {
        background: rgba(8, 12, 10, 0.94) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        box-shadow:
          0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .launch-film__cascade-real ::ng-deep .input-textarea {
        color: #ffffff !important;
        caret-color: #ccff00 !important;
        accent-color: #ccff00 !important;
      }

      .launch-film__cascade-real ::ng-deep .input-textarea::placeholder {
        color: rgba(255, 255, 255, 0.58) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-textarea::selection {
        color: #ffffff !important;
        background: rgba(204, 255, 0, 0.14) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-btn {
        background: rgba(255, 255, 255, 0.1) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        color: rgba(255, 255, 255, 0.58) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
      }

      .launch-film__cascade-real ::ng-deep .input-send-btn.active {
        background: rgba(204, 255, 0, 0.14) !important;
        border-color: #ccff00 !important;
        color: #ccff00 !important;
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15) !important;
      }

      .launch-film__prompt-real ::ng-deep .agent-x-input-root {
        padding-left: 0;
        padding-right: 0;
      }

      .launch-film__prompt-real ::ng-deep .input-card {
        padding-right: 14px;
      }

      .launch-film__prompt-real--sendfx {
        --input-bg: #050705;
        --input-surface: rgba(8, 12, 10, 0.92);
        --input-border: rgba(255, 255, 255, 0.13);
        --input-text: #ffffff;
        --input-muted: rgba(255, 255, 255, 0.58);
        --input-primary: #ccff00;
        --input-primary-glow: rgba(204, 255, 0, 0.14);
        --input-caret: #ccff00;
        --input-selection-bg: rgba(204, 255, 0, 0.14);
        --input-surface-hover: rgba(255, 255, 255, 0.1);
        --input-chip-remove-bg: rgba(10, 10, 10, 0.88);
        --input-chip-remove-fg: #ffffff;
        --input-chip-remove-border: rgba(255, 255, 255, 0.55);
        --input-chip-remove-icon: #ffffff;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        background:
          linear-gradient(
            120deg,
            rgba(12, 20, 15, 0.98),
            rgba(8, 11, 9, 0.95) 46%,
            rgba(10, 18, 14, 0.98)
          ),
          repeating-linear-gradient(
            104deg,
            rgba(255, 255, 255, 0.02) 0 5%,
            rgba(204, 255, 0, 0) 8% 18%,
            rgba(255, 255, 255, 0.012) 22% 27%,
            rgba(255, 255, 255, 0) 31% 42%
          ),
          linear-gradient(
            90deg,
            rgba(204, 255, 0, 0) 0%,
            rgba(204, 255, 0, 0.08) 16%,
            rgba(204, 255, 0, 0.34) 34%,
            rgba(110, 248, 255, 0.28) 52%,
            rgba(204, 255, 0, 0.1) 68%,
            rgba(204, 255, 0, 0) 100%
          ),
          radial-gradient(circle at center, rgba(204, 255, 0, 0.8) 0 0.18cqh, transparent 0.2cqh),
          radial-gradient(
            circle at center,
            rgba(110, 248, 255, 0.76) 0 0.16cqh,
            transparent 0.18cqh
          ),
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)) !important;
        background-size:
          160% 100%,
          220% 100%,
          136% 70%,
          6.1cqh 6.1cqh,
          4.5cqh 4.5cqh,
          100% 100%;
        background-position:
          0% 0%,
          0% 0%,
          136% 50%,
          123% 50%,
          130% 50%,
          0 0;
        background-repeat: no-repeat;
        background-blend-mode: normal, soft-light, screen, screen, screen, normal;
        border-color: rgba(255, 255, 255, 0.13) !important;
        box-shadow:
          0 1.8cqh 6.2cqh rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
        will-change: transform, filter, background-position, box-shadow, border-radius;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card::before,
      .launch-film__prompt-real--sendfx ::ng-deep .input-card::after {
        position: absolute;
        inset: -28% -12%;
        z-index: 1;
        pointer-events: none;
        content: '';
        opacity: 0;
        border-radius: inherit;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card::before {
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(204, 255, 0, 0.04) 18%,
          rgba(204, 255, 0, 0.82) 42%,
          rgba(110, 248, 255, 0.68) 53%,
          rgba(204, 255, 0, 0.16) 72%,
          transparent 100%
        );
        filter: blur(1.8cqh) drop-shadow(0 0 1.8cqh rgba(204, 255, 0, 0.42));
        mix-blend-mode: screen;
        transform: translate3d(118%, 12%, 0) rotate(-8deg) scaleX(0.72);
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card::after {
        background-image:
          radial-gradient(circle, rgba(204, 255, 0, 0.92) 0 0.16cqh, transparent 0.22cqh),
          radial-gradient(circle, rgba(110, 248, 255, 0.82) 0 0.14cqh, transparent 0.2cqh),
          linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        background-position:
          0 0,
          2.2cqh 1.1cqh,
          0 0;
        background-size:
          4.8cqh 4.8cqh,
          3.7cqh 3.7cqh,
          100% 100%;
        background-repeat: repeat, repeat, no-repeat;
        filter: drop-shadow(0 0 0.8cqh rgba(204, 255, 0, 0.48));
        mix-blend-mode: screen;
        transform: translate3d(118%, 0, 0) scale(0.72);
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card > * {
        position: relative;
        z-index: 2;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-card {
        overflow: visible !important;
        isolation: isolate;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected ::ng-deep .input-card {
        background:
          linear-gradient(
            120deg,
            rgba(12, 20, 15, 0.98),
            rgba(8, 11, 9, 0.95) 46%,
            rgba(10, 18, 14, 0.98)
          ),
          repeating-linear-gradient(
            104deg,
            rgba(204, 255, 0, 0.08) 0 5%,
            rgba(204, 255, 0, 0) 8% 18%,
            rgba(110, 248, 255, 0.07) 22% 27%,
            rgba(110, 248, 255, 0) 31% 42%
          ),
          linear-gradient(
            90deg,
            rgba(204, 255, 0, 0) 0%,
            rgba(204, 255, 0, 0.08) 16%,
            rgba(204, 255, 0, 0.34) 34%,
            rgba(110, 248, 255, 0.28) 52%,
            rgba(204, 255, 0, 0.1) 68%,
            rgba(204, 255, 0, 0) 100%
          ),
          radial-gradient(circle at center, rgba(204, 255, 0, 0.88) 0 0.18cqh, transparent 0.2cqh),
          radial-gradient(
            circle at center,
            rgba(110, 248, 255, 0.82) 0 0.16cqh,
            transparent 0.18cqh
          ),
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)) !important;
        background-size:
          160% 100%,
          220% 100%,
          136% 70%,
          6.1cqh 6.1cqh,
          4.5cqh 4.5cqh,
          100% 100%;
        background-position:
          0% 0%,
          0% 0%,
          136% 50%,
          123% 50%,
          130% 50%,
          0 0;
        background-repeat: no-repeat;
        background-blend-mode: normal, soft-light, screen, screen, screen, normal;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-textarea {
        color: #ffffff !important;
        caret-color: #ccff00 !important;
        accent-color: #ccff00 !important;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-textarea::placeholder {
        color: rgba(255, 255, 255, 0.58) !important;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-btn {
        background: rgba(255, 255, 255, 0.1) !important;
        border-color: rgba(255, 255, 255, 0.13) !important;
        color: rgba(255, 255, 255, 0.58) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
      }

      .launch-film__prompt-real--sendfx ::ng-deep .input-send-btn.active {
        background: rgba(204, 255, 0, 0.14) !important;
        border-color: #ccff00 !important;
        color: #ccff00 !important;
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15) !important;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-strip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        max-width: calc(100% - 28px);
        margin: 0 10px 8px auto;
        padding: 5px 12px 5px 8px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.95);
        border-radius: 999px;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment {
        gap: 6px;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-thumb {
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 4px;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-source-badge {
        position: static;
        max-width: none;
        padding: 0;
        background: transparent;
        color: #0a0a0a;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.01em;
        text-transform: none;
      }

      .launch-film__prompt-real--source-active ::ng-deep .input-attachment-remove {
        display: none;
      }

      .launch-film__prompt-real ::ng-deep .input-textarea {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .launch-film__prompt-real--selected ::ng-deep .input-send-btn.active {
        transform: scale(1.08);
        box-shadow:
          0 0 0 0.26cqi rgba(204, 255, 0, 0.16),
          0 0 3.6cqh rgba(204, 255, 0, 0.22);
        animation: launch-film-send-select 420ms ease-out both;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected ::ng-deep .input-card {
        animation: launch-film-input-card-wave 780ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected
        ::ng-deep
        .input-textarea {
        animation: launch-film-input-inner-wave 780ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected
        ::ng-deep
        .input-actions {
        animation: launch-film-input-actions-wave 780ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected
        ::ng-deep
        .input-card::before {
        animation: launch-film-input-wave-band 780ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__prompt-real--sendfx.launch-film__prompt-real--selected
        ::ng-deep
        .input-card::after {
        animation: launch-film-input-node-flow 780ms cubic-bezier(0.2, 0.82, 0.18, 1) both;
      }

      .launch-film__intro strong {
        color: #fff;
        font-size: clamp(31px, 6.8cqi, 50px);
        font-weight: 780;
        letter-spacing: -0.03em;
        line-height: 1.05;
        text-wrap: balance;
        text-shadow: 0 1.4cqh 7cqh rgba(0, 0, 0, 0.36);
      }

      .launch-film__slide--cascade {
        overflow: hidden;
        align-content: start;
        grid-template-rows: 1fr;
        padding: 8.4cqh 1.2cqi 5.6cqh;
        perspective: 120cqh;
        background: transparent;
        animation: launch-film-cascade-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__cascade-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        min-height: 68cqh;
        margin: 0 auto;
        transform-style: preserve-3d;
      }

      .launch-film__cascade-card {
        position: absolute;
        left: 50%;
        top: 0;
        display: grid;
        gap: 1.6cqh;
        width: 100%;
        max-width: 100%;
        transform-origin: 50% 50%;
        transition:
          opacity 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1),
          filter 360ms ease;
        will-change: opacity, transform, filter;
      }

      .launch-film__cascade-card--hidden {
        opacity: 0;
        transform: translate3d(-50%, 46cqh, -40cqh) scale(0.6);
        pointer-events: none;
      }

      .launch-film__cascade-card--active {
        z-index: 3;
        opacity: 1;
        transform: translate3d(-50%, 0, 9cqh) rotateY(0deg) scale(1);
        filter: blur(0);
      }

      .launch-film__cascade-card--next {
        z-index: 2;
        opacity: 0.36;
        transform: translate3d(-20%, 15cqh, -18cqh) rotateY(-22deg) scale(0.72);
        filter: blur(1.6px);
      }

      .launch-film__cascade-card--back {
        z-index: 1;
        opacity: 0.24;
        transform: translate3d(-80%, 15cqh, -18cqh) rotateY(22deg) scale(0.72);
        filter: blur(1.9px);
      }

      .launch-film__cascade-card-top {
        width: min(100%, 86cqi);
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.5cqi;
        min-width: 0;
        padding: 0 1.2cqi;
      }

      .launch-film__cascade-card-top span {
        min-width: 0;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.92);
        font-size: clamp(13px, 3.15cqi, 18px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .launch-film__cascade-card-top strong {
        flex: 0 0 auto;
        border: 1px solid rgba(204, 255, 0, 0.28);
        border-radius: 999px;
        padding: 0.52cqh 1.4cqi;
        color: #ccff00;
        font-size: clamp(9px, 2.15cqi, 12px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-transform: uppercase;
      }

      .launch-film__cascade-real {
        width: min(100%, 86cqi);
        margin: 0 auto;
      }

      .launch-film__cascade-card--next .launch-film__cascade-real,
      .launch-film__cascade-card--back .launch-film__cascade-real,
      .launch-film__cascade-card--next .launch-film__cascade-output,
      .launch-film__cascade-card--back .launch-film__cascade-output {
        pointer-events: none;
      }

      .launch-film__cascade-output {
        width: min(100%, 86cqi);
        margin: 0 auto;
        display: grid;
        gap: 1.15cqh;
        min-height: 25cqh;
        border: 0;
        border-radius: 8px;
        padding: 0;
        overflow: hidden;
        background: transparent;
        box-shadow: none;
        opacity: 0;
        transform: translate3d(0, 1.6cqh, 0) scale(0.985);
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        pointer-events: none;
      }

      .launch-film__cascade-output--visible {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }

      .launch-film__cascade-output span {
        color: #ccff00;
        font-size: clamp(9px, 2.1cqi, 12px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1;
        text-transform: uppercase;
      }

      .launch-film__cascade-output strong {
        color: #fff;
        font-size: clamp(16px, 4.4cqi, 25px);
        font-weight: 850;
        letter-spacing: 0;
        line-height: 1.02;
      }

      .launch-film__cascade-output p {
        margin: 0;
        color: rgba(255, 255, 255, 0.74);
        font-size: clamp(10px, 2.45cqi, 13px);
        font-weight: 620;
        line-height: 1.3;
      }

      .launch-film__artifact-bar,
      .launch-film__mail-card,
      .launch-film__strategy-card {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.025)),
          rgba(9, 11, 11, 0.92);
        box-shadow:
          0 2.2cqh 5.2cqh rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.09);
      }

      .launch-film__artifact-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2cqi;
        min-height: 7.2cqh;
        padding: 1.15cqh 2.4cqi;
      }

      .launch-film__artifact-bar > div,
      .launch-film__mail-header > div,
      .launch-film__strategy-card > div:first-child {
        display: grid;
        gap: 0.45cqh;
        min-width: 0;
      }

      .launch-film__pdf-icon {
        flex: 0 0 auto;
        width: 10.5cqi;
        max-width: 48px;
        height: auto;
        color: #d22630;
        filter: drop-shadow(0 1.2cqh 2.4cqh rgba(0, 0, 0, 0.25));
      }

      .launch-film__pdf-icon path:first-child {
        fill: #ffffff;
        stroke: rgba(0, 0, 0, 0.14);
        stroke-width: 1.3;
      }

      .launch-film__pdf-icon path:nth-child(2) {
        stroke: rgba(0, 0, 0, 0.22);
        stroke-width: 1.3;
      }

      .launch-film__pdf-icon rect {
        fill: #d22630;
      }

      .launch-film__pdf-icon text {
        fill: #ffffff;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.02em;
        box-shadow: 0 1.2cqh 2.4cqh rgba(0, 0, 0, 0.25);
      }

      .launch-film__pdf-preview {
        display: grid;
        place-items: center;
        min-height: 21cqh;
        border-radius: 8px;
        background:
          radial-gradient(circle at 18% 18%, rgba(204, 255, 0, 0.16), transparent 26%),
          rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      .launch-film__pdf-image-placeholder {
        display: block;
        width: min(76%, 245px);
        aspect-ratio: 16 / 9;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background: rgba(245, 245, 241, 0.98);
        box-shadow: 0 2cqh 4.2cqh rgba(0, 0, 0, 0.36);
        transform: rotate(-2deg);
      }

      .launch-film__pdf-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        background: #f5f5f1;
      }

      .launch-film__pdf-download {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        min-height: 5cqh;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 16px;
        background: #ccff00;
        color: #0a0a0a;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 700;
        letter-spacing: 0;
        box-shadow: none;
      }

      .launch-film__mail-card,
      .launch-film__strategy-card {
        display: grid;
        gap: 1.15cqh;
        padding: 1.35cqh 2.4cqi;
      }

      .launch-film__mail-header {
        display: flex;
        align-items: center;
        gap: 2cqi;
      }

      .launch-film__gmail-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 9.2cqi;
        max-width: 42px;
        aspect-ratio: 1;
        border-radius: 9px;
        background: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
      }

      .launch-film__school-stack {
        display: flex;
        align-items: center;
        min-height: 4.2cqh;
      }

      .launch-film__school-stack img {
        display: block;
        width: 9.2cqi;
        max-width: 42px;
        aspect-ratio: 1;
        margin-left: -1.5cqi;
        border: 2px solid rgba(9, 11, 11, 0.96);
        border-radius: 999px;
        background: #ffffff;
        object-fit: contain;
        padding: 0.7cqi;
        box-shadow: 0 1cqh 2.2cqh rgba(0, 0, 0, 0.22);
      }

      .launch-film__school-stack img:first-child {
        margin-left: 0;
      }

      .launch-film__approval-card {
        margin-top: 0.2cqh;
        overflow: hidden;
        border: 1px solid rgba(245, 158, 11, 0.34);
        border-radius: 12px;
        background:
          linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(255, 255, 255, 0.025)),
          rgba(10, 10, 10, 0.94);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
      }

      .confirm-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(245, 158, 11, 0.11);
        border-bottom: 1px solid rgba(245, 158, 11, 0.18);
      }

      .confirm-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: #f59e0b;
      }

      .confirm-card__title {
        flex: 1;
        color: #ffffff;
        font-size: clamp(12px, 2.65cqi, 14px);
        font-weight: 600;
        text-transform: none;
      }

      .confirm-card__message {
        margin: 0;
        padding: 10px 12px 8px;
        color: rgba(255, 255, 255, 0.72);
        font-size: clamp(10px, 2.3cqi, 13px);
        line-height: 1.35;
      }

      .launch-film__email-draft-preview {
        display: grid;
        gap: 0.75cqh;
        margin: 0 12px 10px;
        border: 1px solid rgba(255, 255, 255, 0.11);
        border-radius: 8px;
        padding: 1cqh 1.8cqi;
        background: rgba(255, 255, 255, 0.055);
      }

      .launch-film__email-draft-row {
        display: grid;
        grid-template-columns: 7ch minmax(0, 1fr);
        gap: 1.4cqi;
        align-items: baseline;
      }

      .launch-film__email-draft-row span,
      .launch-film__email-draft-body span {
        color: rgba(255, 255, 255, 0.52);
        font-size: clamp(8px, 1.8cqi, 10px);
        font-weight: 850;
        text-transform: uppercase;
      }

      .launch-film__email-draft-row strong {
        min-width: 0;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.92);
        font-size: clamp(9px, 2.05cqi, 11px);
        font-weight: 750;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .launch-film__email-draft-body {
        display: grid;
        gap: 0.45cqh;
        padding-top: 0.2cqh;
      }

      .launch-film__email-draft-body p {
        color: rgba(255, 255, 255, 0.74);
        font-size: clamp(9px, 2.05cqi, 11px);
        font-weight: 560;
        line-height: 1.28;
      }

      .confirm-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 12px 12px;
      }

      .confirm-btn {
        flex: 1 1 auto;
        min-width: 80px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 16px;
        background: transparent;
        color: #ffffff;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 600;
      }

      .confirm-btn--primary {
        border-color: transparent;
        background: #ccff00;
        color: #0a0a0a;
      }

      .launch-film__graphic-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.35cqh 2cqi;
      }

      .launch-film__graphic-grid figure {
        display: grid;
        gap: 0.6cqh;
        margin: 0;
      }

      .launch-film__graphic-placeholder {
        display: grid;
        place-items: end start;
        min-height: 18.8cqh;
        border-radius: 8px;
        padding: 1.05cqh 1.55cqi;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }

      .launch-film__graphic-placeholder--image {
        height: 18.8cqh;
        min-height: 18.8cqh;
        place-items: stretch;
        padding: 0;
      }

      .launch-film__graphic-placeholder--video {
        position: relative;
      }

      .launch-film__graphic-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
      }

      .launch-film__graphic-video-badge {
        position: absolute;
        top: 50%;
        left: 50%;
        display: grid;
        place-items: center;
        width: 5.2cqh;
        min-width: 28px;
        aspect-ratio: 1;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background: rgba(5, 8, 15, 0.56);
        color: #ffffff;
        box-shadow: 0 0.6cqh 1.8cqh rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(8px);
      }

      .launch-film__graphic-placeholder span {
        color: #fff;
        font-size: clamp(13px, 3.4cqi, 19px);
        text-transform: none;
      }

      .launch-film__graphic-placeholder--hero {
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.72), transparent 46%),
          linear-gradient(315deg, rgba(59, 130, 246, 0.7), transparent 48%), #111827;
      }

      .launch-film__graphic-placeholder--clip {
        background:
          linear-gradient(145deg, rgba(236, 72, 153, 0.62), transparent 48%),
          linear-gradient(315deg, rgba(250, 204, 21, 0.7), transparent 50%), #111111;
      }

      .launch-film__graphic-placeholder--poster {
        background:
          linear-gradient(145deg, rgba(59, 130, 246, 0.62), transparent 50%),
          linear-gradient(315deg, rgba(204, 255, 0, 0.52), transparent 48%), #0f172a;
      }

      .launch-film__graphic-placeholder--banner {
        background:
          linear-gradient(145deg, rgba(239, 68, 68, 0.64), transparent 48%),
          linear-gradient(315deg, rgba(255, 255, 255, 0.22), transparent 52%), #111827;
      }

      .launch-film__graphic-grid figcaption {
        color: rgba(255, 255, 255, 0.68);
        font-size: clamp(9px, 2.1cqi, 12px);
        font-weight: 750;
      }

      .launch-film__artifact-bar--schedule {
        justify-content: flex-start;
      }

      .launch-film__schedule-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 8.8cqi;
        max-width: 40px;
        aspect-ratio: 1;
        border: 1px solid rgba(204, 255, 0, 0.55);
        border-radius: 8px;
        background:
          linear-gradient(135deg, rgba(204, 255, 0, 0.2), rgba(255, 255, 255, 0.04)),
          rgba(204, 255, 0, 0.1);
        color: #ccff00;
        box-shadow:
          0 0 0 1px rgba(204, 255, 0, 0.06),
          0 1.1cqh 2.4cqh rgba(0, 0, 0, 0.22);
      }

      .launch-film__sync-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1cqh 1.4cqi;
        padding: 1.2cqh 1.6cqi;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background:
          radial-gradient(circle at 12% 10%, rgba(204, 255, 0, 0.12), transparent 32%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025)),
          rgba(8, 11, 9, 0.92);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .launch-film__sync-list span {
        display: grid;
        gap: 0.38cqh;
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1.05cqh 2cqi;
        background:
          linear-gradient(135deg, rgba(204, 255, 0, 0.075), transparent 55%),
          rgba(255, 255, 255, 0.045);
        color: rgba(255, 255, 255, 0.8);
        font-size: clamp(10px, 2.45cqi, 13px);
        font-weight: 850;
        line-height: 1.08;
        text-transform: uppercase;
      }

      .launch-film__sync-list b {
        color: #ccff00;
        font-size: clamp(22px, 5.6cqi, 32px);
        font-weight: 950;
        line-height: 0.95;
      }

      .launch-film__strategy-image-placeholder {
        display: block;
        min-height: 16cqh;
        aspect-ratio: 16 / 7.5;
        border: 1px solid rgba(204, 255, 0, 0.22);
        border-radius: 8px;
        padding: 0;
        overflow: hidden;
        background: rgba(245, 245, 241, 0.98);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 1.6cqh 3.4cqh rgba(0, 0, 0, 0.26);
      }

      .launch-film__strategy-image {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 16cqh;
        object-fit: cover;
        object-position: center top;
        background: #f5f5f1;
      }

      .launch-film__strategy-image-placeholder span {
        color: rgba(255, 255, 255, 0.64);
        font-size: clamp(9px, 2.1cqi, 12px);
        text-transform: none;
      }

      .launch-film__strategy-image-placeholder strong {
        max-width: 12ch;
        font-size: clamp(18px, 5cqi, 30px);
      }

      .launch-film__strategy-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.5cqi;
      }

      .launch-film__strategy-actions button {
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        padding: 0.95cqh 1.2cqi;
        background: rgba(255, 255, 255, 0.055);
        color: #ffffff;
        font-size: clamp(10px, 2.35cqi, 13px);
        font-weight: 750;
      }

      .launch-film__strategy-actions button:last-child {
        border-color: transparent;
        background: #ccff00;
        color: #0a0a0a;
      }

      .launch-film__slide--phone {
        overflow: hidden;
        perspective: 160cqh;
        animation: launch-film-phone-in 760ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .launch-film__device-handoff {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        transform-style: preserve-3d;
      }

      .launch-film__iphone {
        position: relative;
        z-index: 3;
        width: min(64cqi, 58cqh);
        aspect-ratio: 9 / 19.5;
        border: 1.1cqi solid rgba(244, 246, 240, 0.98);
        border-radius: 8.2cqi;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(231, 235, 226, 0.96)), #f8faf5;
        box-shadow:
          0 4cqh 18cqh rgba(18, 24, 18, 0.24),
          0 0 0 1px rgba(255, 255, 255, 0.9),
          inset 0 0 0 1px rgba(15, 23, 42, 0.08);
        transform-origin: 52% 42%;
        will-change: transform, filter;
        animation: launch-film-phone-lift 6200ms cubic-bezier(0.22, 1, 0.36, 1) 4.15s both;
      }

      .launch-film__island {
        position: absolute;
        top: 2.1cqh;
        left: 50%;
        z-index: 2;
        width: 34%;
        height: 3.2%;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.34);
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.1);
        transform: translateX(-50%);
      }

      .launch-film__screen {
        position: absolute;
        inset: 1.1%;
        overflow: hidden;
        border-radius: 6.7cqi;
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.16), transparent 34%),
          linear-gradient(225deg, rgba(59, 130, 246, 0.09), transparent 42%), #f8faf5;
      }

      .launch-film__phone-video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #f8faf5;
      }

      .launch-film__phone-image {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center top;
        background: #f8faf5;
      }

      .launch-film__desktop {
        position: absolute;
        left: 50%;
        bottom: 9.5cqh;
        z-index: 4;
        width: min(92cqi, 76cqh);
        max-width: 96%;
        aspect-ratio: 16 / 10.35;
        transform-origin: 50% 58%;
        will-change: opacity, transform, filter;
        opacity: 0;
        animation: launch-film-desktop-rise-zoom 6200ms cubic-bezier(0.2, 0.8, 0.2, 1) 4.15s both;
      }

      .launch-film__desktop-glow {
        position: absolute;
        inset: -11cqh -8cqi;
        z-index: -1;
        background:
          radial-gradient(circle at 32% 42%, rgba(204, 255, 0, 0.2), transparent 36%),
          radial-gradient(circle at 70% 62%, rgba(76, 154, 255, 0.16), transparent 42%);
        filter: blur(22px);
        opacity: 0.72;
      }

      .launch-film__desktop-frame {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1.1cqi solid rgba(244, 246, 240, 0.98);
        border-radius: 3.2cqi;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(229, 234, 224, 0.96)), #f8faf5;
        box-shadow:
          0 5.2cqh 16cqh rgba(18, 24, 18, 0.24),
          0 0 0 1px rgba(255, 255, 255, 0.88),
          inset 0 1px 0 rgba(255, 255, 255, 0.92);
      }

      .launch-film__desktop-camera {
        position: absolute;
        top: 1.35cqh;
        left: 50%;
        z-index: 2;
        width: 8.5%;
        height: 1.4%;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.34);
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.1);
        transform: translateX(-50%);
      }

      .launch-film__desktop-screen {
        position: absolute;
        inset: 3.4%;
        overflow: hidden;
        border-radius: 2.25cqi;
        background:
          linear-gradient(145deg, rgba(204, 255, 0, 0.16), transparent 34%),
          linear-gradient(225deg, rgba(59, 130, 246, 0.09), transparent 42%), #f8faf5;
      }

      .launch-film__desktop-video {
        position: absolute;
        inset: 1.4%;
        display: block;
        width: 97.2%;
        height: 97.2%;
        border-radius: 1.45cqi;
        object-fit: contain;
        background: #f8faf5;
      }

      .launch-film__desktop-screen::before {
        content: '';
        position: absolute;
        inset: -25%;
        background: linear-gradient(
          115deg,
          transparent 0%,
          transparent 38%,
          rgba(255, 255, 255, 0.13) 48%,
          transparent 58%,
          transparent 100%
        );
        transform: translateX(-32%);
        animation: launch-film-desktop-sheen 5200ms ease-in-out 4.7s both;
      }

      @keyframes launch-film-gradient {
        from {
          background-position:
            0% 50%,
            18% 26%,
            0% 0%,
            100% 100%;
          transform: translate3d(-4cqi, -1.4cqh, 0) rotate(-2.2deg) scale(1.02);
        }
        to {
          background-position:
            100% 50%,
            82% 74%,
            22% 18%,
            78% 84%;
          transform: translate3d(4cqi, 1.4cqh, 0) rotate(2.2deg) scale(1.04);
        }
      }

      @keyframes launch-film-action-plan-gradient {
        from {
          background-position:
            0% 50%,
            18% 26%,
            0% 0%,
            100% 100%,
            0% 0%;
        }
        to {
          background-position:
            100% 50%,
            82% 74%,
            22% 18%,
            78% 84%,
            0% 0%;
        }
      }

      @keyframes launch-film-atmosphere {
        from {
          background-position:
            0% 50%,
            0 0,
            0 0;
          transform: translate3d(-1.8cqi, 0, 0);
        }
        to {
          background-position:
            100% 50%,
            0 3.4cqh,
            3.4cqh 0;
          transform: translate3d(1.8cqi, -0.8cqh, 0);
        }
      }

      @keyframes launch-film-intro-in {
        from {
          opacity: 0;
          transform: translate3d(5cqi, 0, 0);
          filter: blur(10px);
        }
        60% {
          opacity: 1;
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
        }
      }

      @keyframes launch-film-word-in {
        0% {
          opacity: 0;
          transform: translateY(3.5cqh);
          filter: blur(10px);
        }
        60% {
          filter: blur(0px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0px);
        }
      }

      @keyframes launch-film-prompt-push-in {
        0% {
          opacity: 0.24;
          transform: translate3d(-3.6cqi, -7.5cqh, 0) scale(0.62) rotateX(10deg);
          filter: blur(12px);
        }
        42% {
          opacity: 0.96;
          transform: translate3d(-1.6cqi, -3.2cqh, 0) scale(0.78) rotateX(5deg);
          filter: blur(4px);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1) rotateX(0deg);
          filter: blur(0);
        }
      }

      @keyframes launch-film-card-in {
        from {
          opacity: 0;
          transform: translateY(2.4cqh) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes launch-film-border {
        from {
          background-position: 0% 50%;
        }
        to {
          background-position: 100% 50%;
        }
      }

      @keyframes launch-film-click {
        0% {
          box-shadow:
            0 0 0 0.45cqi rgba(204, 255, 0, 0.08),
            0 0 3cqh rgba(97, 214, 139, 0.28);
          transform: scaleY(1);
        }
        50% {
          box-shadow:
            0 0 0 0.95cqi rgba(204, 255, 0, 0.06),
            0 0 4.4cqh rgba(97, 214, 139, 0.34);
          transform: scaleY(0.88);
        }
        100% {
          box-shadow:
            0 0 0 0.45cqi rgba(204, 255, 0, 0.08),
            0 0 3cqh rgba(97, 214, 139, 0.28);
          transform: scaleY(1);
        }
      }

      @keyframes launch-film-send-select {
        0% {
          transform: scale(1);
        }
        55% {
          transform: scale(1.12);
        }
        100% {
          transform: scale(1.08);
        }
      }

      @keyframes launch-film-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes launch-film-phone-in {
        from {
          opacity: 0;
          transform: translateY(4cqh) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes launch-film-cascade-in {
        from {
          opacity: 0;
          transform: translate3d(0, 3cqh, 0) scale(0.985);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-cascade-rise {
        from {
          opacity: 0;
          transform: translateY(2cqh);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes launch-film-cascade-command-in {
        from {
          opacity: 0;
          transform: translateY(1.8cqh) scale(0.985);
          filter: blur(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-phone-lift {
        0% {
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0);
        }
        20% {
          transform: translate3d(0, -70cqh, 0) scale(1);
          filter: blur(0);
        }
        78% {
          opacity: 0.84;
          transform: translate3d(0, -70cqh, 0) scale(1);
        }
        100% {
          opacity: 0.72;
          transform: translate3d(0, -70cqh, 0) scale(1);
          filter: blur(0);
        }
      }

      @keyframes launch-film-desktop-rise-zoom {
        0% {
          opacity: 0;
          transform: translate3d(-50%, 30cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(5px);
        }
        16% {
          opacity: 1;
          transform: translate3d(-50%, -11cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(0);
        }
        31% {
          opacity: 1;
          transform: translate3d(-50%, -11cqh, 0) scale(1.24) rotateX(0deg);
          filter: blur(0);
        }
        43% {
          opacity: 1;
          transform: translate3d(-136%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
        67% {
          opacity: 1;
          transform: translate3d(28%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
        86%,
        100% {
          opacity: 1;
          transform: translate3d(28%, -27.5cqh, 0) scale(3.55) rotateX(0deg);
          filter: blur(0);
        }
      }

      @keyframes launch-film-desktop-sheen {
        0%,
        22% {
          opacity: 0;
          transform: translateX(-32%);
        }
        45% {
          opacity: 0.72;
        }
        74%,
        100% {
          opacity: 0;
          transform: translateX(36%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .launch-film *,
        .launch-film {
          animation-duration: 1ms !important;
          transition-duration: 1ms !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtInteractiveDemoReelComponent {
  readonly phoneVideoSrc = input<string | null>(null);
  protected readonly timeline = inject(NxtInteractiveDemoTimelineService);
  protected readonly actionPlanReasoningText = ACTION_PLAN_REASONING_TEXT;
  protected readonly commandCenterNotifications = ACTION_PLAN_COMMAND_CENTER_NOTIFICATIONS;
  readonly promoActionPlanItems = PROMO_ACTION_PLAN_ITEMS;
  protected readonly visiblePromoActionPlanItems = computed(() =>
    this.promoActionPlanItems.slice(0, this.timeline.actionPlanVisibleCardCount())
  );
  protected readonly visibleActionPlanToolSteps = computed<readonly AgentXToolStep[]>(() => {
    const visibleCount = this.timeline.actionPlanToolStepCount();
    const stepsComplete = this.timeline.actionPlanToolStepsComplete();

    return ACTION_PLAN_TOOL_STEP_BLUEPRINTS.slice(0, visibleCount).map((step, index, visible) => ({
      ...step,
      status: stepsComplete || index < visible.length - 1 ? 'success' : ('active' as const),
    }));
  });
  protected readonly desktopVideoSrc = DESKTOP_VIDEO_SRC;
  protected readonly shouldLoopPhoneVideo = false;
  protected readonly desktopVideoActive = signal(false);
  protected readonly finalScoreVideoImageSrc = FINAL_SCORE_VIDEO_IMAGE_SRC;
  protected readonly highlightVideoImageSrc = HIGHLIGHT_VIDEO_IMAGE_SRC;
  protected readonly pdfPlaysImageSrc = PDF_PLAYS_IMAGE_SRC;
  protected readonly prospectCardAthleteImageSrc = PROSPECT_CARD_ATHLETE_IMAGE_SRC;
  protected readonly statCardVideoImageSrc = STAT_CARD_VIDEO_IMAGE_SRC;
  protected readonly strategyCallSheetImageSrc = STRATEGY_CALL_SHEET_IMAGE_SRC;
  protected readonly actionPlanPhoneImageSrc = ACTION_PLAN_PHONE_IMAGE_SRC;
  protected readonly actionPlanPhoneImageSrcByVariant: Record<string, string> = {
    left: ACTION_PLAN_PHONE_LEFT_IMAGE_SRC,
    center: ACTION_PLAN_PHONE_IMAGE_SRC,
    right: ACTION_PLAN_PHONE_RIGHT_IMAGE_SRC,
  };
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private previousShowHook = false;
  private previousHookPromptLength = 0;
  private previousShowPhone = false;
  private previousPromptLength = 0;
  private previousSendSelected = false;
  private audioContext: AudioContext | null = null;
  private audioUnlockCleanup: (() => void) | null = null;
  private desktopVideoStartTimerId: ReturnType<typeof setTimeout> | null = null;
  private desktopCompletionTimerId: ReturnType<typeof setTimeout> | null = null;
  private desktopWindAudioTimerId: ReturnType<typeof setTimeout> | null = null;
  private hookAudioPending = false;
  private nextTypingAudioElementIndex = 0;
  private typingAudioPendingCharacters = 0;
  private readonly typingAudioElements: HTMLAudioElement[] = [];
  private readonly typingAudioTimeoutIds = new Set<ReturnType<typeof setTimeout>>();
  private phoneAudioPending = false;
  private desktopWindAudioPending = false;
  private sendAudioPending = false;

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => this.installAudioUnlockListeners());
      this.destroyRef.onDestroy(() => {
        this.clearDesktopVideoStartTimer();
        this.clearDesktopCompletionTimer();
        this.clearDesktopWindAudioTimer();
        this.clearTypingAudioTimeouts();
        this.resetTypingAudioElements();
        this.audioUnlockCleanup?.();
        this.audioUnlockCleanup = null;
        void this.audioContext?.close();
        this.audioContext = null;
      });
    }

    effect(() => {
      this.timeline.setHoldPhoneUntilComplete(!!this.phoneVideoSrc());
    });

    effect(() => {
      const showHook = this.timeline.showHook();
      const hookPromptLength = this.timeline.hookPrompt().length;
      const showPhone = this.timeline.showPhone();
      const showPrompt = this.timeline.showPrompt();
      const promptLength = this.timeline.typedPrompt().length;
      const sendSelected = this.hasActiveSendSelection();

      if (showHook && !this.previousShowHook) {
        this.hookAudioPending = true;
        void this.tryPlayHookAudio();
      }

      if (!showHook) {
        this.hookAudioPending = false;
        this.typingAudioPendingCharacters = 0;
        this.previousHookPromptLength = 0;
      } else if (hookPromptLength > this.previousHookPromptLength) {
        this.typingAudioPendingCharacters = Math.min(
          this.typingAudioPendingCharacters + (hookPromptLength - this.previousHookPromptLength),
          IOS_TYPING_CLICK_BACKLOG_LIMIT
        );
        void this.tryPlayTypingAudio();
      }

      if (showPhone && !this.previousShowPhone) {
        this.desktopVideoActive.set(false);
        this.clearDesktopCompletionTimer();
        this.scheduleDesktopVideoStart();
        this.phoneAudioPending = true;
        void this.tryPlayPhoneAudio();
        this.scheduleDesktopWindAudio();
      }

      if (!showPhone) {
        this.desktopVideoActive.set(false);
        this.clearDesktopVideoStartTimer();
        this.clearDesktopCompletionTimer();
        this.phoneAudioPending = false;
        this.desktopWindAudioPending = false;
        this.clearDesktopWindAudioTimer();
      }

      if (!showPrompt) {
        this.previousPromptLength = 0;
      } else {
        if (
          promptLength > this.previousPromptLength &&
          promptLength < this.timeline.prompt.length
        ) {
          void this.haptics.impact('light');
        }
      }

      if (sendSelected && !this.previousSendSelected) {
        void this.haptics.impact('heavy');
        this.sendAudioPending = true;
        void this.tryPlaySendAudio();
      }

      if (!sendSelected) {
        this.sendAudioPending = false;
      }

      this.previousShowPhone = showPhone;
      this.previousShowHook = showHook;
      this.previousHookPromptLength = hookPromptLength;
      this.previousPromptLength = promptLength;
      this.previousSendSelected = sendSelected;
    });
  }

  protected handlePhoneVideoEnded(): void {
    if (this.desktopVideoSrc) {
      return;
    }

    this.timeline.completePhoneScene();
  }

  protected handleDesktopVideoEnded(): void {
    if (!this.isBrowser) {
      this.timeline.completePhoneScene();
      return;
    }

    this.clearDesktopCompletionTimer();
    this.desktopCompletionTimerId = setTimeout(() => {
      this.desktopCompletionTimerId = null;

      if (this.timeline.showPhone()) {
        this.timeline.completePhoneScene();
      }
    }, DESKTOP_COMPLETION_HOLD_MS);
  }

  private installAudioUnlockListeners(): void {
    if (!this.isBrowser || this.audioUnlockCleanup) {
      return;
    }

    const unlockAudio = () => {
      this.primeTypingAudioElements();
      void this.flushPendingAudio();
    };

    const options: AddEventListenerOptions = { passive: true };
    const eventTypes = ['pointerdown', 'touchstart', 'keydown'] as const;

    for (const eventType of eventTypes) {
      this.document.addEventListener(eventType, unlockAudio, options);
    }

    this.audioUnlockCleanup = () => {
      for (const eventType of eventTypes) {
        this.document.removeEventListener(eventType, unlockAudio, options);
      }
    };
  }

  private async ensureAudioContext(): Promise<AudioContext | null> {
    if (!this.isBrowser || typeof window === 'undefined') {
      return null;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContextCtor();
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        return null;
      }
    }

    if (this.audioContext.state === 'running') {
      this.audioUnlockCleanup?.();
      this.audioUnlockCleanup = null;
      return this.audioContext;
    }

    return null;
  }

  private async flushPendingAudio(): Promise<void> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return;
    }

    if (this.timeline.showHook() && this.hookAudioPending) {
      await this.tryPlayHookAudio();
    }

    if (this.timeline.showHook() && this.typingAudioPendingCharacters > 0) {
      await this.tryPlayTypingAudio();
    }

    if (this.timeline.showPhone() && this.phoneAudioPending) {
      await this.tryPlayPhoneAudio();
    }

    if (this.timeline.showPhone() && this.desktopWindAudioPending) {
      await this.tryPlayDesktopWindAudio();
    }

    if (this.hasActiveSendSelection() && this.sendAudioPending) {
      await this.tryPlaySendAudio();
    }
  }

  private hasActiveSendSelection(): boolean {
    return (
      this.timeline.introSendSelected() ||
      this.timeline.cascadeRows().some((row) => row.sendSelected)
    );
  }

  private async tryPlayHookAudio(): Promise<void> {
    if (!this.hookAudioPending) {
      return;
    }

    const played = await this.playHookAudio();

    if (played) {
      this.hookAudioPending = false;
    }
  }

  private async tryPlaySendAudio(): Promise<void> {
    if (!this.sendAudioPending) {
      return;
    }

    const played = await this.playSendAudio();

    if (played) {
      this.sendAudioPending = false;
    }
  }

  private async tryPlayTypingAudio(): Promise<void> {
    if (this.typingAudioPendingCharacters <= 0) {
      return;
    }

    const characterCount = this.typingAudioPendingCharacters;
    const played = await this.playTypingAudio(characterCount);

    if (played) {
      this.typingAudioPendingCharacters = Math.max(
        0,
        this.typingAudioPendingCharacters - characterCount
      );
    }
  }

  private async tryPlayPhoneAudio(): Promise<void> {
    if (!this.phoneAudioPending) {
      return;
    }

    const played = await this.playPhoneAudio();

    if (played) {
      this.phoneAudioPending = false;
    }
  }

  private scheduleDesktopWindAudio(): void {
    if (!this.isBrowser) {
      return;
    }

    this.clearDesktopWindAudioTimer();
    this.desktopWindAudioTimerId = setTimeout(() => {
      this.desktopWindAudioTimerId = null;

      if (!this.timeline.showPhone()) {
        return;
      }

      this.desktopWindAudioPending = true;
      void this.haptics.impact('light');
      void this.tryPlayDesktopWindAudio();
    }, DESKTOP_HANDOFF_AUDIO_DELAY_MS);
  }

  private scheduleDesktopVideoStart(): void {
    if (!this.isBrowser) {
      this.desktopVideoActive.set(true);
      return;
    }

    this.clearDesktopVideoStartTimer();
    this.desktopVideoStartTimerId = setTimeout(() => {
      this.desktopVideoStartTimerId = null;

      if (!this.timeline.showPhone()) {
        return;
      }

      this.desktopVideoActive.set(true);
    }, DESKTOP_HANDOFF_AUDIO_DELAY_MS);
  }

  private clearDesktopVideoStartTimer(): void {
    if (this.desktopVideoStartTimerId === null) {
      return;
    }

    clearTimeout(this.desktopVideoStartTimerId);
    this.desktopVideoStartTimerId = null;
  }

  private clearDesktopCompletionTimer(): void {
    if (this.desktopCompletionTimerId === null) {
      return;
    }

    clearTimeout(this.desktopCompletionTimerId);
    this.desktopCompletionTimerId = null;
  }

  private clearDesktopWindAudioTimer(): void {
    if (this.desktopWindAudioTimerId === null) {
      return;
    }

    clearTimeout(this.desktopWindAudioTimerId);
    this.desktopWindAudioTimerId = null;
  }

  private async tryPlayDesktopWindAudio(): Promise<void> {
    if (!this.desktopWindAudioPending) {
      return;
    }

    const played = await this.playDesktopWindAudio();

    if (played) {
      this.desktopWindAudioPending = false;
    }
  }

  private async playHookAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const attack = audioContext.createOscillator();
    const body = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    attack.type = 'triangle';
    attack.frequency.setValueAtTime(280, now);
    attack.frequency.exponentialRampToValueAtTime(420, now + 0.16);

    body.type = 'sawtooth';
    body.frequency.setValueAtTime(140, now);
    body.frequency.exponentialRampToValueAtTime(198, now + 0.18);
    body.frequency.exponentialRampToValueAtTime(176, now + 0.3);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.Q.setValueAtTime(1.1, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.013, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    attack.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    attack.start(now);
    body.start(now);
    attack.stop(now + 0.3);
    body.stop(now + 0.3);

    return true;
  }

  private async playSendAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const snap = audioContext.createOscillator();
    const body = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    snap.type = 'square';
    snap.frequency.setValueAtTime(420, now);
    snap.frequency.exponentialRampToValueAtTime(250, now + 0.05);

    body.type = 'triangle';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(122, now + 0.11);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(1.4, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    snap.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    snap.start(now);
    body.start(now);
    snap.stop(now + 0.08);
    body.stop(now + 0.15);

    return true;
  }

  private async playTypingAudio(characterCount: number): Promise<boolean> {
    const playedAsset = await this.playTypingAssetAudio(characterCount);

    if (playedAsset) {
      return true;
    }

    return this.playTypingSynthAudio(characterCount);
  }

  private async playTypingAssetAudio(characterCount: number): Promise<boolean> {
    if (!this.isBrowser) {
      return false;
    }

    this.primeTypingAudioElements();

    if (!this.typingAudioElements.length) {
      return false;
    }

    const clickCount = Math.max(1, Math.min(characterCount, IOS_TYPING_CLICK_BACKLOG_LIMIT));
    const firstAudioElement = this.getNextTypingAudioElement();

    if (!firstAudioElement || !(await this.playTypingAudioElement(firstAudioElement))) {
      return false;
    }

    for (let index = 1; index < clickCount; index += 1) {
      const timeoutId = setTimeout(() => {
        this.typingAudioTimeoutIds.delete(timeoutId);
        const audioElement = this.getNextTypingAudioElement();

        if (!audioElement) {
          return;
        }

        void this.playTypingAudioElement(audioElement);
      }, index * IOS_TYPING_SOUND_INTERVAL_MS);

      this.typingAudioTimeoutIds.add(timeoutId);
    }

    return true;
  }

  private async playTypingAudioElement(audioElement: HTMLAudioElement): Promise<boolean> {
    try {
      audioElement.pause();
      audioElement.currentTime = 0;
      await audioElement.play();
    } catch {
      audioElement.pause();
      audioElement.currentTime = 0;
      return false;
    }

    const timeoutId = setTimeout(() => {
      this.typingAudioTimeoutIds.delete(timeoutId);
      audioElement.pause();
      audioElement.currentTime = 0;
    }, IOS_TYPING_SOUND_CUTOFF_MS);

    this.typingAudioTimeoutIds.add(timeoutId);
    return true;
  }

  private primeTypingAudioElements(): void {
    if (!this.isBrowser || this.typingAudioElements.length > 0) {
      return;
    }

    for (let index = 0; index < IOS_TYPING_SOUND_POOL_SIZE; index += 1) {
      const audioElement = this.document.createElement('audio');
      audioElement.preload = 'auto';
      audioElement.src = IOS_TYPING_SOUND_SRC;
      audioElement.load();
      this.typingAudioElements.push(audioElement);
    }
  }

  private getNextTypingAudioElement(): HTMLAudioElement | null {
    if (!this.typingAudioElements.length) {
      return null;
    }

    const audioElement = this.typingAudioElements[this.nextTypingAudioElementIndex] ?? null;
    this.nextTypingAudioElementIndex =
      (this.nextTypingAudioElementIndex + 1) % this.typingAudioElements.length;
    return audioElement;
  }

  private clearTypingAudioTimeouts(): void {
    for (const timeoutId of this.typingAudioTimeoutIds) {
      clearTimeout(timeoutId);
    }

    this.typingAudioTimeoutIds.clear();
  }

  private resetTypingAudioElements(): void {
    for (const audioElement of this.typingAudioElements) {
      audioElement.pause();
      audioElement.removeAttribute('src');
      audioElement.load();
    }

    this.typingAudioElements.length = 0;
    this.nextTypingAudioElementIndex = 0;
  }

  private async playTypingSynthAudio(characterCount: number): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const clickCount = Math.max(1, Math.min(characterCount, IOS_TYPING_CLICK_BACKLOG_LIMIT));
    const startTime = audioContext.currentTime + 0.003;

    for (let index = 0; index < clickCount; index += 1) {
      const now = startTime + index * IOS_TYPING_CLICK_INTERVAL_SECONDS;
      const attack = audioContext.createOscillator();
      const body = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      attack.type = 'square';
      attack.frequency.setValueAtTime(2460 + index * 12, now);
      attack.frequency.exponentialRampToValueAtTime(1820 + index * 8, now + 0.01);

      body.type = 'triangle';
      body.frequency.setValueAtTime(1220 + index * 6, now);
      body.frequency.exponentialRampToValueAtTime(860 + index * 4, now + 0.016);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2100, now);
      filter.Q.setValueAtTime(1.4, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.014, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + IOS_TYPING_CLICK_DURATION_SECONDS);

      attack.connect(filter);
      body.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      attack.start(now);
      body.start(now);
      attack.stop(now + IOS_TYPING_CLICK_DURATION_SECONDS);
      body.stop(now + IOS_TYPING_CLICK_DURATION_SECONDS);
    }

    return true;
  }

  private async playPhoneAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const durationSeconds = 0.34;
    const sampleCount = Math.floor(audioContext.sampleRate * durationSeconds);
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const channelData = buffer.getChannelData(0);
    const wind = audioContext.createBufferSource();
    const lift = audioContext.createOscillator();
    const shimmer = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const shimmerFilter = audioContext.createBiquadFilter();

    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / sampleCount;
      channelData[index] = (Math.random() * 2 - 1) * (1 - progress * 0.72);
    }

    wind.buffer = buffer;

    lift.type = 'triangle';
    lift.frequency.setValueAtTime(190, now);
    lift.frequency.exponentialRampToValueAtTime(320, now + 0.18);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(620, now);
    shimmer.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.22);
    filter.Q.setValueAtTime(0.72, now);

    shimmerFilter.type = 'highpass';
    shimmerFilter.frequency.setValueAtTime(540, now);
    shimmerFilter.Q.setValueAtTime(0.6, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.026, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    wind.connect(filter);
    lift.connect(filter);
    shimmer.connect(shimmerFilter);
    shimmerFilter.connect(gain);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    wind.start(now);
    lift.start(now);
    shimmer.start(now);
    wind.stop(now + durationSeconds);
    lift.stop(now + durationSeconds);
    shimmer.stop(now + 0.22);

    return true;
  }

  private async playDesktopWindAudio(): Promise<boolean> {
    const audioContext = await this.ensureAudioContext();

    if (!audioContext) {
      return false;
    }

    const now = audioContext.currentTime;
    const durationSeconds = 0.52;
    const sampleCount = Math.floor(audioContext.sampleRate * durationSeconds);
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      channelData[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
    }

    const wind = audioContext.createBufferSource();
    const lift = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    wind.buffer = buffer;

    lift.type = 'triangle';
    lift.frequency.setValueAtTime(280, now);
    lift.frequency.exponentialRampToValueAtTime(680, now + 0.34);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.36);
    filter.Q.setValueAtTime(0.82, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.026, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    wind.connect(filter);
    lift.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    wind.start(now);
    lift.start(now);
    wind.stop(now + durationSeconds);
    lift.stop(now + durationSeconds);

    return true;
  }
}
