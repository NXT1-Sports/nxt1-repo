/**
 * @fileoverview User Models Barrel Export
 * @module @nxt1/core/models/user
 *
 * Re-exports all user model types from modular files.
 *
 * Original file (~1920 lines) has been split into 5 modular files:
 *   - user-base.model.ts        — Base types (Location, SocialLink, Verification, Awards, etc.)
 *   - user-sport.model.ts       — Sport profiles and sport-specific data (metrics, stats, recruiting)
 *   - user-role-data.model.ts   — Role-specific data interfaces (Athlete, Coach, Director)
 *   - user-collections.model.ts — Firestore collection types (PostDoc, VideoDoc, etc.)
 *   - user.model.ts             — Main User interface + preferences + counters + utility functions
 *
 * @author NXT1 Engineering
 * @version 3.0.0 - Modular Architecture
 */

// Re-export base types (Location, SocialLink, ConnectedSource, TeamHistory, UserAward, etc.)
export * from './user-base.model';

// Re-export sport types (SportProfile, VerifiedMetric, VerifiedStat, ScheduleEvent, RecruitingActivity, etc.)
export * from './user-sport.model';

// Re-export role data types (AthleteData, CoachData, DirectorData)
export * from './user-role-data.model';

// Re-export collection types (PostDoc, VideoDoc, PlayerStatDoc, GameStatDoc, RankingEntryDoc, etc.)
export * from './user-collections.model';

// Re-export main User interface + preferences + counters + utilities
export * from './user.model';

// Re-export user display context (centralized mapper for menus/sidebars/headers)
export * from './user-display-context';
