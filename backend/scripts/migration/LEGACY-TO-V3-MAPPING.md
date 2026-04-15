# Legacy User Schema → V3 Schema Mapping Guide

**Script**: `migrate-users-to-v2.ts`  
**Source**: Legacy V1 flat fields hoặc V2 partial nested  
**Target**: V3 fully structured schema (`@nxt1/core/models/user`)

---

## 📊 Tổng Quan Mapping

### Legacy V1 (Flat Fields)

```javascript
{
  uid: "abc123",
  email: "john@example.com",
  firstName: "John",
  lastName: "Smith",
  profileImg: "https://...",           // ← SINGLE string
  primarySport: "Football",            // ← FLAT at root
  primarySportPositions: ["QB"],
  primarySportAthleticInfo: {...},
  secondarySport: "Basketball",        // ← FLAT at root
  secondarySportPositions: ["PG"],
  height: "6'2\"",                     // ← STRING
  weight: "185",
  city: "Miami",                       // ← FLAT at root
  state: "FL",
  phoneNumber: "555-1234",             // ← FLAT at root
  gpa: 3.8,                           // ← FLAT at root
  classOf: 2026,
  highSchool: "Miami Central HS",
  teamCode: "MC-FB-2026",
  // ... 150+ more flat fields
}
```

### V3 Schema (Structured)

```typescript
interface User {
  // Core Identity
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  unicode?: string;
  profileImgs: string[]; // ← ARRAY of images

  // Role
  role: 'athlete' | 'coach' | 'recruiter' | 'director' | 'parent' | 'fan';

  // Sports (ARRAY - unlimited sports)
  sports: SportProfile[]; // ← NESTED array
  activeSportIndex: number;

  // Measurables (root-level, not per-sport)
  measurables: VerifiedMetric[]; // ← STRUCTURED metrics

  // Location (NESTED object)
  location: {
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    coordinates?: { lat: number; lon: number };
  };

  // Contact (NESTED object)
  contact: {
    phone?: string;
    email?: string;
    preferredMethod?: 'email' | 'phone' | 'app';
  };

  // Academics (NESTED object)
  academics?: {
    gpa?: number;
    sat?: number;
    act?: number;
    apCourses?: number;
    school?: string;
  };

  classOf?: number;

  // Team History (ARRAY)
  teamHistory: TeamHistoryEntry[];

  // Connected Sources (ARRAY)
  connectedSources: ConnectedSource[];

  // Role-specific data
  athlete?: AthleteData;
  coach?: CoachData;
  recruiter?: RecruiterData;

  // Meta
  _schemaVersion: 3;
  _migratedAt: Date;
  _migratedFrom: 'nxt-1-de054';
  _legacyId: string;
}
```

---

## 🗺️ Chi Tiết Mapping Categories

### A. Core Identity → User (Root)

| Legacy V1                | V3 Schema        | Transform                 |
| ------------------------ | ---------------- | ------------------------- |
| `uid`                    | `id`             | Direct copy               |
| `email`                  | `email`          | Cleaned, lowercased       |
| `firstName`              | `firstName`      | Trim, fallback "Unknown"  |
| `lastName`               | `lastName`       | Trim                      |
| `displayName`            | `displayName`    | Or `firstName + lastName` |
| `unicode`                | `unicode`        | Or generated from name    |
| `profileImg`             | `profileImgs[0]` | **String → Array**        |
| `athleteOrParentOrCoach` | `role`           | Normalized to enum        |
| `gender`                 | `gender`         | Direct                    |

**Code:**

```typescript
const profileImg = cleanString(d['profileImg']);
const profileImgs: string[] = profileImg ? [profileImg] : [];

const firstName = cleanString(d['firstName']) || 'Unknown';
const lastName = cleanString(d['lastName']) || '';
const displayName =
  cleanString(d['displayName']) || [firstName, lastName].join(' ');
const username = unicode || generateUsername(firstName, lastName, d['classOf']);
```

