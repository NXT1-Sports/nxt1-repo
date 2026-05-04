/**
 * @fileoverview Agent X Type Definitions
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Agent X AI assistant.
 * 100% portable - works on web, mobile, and backend.
 */

import type { PortableTimestamp } from '../models/portable-timestamp.model';
import type {
  AgentIdentifier,
  AgentJobOrigin,
  AgentProgressMetadata,
  AgentProgressStage,
  AgentProgressStageType,
  AgentYieldState,
  OperationOutcomeCode,
} from './agent.types';

// ============================================
// ATTACHMENT TYPES
// ============================================

/**
 * MIME type categories that Agent X can process via multimodal models.
 */
export type AgentXAttachmentType = 'image' | 'video' | 'pdf' | 'csv' | 'doc' | 'app';

/**
 * Metadata for a file attached to an Agent X message.
 * Stored in MongoDB alongside the message — the actual binary lives in Firebase Storage.
 */
export interface AgentXAttachment {
  /** Unique attachment identifier (UUID v4). */
  readonly id: string;
  /** Signed/read URL for the uploaded file. May be refreshed by backend on history reads. */
  readonly url: string;
  /** Firebase Storage object path used to re-sign URLs (non-video files). */
  readonly storagePath?: string;
  /** Original file name as chosen by the user. */
  readonly name: string;
  /** MIME type (e.g. `image/jpeg`, `application/pdf`). */
  readonly mimeType: string;
  /** Resolved high-level type for UI rendering and model routing. */
  readonly type: AgentXAttachmentType;
  /** File size in bytes. */
  readonly sizeBytes: number;
  /**
   * Cloudflare Stream video ID — present only for `type === 'video'` attachments
   * uploaded via TUS. Used by Agent X tools such as `clip_video`, `generate_thumbnail`,
   * and `generate_captions`.
   */
  readonly cloudflareVideoId?: string;
  /** Connected-source platform label for app attachments. */
  readonly platform?: string;
  /** Platform favicon URL for app attachments. */
  readonly faviconUrl?: string;
}

/**
 * Minimal metadata for a file that is selected but not yet uploaded.
 * Sent as `attachmentStubs` in a chat request when the upload is still in progress.
 * The backend waits up to 90 s for the frontend to POST the resolved URL via
 * `POST /agent-x/chat/pending-attachments/:operationId` before processing.
 */
export interface AgentXAttachmentStub {
  /** Must match the `id` that will be sent in the resolved full attachment. */
  readonly id: string;
  /** Original file name chosen by the user. */
  readonly name: string;
  /** MIME type (e.g. `video/mp4`, `image/jpeg`). */
  readonly mimeType: string;
  /** File size in bytes. */
  readonly sizeBytes: number;
  /** Resolved high-level attachment type. */
  readonly type: AgentXAttachmentType;
}

// ============================================
// CHAT TYPES
// ============================================

/**
 * Role of a message sender in the chat.
 */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

// ============================================
// MESSAGE PARTS — Copilot-style interleaved rendering
// ============================================

/**
 * A single rendering segment in a message. Parts are rendered in order,
 * enabling interleaved text → tool steps → text → card sequences
 * (matching the VS Code Copilot pattern).
 */
export type AgentXMessagePart =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'tool-steps'; readonly steps: readonly AgentXToolStep[] }
  | { readonly type: 'card'; readonly card: AgentXRichCard }
  | { readonly type: 'image'; readonly url: string; readonly alt?: string }
  | { readonly type: 'video'; readonly url: string; readonly mimeType?: string }
  /**
   * Extended thinking block emitted by Claude 3.7+ / Gemini 2.5 before the
   * answer. Hidden by default (collapsed) — surfaced as a collapsible panel
   * in the chat UI so power users can inspect the model's reasoning.
   * `done` is set to true when the first text delta arrives, collapsing the block.
   */
  | { readonly type: 'thinking'; readonly content: string; readonly done?: true };

/**
 * A single message in the Agent X conversation.
 */
export interface AgentXMessage {
  /** Unique message identifier */
  readonly id: string;
  /** Who sent the message */
  readonly role: ChatRole;
  /** Message content (text) */
  readonly content: string;
  /** When the message was created */
  readonly timestamp: Date;
  /** Whether assistant is currently typing */
  readonly isTyping?: boolean;
  /** Whether this message represents an error */
  readonly error?: boolean;
  /** Optional image URL (e.g. generated graphic from Agent X) */
  readonly imageUrl?: string;
  /** File attachments (images, PDFs, CSVs) uploaded with this message. */
  readonly attachments?: readonly AgentXAttachment[];
  /** Optional metadata */
  readonly metadata?: AgentXMessageMetadata;
  /**
   * When present, this message should render as an Action Card instead of a text bubble.
   * Populated when the agent yields control back to the user (approval or input needed).
   */
  readonly yieldState?: AgentYieldState;
  /** The operation ID associated with this yield (needed to approve/reply). */
  readonly operationId?: string;
  /**
   * Inline tool execution steps displayed as a Copilot-style accordion.
   * Populated in real time as the backend executes tools during a streaming response.
   */
  readonly steps?: readonly AgentXToolStep[];
  /**
   * Rich interactive cards embedded in the message (e.g. planner checklist).
   * Rendered as standalone UI components inside the chat bubble.
   */
  readonly cards?: readonly AgentXRichCard[];
  /**
   * Ordered sequence of content segments for Copilot-style interleaved rendering.
   * When present, the chat bubble renders parts in order instead of the flat
   * steps → content → cards layout. Built during SSE streaming to preserve
   * the natural text ↔ tool-step ↔ card interleaving.
   *
   * Old messages (loaded from history) may not have this field — the bubble
   * falls back to the flat layout using `content`, `steps`, and `cards`.
   */
  readonly parts?: readonly AgentXMessagePart[];
}

// ============================================
// LIVE VIEW SESSION TYPES
// ============================================

/**
 * Trust tier for a live-view destination.
 * - `platform`  — Allowlisted NXT1 platform from the PLATFORM_REGISTRY (higher trust).
 * - `arbitrary` — User-supplied URL that passed validation (lower trust, no auth reuse).
 */
export type LiveViewDestinationTier = 'platform' | 'arbitrary';

