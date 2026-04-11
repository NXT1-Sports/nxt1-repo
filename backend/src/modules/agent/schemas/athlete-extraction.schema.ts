/**
 * @fileoverview Athlete Extraction Zod Schema
 * @module @nxt1/backend/modules/agent/schemas
 *
 * Strict validation schema for the Athlete Specialist sub-agent output.
 * Only allows: stats, combine metrics, graduation year, height, weight,
 * positions, jersey number, and side.
 *
 * The Boss (DataCoordinator) validates every sub-agent response against
 * its schema before routing to write tools. Invalid payloads are rejected
 * with structured error messages.
 */

import { z } from 'zod';

// ─── Combine Metrics ────────────────────────────────────────────────────────

const CombineMetricSchema = z.object({
  field: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Metric field must be snake_case')
    .describe('snake_case metric key, e.g. "forty_yard_dash", "bench_press"'),
  label: z.string().min(1).describe('Human-readable label, e.g. "40-Yard Dash"'),
  value: z.number().describe('Numeric metric value'),
  unit: z.string().optional().describe('Unit of measurement, e.g. "seconds", "inches", "lbs"'),
});

// ─── Season Stats ───────────────────────────────────────────────────────────

const StatEntrySchema = z.object({
  field: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Stat field must be snake_case')
    .describe('snake_case stat key, e.g. "passing_yards", "touchdowns"'),
  label: z.string().min(1).describe('Human-readable label'),
  value: z.union([z.number(), z.string()]).describe('Stat value (numeric or string)'),
});

const GameLogSchema = z.object({
  date: z.string().optional().describe('Game date (ISO or human-readable)'),
  opponent: z.string().optional().describe('Opponent team name'),
  result: z.string().optional().describe('Game result, e.g. "W 35-21"'),
  stats: z.array(StatEntrySchema).default([]).describe('Per-game stats'),
});

const SeasonSchema = z.object({
  season: z.string().min(1).describe('Season identifier, e.g. "2024-2025", "Fall 2024"'),
  category: z.string().optional().describe('Stat category, e.g. "Passing", "Batting"'),
  games: z.array(GameLogSchema).default([]).describe('Individual game logs'),
  totals: z.array(StatEntrySchema).default([]).describe('Season totals/averages'),
});

// ─── Sport Info ─────────────────────────────────────────────────────────────

const SportInfoSchema = z.object({
  positions: z
    .array(z.string().min(1))
    .default([])
    .describe('Position abbreviations, e.g. ["QB", "WR"]'),
  jerseyNumber: z.string().optional().describe('Jersey number as string'),
  side: z
    .enum(['offense', 'defense', 'special_teams', 'both'])
    .optional()
    .describe('Side of the ball'),
});

// ─── Physical Profile ───────────────────────────────────────────────────────

const PhysicalProfileSchema = z.object({
  heightInches: z
    .number()
    .min(48)
    .max(96)
    .optional()
    .describe('Height in inches (48-96 valid range)'),
  weightLbs: z
    .number()
    .min(80)
    .max(400)
    .optional()
    .describe('Weight in pounds (80-400 valid range)'),
});

// ─── Root Schema ────────────────────────────────────────────────────────────

export const AthleteExtractionSchema = z.object({
  classOf: z
    .number()
    .int()
    .min(new Date().getFullYear() - 2)
    .max(new Date().getFullYear() + 6)
    .optional()
    .describe('Graduation year (current year − 2 to +6 for recent grads)'),
  physical: PhysicalProfileSchema.optional().describe('Height and weight measurements'),
  sportInfo: SportInfoSchema.optional().describe('Position, jersey, side of ball'),
  metrics: z.array(CombineMetricSchema).default([]).describe('Combine/measurable metrics'),
  seasons: z.array(SeasonSchema).default([]).describe('Season-by-season stat lines'),
  awards: z
    .array(
      z.object({
        title: z.string().min(1).describe('Award name, e.g. "All-District 2024"'),
        year: z.string().optional().describe('Year awarded'),
        organization: z.string().optional().describe('Awarding body'),
      })
    )
    .default([])
    .describe('Athletic awards and honors'),
});

export type AthleteExtraction = z.infer<typeof AthleteExtractionSchema>;
