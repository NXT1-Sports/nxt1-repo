/**
 * @fileoverview Context Builder — Profile Hydration Pipeline
 * @module @nxt1/backend/modules/agent/memory
 *
 * The ContextBuilder is the FIRST thing that runs before any agent processes
 * a request. It fetches the user's complete profile from MongoDB/Firestore
 * and compresses it into a token-efficient AgentUserContext object.
 *
 * This context is injected into AgentSessionContext so every sub-agent
 * naturally "knows" who the user is without the user having to explain.
 *
 * Architecture:
 * ┌──────────────────┐
 * │ User sends prompt │
 * └────────┬─────────┘
 *          ▼
 * ┌──────────────────────────────────────────────────────┐
 * │ Context Builder (THIS FILE)                          │
 * │  1. Fetch user profile from MongoDB                  │
 * │  2. Fetch user stats & athletic data                 │
 * │  3. Fetch connected accounts (Gmail, Twitter, etc.)  │
 * │  4. Fetch recruiting targets & commitment status     │
 * │  5. Fetch subscription tier & usage limits           │
 * │  6. Compress into AgentUserContext                   │
 * └────────┬─────────────────────────────────────────────┘
 *          ▼
 * ┌──────────────────┐
 * │ Planner Agent     │  ← Now knows everything about the user
 * └──────────────────┘
 *
 * Why this exists:
 * Without context, if a user says "email my top schools," the AI has no idea
 * what sport they play, what schools they're targeting, or even their name.
 * The ContextBuilder eliminates 100% of that ambiguity.
 */

import type { AgentUserContext, AgentConnectedAccount } from '@nxt1/core';

/** Shape returned by the profile fetcher placeholder. */
interface ProfileData {
  readonly role: string;
  readonly displayName: string;
  readonly subscriptionTier: string;
  readonly sport?: string;
  readonly position?: string;
  readonly heightInches?: number;
  readonly weightLbs?: number;
  readonly graduationYear?: number;
  readonly gpa?: number;
  readonly school?: string;
  readonly city?: string;
  readonly state?: string;
  readonly coachProgram?: string;
  readonly coachDivision?: string;
  readonly coachSport?: string;
}

/** Shape returned by the recruiting fetcher placeholder. */
interface RecruitingData {
  readonly targetDivisions?: readonly string[];
  readonly targetColleges?: readonly string[];
  readonly recruitingStatus?: string;
  readonly commitmentStatus?: string;
}

/** Shape returned by the engagement fetcher placeholder. */
interface EngagementData {
  readonly profileCompletionPercent?: number;
  readonly totalProfileViews?: number;
  readonly lastActiveAt?: string;
}

export class ContextBuilder {
  /**
   * Build the full hydrated context for a user.
   * Called once at the start of every operation (both user-initiated and trigger-initiated).
   *
   * @param userId - The Firebase UID of the user.
   * @returns A compressed, token-efficient context object.
   */
  async buildContext(userId: string): Promise<AgentUserContext> {
    // ── Step 1: Fetch core profile ────────────────────────────────────────
    const profile = await this.fetchUserProfile(userId);

    // ── Step 2: Fetch connected accounts ──────────────────────────────────
    const connectedAccounts = await this.fetchConnectedAccounts(userId);

    // ── Step 3: Fetch recruiting context (if athlete) ─────────────────────
    const recruitingData =
      profile.role === 'athlete' ? await this.fetchRecruitingContext(userId) : undefined;

    // ── Step 4: Fetch engagement metrics ──────────────────────────────────
    const engagement = await this.fetchEngagementMetrics(userId);

    // ── Step 5: Assemble the context object ───────────────────────────────
    return {
      userId,
      role: profile.role ?? 'athlete',
      displayName: profile.displayName ?? 'Unknown User',
      subscriptionTier: profile.subscriptionTier ?? 'free',

      // Athletic data
      sport: profile.sport,
      position: profile.position,
      heightInches: profile.heightInches,
      weightLbs: profile.weightLbs,
      graduationYear: profile.graduationYear,
      gpa: profile.gpa,
      school: profile.school,
      city: profile.city,
      state: profile.state,

      // Recruiting
      targetDivisions: recruitingData?.targetDivisions,
      targetColleges: recruitingData?.targetColleges,
      recruitingStatus: recruitingData?.recruitingStatus,
      commitmentStatus: recruitingData?.commitmentStatus,

      // Engagement
      profileCompletionPercent: engagement.profileCompletionPercent,
      totalProfileViews: engagement.totalProfileViews,
      lastActiveAt: engagement.lastActiveAt,

      // Connected accounts
      connectedAccounts,

      // Coach-specific
      coachProgram: profile.coachProgram,
      coachDivision: profile.coachDivision,
      coachSport: profile.coachSport,
    };
  }

