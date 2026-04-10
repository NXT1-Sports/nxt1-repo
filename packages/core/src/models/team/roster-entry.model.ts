/**
 * @fileoverview Roster Entry Model
 * @module @nxt1/core/models
 *
 * RosterEntry - The Junction Table
 * This is the CRITICAL missing piece that connects Users to Teams.
 *
 * Why this exists:
 * - Decouples Identity (User) from Affiliation (Team membership)
 * - Supports many-to-many: One user can be on multiple teams
 * - Team-specific data (jersey #, position, stats) live here, not on User
 * - Scalable: No array limits, efficient queries
 *
 * Architecture:
 * - Collection: RosterEntries
 * - Each doc represents ONE user's membership in ONE team
 * - Query "my teams": RosterEntries where userId == me
 * - Query "team roster": RosterEntries where teamId == thisTeam
 *
 * @author NXT1 Engineering
 * @version 3.0.0
 */

// ============================================
// ROSTER ENTRY STATUS
// ============================================

export enum RosterEntryStatus {
  /** User has joined, awaiting approval */
  PENDING = 'pending',
  /** Active member */
  ACTIVE = 'active',
  /** Temporarily inactive (injured, suspended) */
  INACTIVE = 'inactive',
  /** No longer on team */
  REMOVED = 'removed',
  /** User left voluntarily */
  LEFT = 'left',
}

// ============================================
// ROSTER ENTRY ROLE
// ============================================

export enum RosterRole {
  /** Team owner/creator */
  OWNER = 'owner',
  /** Head coach */
  HEAD_COACH = 'head-coach',
  /** Assistant coach */
  ASSISTANT_COACH = 'assistant-coach',
  /** Team staff/manager */
  STAFF = 'staff',
  /** Varsity starter */
  STARTER = 'starter',
  /** Varsity athlete */
  ATHLETE = 'athlete',
  /** Junior Varsity */
  JV = 'jv',
  /** Bench player */
  BENCH = 'bench',
  /** Media/photographer */
  MEDIA = 'media',
  /** Parent/guardian */
  PARENT = 'parent',
}

// ============================================
// ROSTER ENTRY (Main Interface)
// ============================================

export interface RosterEntry {
  /** Firestore document ID */
  id?: string;

  // ============================================
  // CORE RELATIONSHIP
  // ============================================

  /** User ID - who is on the team */
  userId: string;

  /** Team ID - which team they're on */
  teamId: string;

  /** Organization ID (denormalized for quick filtering) */
  organizationId: string;

  // ============================================
  // ROLE & STATUS
  // ============================================

  /** Role on this specific team */
  role: RosterRole;

  /** Membership status */
  status: RosterEntryStatus;

  // ============================================
  // TEAM-SPECIFIC DATA
  // This is WHY we need RosterEntry - same user can have different
  // jersey numbers, positions on different teams
  // ============================================

  /** Jersey number for THIS team */
  jerseyNumber?: string | number;

  /** Positions played for THIS team (e.g., ["QB", "Safety"]) */
  positions?: string[];

  /** Primary position for THIS team */
  primaryPosition?: string;

  // ============================================
  // SEASON INFO
  // ============================================

  /** Season this entry is for (allows historical tracking) */
  season?: string;

  /** Class year when they joined this team */
  classOfWhenJoined?: number;

  // ============================================
  // STATS (team-specific)
  // ============================================

  /** Stats for this user on this team (aggregated) */
  stats?: {
    gamesPlayed?: number;
    gamesStarted?: number;
    /**
     * Sport-specific stats.
     * For detailed game-by-game stats, use sub-collection:
     * RosterEntries/{entryId}/gameStats/{gameId}
     */
    [statKey: string]: unknown;
  };

  // ============================================
  // PERFORMANCE
  // ============================================

  /** Overall rating on this team (0-100) */
  rating?: number;

  /** Coach notes/evaluation (private) */
  coachNotes?: string;

  // ============================================
  // METADATA
  // ============================================

  /** When user joined this team */
  joinedAt: Date | string;

  /** When membership was last updated */
  updatedAt?: Date | string;

  /** When user left/was removed (if applicable) */
  leftAt?: Date | string;

  /** Who invited/added this user */
  invitedBy?: string;

  /** Who approved this membership (if required) */
  approvedBy?: string;

  /** When membership was approved */
  approvedAt?: Date | string;

  // ============================================
  // CACHED USER DATA (for display without extra query)
  // Denormalized for performance - updated when User changes
  // ============================================

  /** Cached first name */
  firstName?: string;

  /** Cached last name */
  lastName?: string;

  /** Cached profile image */
  profileImg?: string;

  /** Cached email */
  email?: string;

  /** Cached phone */
  phoneNumber?: string;

  /** Cached class of year */
  classOf?: number;

  /** Cached GPA */
  gpa?: string | number;

  /** Cached height */
  height?: string;

  /** Cached weight */
  weight?: string;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateRosterEntryInput {
  userId: string;
  teamId: string;
  organizationId: string;
  role: RosterRole;
  status?: RosterEntryStatus;
  jerseyNumber?: string | number;
  positions?: string[];
  primaryPosition?: string;
  season?: string;
  invitedBy?: string;
  // Cached user data
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  profileImg?: string;
  classOf?: number;
  gpa?: string | number;
  height?: string;
  weight?: string;
}

export interface UpdateRosterEntryInput {
  role?: RosterRole;
  status?: RosterEntryStatus;
  jerseyNumber?: string | number;
  positions?: string[];
  primaryPosition?: string;
  rating?: number;
  coachNotes?: string;
  stats?: RosterEntry['stats'];
}

export interface ApproveRosterEntryInput {
  entryId: string;
  approvedBy: string;
}

// ============================================
// QUERY TYPES
// ============================================

export interface GetUserTeamsQuery {
  userId: string;
  status?: RosterEntryStatus[];
  includeInactive?: boolean;
}

export interface GetTeamRosterQuery {
  teamId: string;
  role?: RosterRole[];
  status?: RosterEntryStatus[];
  season?: string;
}

export interface GetOrganizationMembersQuery {
  organizationId: string;
  role?: RosterRole[];
  status?: RosterEntryStatus[];
}

// ============================================
// RESPONSE TYPES
// ============================================

/** RosterEntry with populated Team data */
export interface RosterEntryWithTeam extends RosterEntry {
  team?: {
    id: string;
    teamName: string;
    teamLogoImg?: string;
    sportName: string;
    teamType: string;
    season?: string;
  };
}

/** RosterEntry with populated User data */
export interface RosterEntryWithUser extends RosterEntry {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    profileImg?: string;
    email: string;
    role?: string;
  };
}