/**
 * Authentication state of the live-view session.
 * - `authenticated` — Using a persisted Firecrawl profile with verified credentials.
 * - `ephemeral`     — Anonymous/one-off session with no stored auth state.
 * - `expired`       — Had an authenticated profile but probe detected stale credentials.
 */
export type LiveViewAuthStatus = 'authenticated' | 'ephemeral' | 'expired';

/**
 * Capabilities the frontend can exercise on this live-view session.
 * Returned by the backend so the shell enables/disables controls dynamically.
 */
export interface LiveViewSessionCapabilities {
  /** Whether the session can be refreshed (navigate to same URL again). */
  readonly canRefresh: boolean;
  /** Whether the user can type a new URL to navigate within the session. */
  readonly canNavigate: boolean;
  /** Whether the session is backed by a saved Firecrawl profile (auth reuse). */
  readonly hasAuthProfile: boolean;
}

/**
 * Full contract for an active live-view browser session.
 * Returned by the backend when a live view is started, and attached to
 * `AutoOpenPanelInstruction` so the frontend has everything it needs
 * to render and control the session without further round-trips.
 */
export interface LiveViewSession {
  /** Backend-assigned unique session identifier (UUID v4). */
  readonly sessionId: string;
  /** Interactive VNC/iframe URL returned by Firecrawl. */
  readonly interactiveUrl: string;
  /** Top-level live-view URL returned by Firecrawl for opening the same session in a browser tab. */
  readonly liveViewUrl?: string;
  /** The destination the user or agent originally requested. */
  readonly requestedUrl: string;
  /** Resolved canonical URL the browser was actually navigated to. */
  readonly resolvedUrl: string;
  /** Trust tier of the destination. */
  readonly destinationTier: LiveViewDestinationTier;
  /** Platform key if the destination matched an allowlisted platform, e.g. `'hudl'`. */
  readonly platformKey?: string;
  /** Human-readable domain label for display in the panel header. */
  readonly domainLabel: string;
  /** Authentication state of this session. */
  readonly authStatus: LiveViewAuthStatus;
  /** What the frontend is allowed to do with this session. */
  readonly capabilities: LiveViewSessionCapabilities;
  /** Timestamp when the session was created. */
  readonly createdAt: PortableTimestamp;
  /** Timestamp when the session will auto-expire. */
  readonly expiresAt: PortableTimestamp;
}

/**
 * Instruction for the frontend to auto-open the expanded side panel.
 * Attached to a message when the agent wants to surface a live view or media.
 */
export interface AutoOpenPanelInstruction {
  readonly type: 'live-view' | 'live-view-launcher' | 'image' | 'video' | 'doc';
  readonly url: string;
  /** Optional top-level URL to open in a separate browser tab while `url` remains the embedded iframe source. */
  readonly externalUrl?: string;
  readonly title?: string;
  /**
   * When `type === 'live-view'`, carries the full session contract
   * so the shell can render and control the browser session.
   */
  readonly session?: LiveViewSession;
}

/**
 * Optional metadata attached to messages.
 */
export interface AgentXMessageMetadata {
  /** Model used for generation */
  readonly model?: string;
  /** Tokens used in request */
  readonly inputTokens?: number;
  /** Tokens in response */
  readonly outputTokens?: number;
  /** Processing time in milliseconds */
  readonly processingTime?: number;
  /** Mode context when message was sent */
  readonly mode?: AgentXMode;
  /** When present, the frontend should auto-open the expanded side panel with this content. */
  readonly autoOpenPanel?: AutoOpenPanelInstruction;
}

// ============================================
// QUICK TASK TYPES
// ============================================

/**
 * Quick task category based on user role.
 */
export type QuickTaskCategory = 'athlete' | 'coach' | 'college' | 'general';

/**
 * A predefined quick action task for the AI.
 */
export interface AgentXQuickTask {
  /** Unique task identifier */
  readonly id: string;
  /** Display title */
  readonly title: string;
  /** Short description */
  readonly description: string;
  /** Icon name (Ionicons) */
  readonly icon: string;
  /** Pre-filled prompt text */
  readonly prompt: string;
  /** Task category */
  readonly category: QuickTaskCategory;
  /** Optional badge count */
  readonly badge?: number;
}

// ============================================
// MODE TYPES
// ============================================

/**
 * Agent X operational modes (feature tabs).
 */
export type AgentXMode = 'highlights' | 'graphics' | 'recruiting' | 'evaluation';

/**
 * Mode configuration for display.
 */