---

### B. Role Normalization

| Legacy Value          | V3 Role                  |
| --------------------- | ------------------------ |
| `"Athlete"`           | `'athlete'`              |
| `"Coach"`             | `'coach'`                |
| `"Parent"`            | `'parent'`               |
| `"Recruiter"`         | `'recruiter'`            |
| `"Director"`          | `'director'`             |
| `""` or missing       | `'athlete'` (default)    |
| `isCollegeCoach=true` | `'recruiter'` (override) |

---

### C. Sports → `sports[]` Array (CRITICAL)

#### Legacy V1: Primary + Secondary (Flat)

```javascript
// BEFORE
{
  primarySport: "Football",
  primarySportPositions: ["QB", "FS"],
  primarySportAthleticInfo: {
    fortydash: "4.5",
    benchPress: "225"
  },
  primarySportStats: {...},
  primarySportProfileImg: "...",

  secondarySport: "Basketball",
  secondarySportPositions: ["PG"],
  // ... no athletic info for secondary
}
```

#### V3: Sports Array (Structured)

```typescript
// AFTER
{
  sports: [
    // Sport 0 (Primary)
    {
      sport: "football",
      positions: ["quarterback", "free-safety"],
      order: 0,

      // Team info
      team: {
        name: "Miami Central HS",
        type: "high-school",
        logoUrl: "...",
        mascot: "Rockets"
      },

      // Coach contact
      coach: {
        firstName: "Mike",
        lastName: "Smith",
        email: "coach@school.com",
        phone: "555-1234"
      },

      // Metrics (excluding root measurables like height/weight)
      verifiedMetrics: [
        {
          id: "forty_yard_dash_2025-06-15",
          field: "40_yard_dash",
          label: "40-Yard Dash",
          value: 4.5,
          unit: "s",
          category: "speed",
          source: { type: "user-entry", url: null },
          verified: false,
          dateRecorded: "2025-06-15"
        },
        {
          id: "bench_press_225_2025-03-10",
          field: "bench_press_225",
          label: "Bench Press (225 lbs)",
          value: 15,
          unit: "reps",
          category: "strength",
          source: { type: "user-entry", url: null },
          verified: false
        }
      ],

      // Stats (top-level summary)
      featuredStats: [...],

      // Images for this sport
      images: ["https://..."],

      // Recruiting (if athlete)
      recruiting: {
        offers: [...],
        interests: [...],
        visits: [...],
        camps: [...]
      }
    },

    // Sport 1 (Secondary)
    {
      sport: "basketball-mens",
      positions: ["point-guard"],
      order: 1,
      team: {...},
      verifiedMetrics: [], // Usually empty for secondary sports
      featuredStats: []
    }
  ],

  activeSportIndex: 0  // Which sport is currently displayed
}
```

**Mapping Logic:**

```typescript
// V1 Format
if (!isV2Format(d)) {
  // Build sports[0] from primarySport*
  if (d.primarySport) {
    sports.push(
      buildSportProfile(
        {
          sport: d.primarySport,
          positions: d.primarySportPositions,
          athleticInfo: d.primarySportAthleticInfo,
          stats: d.primarySportStats,
          gameStats: d.primarySportGameStats,
          profileImg: d.primarySportProfileImg,
          level: d.level,
          side: d.side,
        },
        0,
        d,
        warnings
      )
    );
  }

  // Build sports[1] from secondarySport*
  if (d.secondarySport) {
    sports.push(
      buildSportProfile(
        {
          sport: d.secondarySport,
          positions: d.secondarySportPositions,
          athleticInfo: d.secondarySportAthleticInfo,
          stats: d.secondarySportStats,
          gameStats: d.secondarySportGameStats,
          profileImg: undefined,
          level: undefined,
          side: undefined,
        },
        1,
        d,
        warnings
      )
    );
  }
}

// V2 Format (if already has sports[])
else {
  // Map existing sports[] to V3 SportProfile
  for (const s of d.sports) {
    sports.push(mapV2Sport(s, index, d, warnings));
  }
}
```

