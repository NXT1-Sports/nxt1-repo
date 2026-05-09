/**
 * @fileoverview Agent X — Quick Tasks route.
 *
 * GET /tasks?role=athlete|coach|college|general
 *
 * Returns a role-filtered list of predefined quick-action tasks for the
 * Agent X shell command palette.
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';

const router = Router();

// ─── Task Definitions ─────────────────────────────────────────────────────────

const QUICK_TASKS = [
  // Athlete tasks
  {
    id: 'athlete-highlight',
    title: 'Create Highlight Reel',
    description: 'Generate a highlight reel from your recent game footage',
    icon: 'videocam-outline',
    prompt: 'Create a highlight reel from my recent game footage and optimize it for recruiting.',
    category: 'athlete',
  },
  {
    id: 'athlete-profile',
    title: 'Update Recruiting Profile',
    description: 'Refresh your stats, bio, and recruiting information',
    icon: 'person-outline',
    prompt: 'Help me update my recruiting profile with my latest stats and achievements.',
    category: 'athlete',
  },
  {
    id: 'athlete-email',
    title: 'Draft Coach Email',
    description: 'Write a professional outreach email to a college coach',
    icon: 'mail-outline',
    prompt:
      'Draft a professional email to a college coach expressing my interest in their program.',
    category: 'athlete',
  },
  {
    id: 'athlete-ncaa',
    title: 'Check NCAA Compliance',
    description: 'Review your recruiting activity for NCAA compliance',
    icon: 'shield-checkmark-outline',
    prompt: 'Review my recent recruiting activities and flag any potential NCAA compliance issues.',
    category: 'athlete',
  },

  // Coach tasks
  {
    id: 'coach-scout',
    title: 'Scout Report',
    description: 'Generate a scouting report for an upcoming opponent',
    icon: 'analytics-outline',
    prompt:
      'Create a detailed scouting report for our upcoming opponent including tendencies and key players.',
    category: 'coach',
  },
  {
    id: 'coach-recruit',
    title: 'Identify Recruits',
    description: 'Find top prospects matching your program needs',
    icon: 'search-outline',
    prompt: "Help me identify top recruits that match our program's needs and culture.",
    category: 'coach',
  },
  {
    id: 'coach-practice',
    title: 'Design Practice Plan',
    description: 'Create a structured practice plan for this week',
    icon: 'list-outline',
    prompt: 'Design a detailed practice plan for this week focused on our upcoming game.',
    category: 'coach',
  },
  {
    id: 'coach-film',
    title: 'Analyze Game Film',
    description: 'Break down key moments from your last game',
    icon: 'film-outline',
    prompt:
      'Analyze our last game film and identify our strengths, weaknesses, and adjustment opportunities.',
    category: 'coach',
  },

  // College/program tasks
  {
    id: 'college-compliance',
    title: 'Compliance Check',
    description: 'Review recruiting activity for NCAA/NAIA compliance',
    icon: 'document-text-outline',
    prompt:
      'Review our recent recruiting activities and communications for compliance with NCAA/NAIA regulations.',
    category: 'college',
  },
  {
    id: 'college-roster',
    title: 'Roster Analysis',
    description: 'Analyze roster gaps and recruiting needs by position',
    icon: 'people-outline',
    prompt: 'Analyze our current roster and identify gaps we need to address in recruiting.',
    category: 'college',
  },

  // General tasks
  {
    id: 'general-media',
    title: 'Create Social Graphic',
    description: 'Design a professional graphic for social media',
    icon: 'image-outline',
    prompt: 'Create a professional sports graphic for my social media channels.',
    category: 'general',
  },
  {
    id: 'general-news',
    title: 'Summarize Sports News',
    description: 'Get a summary of the latest relevant sports news',
    icon: 'newspaper-outline',
    prompt: 'Summarize the latest relevant sports news and trends for my sport and position.',
    category: 'general',
  },
] as const;

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /tasks
 *
 * Returns predefined quick tasks, optionally filtered by `role` query param.
 * Roles map to categories: athlete → 'athlete', coach → 'coach',
 * director/recruiter/college → 'college', others → 'general'.
 */
router.get('/tasks', appGuard, (req: Request, res: Response) => {
  const role = typeof req.query['role'] === 'string' ? req.query['role'].toLowerCase() : '';

  const categoryFilter = mapRoleToCategory(role);

  const tasks = categoryFilter
    ? QUICK_TASKS.filter((t) => t.category === categoryFilter || t.category === 'general')
    : QUICK_TASKS;

  return res.json({
    success: true,
    data: { tasks },
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRoleToCategory(role: string): 'athlete' | 'coach' | 'college' | 'general' | null {
  if (!role) return null;
  if (role === 'athlete') return 'athlete';
  if (role === 'coach') return 'coach';
  if (role === 'director' || role === 'recruiter' || role === 'college') return 'college';
  return 'general';
}

export default router;