export interface AgentXModeConfig {
  /** Mode identifier */
  readonly id: AgentXMode;
  /** Display label */
  readonly label: string;
  /** Optional icon */
  readonly icon?: string;
  /** Mode description */
  readonly description?: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to send a message to Agent X.
 */
export interface AgentXChatRequest {
  /** The user's message */
  readonly message: string;
  /** Current operational mode */
  readonly mode?: AgentXMode;
  /** Conversation history for context */
  readonly history?: readonly AgentXMessage[];
  /** User context for personalization */
  readonly userContext?: AgentXUserContext;
  /**
   * MongoDB thread ID for conversation continuity.
   * Omit to start a new thread; include to continue an existing one.
   * Resolved by the backend on the `event: thread` SSE frame.
   */
  readonly threadId?: string;
  /**
   * File attachments to send alongside the message.
   * Each attachment must already be uploaded to Firebase Storage;
   * these contain the CDN URLs + metadata resolved after upload.
   */
  readonly attachments?: readonly AgentXAttachment[];
  /**
   * Connected app sources the user has explicitly selected for this message.
   * The backend injects these as context hints so Agent X knows which platforms
   * are available for retrieval or virtual browser navigation.
   * e.g. [{ platform: 'Hudl', profileUrl: 'https://hudl.com/athlete/...' }]
   */
  readonly connectedSources?: readonly {
    readonly platform: string;
    readonly profileUrl: string;
    readonly faviconUrl?: string;
  }[];
  /**
   * Stubs for files that are selected but not yet uploaded.
   * When present, the backend starts the SSE stream immediately, emits a
   * `waiting_for_attachments` event, and awaits a resolution POST before
   * enqueueing the job. Can coexist with `attachments` (already-uploaded files).
   */
  readonly attachmentStubs?: readonly AgentXAttachmentStub[];
  /**
   * Re-attach to an already-running queued operation stream.
   * Used after approval resolution and SSE drop recovery.
   */
  readonly resumeOperationId?: string;
  /** Replay dedup: skip persisted events up to and including this seq number. */
  readonly afterSeq?: number;
  /** Optional structured quick-action selection resolved by the backend. */
  readonly selectedAction?: AgentXSelectedAction;
}

/** Which coordinator action surface originated the request. */
export type AgentXSelectedActionSurface = 'command' | 'scheduled' | 'suggested';

/** Structured quick-action metadata sent alongside the visible chip label. */
export interface AgentXSelectedAction {
  readonly coordinatorId: string;
  readonly actionId: string;
  readonly surface: AgentXSelectedActionSurface;
  /** Visible chip label for UX, analytics, and operation history. */
  readonly label?: string;
}

/**
 * Response from Agent X chat endpoint.
 */
export interface AgentXChatResponse {
  /** Whether request was successful */
  readonly success: boolean;
  /** The assistant's response message */
  readonly message?: AgentXMessage;
  /** Error details if failed */
  readonly error?: string;
  /** Error code for programmatic handling */
  readonly errorCode?: AgentXErrorCode;
}

/**
 * User context for AI personalization.
 */
export interface AgentXUserContext {
  /** User's role on the platform */
  readonly role?: string;
  /** User's primary sport */
  readonly sport?: string;
  /** User's position/event */
  readonly position?: string;
  /** Graduation year (for athletes) */
  readonly gradYear?: number;
  /** User's state/region */
  readonly state?: string;
}

// ============================================
// TOOL STEP & RICH CARD TYPES
// ============================================

/** Execution status of a single tool step. */
export type AgentXToolStepStatus = 'pending' | 'active' | 'success' | 'error';

/** Semantic icon ids for streamed tool steps. */
export type AgentXToolStepIcon =
  | 'default'
  | 'delete'
  | 'upload'
  | 'download'
  | 'search'
  | 'processing'
  | 'document'
  | 'media'
  | 'database'
  | 'email'
  | 'approval';

/**
 * A single tool execution step shown as an inline log in the chat bubble.
 * Rendered in a Copilot-style accordion: spinner when active, checkmark on success.
 */
export interface AgentXToolStep {
  /** Unique step identifier (UUID). */
  readonly id: string;
  /** Short human-readable label (e.g. "Searching athlete database…"). */
  readonly label: string;
  /** Stable backend-authored localization key paired with label text when available. */
  readonly messageKey?: string;
  /** Which agent emitted the step, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this step, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Current execution status — updated in real time via SSE. */
  readonly status: AgentXToolStepStatus;
  /** Optional semantic icon key for custom rendering. */
  readonly icon?: AgentXToolStepIcon;
  /** Optional detail text shown when the accordion is expanded. */
  readonly detail?: string;
}

/** Card type discriminator for rich inline cards. */
export type AgentXRichCardType =
  | 'planner'
  | 'confirmation'
  | 'ask_user'
  | 'data-table'
  | 'citations'
  | 'parameter-form'
  | 'draft'
  | 'profile'
  | 'film-timeline'
  | 'billing-action'
  | 'document';

/** A single item in a planner checklist card. */
export interface AgentXPlannerItem {
  /** Unique ID for this checklist item. */
  readonly id: string;
  /** Human-readable step description. */
  readonly label: string;
  /** Whether the step is complete. */
  readonly done: boolean;
  /** True while this specific task is actively executing. At most one item is active at a time. */
  readonly active?: boolean;
  /** Typed task status for richer execution-plan rendering. */
  readonly status?: import('./agent.types').AgentTaskStatus;
  /** Optional short detail line shown under the main label. */
  readonly note?: string;
}

/**
 * A rich interactive card rendered inline in the chat timeline.
 * The `type` discriminator determines which Angular component is projected.
 */
export interface AgentXRichCard {
  /** Card type — drives Angular component selection. */
  readonly type: AgentXRichCardType;
  /** Which agent generated the card, used for per-agent colorways. */
  readonly agentId: AgentIdentifier;
  /** Card title (shown as header). */
  readonly title: string;
  /** Type-specific payload. */
  readonly payload:
    | AgentXPlannerPayload
    | AgentXDataTablePayload
    | AgentXConfirmationPayload
    | AgentXAskUserPayload
    | AgentXCitationsPayload
    | AgentXParameterFormPayload
    | AgentXDraftPayload
    | AgentXProfilePayload
    | AgentXFilmTimelinePayload
    | AgentXBillingActionPayload
    | AgentXDocumentPayload
    | Record<string, unknown>;
}

// ── Planner ──

/** Payload for the `planner` card type. */
export interface AgentXPlannerPayload {
  /** Ordered list of checklist items. */
  readonly items: readonly AgentXPlannerItem[];
}

// ── Data Table ──

/** Column definition for the `data-table` card type. */
export interface AgentXDataTableColumn {
  /** Machine-readable key (matches row value keys). */
  readonly key: string;
  /** Human-visible column header. */
  readonly label: string;
  /** Optional text alignment. */
  readonly align?: 'left' | 'center' | 'right';
}

/** Payload for the `data-table` card type. */
export interface AgentXDataTablePayload {
  /** Column definitions (order determines display order). */
  readonly columns: readonly AgentXDataTableColumn[];
  /** Row data — each row is a key/value map matching column keys. */
  readonly rows: readonly Record<string, string | number | boolean | undefined>[];
}

// ── Confirmation ──

/** A single action button in the `confirmation` card. */
export interface AgentXConfirmationAction {
  /** Machine-readable action identifier. */
  readonly id: string;
  /** Human-visible button label. */
  readonly label: string;
  /** Visual style variant. */
  readonly variant: 'primary' | 'secondary' | 'destructive';
}

/**
 * Discriminator for the confirmation card rendering variant.
 * - `email`           — Single email approval with editable draft UI.
 * - `email-batch`     — Batch email approval with editable recipient pills + template.
 * - `timeline_post`   — Timeline/team post approval with editable title + description.
 * - `generic_approval`— Rich approval card for non-email tools (profile/team writes,
 *                       workspace actions, deletes, etc.) with action summary + data preview.
 * - `plan_approval`   — Multi-step execution plan review card with goal + ordered
 *                       step list (used by `create_plan` / `execute_saved_plan`).
 */
export type AgentXConfirmationVariant =
  | 'email'
  | 'email-batch'
  | 'timeline_post'
  | 'generic_approval'
  | 'plan_approval';

/**
 * Email payload attached to `email` and `email-batch` confirmation cards.
 * Enables the frontend to pre-populate an editable draft preview.
 */
export interface AgentXConfirmationEmailData {
  /** Email subject line (or batch subject template). */
  readonly subject: string;
  /** Email body HTML (or batch body HTML template). */
  readonly body: string;
  /** Single-email recipient address. Present only on `email` variant. */
  readonly toEmail?: string;
  /**
   * Recipient list for batch sends.
   * Each entry is either a plain email string (legacy) or a structured object
   * preserving per-recipient template variables for the round-trip approval.
   */
  readonly recipients?: readonly (
    | string
    | { readonly toEmail: string; readonly variables: Record<string, string | number | boolean> }
  )[];
  /** Total recipient count — used for the card title badge. */
  readonly recipientsCount: number;
}

/**
 * Category of a non-email tool approval.
 * Drives the icon, accent color, and risk language in the generic approval card.
 */
export type AgentXGenericApprovalCategory =
  | 'profileWrite'
  | 'profileDelete'
  | 'teamWrite'
  | 'teamDelete'
  | 'communication'
  | 'workspace'
  | 'automation'
  | 'destructive'
  | 'other';

/**
 * Structured data attached to `generic_approval` confirmation cards.
 * Provides a rich preview so users understand what Agent X wants to do
 * without needing to expand a raw JSON accordion.
 */
/**
 * Rich preview for write_season_stats approval — stats displayed in table format.
 */
export interface SeasonStatsPreview {
  readonly type: 'season_stats';
  readonly sport: string;
  readonly year?: string | number;
  readonly rows: ReadonlyArray<{
    readonly label: string;
    readonly value: string | number;
  }>;
}

/**
 * Rich preview for write_core_identity approval — profile info in labeled sections.
 */
export interface CoreIdentityPreview {
  readonly type: 'core_identity';
  readonly sections: ReadonlyArray<{
    readonly title: string;
    readonly fields: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  }>;
}

/**
 * Rich preview for write_roster_entries approval — roster in table format.
 */
export interface RosterPreview {
  readonly type: 'roster';
  readonly teamName?: string;
  readonly rows: ReadonlyArray<{
    readonly name: string;
    readonly number?: string | number;
    readonly position?: string;
    readonly grade?: string;
    readonly status?: string;
  }>;
}

/** Union of all rich preview types. */
export type ApprovalRichPreview = SeasonStatsPreview | CoreIdentityPreview | RosterPreview;

export interface AgentXGenericApprovalData {
  /** Semantic category driving icon + accent color in the UI. */
  readonly category: AgentXGenericApprovalCategory;
  /** Risk level indicator — controls warning color and language. */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable one-line summary of the action (from `resolveAgentApprovalCopy`). */
  readonly actionSummary: string;
  /** Human-readable resource name (e.g. "timeline post", "season stats"). */
  readonly resourceName: string;
  /**
   * Optional key-value preview of the most relevant fields from `toolInput`.
   * Limited to 5 entries. Sensitive fields (tokens, passwords, etc.) are stripped.
   */
  readonly dataFields?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  /** Optional rich structured preview (stats table, profile sections, roster table). */
  readonly richPreview?: ApprovalRichPreview;
}

/**
 * Timeline/team post payload attached to `timeline_post` confirmation cards.
 * Enables users to edit the post title and description before approval.
 */
export interface AgentXConfirmationTimelinePostData {
  /** Editable post title shown in feed cards (optional for plain text posts). */
  readonly title?: string;
  /** Editable post body/description. */
  readonly description: string;
  /** Post type (text, image, video, announcement, etc.). */
  readonly postType?: string;
  /** True when approval targets a team timeline post. */
  readonly isTeamPost: boolean;
}

/**
 * A single step inside a plan approval card.
 * Mirrors the persisted `AgentTask` shape but only carries display-relevant fields
 * so the frontend can render an ordered, human-readable list without leaking
 * internal scheduling/DAG metadata.
 */
export interface AgentXPlanApprovalStep {
  /** Stable task id (`task_1`, `task_2`, …) — used as `track` key on the frontend. */
  readonly id: string;
  /** Short human-readable label (e.g. "Draft outreach email to coach Smith"). */
  readonly label: string;
  /** Optional longer description shown under the label. */
  readonly description?: string;
  /** Coordinator/agent that will execute this step (e.g. "communication_coordinator"). */
  readonly coordinator?: string;
  /** Tool the coordinator is expected to invoke (display only). */
  readonly toolName?: string;
}

/**
 * Plan approval payload attached to `plan_approval` confirmation cards.
 *
 * Surfaces the actual plan (goal + ordered steps) so users can review and
 * approve a multi-step execution plan, instead of seeing only an opaque
 * `planId` in the generic-approval data table.
 */
export interface AgentXPlanApprovalData {
  /** The user-stated goal that produced this plan. */
  readonly goal: string;
  /** Backend-issued plan id — preserved for the resume / execute step. */
  readonly planId: string;
  /** Ordered, display-ready list of plan steps. */
  readonly steps: ReadonlyArray<AgentXPlanApprovalStep>;
}

/** Payload for the `confirmation` card type. */
export interface AgentXConfirmationPayload {
  /** Descriptive message body. */
  readonly message: string;
  /** Available action buttons (max 3). */
  readonly actions: readonly AgentXConfirmationAction[];
  /** Pending approval request id for approval-backed confirmations. */
  readonly approvalId?: string;
  /** Operation id associated with the pending approval. */
  readonly operationId?: string;
  /**
   * Rendering variant — determines which UI branch the action card renders.
   * Absent on legacy cards; the frontend falls back to toolName detection.
   */
  readonly variant?: AgentXConfirmationVariant;
  /**
   * Email draft data — present on `email` and `email-batch` variants.
   * Enables the editable draft UI without re-reading raw toolInput.
   */
  readonly emailData?: AgentXConfirmationEmailData;
  /**
   * Generic approval data — present on `generic_approval` variant.
   * Provides a structured rich preview for non-email tool approvals.
   */
  readonly genericApprovalData?: AgentXGenericApprovalData;
  /**
   * Timeline post data — present on `timeline_post` variant.
   * Provides editable title/description for timeline/team post approvals.
   */
  readonly timelinePostData?: AgentXConfirmationTimelinePostData;
  /**
   * Plan approval data — present on `plan_approval` variant.
   * Surfaces the goal and the ordered list of steps Agent X drafted so the
   * user can review the actual plan instead of just an opaque plan id.
   */
  readonly planApprovalData?: AgentXPlanApprovalData;
}

// ── Ask User ──

/** Payload for the `ask_user` card type — inline question from Agent X. */
export interface AgentXAskUserPayload {
  /** The question Agent X is asking. */
  readonly question: string;
  /** Optional additional context or instructions. */
  readonly context?: string;
  /** The thread ID — used when posting the user's reply. */
  readonly threadId?: string;
  /** Operation ID that is currently yielded and must be resumed. */
  readonly operationId?: string;
}

// ── Citations ──

/** A single citation/source reference. */
export interface AgentXCitation {
  /** Unique citation identifier. */
  readonly id: string;
  /** Display label (e.g. article title, page name). */
  readonly label: string;
  /** Destination URL. */
  readonly url: string;
  /** Optional favicon or icon URL. */
  readonly iconUrl?: string;
}

/** Payload for the `citations` card type. */
export interface AgentXCitationsPayload {
  /** Ordered list of cited source references. */
  readonly sources: readonly AgentXCitation[];
}

// ── Parameter Form ──

/** A single form field in the `parameter-form` card. */
export interface AgentXParameterField {
  /** Machine-readable field key (submitted in the form payload). */
  readonly key: string;
  /** Human-visible label. */
  readonly label: string;
  /** Input type. */
  readonly type: 'text' | 'number' | 'select' | 'toggle';
  /** Default value (pre-filled in the form). */
  readonly defaultValue?: string | number | boolean;
  /** Options list (required when type = 'select'). */
  readonly options?: readonly string[];
  /** Optional placeholder text. */
  readonly placeholder?: string;
}

/** Payload for the `parameter-form` card type. */
export interface AgentXParameterFormPayload {
  /** Ordered list of form fields. */
  readonly fields: readonly AgentXParameterField[];
  /** Label for the submit button. */
  readonly submitLabel: string;
}

// ── Draft ──

/** Payload for the `draft` card type (outreach editor). */
export interface AgentXDraftPayload {
  /** The draft body content (editable by the user). */
  readonly content: string;
  /** Optional email subject line (editable by the user). */
  readonly subject?: string;
  /** Number of recipients (display-only context). */
  readonly recipientsCount?: number;
  /** Recipient email address for approval-backed send-email actions. */
  readonly toEmail?: string;
  /** Pending approval request id for approval-backed draft sending. */
  readonly approvalId?: string;
  /** Operation id associated with the pending approval. */
  readonly operationId?: string;
}

// ── Profile ──

/** A single stat displayed in the profile micro-card. */
export interface AgentXProfileStat {
  /** Stat label (e.g. "Height", "GPA", "40yd"). */
  readonly label: string;
  /** Stat value (e.g. "6'2\"", "3.8", "4.45s"). */
  readonly value: string;
}

/** Payload for the `profile` card type (player snapshot). */
export interface AgentXProfilePayload {
  /** Platform user ID (used for "View Profile" navigation). */
  readonly userId: string;
  /** Display name. */
  readonly name: string;
  /** Avatar CDN URL. */
  readonly avatarUrl?: string;
  /** Primary position (e.g. "Point Guard", "Wide Receiver"). */
  readonly position?: string;
  /** Graduation year. */
  readonly gradYear?: number;
  /** Ordered key stats shown below the name. */
  readonly stats?: readonly AgentXProfileStat[];
}

// ── Film Timeline ──

/** A single timestamped marker in a film analysis. */
export interface AgentXFilmMarker {
  /** Timestamp in milliseconds from video start. */
  readonly timeMs: number;
  /** Short human-readable annotation. */
  readonly label: string;
  /** Optional sentiment/category for visual styling. */
  readonly sentiment?: 'positive' | 'negative' | 'neutral';
}

/** Payload for the `film-timeline` card type (video analyst). */
export interface AgentXFilmTimelinePayload {
  /** The video ID this timeline annotates (for parent scrub control). */
  readonly videoId: string;
  /** Ordered list of timestamped markers. */
  readonly markers: readonly AgentXFilmMarker[];
}

// ── Billing Action ──

/** Why Agent X is surfacing a billing action card. */
export type AgentXBillingActionReason =
  | 'insufficient_funds'
  | 'payment_method_required'
  | 'limit_reached';

/** Payload for the `billing-action` card type. */
export interface AgentXBillingActionPayload {
  /** The reason this card was surfaced. */
  readonly reason: AgentXBillingActionReason;
  /** Estimated cost (in cents) that the operation requires. */
  readonly amountNeededCents?: number;
  /** The user's current wallet balance (in cents). */
  readonly currentBalanceCents?: number;
  /** Human-readable explanation of why the operation was paused. */
  readonly description?: string;
}

/**
 * Payload for a generated document (PDF / CSV) download card.
 * Rendered as a rich card with a download button in the Agent X chat.
 */
export interface AgentXDocumentPayload {
  /** Signed download URL (typically Firebase Storage). */
  readonly downloadUrl: string;
  /** Display file name including extension. */
  readonly fileName: string;
  /** MIME type of the generated document. */
  readonly mimeType: string;
  /** Document format discriminator. */
  readonly format: 'pdf' | 'csv';
  /** File size in bytes (used for display). */
  readonly sizeBytes: number;
  /** Number of data rows (for tabular exports). */
  readonly rowCount?: number;
  /** Number of columns (for tabular exports). */
  readonly columnCount?: number;
}

// ============================================
// SSE STREAMING TYPES
// ============================================

/**
 * Payload of the `event: thread` SSE frame.
 * Sent immediately when the backend resolves/creates the thread,
 * before any LLM inference begins — so the client can persist
 * the threadId without waiting for the full response.
 */
export interface AgentXStreamThreadEvent {
  /** Event contract schema version. */
  readonly schemaVersion?: number;
  /** Stable unique event identifier. */
  readonly eventId?: string;
  /** Monotonic stream sequence number when available. */
  readonly seq?: number;
  /** ISO timestamp when backend emitted this event. */
  readonly emittedAt?: string;
  readonly threadId: string;
  /** The backend operation ID for this chat request. Used for explicit cancellation via POST /cancel/:operationId. */
  readonly operationId?: string;
}

/**
 * Payload of the `event: title_updated` SSE frame.
 * Sent after the backend auto-generates a concise conversation title
 * using a cheap/fast model. Only emitted on the first turn of a new thread.
 */
export interface AgentXStreamTitleUpdatedEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly threadId: string;
  readonly title: string;
}