---

### D. Measurables → `measurables[]` (Root-Level)

**Root measurables** (không thuộc sport cụ thể):

- `height`, `weight`, `wingspan`, `armLength`, `handSize`, `reach`

```typescript
// BEFORE (V1)
{
  height: "6'2\"",
  weight: "185 lbs",
  wingspan: "6'5\""
}

// AFTER (V3)
{
  measurables: [
    {
      id: "height_2025-01-15",
      field: "height",
      label: "Height",
      value: 74,        // Converted to inches
      unit: "in",
      category: "physical",
      source: { type: "user-entry" },
      verified: false,
      dateRecorded: "2025-01-15"
    },
    {
      id: "weight_2025-01-15",
      field: "weight",
      label: "Weight",
      value: 185,
      unit: "lbs",
      category: "physical",
      source: { type: "user-entry" },
      verified: false
    },
    {
      id: "wingspan_2025-01-15",
      field: "wingspan",
      label: "Wingspan",
      value: 77,
      unit: "in",
      category: "physical",
      source: { type: "user-entry" },
      verified: false
    }
  ]
}
```

**Sport-specific metrics** → `sports[i].verifiedMetrics[]`:

- `40_yard_dash`, `bench_press`, `vertical_jump`, `shuttle_run`, etc.

---

### E. Location → `location` Object

```typescript
// BEFORE (V1 - flat)
{
  city: "Miami",
  state: "FL",
  zipCode: "33101",
  country: "USA",
  lat: 25.7617,
  lon: -80.1918
}

// AFTER (V3 - nested)
{
  location: {
    city: "Miami",
    state: "FL",
    zipCode: "33101",
    country: "USA",
    coordinates: {
      lat: 25.7617,
      lon: -80.1918
    }
  }
}
```

---

### F. Contact → `contact` Object

```typescript
// BEFORE (V1 - flat)
{
  phoneNumber: "555-1234",
  contactEmail: "john@example.com",
  preferredContactMethod: "email"
}

// AFTER (V3 - nested)
{
  contact: {
    phone: "555-1234",
    email: "john@example.com"
  },
  preferredContactMethod: "email"  // Top-level
}
```

---

### G. Academics → `academics` Object

```typescript
// BEFORE (V1 - flat)
{
  gpa: 3.8,
  sat: 1450,
  act: 32,
  apCourses: 5,
  academicAwards: ["Honor Roll"]
}

// AFTER (V3 - nested)
{
  academics: {
    gpa: 3.8,
    sat: 1450,
    act: 32,
    apCourses: 5,
    awards: ["Honor Roll"]
  },
  classOf: 2026  // Promoted to top-level
}
```

---

### H. Team History → `teamHistory[]`

```typescript
// BEFORE (V1 - flat)
{
  highSchool: "Miami Central HS",
  highSchoolSuffix: "High School",
  club: "Miami Elite Basketball",
  teamCode: "MC-FB-2026"
}

// AFTER (V3 - structured array)
{
  teamHistory: [
    {
      teamName: "Miami Central HS",
      teamType: "high-school",
      sport: "football",
      startDate: "2022-08-01",
      endDate: null,  // Current team
      isCurrent: true,
      logoUrl: "...",
      mascot: "Rockets"
    },
    {
      teamName: "Miami Elite Basketball",
      teamType: "club",
      sport: "basketball-mens",
      startDate: "2023-01-01",
      endDate: "2024-03-15",
      isCurrent: false
    }
  ],

  teamCode: "MC-FB-2026"  // Kept for backward compatibility
}
```

---

### I. Connected Sources → `connectedSources[]`

