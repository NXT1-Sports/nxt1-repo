import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityService } from '@nxt1/ui/activity';
import { AgentXService } from '@nxt1/ui/agent-x';
import { ManageTeamMembershipModalService } from '@nxt1/ui/manage-team';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { AUTH_SERVICE } from '../../../../core/services/auth/auth.interface';
import { WebEmailConnectionService } from '../../../../core/services/web/email-connection.service';
import { OAuthTokensService } from '../../../../core/services/web/oauth-tokens.service';
import { NotificationPopoverComponent } from './notification-popover.component';

const routerEvents = new Subject<unknown>();

const createActivityServiceMock = () => ({
  activeTab: vi.fn().mockReturnValue('alerts'),
  loadFeed: vi.fn().mockResolvedValue(undefined),
  loadMore: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  markAllRead: vi.fn().mockResolvedValue(undefined),
  totalUnread: signal(0),
  unreadItems: signal([]),
  unifiedItems: signal([]),
  isLoading: signal(false),
  isLoadingMore: signal(false),
  isEmpty: signal(false),
  error: signal(null),
  hasMore: signal(false),
});

const createLoggerMock = () => ({
  child: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
});

describe('NotificationPopoverComponent', () => {
  beforeEach(() => {
    routerEvents.complete();
  });

  it('queues the startup prompt and navigates to normalized Agent X link from the bell popover', async () => {
    const events = new Subject<unknown>();
    const activityService = createActivityServiceMock();
    const agentX = {
      queueStartupMessage: vi.fn(),
    };
    const router = {
      events,
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      imports: [NotificationPopoverComponent],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: ActivityService, useValue: activityService },
        { provide: AgentXService, useValue: agentX },
        { provide: Router, useValue: router },
        { provide: NxtLoggingService, useValue: createLoggerMock() },
        { provide: AUTH_SERVICE, useValue: { user: signal(null) } },
        {
          provide: ManageTeamMembershipModalService,
          useValue: { open: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: WebEmailConnectionService,
          useValue: { connectProvider: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: OAuthTokensService,
          useValue: { connectedEmails: signal([]) },
        },
      ],
    });

    TestBed.overrideComponent(NotificationPopoverComponent, {
      set: {
        imports: [],
        template: '',
      },
    });

    const fixture = TestBed.createComponent(NotificationPopoverComponent);
    const component = fixture.componentInstance;

    (component as unknown as { onItemClick: (item: Record<string, unknown>) => void }).onItemClick({
      id: 'activity-1',
      type: 'dynamic_agent_alert',
      title: 'HUDL updated',
      tab: 'alerts',
      priority: 'high',
      timestamp: new Date().toISOString(),
      isRead: false,
      deepLink: '/agent',
      metadata: {
        startupPrompt: 'Review the new Hudl touchdown clips and create the best next move.',
      },
    });

    expect(agentX.queueStartupMessage).toHaveBeenCalledWith(
      'Review the new Hudl touchdown clips and create the best next move.'
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith('/agent-x');

    events.next(new NavigationEnd(1, '/agent-x', '/agent-x'));
    events.complete();
    fixture.destroy();
  });
});
