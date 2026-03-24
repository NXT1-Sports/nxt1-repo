/**
 * @fileoverview Mock Manage Team Data for Development
 * @module @nxt1/ui/manage-team/mock-data
 *
 * ⚠️ TEMPORARY FILE - Delete when backend is ready
 *
 * Contains comprehensive dummy data for Manage Team feature during development.
 * All data here is fabricated for UI testing purposes only.
 */

import type {
  ManageTeamFormData,
  ManageTeamSection,
  RosterPlayer,
  TeamScheduleEvent,
  StaffMember,
  TeamSponsor,
  TeamIntegration,
  TeamCompletionData,
} from '@nxt1/core';

// ============================================
// MOCK TEAM BASIC INFO
// ============================================

export const MOCK_TEAM_BASIC_INFO: ManageTeamFormData['basicInfo'] = {
  name: 'Riverside Tigers',
  mascot: 'Tigers',
  abbreviation: 'RHS',
  sport: 'Football',
  level: 'varsity',
  gender: 'boys',
  season: 'Fall',
  year: '2025-2026',
};

export const MOCK_TEAM_BRANDING: ManageTeamFormData['branding'] = {
  logo: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=200&h=200&fit=crop',
  mascotImage: 'https://images.unsplash.com/photo-1551009175-8a68da93d5f9?w=400&h=400&fit=crop',
  primaryColor: '#FF6B00',
  secondaryColor: '#1A1A1A',
  accentColor: '#FFFFFF',
  bannerImage: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=400&fit=crop',
};

export const MOCK_TEAM_CONTACT: ManageTeamFormData['contact'] = {
  email: 'football@riversidehigh.edu',
  phone: '(555) 234-5678',
  website: 'https://riversideathletics.com/football',
  address: '1234 Stadium Drive',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
};

export const MOCK_TEAM_RECORD: ManageTeamFormData['record'] = {
  wins: 8,
  losses: 2,
  ties: 0,
  conferenceWins: 5,
  conferenceLosses: 1,
  streak: 'W4',
  ranking: 12,
  conferenceRank: 2,
};

// ============================================
// MOCK ROSTER
// ============================================

export const MOCK_ROSTER: readonly RosterPlayer[] = [
  {
    id: 'player-1',
    firstName: 'Marcus',
    lastName: 'Johnson',
    displayName: 'Marcus Johnson',
    number: '12',
    position: 'Quarterback',
    positions: ['Quarterback', 'Wide Receiver'],
    classYear: '2026',
    height: '6\'2"',
    weight: '195',
    photoUrl: 'https://i.pravatar.cc/150?img=68',
    profileId: 'profile-123',
    email: 'marcus.j@email.com',
    isVerified: true,
    isCaptain: true,
    status: 'active',
    joinedAt: '2023-08-15',
  },
  {
    id: 'player-2',
    firstName: 'Jayden',
    lastName: 'Williams',
    displayName: 'Jayden Williams',
    number: '24',
    position: 'Running Back',
    classYear: '2026',
    height: '5\'10"',
    weight: '185',
    photoUrl: 'https://i.pravatar.cc/150?img=12',
    profileId: 'profile-456',
    isVerified: true,
    isCaptain: false,
    status: 'active',
    joinedAt: '2023-08-15',
  },
  {
    id: 'player-3',
    firstName: 'Darius',
    lastName: 'Brown',
    displayName: 'Darius Brown',
    number: '88',
    position: 'Wide Receiver',
    classYear: '2027',
    height: '6\'1"',
    weight: '180',
    photoUrl: 'https://i.pravatar.cc/150?img=15',
    isVerified: false,
    status: 'active',
    joinedAt: '2024-08-20',
  },
  {
    id: 'player-4',
    firstName: 'Malik',
    lastName: 'Davis',
    displayName: 'Malik Davis',
    number: '55',
    position: 'Linebacker',
    classYear: '2026',
    height: '6\'0"',
    weight: '215',
    photoUrl: 'https://i.pravatar.cc/150?img=22',
    isVerified: true,
    isCaptain: true,
    status: 'active',
    joinedAt: '2023-08-15',
  },
  {
    id: 'player-5',
    firstName: 'Tyler',
    lastName: 'Moore',
    displayName: 'Tyler Moore',
    number: '7',
    position: 'Cornerback',
    classYear: '2027',
    height: '5\'11"',
    weight: '175',
    isVerified: false,
    status: 'invited',
    joinedAt: '2025-01-10',
  },
  {
    id: 'player-6',
    firstName: 'Chris',
    lastName: 'Taylor',
    number: '72',
    position: 'Offensive Tackle',
    classYear: '2026',
    height: '6\'5"',
    weight: '285',
    photoUrl: 'https://i.pravatar.cc/150?img=33',
    isVerified: true,
    status: 'active',
    joinedAt: '2023-08-15',
  },
  {
    id: 'player-7',
    firstName: 'Brandon',
    lastName: 'Lee',
    number: '21',
    position: 'Safety',
    classYear: '2026',
    height: '6\'0"',
    weight: '190',
    photoUrl: 'https://i.pravatar.cc/150?img=45',
    isVerified: true,
    status: 'injured',
    joinedAt: '2023-08-15',
  },
] as const;

