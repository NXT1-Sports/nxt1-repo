# Film Review Timeline Generation Refactor

## Replace Polling with Direct Agent X Integration

### Current Problem

The "Generate Timeline" button uses a polling loop:

```typescript
// Current (to be removed):
protected async onGenerateTimeline(reviewId: string): Promise<void> {
  const review = this.selectedReview();
  await this.service.generateTimeline(reviewId, 30, durationCandidate);
  // ↓ Service polls: POST → wait 1s → check status → repeat 300x
  // ↓ UI shows spinner while polling
  // ↓ Updates review.timeline signal when ready
}
```

This is complex and adds state management burden to the service.

### Target Solution

Replace with direct Agent X context injection (like "Ask Agent" button):

```typescript
// New (Agent X-driven):
protected async onGenerateTimeline(review: FilmListReview): Promise<void> {
  // 1. Queue the review context for Agent X
  const context = this.buildFilmReviewDragContext(review);
  this.agentXService.queueSelectedContexts([context]);

  // 2. Build a prompt asking Agent X to analyze
  const prompt = `Analyze this film review and generate a complete timeline breakdown of all plays. Include timestamps, labels, descriptions, and confidence scores for each segment.`;

  // 3. Emit event - Agent X shell opens and sends prompt
  this.askAgentPromptRequested.emit(prompt);
}
```

### Implementation Steps

#### Step 1: Update `onGenerateTimeline()` in agent-x-film-review-panel.component.ts

**File:**
`packages/ui/src/agent-x/components/shared/agent-x-film-review-panel.component.ts`

Replace lines 8728-8758 with:

```typescript
protected async onGenerateTimeline(reviewId: string): Promise<void> {
  const review = this.selectedReview();
  if (!review) return;

  if (this.isBatchClipReview(review)) {
    this.toast.error(
      'Timeline generation is not available for batch clip sessions yet. Import a breakdown sheet or upload full footage instead.'
    );
    return;
  }

  // Sync sport if needed (keep this logic)
  const panelSport = this.panelSport();
  if (review && panelSport && this.normalizeSport(review.sport) !== panelSport) {
    try {
      await this.service.syncReviewSport(reviewId, panelSport);
    } catch (err) {
      this.logger.error('Failed to sync review sport', err, { reviewId });
      this.toast.error('Failed to sync sport');
      return;
    }
  }

  // NEW: Inject video context into Agent X instead of polling
  const context = this.buildFilmReviewDragContext(review);
  this.agentXService.queueSelectedContexts([context]);

  // Build prompt asking Agent X to analyze timeline
  const prompt = this.buildTimelineGenerationPrompt(review);

  // Emit - Agent X shell opens chat and sends this prompt
  this.askAgentPromptRequested.emit(prompt);

  this.logger.info('Timeline generation requested via Agent X', { reviewId });
  this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_INITIATED, {
    reviewId,
    method: 'agent_x', // Track that it's now using Agent X directly
    source: 'timeline_button',
  });
}

protected buildTimelineGenerationPrompt(review: FilmListReview): string {
  const sportLabel = review.sport ? ` (${review.sport})` : '';
  const opponentLabel = review.opponentName ? ` vs ${review.opponentName}` : '';

  return (
    `Analyze this film review${sportLabel}${opponentLabel} and generate a complete timeline breakdown of all plays. ` +
    `For each segment, include: ` +
    `(1) timestamp range (start and end), ` +
    `(2) clear play label/description, ` +
    `(3) confidence score (high/medium/low), ` +
    `(4) any relevant coaching notes or analysis. ` +
    `Format the response as a structured list that can be imported as a timeline.`
  );
}
```

#### Step 2: Deprecate Polling in AgentXFilmReviewService

**File:** `packages/ui/src/agent-x/services/agent-x-film-review.service.ts`