/**
 * Payload of the `event: delta` SSE frame.
 * One frame per token chunk emitted by the LLM.
 */
export interface AgentXStreamDeltaEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly content: string;
}

/**
 * Payload of the `event: thinking` SSE frame.
 * Emitted by extended-thinking models (Claude 3.7+, Gemini 2.5) before the
 * first delta frame. The content is the model's raw reasoning chain.
 */
export interface AgentXStreamThinkingEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  /** One fragment of the model's reasoning text. */
  readonly content: string;
}

/**
 * Payload of the `event: done` SSE frame.
 * Final frame sent after all deltas — contains usage metadata.
 */
export interface AgentXStreamDoneEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly messageKey?: string;
  readonly threadId?: string;
  /** Canonical persisted assistant message ID (Mongo ObjectId). */
  readonly messageId?: string;
  readonly model?: string;
  /** Operation ID associated with this terminal frame. */
  readonly operationId?: string;
  /** Canonical terminal status mirrored from backend lifecycle state. */
  readonly status?: 'complete' | 'error' | 'cancelled';
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly costUsd?: number;
  };
  /** When present, the frontend should auto-open the expanded side panel. */
  readonly autoOpenPanel?: AutoOpenPanelInstruction;
}

/**
 * Payload of the `event: error` SSE frame.
 */