// ============================================
// MOCK SCHEDULE
// ============================================

export const MOCK_SCHEDULE: readonly TeamScheduleEvent[] = [
  {
    id: 'event-1',
    type: 'game',
    opponent: 'Lincoln Lions',
    opponentLogo: 'https://i.pravatar.cc/100?img=1',
    date: '2025-09-06',
    time: '7:00 PM',
    location: 'Tiger Stadium',
    isHome: true,
    result: { teamScore: 35, opponentScore: 14, outcome: 'win' },
    status: 'completed',
  },
  {
    id: 'event-2',
    type: 'game',
    opponent: 'Jefferson Eagles',
    opponentLogo: 'https://i.pravatar.cc/100?img=2',
    date: '2025-09-13',
    time: '7:00 PM',
    location: 'Eagle Field',
    isHome: false,
    result: { teamScore: 28, opponentScore: 21, outcome: 'win' },
    status: 'completed',
  },
  {
    id: 'event-3',
    type: 'game',
    opponent: 'Central Bulldogs',
    opponentLogo: 'https://i.pravatar.cc/100?img=3',
    date: '2025-09-20',
    time: '7:30 PM',
    location: 'Tiger Stadium',
    isHome: true,
    result: { teamScore: 21, opponentScore: 24, outcome: 'loss' },
    status: 'completed',
  },
  {
    id: 'event-4',
    type: 'game',
    opponent: 'Westside Warriors',
    opponentLogo: 'https://i.pravatar.cc/100?img=4',
    date: '2025-09-27',
    time: '7:00 PM',
    location: 'Warrior Stadium',
    isHome: false,
    status: 'scheduled',
  },
  {
    id: 'event-5',
    type: 'game',
    opponent: 'Eastwood Panthers',
    date: '2025-10-04',
    time: '7:00 PM',
    location: 'Tiger Stadium',
    isHome: true,
    status: 'scheduled',
  },
  {
    id: 'event-6',
    type: 'practice',
    title: 'Team Practice',
    date: '2025-09-25',
    time: '3:30 PM',
    location: 'Practice Field',
    isHome: true,
    status: 'scheduled',
  },
  {
    id: 'event-7',
    type: 'playoff',
    opponent: 'TBD - Playoff Opponent',
    date: '2025-11-14',
    time: '7:00 PM',
    location: 'TBD',
    isHome: false,
    status: 'scheduled',
    notes: 'First round playoff game',
  },
] as const;

// ============================================
// MOCK STAFF
// ============================================