```typescript
// BEFORE (V1 - scattered)
{
  hudlAccountLink: "https://hudl.com/profile/123",
  maxPrepsLink: "https://maxpreps.com/athlete/456",
  twitter: "@johnsmith",
  instagram: "johnsmith_fb",
  tiktok: "@johnsmith"
}

// AFTER (V3 - unified array)
{
  connectedSources: [
    {
      platform: "hudl",
      url: "https://hudl.com/profile/123",
      username: null,
      connectedAt: "2025-01-15T10:30:00Z",
      verified: false
    },
    {
      platform: "maxpreps",
      url: "https://maxpreps.com/athlete/456",
      username: null,
      connectedAt: "2025-01-15T10:30:00Z",
      verified: false
    },
    {
      platform: "twitter",
      url: "https://twitter.com/johnsmith",
      username: "@johnsmith",
      connectedAt: "2025-01-15T10:30:00Z",
      verified: false
    },
    {
      platform: "instagram",
      url: "https://instagram.com/johnsmith_fb",
      username: "johnsmith_fb",
      connectedAt: "2025-01-15T10:30:00Z",
      verified: false
    }
  ]
}
```

---

### J. Connected Emails → `connectedEmails[]`

```typescript
// BEFORE (V1 - boolean flags)
{
  connectedGmailToken: "ya29.a0...",
  connectedMicrosoftToken: "eyJ0e..."
}

// AFTER (V3 - structured array)
{
  connectedEmails: [
    {
      provider: "gmail",
      email: "john@gmail.com",
      isPrimary: true,
      connectedAt: "2025-01-15T10:30:00Z"
      // Token stored in subcollection: users/{uid}/emailTokens/gmail
    },
    {
      provider: "microsoft",
      email: "john@outlook.com",
      isPrimary: false,
      connectedAt: "2025-02-01T14:22:00Z"
    }
  ]
}
```

---

### K. Counters → `_counters` Object

```typescript
// BEFORE (V1 - flat)
{
  profileViews: 1234,
  videoViews: 5678
}

// AFTER (V3 - structured)
{
  _counters: {
    profileViews: 1234,
    videoViews: 5678,
    postsCount: 0,        // New
    sharesCount: 0,       // New
    highlightCount: 0,    // New
    offerCount: 0,        // New
    eventCount: 0,        // New
    _lastSyncedAt: "2026-04-12T12:00:00Z"
  }
}
```

---

### L. Role-Specific Data

#### Athlete

```typescript
// BEFORE (V1 - mixed with root)
{
  role: "Athlete",
  isRecruit: true,
  offers: "[{...}]",           // JSON string!
  collegeInterests: [...],
  collegeVisits: [...],
  collegeCamps: [...],
  isCommitted: true,
  committedSchool: "University of Miami"
}

// AFTER (V3 - nested in athlete object)
{
  role: "athlete",
  athlete: {
    isRecruit: true,

    // Recruiting moved to sports[].recruiting
    // (because athlete can have offers in multiple sports)

    committed: {
      school: "University of Miami",
      sport: "football",
      date: "2025-12-15",
      scholarshipType: "full-ride",
      nli signed: true
    }
  },

  sports: [
    {
      sport: "football",
      recruiting: {
        offers: [
          {
            schoolName: "University of Miami",
            scholarshipType: "full-ride",
            offeredAt: "2025-06-15",
            status: "accepted"
          },
          {
            schoolName: "Florida State",
            scholarshipType: "partial",
            offeredAt: "2025-07-20",
            status: "declined"
          }
        ],
        interests: [...],
        visits: [...],
        camps: [...]
      }
    }
  ]
}
```

#### Coach

```typescript
// BEFORE (V1)
{
  role: "Coach",
  coachingExperience: 15,
  currentTeam: "Miami Central HS",
  specialization: "Offensive Coordinator"
}

// AFTER (V3)
{
  role: "coach",
  coach: {
    yearsExperience: 15,
    currentTeam: {
      name: "Miami Central HS",
      position: "Offensive Coordinator",
      sport: "football",
      level: "high-school"
    },
    certifications: [...],
    achievements: [...]
  }
}
```

