import { describe, expect, it, vi } from 'vitest';
import { AgentXShellWebComponent } from './agent-x-shell-web.component';

describe('AgentXShellWebComponent onResponseComplete', () => {
  function createComponent(activeThreadId?: string) {
    const refresh = vi.fn();
    const emit = vi.fn();
    const requestActiveThreadRefresh = vi.fn();

    const component = Object.create(AgentXShellWebComponent.prototype) as {
      activeDesktopSession: ReturnType<typeof vi.fn>;
      operationsLog: ReturnType<typeof vi.fn>;
      requestActiveThreadRefresh: ReturnType<typeof vi.fn>;
      responseComplete: { emit: ReturnType<typeof vi.fn> };
      onResponseComplete(): void;
    };

    component.activeDesktopSession = vi
      .fn()
      .mockReturnValue(activeThreadId ? { threadId: activeThreadId } : null);
    component.operationsLog = vi.fn().mockReturnValue({ refresh });
    component.requestActiveThreadRefresh = requestActiveThreadRefresh;
    component.responseComplete = { emit };

    return { component, refresh, emit, requestActiveThreadRefresh };
  }

  it('refreshes the active thread before updating the operations log', () => {
    const { component, refresh, emit, requestActiveThreadRefresh } = createComponent('thread-123');

    component.onResponseComplete();

    expect(requestActiveThreadRefresh).toHaveBeenCalledWith('thread-123', 'chat-response-complete');
    expect(refresh).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
  });

  it('still refreshes the operations log when no active thread is open', () => {
    const { component, refresh, emit, requestActiveThreadRefresh } = createComponent();

    component.onResponseComplete();

    expect(requestActiveThreadRefresh).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
  });
});