export interface AgentXStreamErrorEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly error: string;
  /** HTTP status code when the error originated from the initial HTTP response. */
  readonly status?: number;
  /** Machine-readable error code (e.g. `WALLET_EMPTY`, `NO_PAYMENT_METHOD`, `BUDGET_EXCEEDED`). */
  readonly code?: string;
}

/**
 * Payload of the `event: step` SSE frame.
 * Sent when the backend begins, updates, or completes a tool execution step.
 */
export interface AgentXStreamStepEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly messageKey?: string;
  /** Unique step identifier. */
  readonly id: string;
  /** Short human-readable label (e.g. "Querying athlete stats…"). */
  readonly label: string;
  /** Which agent emitted the step, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this step, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Current step status — `active` when starting, `success`/`error` when done. */
  readonly status: AgentXToolStepStatus;
  /** Optional semantic icon key for custom rendering. */
  readonly icon?: AgentXToolStepIcon;
  /** Optional expanded detail (e.g. "Found 24 matching athletes"). */
  readonly detail?: string;
}

/**
 * Payload of the `event: card` SSE frame.
 * Sent when the backend wants to embed a rich interactive card in the chat.
 */
export interface AgentXStreamCardEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  /** Which agent generated the card, used for per-agent colorways. */
  readonly agentId: AgentIdentifier;
  /** Card type discriminator. */
  readonly type: AgentXRichCardType;
  /** Card title. */
  readonly title: string;
  /**
   * When true, the frontend should discard any text parts streamed before
   * this card (e.g. when ask_user causes the LLM's streamed question text
   * to be superseded by the interactive card).
   */
  readonly clearText?: boolean;
  /** Type-specific payload (e.g. planner checklist items). */
  readonly payload:
    | AgentXPlannerPayload
    | AgentXDataTablePayload
    | AgentXConfirmationPayload
    | AgentXCitationsPayload
    | AgentXParameterFormPayload
    | AgentXBillingActionPayload
    | AgentXDocumentPayload
    | Record<string, unknown>;
}

