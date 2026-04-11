/**
 * @fileoverview Organization Extraction Zod Schema
 * @module @nxt1/backend/modules/agent/schemas
 *
 * Strict validation schema for the Organization Specialist sub-agent output.
 * Covers: school/club name, mascot, branding colors, location, program type,
 * conference, division, and website.
 *
 * Organization data is written to the Organizations collection via
 * deterministic ID hashing to prevent race-condition duplicates.
 */

import { z } from 'zod';

// ─── Hex Color ──────────────────────────────────────────────────────────────

const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color, e.g. "#1A2B3C"')
  .describe('6-digit hex color code');

// ─── Location ───────────────────────────────────────────────────────────────

const LocationSchema = z.object({
  city: z.string().min(1).describe('City name'),
  state: z
    .string()
    .min(2)
    .max(2)
    .toUpperCase()
    .describe('US state abbreviation (2 chars, e.g. "TX")'),
  country: z.string().default('US').describe('ISO 3166-1 alpha-2 country code, defaults to US'),
});

// ─── Branding ───────────────────────────────────────────────────────────────

const BrandingSchema = z.object({
  mascot: z.string().optional().describe('School/club mascot, e.g. "Eagles"'),
  logoUrl: z.string().url().optional().describe('URL to organization logo'),
  primaryColor: HexColorSchema.optional().describe('Primary brand color'),
  secondaryColor: HexColorSchema.optional().describe('Secondary brand color'),
});

// ─── Program Type ───────────────────────────────────────────────────────────

const ProgramTypeSchema = z
  .enum([
    'high-school',
    'college',
    'club',
    'travel',
    'aau',
    'prep',
    'academy',
    'juco',
    'naia',
    'unknown',
  ])
  .default('unknown')
  .describe('Type of athletic program');

// ─── Team Reference ─────────────────────────────────────────────────────────

const TeamRefSchema = z.object({
  teamName: z.string().min(1).describe('Official team name'),
  teamType: z
    .enum(['varsity', 'jv', 'freshman', 'club', 'travel', 'aau', 'academy'])
    .optional()
    .describe('Level of play'),
  conference: z.string().optional().describe('Conference or league name'),
  division: z.string().optional().describe('Division or classification'),
});

// ─── Root Schema ────────────────────────────────────────────────────────────

export const OrgExtractionSchema = z.object({
  organizationName: z
    .string()
    .min(1)
    .describe('Official name of the school, club, or organization'),
  programType: ProgramTypeSchema,
  location: LocationSchema.optional().describe('City/state of the organization'),
  branding: BrandingSchema.optional().describe('Mascot, logo, and colors'),
  website: z.string().url().optional().describe('Organization website URL'),
  team: TeamRefSchema.optional().describe('Team within the organization'),
});

export type OrgExtraction = z.infer<typeof OrgExtractionSchema>;

// ─── Deterministic Org ID ───────────────────────────────────────────────────

/**
 * Builds a deterministic organization key for deduplication.
 * Uses normalized name + state to prevent duplicate orgs from concurrent scrapes.
 *
 * @example
 * buildOrgKey("Allen High School", "TX") => "allen_high_school_tx"
 * buildOrgKey("Allen High School", "TX") => "allen_high_school_tx" // same!
 */
export function buildOrgKey(name: string, state?: string): string {
  if (!name || !name.trim()) return 'unknown_org';

  const normalized = name
    .normalize('NFD') // Decompose diacritics (e.g. é → e + ́)
    .replace(/[\u0300-\u036f]/g, '') // Strip combining marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_');

  const key = state ? `${normalized}_${state.toLowerCase().trim()}` : normalized;

  // Cap at 128 chars to keep Firestore document IDs manageable
  return key.slice(0, 128) || 'unknown_org';
}