export const MOCK_STAFF: readonly StaffMember[] = [
  {
    id: 'staff-1',
    firstName: 'Robert',
    lastName: 'Thompson',
    displayName: 'Coach Thompson',
    role: 'head-coach',
    title: 'Head Football Coach',
    email: 'rthompson@riversidehigh.edu',
    phone: '(555) 111-2222',
    photoUrl: 'https://i.pravatar.cc/150?img=52',
    bio: '15 years coaching experience. Former college quarterback. State champion 2019, 2022.',
    isHead: true,
    yearsExperience: 15,
    certifications: ['USA Football', 'CPR/First Aid', 'CDL'],
    status: 'active',
  },
  {
    id: 'staff-2',
    firstName: 'Michael',
    lastName: 'Rodriguez',
    displayName: 'Coach Rodriguez',
    role: 'assistant-coach',
    title: 'Offensive Coordinator',
    email: 'mrodriguez@riversidehigh.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=53',
    yearsExperience: 8,
    status: 'active',
  },
  {
    id: 'staff-3',
    firstName: 'David',
    lastName: 'Kim',
    displayName: 'Coach Kim',
    role: 'assistant-coach',
    title: 'Defensive Coordinator',
    email: 'dkim@riversidehigh.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=54',
    yearsExperience: 6,
    status: 'active',
  },
  {
    id: 'staff-4',
    firstName: 'James',
    lastName: 'Wilson',
    role: 'position-coach',
    title: 'Quarterbacks Coach',
    email: 'jwilson@riversidehigh.edu',
    yearsExperience: 4,
    status: 'active',
  },
  {
    id: 'staff-5',
    firstName: 'Sarah',
    lastName: 'Martinez',
    role: 'trainer',
    title: 'Athletic Trainer',
    email: 'smartinez@riversidehigh.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=32',
    certifications: ['NATA Certified', 'CPR/AED', 'Sports Medicine'],
    status: 'active',
  },
  {
    id: 'staff-6',
    firstName: 'Emily',
    lastName: 'Chen',
    role: 'statistician',
    title: 'Team Statistician',
    email: 'echen@riversidehigh.edu',
    status: 'active',
  },
] as const;

// ============================================
// MOCK SPONSORS
// ============================================

export const MOCK_SPONSORS: readonly TeamSponsor[] = [
  {
    id: 'sponsor-1',
    name: 'Austin Sports Medicine',
    logo: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=200&h=100&fit=crop',
    tier: 'platinum',
    website: 'https://austinsportsmedicine.com',
    contactName: 'Dr. James Anderson',
    contactEmail: 'partnerships@austinsportsmedicine.com',
    description: 'Official sports medicine provider for Riverside Tigers Football',
    startDate: '2024-08-01',
    endDate: '2025-07-31',
    benefits: ['Sideline medical staff', 'Player physicals', 'Logo on jerseys'],
    status: 'active',
  },
  {
    id: 'sponsor-2',
    name: 'Texas Auto Group',
    logo: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=200&h=100&fit=crop',
    tier: 'gold',
    website: 'https://texasautogroup.com',
    contactName: 'Mike Henderson',
    contactEmail: 'mike@texasautogroup.com',
    description: 'Proud supporter of Riverside athletics',
    startDate: '2024-08-01',
    endDate: '2025-07-31',
    benefits: ['Scoreboard logo', 'Program ads', 'PA announcements'],
    status: 'active',
  },
  {
    id: 'sponsor-3',
    name: 'Local Pizza Co.',
    logo: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=100&fit=crop',
    tier: 'silver',
    website: 'https://localpizza.com',
    contactName: 'Tony Romano',
    contactEmail: 'tony@localpizza.com',
    description: 'Team meal sponsor',
    benefits: ['Post-game meals', 'Concession stand'],
    status: 'active',
  },
  {
    id: 'sponsor-4',
    name: 'First Community Bank',
    tier: 'bronze',
    contactName: 'Jennifer Adams',
    contactEmail: 'jadams@fcbank.com',
    status: 'active',
  },
  {
    id: 'sponsor-5',
    name: 'Smith Family Foundation',
    tier: 'supporter',
    description: 'Supporting student athletes since 2015',
    status: 'active',
  },
] as const;

