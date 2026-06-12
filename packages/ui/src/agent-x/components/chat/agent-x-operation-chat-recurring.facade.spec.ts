import '@angular/compiler';

import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
import { AgentXOperationEventService } from '../../services/agent-x-operation-event.service';
import { AgentXOperationChatRecurringFacade } from './agent-x-operation-chat-recurring.facade';

describe('AgentXOperationChatRecurringFacade', () => {
  it('requests an operations log refresh after cancelling a recurring task', async () => {
    const http = {
      post: vi.fn().mockReturnValue(of({ success: true })),
    };
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
    };
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const operationEventService = {
      emitOperationsLogRefreshRequested: vi.fn(),
    };

    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test' },
        { provide: NxtToastService, useValue: toast },
        {
          provide: NxtLoggingService,
          useValue: {
            child: () => logger,
          },
        },
        {
          provide: NxtBreadcrumbService,
          useValue: {
            trackStateChange: vi.fn(),
          },
        },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
        { provide: AgentXOperationEventService, useValue: operationEventService },
      ],
    });

    const facade = runInInjectionContext(injector, () => new AgentXOperationChatRecurringFacade());
    facade.configure({
      resolveActiveThreadId: () => 'thread-123',
      hasRecurringTasksHint: () => true,
    });

    await facade.cancelRecurringTask('repeat:key:1');

    expect(http.post).toHaveBeenCalledWith(
      'https://api.test/agent-x/operations-log/scheduled/repeat%3Akey%3A1/archive',
      {}
    );
    expect(operationEventService.emitOperationsLogRefreshRequested).toHaveBeenCalledWith(
      'operations-log',
      'thread-123',
      [0, 1000, 2500, 5000]
    );
    expect(toast.success).toHaveBeenCalledWith('Recurring task cancelled');
  });
});