/**
 * Payload of the `event: operation` SSE frame.
 * Emitted at key lifecycle transitions so the operations log sidebar
 * can update in real-time without polling.
 */
export interface AgentXStreamOperationEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly messageKey?: string;
  /** The thread ID this operation belongs to. */
  readonly threadId: string;
  /** Current backend-authoritative lifecycle status. */
  readonly status: AgentXOperationLifecycleStatus;
  /** ISO timestamp of the status transition. */
  readonly timestamp: string;
  /** Operation ID associated with the lifecycle update. */
  readonly operationId?: string;
  /** Which agent emitted this lifecycle transition, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this lifecycle transition, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Human-readable operation message for UX commentary. */
  readonly message?: string;
  /** Serialized yield payload when the operation is awaiting user input or approval. */
  readonly yieldState?: AgentYieldState;
}

/**
 * Payload of the `event: progress` SSE frame.
 * Emitted for stage/subphase/metric commentary updates while work is in-flight.
 */
export interface AgentXStreamProgressEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly messageKey?: string;
  /** Event subtype emitted by backend (`progress_stage`, `progress_subphase`, `metric`). */
  readonly type: 'progress_stage' | 'progress_subphase' | 'metric';
  /** Operation ID associated with the progress update. */
  readonly operationId?: string;
  /** Thread ID associated with the progress update. */
  readonly threadId?: string;
  /** Which agent emitted the update, when known. */
  readonly agentId?: AgentIdentifier;
  /** Which execution layer emitted this update, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Human-readable commentary text to display in the UI. */
  readonly message?: string;
  /** ISO timestamp emitted by backend. */
  readonly timestamp?: string;
}

/**
 * Payload of the `event: stream_replaced` SSE frame.
 * Emitted when a newer stream lease takes over the same operation.
 */
export interface AgentXStreamReplacedEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly operationId: string;
  readonly replacedByStreamId: string;
  readonly reason: 'replaced';
  readonly timestamp: string;
}

/**
 * Canonical operation lifecycle statuses emitted by backend SSE streams.
 *
 * This contract is intentionally backend-owned and stable so web/mobile
 * clients can render deterministic lifecycle state without inferring from
 * partial tool-step events.
 */
export type AgentXOperationLifecycleStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'complete'
  | 'failed'
  | 'cancelled';

/**
 * Callbacks consumed by `streamMessage()` in the API factory.
 */
