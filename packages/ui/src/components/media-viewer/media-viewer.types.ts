/**
 * @fileoverview MediaViewer types — shared across service, component, and consumers.
 * @module @nxt1/ui/components/media-viewer
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// ─── Media Item ───────────────────────────────────────────

/** A single media or document entry in the viewer. */
export interface MediaViewerItem {
  /** Absolute or relative URL of the media asset. */
  readonly url: string;

  /** Optional Firebase Storage path for assets that can be re-signed. */
  readonly storagePath?: string;

  /** Media type — determines which element is rendered. */
  readonly type: 'image' | 'video' | 'doc';

  /** Accessibility alt-text for images (required for a11y). */
  readonly alt?: string;

  /** Optional caption displayed below the media. */
  readonly caption?: string;

  /** Optional poster image for video thumbnails. */
  readonly poster?: string;

  /** File name — used for doc preview display and download attribute. */
  readonly name?: string;

  /** File size in bytes — displayed as metadata on doc slides. */
  readonly size?: number;

  /** Optional structured breakdown metadata shown in specialized viewer variants. */
  readonly breakdown?: MediaViewerBreakdown;
}

/** Generic section in a structured breakdown panel. */
export interface MediaViewerBreakdownSection {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
  readonly chips?: readonly string[];
}

/** Structured breakdown payload rendered by the playbook viewer variant. */
export interface MediaViewerBreakdown {
  readonly title?: string;
  readonly subtitle?: string;
  readonly metaChips?: readonly string[];
  readonly sections?: readonly MediaViewerBreakdownSection[];
}

export interface MediaViewerBreakdownEditorOption {
  readonly value: string;
  readonly label: string;
}

export interface MediaViewerBreakdownEditorField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly type?: 'text' | 'url' | 'textarea' | 'select' | 'file';
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly rows?: number;
  readonly options?: readonly MediaViewerBreakdownEditorOption[];
}

export interface MediaViewerDiagramToolAction {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly icon?:
    | 'circle-player'
    | 'triangle-player'
    | 'square-player'
    | 'route'
    | 'block'
    | 'motion'
    | 'text'
    | 'zone'
    | 'background'
    | 'shield'
    | 'undo'
    | 'redo'
    | 'discard';
  readonly variant?: 'default' | 'primary' | 'secondary';
  readonly disabled?: () => boolean;
  readonly run: () => void | Promise<void>;
}

export interface MediaViewerDiagramToolsConfig {
  readonly title?: string;
  readonly description?: string;
  readonly unavailableMessage?: string;
  readonly getPreviewUrl?: () => string | null;
  readonly getPreviewSvg?: () => string | null;
  readonly getStatus?: () => string | null;
  readonly onSvgPointerDown?: (event: PointerEvent, target: MediaViewerDiagramSvgTarget) => void;
  readonly onSvgPointerMove?: (event: PointerEvent) => void;
  readonly onSvgPointerUp?: (event: PointerEvent) => void;
  readonly onSvgPointerCancel?: (event: PointerEvent) => void;
  readonly onSvgPointerLeave?: (event: PointerEvent) => void;
  readonly onSvgClick?: (event: MouseEvent, target: MediaViewerDiagramSvgTarget) => void;
  readonly onSvgDoubleClick?: (event: MouseEvent, target: MediaViewerDiagramSvgTarget) => void;
  readonly actions: readonly MediaViewerDiagramToolAction[];
}

export interface MediaViewerDiagramSvgTarget {
  readonly type: 'canvas' | 'player' | 'route' | 'zone';
  readonly id?: string;
}

export interface MediaViewerBreakdownEditorConfig {
  readonly title?: string;
  readonly editLabel?: string;
  readonly saveLabel?: string;
  readonly cancelLabel?: string;
  readonly savingLabel?: string;
  readonly startInEditMode?: boolean;
  readonly fields: readonly MediaViewerBreakdownEditorField[];
  readonly diagramTools?: MediaViewerDiagramToolsConfig;
  readonly onSave: (
    values: Record<string, string>,
    files: Record<string, File | null>
  ) => void | Promise<void>;
}

// ─── Configuration ────────────────────────────────────────

/** Configuration object passed to `NxtMediaViewerService.open()`. */
export interface MediaViewerConfig {
  /** Ordered array of media items to display. Must contain ≥ 1 item. */
  readonly items: readonly MediaViewerItem[];

  /** Zero-based index of the item to show first. Defaults to `0`. */
  readonly initialIndex?: number;

  /** Whether to show the share button in the top bar. Defaults to `true`. */
  readonly showShare?: boolean;

  /** Whether to show the counter indicator (e.g. "2 / 5"). Defaults to `true` when > 1 item. */
  readonly showCounter?: boolean;

  /** Analytics source identifier (e.g. 'feed', 'profile', 'chat'). */
  readonly source?: string;

  /** Optional label for a contextual action button. */
  readonly primaryActionLabel?: string;

  /** Accessible label for the contextual action button. */
  readonly primaryActionAriaLabel?: string;

  /** Optional contextual action for the active item. */
  readonly primaryAction?: (item: MediaViewerItem) => void | Promise<void>;

  /** Optional busy-state label for the contextual action button. */
  readonly primaryActionBusyLabel?: string;

  /**
   * Presentation mode override.
   * - `auto` (default): adaptive behavior (desktop overlay, mobile sheet)
   * - `overlay`: always use web-style overlay modal
   * - `bottom-sheet`: always use Ionic bottom sheet
   */
  readonly presentation?: 'auto' | 'overlay' | 'bottom-sheet';

  /** Specialized layout variant for extending the shared modal. */
  readonly variant?: 'default' | 'playbook-breakdown';

  /** Optional editor rendered inside the playbook breakdown variant. */
  readonly playbookEditor?: MediaViewerBreakdownEditorConfig;
}

// ─── Result ───────────────────────────────────────────────

/** Result returned when the media viewer is dismissed. */
export interface MediaViewerResult {
  /** How the modal was dismissed. */
  readonly role: 'dismiss' | 'share';

  /** The index of the item visible when the viewer was closed. */
  readonly lastIndex: number;

  /** The item that was visible when the viewer was closed. */
  readonly item: MediaViewerItem;
}
