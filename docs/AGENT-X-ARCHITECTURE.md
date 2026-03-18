# Agent X Architecture & Operations

> **2026 ENTERPRISE STANDARD** — This document defines the architectural
> patterns, state management, and best practices for developing and maintaining
> Agent X across the NXT1 platform.

## 1. Overview

Agent X is the central AI command center for the NXT1 platform. It is not just a
standard chatbot; it is a proactive, background-processing operations engine
designed to execute tasks autonomously (e.g., sending emails, designing
graphics, writing scout reports) across both Web and Mobile environments.

Because Agent X coordinates background jobs, push notifications, native OS
intents, and real-time chat, **strict state management and architectural
discipline** are required.

---

## 2. Core Architecture (The 3-Tier System)

Agent X operates on a strict 3-tier architecture that heavily enforces the
"Backend Does the Heavy Lifting" rule.

### Tier 1: The Backend Engine (Node.js/Express)

- **Responsibilities**: OpenRouter integration, LLM prompt orchestration, tool
  execution, multi-stage background job processing.
- **Storage Strategy**:
  - **MongoDB**: Stores heavy chat history, messages, and long-term conversation
    context.
  - **Firestore**: Stores lightweight `agentJobs` (status, tool names,
    timestamps) for real-time listener updates on the client. Documents
    automatically expire using TTL policies to prevent UI clutter.
- **Rule**: The frontend _never_ calls AI APIs directly. All AI and tool logic
  lives here.

### Tier 2: The Shared UI State (`packages/ui/src/agent-x`)

- **Responsibilities**: API communication, state management, chat history
  caching, real-time Firestore listeners.
- **The Singleton Pattern**: `AgentXService` is injected at the root level
  (`providedIn: 'root'`).
- **CRITICAL REQUIREMENT**: Both the Web and Mobile apps **must** inherit this
  exact service from `@nxt1/ui`. Duplicating this service in the mobile app
  creates a split Dependency Injection tree, leading to orphaned state. **There
  is only one single source of truth.**

### Tier 3: The Frontend Shells (Apps: Web & Mobile)

- **Responsibilities**: UI rendering, input collection, haptic feedback, opening
  bottom sheets, and route administration.
- **Rule**: Views contain _zero_ state logic. They solely rely on Angular
  `effect()` listeners subscribing to the shared `AgentXService`.

---

## 3. Cross-Surface State Management (The Queue Pattern)

### The Problem

When a user taps a Push Notification or clicks an Activity Log entry, the app
must route them to the Agent X shell and open a specific conversation thread. If
background services try to manipulate the UI overlay immediately, race
conditions occur (e.g., trying to render a bottom sheet before the parent router
outlet exists).

### The Solution: `queuePendingThread`

We use an asynchronous, queue-based handoff utilizing Angular Signals.

#### 1. The Handoff (Background / Non-UI Services)

When an external intent occurs (like a notification tap), the intercepting
service simply writes the intent to the shared state queue and routes the user.

```typescript
// apps/mobile/src/app/core/services/push-handler.service.ts
import { AgentXService } from '@nxt1/ui';

@Injectable({ providedIn: 'root' })
export class PushHandlerService {
  private agentX = inject(AgentXService);
  private router = inject(Router);

  onNotificationTap(threadId: string) {
    // 1. Queue the intention safely in the unified state
    this.agentX.queuePendingThread(threadId);

    // 2. Route to the primary shell
    this.router.navigate(['/agent-x']);
  }
}
```

#### 2. The Reaction (Agent X Shell Component)

The `AgentXComponent` boots up. Inside its constructor, it runs an Angular
`effect()` that listens to the `pendingThread` signal. Once it detects a queued
thread, it processes the UI change and clears the queue.

```typescript
// packages/ui/src/agent-x/shell/agent-x.component.ts
import { AgentXService } from '../agent-x.service';

@Component({ ... })
export class AgentXComponent {
  private agentX = inject(AgentXService);
  private bottomSheet = inject(NxtBottomSheetService);

  constructor() {
    effect(() => {
      const pendingThreadId = this.agentX.pendingThread();

      if (pendingThreadId) {
        // 1. Open the UI safely (we are guaranteed to be mounted here)
        this.openChatOverlay(pendingThreadId);

        // 2. Clear the queue so it doesn't fire again
        this.agentX.clearPendingThread();
      }
    });
  }
}
```

---

## 4. Signal-Based Service API (`AgentXService`)

The core `AgentXService` exposes its public state purely through mapped,
read-only Signals. It does not leak variables or `BehaviorSubject` observables.

**Key Signals:**

- `messages()`: The reactive list of chat items.
- `isLoading()`: Prevents overlapping submissions and controls UI skeleton
  animations.
- `pendingThread()`: The active queue for cross-surface thread launching.

---

## 5. Development Checklist & Best Practices

If you are modifying Agent X code, you **must** adhere to these 2026 standards:

- [ ] **No Local Mocks**: Never create an `agent-x.service.ts` inside
      `apps/mobile/` or `apps/web/`. Always use
      `export { AgentXService } from '@nxt1/ui';` to prevent Dependency
      Injection fragmentation.
- [ ] **Event-Driven UI**: Do not manually command the UI to open from deep
      services. Use `queuePendingThread(id)` and let the shell component react
      via `effect()`.
- [ ] **Memory Management**: If creating real-time listeners for jobs (e.g.,
      Firestore `onSnapshot`), ensure the listener is explicitly destroyed when
      the thread is closed to prevent massive memory leaks.
- [ ] **Haptics Integration**: All state transitions inside the shell (Job
      completion, Message Arrival) should trigger standard `@nxt1/ui` haptics
      (e.g., `this.haptics.notification('success')`).
- [ ] **Dual Query Architecture**: For UI feeds like the Dashboard Tasks list,
      merge active background jobs (from Firestore) with historic completed
      items (from the backend endpoints) to give users a seamless view of "What
      Agent X is doing" and "What Agent X has done."