export interface AgentXStreamCallbacks {
  /** Called as soon as the backend resolves the threadId (before LLM starts). */
  onThread?: (event: AgentXStreamThreadEvent) => void;
  /** Called for every token chunk the LLM streams. */
  onDelta: (event: AgentXStreamDeltaEvent) => void;
  /**
   * Called for every extended thinking fragment (Claude 3.7+, Gemini 2.5).
   * Arrives before the first delta. Optional — models that don't support
   * extended thinking will never fire this callback.
   */
  onThinking?: (event: AgentXStreamThinkingEvent) => void;
  /** Called once when the stream completes successfully. */
  onDone: (event: AgentXStreamDoneEvent) => void;
  /** Called if the stream encounters an error. */
  onError: (event: AgentXStreamErrorEvent) => void;
  /** Called when a tool execution step starts, updates, or completes. */
  onStep?: (event: AgentXStreamStepEvent) => void;
  /** Called when the backend embeds a rich interactive card (planner, table, etc.). */
  onCard?: (event: AgentXStreamCardEvent) => void;
  /** Called when the backend auto-generates a concise title for a new conversation thread. */
  onTitleUpdated?: (event: AgentXStreamTitleUpdatedEvent) => void;
  /** Called when the operation lifecycle status changes (in-progress → complete/error/awaiting_input). */
  onOperation?: (event: AgentXStreamOperationEvent) => void;
  /** Called for stage/subphase/metric progress commentary updates. */
  onProgress?: (event: AgentXStreamProgressEvent) => void;
  /** Called immediately when a tool emits an autoOpenPanel instruction (before done). */
  onPanel?: (event: AutoOpenPanelInstruction) => void;
  /** Called when a tool produces a media artifact (image/video URL). */
  onMedia?: (event: AgentXStreamMediaEvent) => void;
  /** Called when this stream is explicitly replaced by a newer stream lease. */
  onStreamReplaced?: (event: AgentXStreamReplacedEvent) => void;
  /**
   * Called when the backend has received attachment stubs and is waiting for the
   * frontend to finish uploading. The handler should complete the upload and then
   * POST resolved attachments to `POST /agent-x/chat/pending-attachments/:operationId`.
   * May return a Promise — the SSE stream continues regardless (fire-and-forget).
   */
  onWaitingForAttachments?: (event: AgentXStreamWaitingForAttachmentsEvent) => void | Promise<void>;
}

/**
 * Emitted by the backend when it has received attachment stubs and is waiting
 * for the frontend to finish uploading and resolve via
 * `POST /agent-x/chat/pending-attachments/:operationId`.
 */
export interface AgentXStreamWaitingForAttachmentsEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  /** The operation ID to use in the resolution POST body and URL parameter. */
  readonly operationId: string;
  /** IDs of the stubs that need to be resolved. */
  readonly attachmentIds: readonly string[];
  /** How long the backend will wait before timing out (milliseconds). */
  readonly timeoutMs: number;
  /** Thread ID if already resolved (may be undefined for brand-new threads). */
  readonly threadId?: string;
}

/**
 * Emitted when a tool produces a media artifact (e.g. generated graphic, video).
 */
export interface AgentXStreamMediaEvent {
  readonly schemaVersion?: number;
  readonly eventId?: string;
  readonly seq?: number;
  readonly emittedAt?: string;
  readonly type: 'image' | 'video';
  readonly url: string;
  readonly mimeType?: string;
}

/**
 * Error codes for Agent X operations.
 */
export type AgentXErrorCode =
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LONG'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Agent X service configuration.
 */
export interface AgentXConfig {
  /** Maximum messages to keep in history */
  readonly maxHistoryLength: number;
  /** Maximum input length in characters */
  readonly maxInputLength: number;
  /** Request timeout in milliseconds */
  readonly timeoutMs: number;
  /** Whether to enable typing animation */
  readonly enableTypingAnimation: boolean;
  /** Animated welcome titles */
  readonly welcomeTitles: readonly string[];
  /** Title rotation interval in milliseconds */
  readonly titleRotationMs: number;
}

/**
 * Agent X state snapshot (for persistence/hydration).
 */
export interface AgentXState {
  /** Current messages */
  readonly messages: readonly AgentXMessage[];
  /** Currently selected mode */
  readonly selectedMode: AgentXMode;
  /** Selected quick task (if any) */
  readonly selectedTask: AgentXQuickTask | null;
  /** Current input value */
  readonly inputValue: string;
  /** Whether currently loading */
  readonly isLoading: boolean;
}

// ============================================
// SHELL CONTENT TYPES (Portable)
// ============================================

/** A contextual action chip for quick workflows. */
export interface ShellActionChip {
  readonly id: string;
  readonly label: string;
  readonly subLabel?: string;
  /** Exact visible prompt text the UI should send when this chip is tapped. */
  readonly promptText?: string;
  readonly icon: string;
}

/** A group of related quick commands under a category. */
export interface ShellCommandCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** Short intro shown as the coordinator's opening message. */
  readonly description: string;
  readonly commands: readonly ShellActionChip[];
  /** Repeatable tasks the user can schedule (daily, weekly, etc.). */
  readonly scheduledActions?: readonly ShellActionChip[];
  /** Weekly personalized actions generated from the user's current context. */
  readonly suggestedActions?: readonly ShellActionChip[];
}

/** Daily briefing insight from Agent X. */
export interface ShellBriefingInsight {
  readonly id: string;
  readonly text: string;
  readonly icon: string;
  readonly type: 'info' | 'warning' | 'success';
}

/** A goal tag linking a playbook task to a user objective. */
export interface ShellGoalTag {
  readonly id: string;
  readonly label: string;
}