Mark the polling method as deprecated (don't remove yet in case of rollback):

```typescript
/**
 * @deprecated Use Agent X direct integration instead (onGenerateTimeline with queueSelectedContexts)
 * This polling-based approach is being replaced with direct Agent X chat interaction.
 */
async generateTimeline(
  reviewId: string,
  maxPollingAttempts: number = 300,
  durationSec?: number
): Promise<void> {
  this.logger.warn(
    'generateTimeline() is deprecated - use Agent X direct integration instead',
    { reviewId }
  );
  // Keep implementation for backwards compatibility, but users should migrate to Agent X pattern
  // ... existing code ...
}
```

Remove or comment out these signals that tracked polling state:

```typescript
// DEPRECATED - polling state no longer needed with Agent X integration
// private readonly _timelineState = signal<'generating' | 'ready' | 'error' | null>(null);
// private readonly _timelineProgress = signal<number>(0);
```

#### Step 3: Update Backend Agent Tools

**File:** `backend/src/modules/agent/tools/[appropriate-tool].ts`

Ensure Agent X has a tool for video analysis. Check tool policy:

```typescript
// Verify agent tool policy includes:
// - analyze_video: Analyzes film review video and generates play breakdown
// - Or: get_film_review + analyze_video capability
```

The agent should already have access to Gemini video analysis via existing
tools. If not, add:

```typescript
const analyzeVideoTool = {
  name: 'analyze_video',
  description:
    'Analyze a film review video and generate a timeline breakdown of plays with timestamps and descriptions',
  inputSchema: {
    type: 'object',
    properties: {
      reviewId: { type: 'string', description: 'Film review ID' },
      outputFormat: { type: 'string', enum: ['timeline', 'markdown', 'json'] },
    },
    required: ['reviewId'],
  },
  // Handler calls buildAiFilmReviewTimeline() from dashboard.routes.ts
};
```

#### Step 4: Update Component Template

**File:**
`packages/ui/src/agent-x/components/shared/agent-x-film-review-panel.component.ts`

Remove polling UI states from template (lines ~2246):

```html
<!-- BEFORE: Shows spinner while polling -->
@if (review.timelineState === 'generating') {
<div class="generating-overlay">
  <nxt1-spinner />
  <p>Analyzing film and tagging plays...</p>
</div>
}

<!-- AFTER: Simpler UI, Agent X chat handles the work -->
<!-- Button just triggers Agent X interaction -->
<button (click)="onGenerateTimeline(review.id)" [disabled]="false">
  Generate Timeline
</button>
```

#### Step 5: Update Testing

**File:** `apps/web/e2e/tests/agent-x/film-review-timeline.spec.ts`

Update E2E test from polling pattern to Agent X chat pattern:

```typescript
test('should generate timeline via Agent X', async ({ page }) => {
  const filmReviewPage = new FilmReviewPage(page);
  await filmReviewPage.goto();

  // OLD: Waited for polling spinner to complete
  // await page.waitForSelector('[data-testid="timeline-spinner"]', { state: 'hidden' });

  // NEW: Click generates timeline button → triggers Agent X
  await filmReviewPage.generateTimelineButton.click();

  // NEW: Verify Agent X chat receives the video context
  await expect(page.locator('[data-testid="agent-x-shell"]')).toBeVisible();

  // NEW: Verify the prompt was sent about timeline analysis
  const lastMessage = page.locator(
    '[data-testid="agent-message"]:last-of-type'
  );
  await expect(lastMessage).toContainText(/analyze.*timeline|generate.*plays/i);

  // NEW: Wait for agent response containing timeline data
  await page.waitForResponse('**/api/v1/agent/complete');

  // NEW: Verify timeline appears in chat response (or side panel if agent returns structured data)
  const timelineResponse = page.locator('[data-testid="timeline-response"]');
  await expect(timelineResponse).toContainText(/\d+:\d+/); // Time stamps
});
```

### Benefits

| Aspect             | Before (Polling)                               | After (Agent X)                               |
| ------------------ | ---------------------------------------------- | --------------------------------------------- |
| **Complexity**     | Complex state machine, polling loops           | Simple context injection + chat               |
| **UX**             | Generic spinner → "analyzing..."               | Conversational agent response with reasoning  |
| **Extensibility**  | New analysis features = more polling endpoints | New features = improved agent prompts + tools |
| **Backend Load**   | Dedicated polling endpoint + persistence       | Leverages existing agent infrastructure       |
| **Error Handling** | Custom retry + timeout logic                   | Agent handles via conversation                |
| **User Feedback**  | Silent polling                                 | Real-time reasoning from agent                |
| **Mobile**         | Works but adds polling overhead                | Native Agent X chat experience                |

### Rollback Plan

If issues arise, the deprecated `generateTimeline()` method remains functional:

1. Update `onGenerateTimeline()` to check a feature flag
2. If disabled, fall back to old polling method
3. Flag can be toggled without code changes

```typescript
protected async onGenerateTimeline(reviewId: string): Promise<void> {
  const useAgentXDirect = this.featureFlags.isEnabled('timeline_via_agent_x');

  if (useAgentXDirect) {
    // New Agent X approach
    // ...
  } else {
    // Fallback to old polling
    await this.service.generateTimeline(reviewId, 30, durationCandidate);
  }
}
```

### Analytics Tracking

Update events to reflect new approach:

```typescript
this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_INITIATED, {
  reviewId,
  method: 'agent_x', // NEW: track method
  source: 'timeline_button',
});

// Add new completion event
this.analytics?.trackEvent(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATED, {
  reviewId,
  method: 'agent_x',
  playCount: timeline.length,
  source: 'timeline_button',
});
```

### Testing Checklist

- [ ] Click "Generate Timeline" button
- [ ] Agent X shell opens with chat
- [ ] Video context is injected (visible in Agent X context panel)
- [ ] Prompt sent to Agent X about timeline analysis
- [ ] Agent responds with play breakdown
- [ ] Timeline plays are parseable/extractable from response
- [ ] Error handling works (network errors, agent timeouts)
- [ ] Works on mobile (Ionic/Capacitor) and web
- [ ] E2E test passes for new flow
- [ ] Analytics events tracked correctly
- [ ] No polling spinner visible anymore
