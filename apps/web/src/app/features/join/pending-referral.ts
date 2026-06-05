/** Shape of referral data persisted to sessionStorage. */
export interface PendingReferral {
  /** Referral code (e.g. NXT-06476B) */
  readonly code: string;
  /** Firebase UID of the inviter */
  readonly inviterUid: string;
  /** Invite type */
  readonly type: string;
  /** Optional team Firestore document ID */
  readonly teamId?: string;
  /** Team code (short alphanumeric) — passed to /invite/accept to join roster */
  readonly teamCode?: string;
  /** Human-readable team name — for display only */
  readonly teamName?: string;
  /** Sport name (e.g., "Football") from team document */
  readonly sport?: string;
  /** Team type (e.g., "High School") */
  readonly teamType?: string;
  /** Role chosen by the invitee on the landing page */
  readonly role?: string;
  /** Timestamp when the link was opened */
  readonly timestamp: number;
}

/** SessionStorage key for pending referral data. */
export const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';