/** Coordinator that suggested a playbook task. */
export interface ShellPlaybookCoordinator {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

/** A weekly timeline item generated by Agent X. */
export interface ShellWeeklyPlaybookItem {
  readonly id: string;
  readonly weekLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly why: string;
  readonly details: string;
  readonly actionLabel: string;
  readonly status: 'pending' | 'in-progress' | 'complete' | 'snoozed' | 'problem';
  readonly goal?: ShellGoalTag;
  readonly coordinator?: ShellPlaybookCoordinator;
}

/** Resolved shell content for a given user role. */
export interface ShellContentForRole {
  readonly coordinators: readonly ShellCommandCategory[];
}

// ============================================
// DASHBOARD API TYPES
// ============================================

/** A user-set goal that drives playbook generation. */
export interface AgentDashboardGoal {
  readonly id: string;
  readonly text: string;
  readonly category: string;
  readonly icon?: string;
  readonly createdAt: PortableTimestamp;
  readonly completedAt?: PortableTimestamp;
  readonly isCompleted?: boolean;
}

/**
 * A completed goal archived to `Users/{uid}/goal_history/{goalId}`.
 * Written at completion time; never mutated after creation.
 */
export interface CompletedGoalRecord {
  readonly id: string;
  readonly goalId: string;
  readonly text: string;
  readonly category: string;
  readonly icon?: string;
  /** Timestamp when the goal was originally set */
  readonly createdAt: PortableTimestamp;
  /** Timestamp when the user marked the goal complete */
  readonly completedAt: PortableTimestamp;
  /** User role at time of completion (athlete | coach | director) */
  readonly role: string;
  /** Whole-day count from createdAt → completedAt */
  readonly daysToComplete: number;
}

/** Request body for completing an active goal. */
export interface AgentCompleteGoalRequest {
  readonly goalId: string;
  readonly notes?: string;
}

/** Response from GET /goal-history */
export interface AgentGoalHistoryResponse {
  readonly success: boolean;
  readonly data?: {
    readonly history: readonly CompletedGoalRecord[];
    readonly totalCompleted: number;
  };
  readonly error?: string;
}

/** Response from POST /goals/:goalId/complete */
export interface AgentCompleteGoalResponse {
  readonly success: boolean;
  readonly data?: {
    readonly completedGoal: CompletedGoalRecord;
  };
  readonly error?: string;
}

/** Dashboard response aggregating all Agent X shell data. */
export interface AgentDashboardResponse {
  readonly success: boolean;
  readonly data?: AgentDashboardData;
  readonly error?: string;
}

/** Full dashboard payload returned by the backend. */
export interface AgentDashboardData {
  readonly briefing: AgentDashboardBriefing;
  readonly playbook: AgentDashboardPlaybook;
  readonly coordinators: readonly ShellCommandCategory[];
}

/** AI-generated daily briefing. */
export interface AgentDashboardBriefing {
  readonly previewText: string;
  readonly insights: readonly ShellBriefingInsight[];
  readonly generatedAt: string;
}

/** Goal-driven weekly playbook. */
export interface AgentDashboardPlaybook {
  readonly items: readonly ShellWeeklyPlaybookItem[];
  readonly goals: readonly AgentDashboardGoal[];
  readonly generatedAt: string | null;
  readonly canRegenerate: boolean;
}

/** Request to set/update user goals (max 3). */
export interface AgentSetGoalsRequest {
  readonly goals: readonly AgentDashboardGoal[];
}

/** Request to regenerate the weekly playbook. */
export interface AgentRegeneratePlaybookRequest {
  readonly force?: boolean;
}

/** Response from playbook generation. */
export interface AgentPlaybookResponse {
  readonly success: boolean;
  readonly data?: AgentDashboardPlaybook;
  readonly error?: string;
}

// ============================================
// WEEKLY RECAP TYPES
// ============================================

/**
 * A persisted weekly recap document stored in:
 * `Users/{uid}/agent_weekly_recaps/{recapId}`
 *
 * Capped at 52 documents (1 year of history).
 */
export interface AgentWeeklyRecap {
  readonly id: string;
  /** Sequential recap number (1-based, ever-increasing). */
  readonly recapNumber: number;
  /** ISO week label, e.g. "Week 28, 2025". */
  readonly weekLabel: string;
  /** User-facing subject line generated by Agent X. */
  readonly subject: string;
  /** Opening paragraph written by Agent X. */
  readonly introParagraph: string;
  /** Up to 5 completed actions this week. */
  readonly completedActions: readonly string[];
  /** Up to 5 key results / highlights. */
  readonly resultsHighlights: readonly string[];
  /** Up to 5 recommended next steps. */
  readonly nextSteps: readonly string[];
  /** CTA button label. */
  readonly ctaText: string;
  /** CTA destination URL (absolute). */
  readonly ctaUrl: string;
  /** Whether the email was actually sent (false if user opted out). */
  readonly emailSent: boolean;
  /** Job ID that produced this recap. */
  readonly jobId?: string;
  readonly createdAt: PortableTimestamp;
}

/** Display status for an operation log entry (mapped from AgentOperationStatus). */
export type OperationLogStatus =
  | 'complete'
  | 'error'
  | 'cancelled'
  | 'in-progress'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval';

/** Category of an operation for icon/color grouping. */
export type OperationLogCategory =
  | 'outreach'
  | 'content'
  | 'film'
  | 'recruiting'
  | 'analytics'
  | 'profile'
  | 'system';

/** A single entry in the operations activity log. */
export interface OperationLogEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: string;
  readonly status: OperationLogStatus;
  readonly category: OperationLogCategory;
  /** ISO-8601 timestamp for display ordering and day-grouping. */
  readonly timestamp: string;
  /** Human-readable duration string (e.g. `"2m 15s"`). Only present for completed operations. */
  readonly duration?: string;
  /** MongoDB thread ID linking to the Agent X conversation for this operation. */
  readonly threadId?: string;
  /** Firestore AgentJobs document ID — used for live onSnapshot event streaming. */
  readonly operationId?: string;
  /**
   * How this operation was initiated.
   * - `'user'` — direct user prompt in chat UI
   * - `'system_cron'` — scheduled task (daily briefing, weekly recap)
   * - `'database_event'` — Firestore/MongoDB change stream trigger
   * - `'webhook'` — external webhook (Stripe, MaxPreps, etc.)
   * - `'agent_chain'` — another agent spawned this job
   */
  readonly origin?: AgentJobOrigin;
  /**
   * `true` only for recurring time-based runs, such as cron-triggered operations.
   * One-off backend-triggered jobs like welcome-graphic generation should remain `false`.
   */
  readonly isScheduled?: boolean;
  /**
   * Supplementary context for this entry. Shape varies by source:
   *
   * Firestore job entries:
   * ```ts
   * { agent?: string | null }
   * ```
   *
   * MongoDB thread entries:
   * ```ts
   * { source: 'thread'; messageCount: number; threadCategory: string | null }
   * ```
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** API response for the operations log endpoint. */
export interface OperationsLogResponse {
  readonly success: boolean;
  readonly data?: readonly OperationLogEntry[];
  readonly error?: string;
}
