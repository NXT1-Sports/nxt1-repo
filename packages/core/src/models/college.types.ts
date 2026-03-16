/**
 * @fileoverview College Domain Types
 * @module @nxt1/core/models/college
 * @version 1.0.0
 *
 * Shared type definitions for College entities across web, mobile, and backend.
 * 100% portable - no framework dependencies.
 */

/**
 * Sport-specific information for a college
 */
export interface CollegeSportInfo {
  conference?: string;
  division?: string;
  questionnaire?: string;
  sportLandingUrl?: string;
  twitter?: string;
  conferenceId?: string;
  name?: string;
  camp?: string;
}

/**
 * Complete college entity
 */
export interface College {
  _id: string;
  name: string;
  'IPEDS/NCES_ID': string;
  city: string;
  state: string;
  sportInfo: Record<string, CollegeSportInfo>;
  logoUrl?: string;
  acceptanceRate?: number;
  averageGPA?: number;
  compositeACT?: string;
  female?: string;
  male?: string;
  hbcu?: boolean;
  landingUrl?: string;
  majorsOffered?: string;
  mathSAT?: number;
  readingSAT?: number;
  public?: boolean;
  religious_affiliation?: string;
  sport?: string[];
  totalCost?: number;
  undergradsNo?: string;
  women_only?: boolean;
  community_college?: boolean;
  contacts?: string[]; // Contact IDs
}

/**
 * Lightweight college projection for list views
 */
export interface CollegeListItem {
  _id: string;
  name: string;
  'IPEDS/NCES_ID': string;
  city: string;
  state: string;
  sportInfo: Record<string, CollegeSportInfo>;
  logoUrl?: string;
}

/**
 * College filter criteria
 */
export interface CollegeFilterCriteria {
  sport: string;
  state?: string;
  division?: string | string[];
  conference?: string;
  name?: string | string[];
  text?: string;
}

/**
 * Paginated college list response
 */
export interface CollegeListResponse {
  colleges: CollegeListItem[];
  total?: number;
  page?: number;
  limit?: number;
}

/**
 * Conference with sport information
 */
export interface ConferenceInfo {
  sports: string[];
  conference: string;
}

/**
 * Division with associated colleges
 */
export interface DivisionWithColleges {
  division: string;
  colleges: Array<{
    _id: string;
    name: string;
  }>;
}