  /**
   * Converts the hydrated context into a compressed string for injection
   * into the agent's system prompt. This keeps token usage minimal.
   *
   * Example output:
   * "User: John Doe | Role: Athlete | Sport: Football | Pos: QB | Class: 2027
   *  School: Lincoln HS, Dallas TX | GPA: 3.8 | Height: 6'2" | Weight: 195lb
   *  Targets: D1, D2 | Top Schools: Georgia, Texas, Ohio State
   *  Status: Uncommitted | Tier: Premium | Profile: 85% complete"
   */
  compressToPrompt(context: AgentUserContext): string {
    const lines: string[] = [];

    lines.push(
      `User: ${context.displayName} | Role: ${context.role} | Tier: ${context.subscriptionTier}`
    );

    if (context.sport) {
      const pos = context.position ? ` | Pos: ${context.position}` : '';
      const gradYear = context.graduationYear ? ` | Class: ${context.graduationYear}` : '';
      lines.push(`Sport: ${context.sport}${pos}${gradYear}`);
    }

    if (context.school) {
      const loc = [context.city, context.state].filter(Boolean).join(', ');
      lines.push(`School: ${context.school}${loc ? `, ${loc}` : ''}`);
    }

    if (context.gpa || context.heightInches || context.weightLbs) {
      const parts: string[] = [];
      if (context.gpa) parts.push(`GPA: ${context.gpa}`);
      if (context.heightInches) {
        const ft = Math.floor(context.heightInches / 12);
        const inches = context.heightInches % 12;
        parts.push(`Height: ${ft}'${inches}"`);
      }
      if (context.weightLbs) parts.push(`Weight: ${context.weightLbs}lb`);
      lines.push(parts.join(' | '));
    }

    if (context.targetDivisions?.length || context.targetColleges?.length) {
      const divs = context.targetDivisions?.length
        ? `Targets: ${context.targetDivisions.join(', ')}`
        : '';
      const cols = context.targetColleges?.length
        ? `Top Schools: ${context.targetColleges.slice(0, 5).join(', ')}`
        : '';
      lines.push([divs, cols].filter(Boolean).join(' | '));
    }

    if (context.commitmentStatus) {
      lines.push(`Status: ${context.commitmentStatus}`);
    }

    if (context.connectedAccounts?.length) {
      const active = context.connectedAccounts.filter((a) => a.isTokenValid).map((a) => a.provider);
      if (active.length) lines.push(`Connected: ${active.join(', ')}`);
    }

    if (context.profileCompletionPercent !== undefined) {
      lines.push(
        `Profile: ${context.profileCompletionPercent}% complete | Views: ${context.totalProfileViews ?? 0}`
      );
    }

    return lines.join('\n');
  }

  // ─── Internal Data Fetchers (placeholders for MongoDB/Firestore) ────────

  private async fetchUserProfile(_userId: string): Promise<ProfileData> {
    // TODO: Connect to your MongoDB User model or Firestore users collection
    // const user = await UserModel.findById(userId).lean();
    return {
      role: 'athlete',
      displayName: 'Unknown User',
      subscriptionTier: 'free',
    };
  }

  private async fetchConnectedAccounts(_userId: string): Promise<readonly AgentConnectedAccount[]> {
    // TODO: Query the user's connected OAuth tokens from your database
    // Check if gmail, twitter, hudl, etc. tokens exist and are valid
    return [];
  }

  private async fetchRecruitingContext(_userId: string): Promise<RecruitingData> {
    // TODO: Fetch from your recruiting/prospect collections
    return {
      targetDivisions: [],
      targetColleges: [],
      recruitingStatus: 'active',
      commitmentStatus: 'uncommitted',
    };
  }

  private async fetchEngagementMetrics(_userId: string): Promise<EngagementData> {
    // TODO: Aggregate from analytics/profile views collections
    return {
      profileCompletionPercent: 0,
      totalProfileViews: 0,
      lastActiveAt: new Date().toISOString(),
    };
  }
}