---

### M. Migration Metadata

```typescript
{
  _schemaVersion: 3,
  _migratedAt: "2026-04-12T15:30:00.000Z",
  _migratedFrom: "nxt-1-de054",
  _legacyId: "p8OiVVIknKhgncxVahKeRs8HzD63",
  _legacyCollection: "Users",
  _migrationScript: "migrate-users-to-v2.ts",
  _migrationVersion: "1.0.0"
}
```

---

## 🚀 Cách Chạy Migration

### 1. Dry-Run (Preview, không write)

```bash
cd backend

# Preview 50 users
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run --limit=50

# Preview với verbose logging
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run --limit=10 --verbose
```

### 2. Thực Hiện Migration

```bash
# Migrate ALL users từ legacy → staging
npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging

# Migrate 100 users đầu tiên (testing)
npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging --limit=100

# Resume từ user cuối cùng đã migrate
npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging --resume
```

### 3. Verify Kết Quả

```bash
# Check số lượng users đã migrate
npx tsx scripts/migration/verify-firestore-migration.ts

# So sánh data giữa legacy vs staging
npx tsx scripts/migration/validate-user-migration.ts --uid=p8OiVVIknKhgncxVahKeRs8HzD63
```

---

## 📋 Checklist Trước Khi Migrate

- [ ] **Phase 2 Complete**: Auth migration đã xong (verify với
      `verify-auth-import.ts`)
- [ ] **Environment Variables**: Check `.env` có đủ LEGACY*FIREBASE*_ và
      STAGING*FIREBASE*_
- [ ] **Backup**: Snapshot Firestore legacy (hoặc đảm bảo có rollback plan)
- [ ] **Dry-Run**: Chạy `--dry-run --limit=10 --verbose` để xem output
- [ ] **Review Mappings**: Đọc kỹ file này để hiểu transform logic
- [ ] **Storage**: Nếu cần migrate images, chạy Phase 4 song song hoặc sau Phase
      3

---

## 🔍 Troubleshooting

### Issue 1: Missing Fields

```
Warning: User abc123 - Athlete has no sport data
```

**Fix**: Legacy user không có `primarySport`. Script assign default values, cần
manual review sau.

### Issue 2: Invalid Data

```
Warning: User xyz789 - Invalid classOf: "graduating soon"
```

**Fix**: Script attempts to parse, fallback to `undefined` nếu không parse được.

### Issue 3: Duplicate Keys

```
Error: Field 'email' already exists
```

**Fix**: Script strip `undefined` values trước khi write. Nếu vẫn lỗi, check
Firestore rules.

---

## 📖 Tài Liệu Liên Quan

- **Script**: [`migrate-users-to-v2.ts`](./migrate-users-to-v2.ts)
- **Utils**: [`migration-utils.ts`](./migration-utils.ts)
- **User Model**:
  [`packages/core/src/models/user/user.model.ts`](../../packages/core/src/models/user/user.model.ts)
- **Sport Model**:
  [`packages/core/src/models/user/user-sport.model.ts`](../../packages/core/src/models/user/user-sport.model.ts)
- **Phase 3 Guide**: [`PHASE-3-QUICK-START.md`](./PHASE-3-QUICK-START.md)

---

## ✅ Kết Luận

**Script `migrate-users-to-v2.ts` tự động handle:**

- ✅ V1 flat → V3 nested transformation
- ✅ Sports array construction từ primary/secondary
- ✅ Metrics restructuring (root vs per-sport)
- ✅ Location/Contact/Academics nesting
- ✅ Role normalization và role-specific data
- ✅ Team history generation
- ✅ Connected sources consolidation
- ✅ Migration metadata injection
- ✅ Data validation và warnings

**Bạn chỉ cần:**

1. Review mapping này
2. Chạy dry-run để verify
3. Execute migration
4. Verify results

🎯 **Ready to migrate!**