// ============================================
// MOCK INTEGRATIONS
// ============================================

export const MOCK_INTEGRATIONS: readonly TeamIntegration[] = [
  {
    id: 'integration-1',
    provider: 'maxpreps',
    type: 'all',
    url: 'https://www.maxpreps.com/tx/austin/riverside-tigers/football/',
    status: 'connected',
    lastSync: '2025-01-20T14:30:00Z',
    syncFrequency: 'daily',
    autoSync: true,
  },
  {
    id: 'integration-2',
    provider: 'hudl',
    type: 'video',
    url: 'https://www.hudl.com/team/riverside-tigers-football',
    status: 'connected',
    lastSync: '2025-01-19T10:00:00Z',
    syncFrequency: 'weekly',
    autoSync: false,
  },
  {
    id: 'integration-3',
    provider: 'gamechanger',
    type: 'stats',
    url: '',
    status: 'disconnected',
  },
] as const;

// ============================================
// COMPLETE MOCK FORM DATA
// ============================================

export const MOCK_MANAGE_TEAM_FORM_DATA: ManageTeamFormData = {
  basicInfo: MOCK_TEAM_BASIC_INFO,
  branding: MOCK_TEAM_BRANDING,
  contact: MOCK_TEAM_CONTACT,
  record: MOCK_TEAM_RECORD,
  roster: MOCK_ROSTER,
  schedule: MOCK_SCHEDULE,
  staff: MOCK_STAFF,
  sponsors: MOCK_SPONSORS,
  integrations: MOCK_INTEGRATIONS,
};

// ============================================
// MOCK EMPTY FORM DATA
// ============================================

export const MOCK_EMPTY_TEAM_FORM_DATA: ManageTeamFormData = {
  basicInfo: {
    name: '',
    sport: '',
    level: 'varsity',
    gender: 'boys',
  },
  branding: {
    primaryColor: '#ccff00',
    secondaryColor: '#000000',
  },
  contact: {},
  record: {
    wins: 0,
    losses: 0,
  },
  roster: [],
  schedule: [],
  staff: [],
  sponsors: [],
  integrations: [],
};

// ============================================
// MOCK COMPLETION DATA
// ============================================

export const MOCK_TEAM_COMPLETION: TeamCompletionData = {
  percentage: 78,
  sectionsComplete: 5,
  sectionsTotal: 7,
  sections: [
    {
      sectionId: 'team-info',
      percentage: 100,
      isComplete: true,
      fieldsCompleted: 10,
      fieldsTotal: 10,
    },
    { sectionId: 'roster', percentage: 85, isComplete: false, fieldsCompleted: 7, fieldsTotal: 8 },
    {
      sectionId: 'schedule',
      percentage: 100,
      isComplete: true,
      fieldsCompleted: 7,
      fieldsTotal: 7,
    },
    { sectionId: 'stats', percentage: 100, isComplete: true, fieldsCompleted: 4, fieldsTotal: 4 },
    { sectionId: 'staff', percentage: 80, isComplete: false, fieldsCompleted: 6, fieldsTotal: 6 },
    {
      sectionId: 'sponsors',
      percentage: 60,
      isComplete: false,
      fieldsCompleted: 5,
      fieldsTotal: 5,
    },
    {
      sectionId: 'integrations',
      percentage: 33,
      isComplete: false,
      fieldsCompleted: 2,
      fieldsTotal: 3,
    },
  ],
};

// ============================================
// MOCK SECTIONS FOR UI
// ============================================

