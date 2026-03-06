/**
 * @fileoverview User Model - Re-exports from modular files
 * @module @nxt1/core/models
 *
 * This file maintains backward compatibility by re-exporting all types
 * from the new modular user model structure.
 *
 * Original file (~1920 lines) has been split into 5 modular files:
 *   - user-base.model.ts        — Base types (Location, SocialLink, Verification, Awards, etc.)
 *   - user-sport.model.ts       — Sport profiles and sport-specific data (metrics, stats, recruiting)
 *   - user-role-data.model.ts   — Role-specific data interfaces (Athlete, Coach, Recruiter, etc.)
 *   - user-collections.model.ts — Firestore collection types (PostDoc, VideoDoc, etc.)
 *   - user.model.ts             — Main User interface + preferences + counters + utility functions
 *
 * All existing imports from '@nxt1/core/models' will continue to work unchanged.
 *
 * @author NXT1 Engineering
 * @version 2.0.0 - Modular Architecture
 */

// ============================================
// RE-EXPORT ALL TYPES FROM MODULAR FILES
// ============================================

// Re-export base types (Location, SocialLink, ConnectedSource, TeamHistory, UserAward, etc.)
export * from './user/user-base.model';

// Re-export sport types (SportProfile, VerifiedMetric, VerifiedStat, ScheduleEvent, RecruitingActivity, etc.)
export * from './user/user-sport.model';

// Re-export role data types (AthleteData, CoachData, RecruiterData, DirectorData, ParentData, etc.)
export * from './user/user-role-data.model';

// Re-export collection types (PostDoc, VideoDoc, PlayerStatDoc, GameStatDoc, RankingEntryDoc, etc.)
export * from './user/user-collections.model';

// Re-export main User interface + preferences + counters + utilities
export * from './user/user.model';