export const MOCK_MANAGE_TEAM_SECTIONS: readonly ManageTeamSection[] = [
  {
    id: 'team-info',
    title: 'Team Information',
    icon: 'shield-outline',
    description: 'Logo, mascot, colors & contact',
    completionPercent: 100,
    fields: [
      {
        id: 'name',
        type: 'text',
        label: 'Team Name',
        value: MOCK_TEAM_BASIC_INFO.name,
        required: true,
      },
      { id: 'mascot', type: 'text', label: 'Mascot', value: MOCK_TEAM_BASIC_INFO.mascot },
      { id: 'logo', type: 'image-upload', label: 'Team Logo', value: MOCK_TEAM_BRANDING.logo },
      {
        id: 'primaryColor',
        type: 'color-picker',
        label: 'Primary Color',
        value: MOCK_TEAM_BRANDING.primaryColor,
      },
      {
        id: 'secondaryColor',
        type: 'color-picker',
        label: 'Secondary Color',
        value: MOCK_TEAM_BRANDING.secondaryColor,
      },
    ],
  },
  {
    id: 'roster',
    title: 'Roster',
    icon: 'people-outline',
    description: 'Manage players & positions',
    completionPercent: 85,
    fields: [{ id: 'roster', type: 'roster-list', label: 'Team Roster', value: MOCK_ROSTER }],
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: 'calendar-outline',
    description: 'Games, practices & events',
    completionPercent: 100,
    fields: [
      { id: 'schedule', type: 'schedule-list', label: 'Team Schedule', value: MOCK_SCHEDULE },
    ],
  },
  {
    id: 'stats',
    title: 'Stats & Record',
    icon: 'stats-chart-outline',
    description: 'Team statistics & standings',
    completionPercent: 100,
    fields: [
      { id: 'wins', type: 'number', label: 'Wins', value: MOCK_TEAM_RECORD.wins },
      { id: 'losses', type: 'number', label: 'Losses', value: MOCK_TEAM_RECORD.losses },
      { id: 'ranking', type: 'number', label: 'Ranking', value: MOCK_TEAM_RECORD.ranking },
    ],
  },
  {
    id: 'staff',
    title: 'Staff',
    icon: 'briefcase-outline',
    description: 'Coaches & team personnel',
    completionPercent: 80,
    fields: [{ id: 'staff', type: 'staff-list', label: 'Team Staff', value: MOCK_STAFF }],
  },
  {
    id: 'sponsors',
    title: 'Sponsors',
    icon: 'ribbon-outline',
    description: 'Team sponsors & partners',
    completionPercent: 60,
    fields: [
      { id: 'sponsors', type: 'sponsor-list', label: 'Team Sponsors', value: MOCK_SPONSORS },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: 'link-outline',
    description: 'Connect external data sources',
    completionPercent: 33,
    fields: [
      {
        id: 'integrations',
        type: 'integration-link',
        label: 'Data Integrations',
        value: MOCK_INTEGRATIONS,
      },
    ],
  },
] as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get mock team form data.
 */
export function getMockTeamFormData(): ManageTeamFormData {
  return { ...MOCK_MANAGE_TEAM_FORM_DATA };
}

/**
 * Get mock empty team form data.
 */
export function getMockEmptyTeamFormData(): ManageTeamFormData {
  return { ...MOCK_EMPTY_TEAM_FORM_DATA };
}

/**
 * Get mock team completion data.
 */
export function getMockTeamCompletion(): TeamCompletionData {
  return { ...MOCK_TEAM_COMPLETION };
}

/**
 * Get mock roster with optional count.
 */
export function getMockRoster(count?: number): readonly RosterPlayer[] {
  return count ? MOCK_ROSTER.slice(0, count) : [...MOCK_ROSTER];
}

/**
 * Get mock schedule with optional count.
 */
export function getMockSchedule(count?: number): readonly TeamScheduleEvent[] {
  return count ? MOCK_SCHEDULE.slice(0, count) : [...MOCK_SCHEDULE];
}

/**
 * Get mock staff.
 */
export function getMockStaff(): readonly StaffMember[] {
  return [...MOCK_STAFF];
}

/**
 * Get mock sponsors.
 */
export function getMockSponsors(): readonly TeamSponsor[] {
  return [...MOCK_SPONSORS];
}

/**
 * Get mock integrations.
 */
export function getMockIntegrations(): readonly TeamIntegration[] {
  return [...MOCK_INTEGRATIONS];
}
