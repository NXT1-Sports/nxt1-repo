# NXT1 User Migration Pipeline

> **Migrate legacy Firestore data from `nxt-1-de054` to the V3 monorepo schema
> (`nxt-1-staging-v2` → `nxt-1-v2`).**

---

## Overview

This pipeline consists of 6 phases plus shared utilities. Every script is
idempotent (`set({ merge: true })`), supports `--dry-run`, and writes detailed
JSON reports to `backend/reports/migration/`.

| Phase | Script                          | Purpose                                              |
| ----- | ------------------------------- | ---------------------------------------------------- |
| Utils | `migration-utils.ts`            | Shared helpers, CLI parsing, batch writer, logging   |
| 1     | `analyze-legacy-users.ts`       | Read-only recon of legacy `Users` collection         |
| 2     | `migrate-users-to-v2.ts`        | Core user document migration (14 mapping categories) |
| 3     | `migrate-user-content-to-v2.ts` | Recruiting, roster, posts, stats                     |
| 4     | `validate-user-migration.ts`    | Dual-read comparison validation                      |
| 5     | `migrate-teamcodes-to-v2.ts`    | TeamCodes → Organizations + Teams + Roster + Billing |
| 6     | `migrate-storage-to-v2.ts`      | Firebase Storage bucket copy + URL rewriting         |

---

## Prerequisites

### 1. Service Account Files

Place these in `backend/assets/`:

| File                                                  | Source Project                  |
| ----------------------------------------------------- | ------------------------------- |
| `nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json` | Legacy (`nxt-1-de054`)          |
| `nxt-1-staging-v2-ae4fac811aa4.json`                  | V2 Staging (`nxt-1-staging-v2`) |

> For production, replace the V2 staging SA with `nxt-1-v2` credentials.

### 2. Environment

```bash
# Required: Node 20+ with tsx
npm install -D tsx

# Backend .env must exist (for dotenv loading)
echo "NODE_ENV=development" > backend/.env
```

### 3. Firestore Indexes

No special indexes required — all queries use `orderBy('createdAt', 'asc')` or
`FieldPath.documentId()`, which are auto-indexed.

---

## Execution Order

```
Phase 1  →  Phase 5  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 6
(analyze)   (teams)     (users)     (content)   (validate)  (storage)
```

**Why this order?**

1. **Phase 1** gives you a recon report — field coverage, role distribution,
   data quality.
2. **Phase 5** creates Organizations/Teams first (so Phase 2 can reference
   them).
3. **Phase 2** migrates core user documents using the 14 mapping categories A–N.
4. **Phase 3** migrates user-associated content into normalized V3 collections.
5. **Phase 4** validates everything by comparing legacy ↔ V3 field-by-field.
6. **Phase 6** copies storage files and rewrites URLs in the now-populated V3
   docs.

---

## Common CLI Flags

All scripts support these flags:

| Flag           | Default | Description                                         |
| -------------- | ------- | --------------------------------------------------- |
| `--dry-run`    | off     | Log operations without writing to Firestore/Storage |
| `--limit=N`    | 0 (all) | Process at most N documents/files                   |
| `--target=`    | staging | `staging` or `production` (selects SA file)         |
| `--verbose`    | off     | Print per-document/per-file detail                  |
| `--legacy-sa=` | auto    | Override path to legacy service account JSON        |

---

## Phase-by-Phase Instructions

### Phase 1 — Analyze Legacy Users

```bash
cd backend

# Quick recon (first 100 users)
npx tsx scripts/migration/analyze-legacy-users.ts --limit=100

# Full analysis
npx tsx scripts/migration/analyze-legacy-users.ts --verbose
```

**Output:** `backend/reports/migration/legacy-analysis-YYYY-MM-DD.json`

Review this report to understand:

- Total user count & role distribution
- Field population rates (which fields are actually used)
- Data quality issues (missing emails, invalid dates, etc.)
- V1 vs V2 format distribution

### Phase 5 — Migrate TeamCodes

```bash
# Dry run first
npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --dry-run --verbose

# Execute against staging
npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --target=staging

# Limit to first 50
npx tsx scripts/migration/migrate-teamcodes-to-v2.ts --limit=50 --verbose
```

**Creates:** `organizations`, `teams`, `rosterEntries` collections.

**Report:** `backend/reports/migration/teamcodes-migration-YYYY-MM-DD.json`

### Phase 2 — Migrate Users

```bash
# Dry run with limit
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run --limit=100 --verbose

# Full migration to staging
npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging

# Resume after interruption (continues from last processed doc)
npx tsx scripts/migration/migrate-users-to-v2.ts --target=staging --resume
```

**Creates:** `users` collection with V3 schema (`_schemaVersion: 3`).

**Mapping Categories (A–N):**

- A: Identity (uid, email, username, displayName)
- B: Profile (name, bio, location, graduation)
- C: Role & Type (role normalization via `ROLE_MAP`)
- D: Auth Metadata (providerData, emailVerified)
- E: Sports (primary + additional, positions, jersey)
- F: Physical Attributes (height, weight, GPA)
- G: Social Links (twitter, instagram, hudl, etc.)
- H: Media (profile image, cover image, videos)
- I: Subscription/Plan (tier, expiry, features)
- J: Notification Preferences
- K: Privacy & Visibility
- L: Team Associations (teamCode linkage)
- M: Timestamps (created, updated, lastLogin)
- N: Recruiting (offers, visits, commitment — basic refs)

**Report:** `backend/reports/migration/users-migration-YYYY-MM-DD.json`

### Phase 3 — Migrate User Content

```bash
# All content types
npx tsx scripts/migration/migrate-user-content-to-v2.ts --dry-run --verbose

# Only recruiting activity
npx tsx scripts/migration/migrate-user-content-to-v2.ts --collection=recruiting

# Only posts
npx tsx scripts/migration/migrate-user-content-to-v2.ts --collection=posts --limit=500

# Only stats
npx tsx scripts/migration/migrate-user-content-to-v2.ts --collection=stats
```

**Creates:**

- `users/{uid}/recruiting/{docId}` — Offers, visits, camps, interests,
  commitments
- `rosterEntries` — User-team associations (deterministic ID:
  `{uid}_{teamCode}`)
- `posts` — Top-level posts collection
- `playerStats`, `gameStats` — Normalized stats collections

**Report:** `backend/reports/migration/content-migration-YYYY-MM-DD.json`

### Phase 4 — Validate Migration

```bash
# Standard validation (warnings allowed)
npx tsx scripts/migration/validate-user-migration.ts --verbose

# Strict mode (fail on ANY mismatch)
npx tsx scripts/migration/validate-user-migration.ts --strict

# Validate first 200 users
npx tsx scripts/migration/validate-user-migration.ts --limit=200 --verbose
```

**Checks:**

- Field-by-field comparison for categories A, B, E, F, G, K, L, M
- Fuzzy matching for timestamps (minute precision), numbers (tolerance), strings
  (trimmed)
- Posts count spot-check (legacy sub-collection vs V3 top-level)
- Per-user status: pass / fail / warn / missing

**Exit code:** `1` if critical failures, `0` otherwise (or `1` in `--strict`
mode on warnings).

**Report:** `backend/reports/migration/validation-YYYY-MM-DD.json`

### Phase 6 — Migrate Storage

```bash
# Step 1: Analyze legacy bucket structure
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=analyze

# Step 2: Copy files (dry run first)
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=copy --dry-run
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=copy --prefix=profileImages/
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=copy

# Step 3: Rewrite URLs in V3 Firestore docs
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=rewrite --dry-run
npx tsx scripts/migration/migrate-storage-to-v2.ts --mode=rewrite --target=staging
```

**Reports:**
`backend/reports/migration/storage-{analysis|copy|rewrite}-YYYY-MM-DD.json`

---

## Reports

All scripts write structured JSON reports to:

```
backend/reports/migration/
├── legacy-analysis-2025-07-14.json
├── teamcodes-migration-2025-07-14.json
├── users-migration-2025-07-14.json
├── content-migration-2025-07-14.json
├── validation-2025-07-14.json
├── storage-analysis-2025-07-14.json
├── storage-copy-2025-07-14.json
└── storage-rewrite-2025-07-14.json
```

> The `reports/migration/` directory is auto-created by `writeReport()`.

---

## Idempotency & Safety

- **All writes use `set({ merge: true })`** — re-running a phase won't overwrite
  fields that have been updated since migration.
- **`--dry-run`** is always safe — no Firestore/Storage writes occur.
- **`--resume`** (Phase 2) picks up where it left off using cursor-based
  pagination.
- Every migrated document includes metadata:
  ```json
  {
    "_schemaVersion": 3,
    "_legacyId": "original-doc-id",
    "_migratedAt": "2025-07-14T12:00:00.000Z",
    "_migratedFrom": "nxt-1-de054"
  }
  ```

---

## Rollback

Since all writes use `merge: true`, there's no destructive overwrite. To truly
roll back:

1. **Staging:** Delete the V3 collections and re-run from Phase 5.
2. **Production:** Use Firestore's point-in-time recovery (PITR) — available
   within 7 days of the operation.

**Storage rollback:** Files are copied, not moved. Legacy bucket is untouched.

---

## Production Checklist

- [ ] Run Phase 1, review analysis report
- [ ] Run Phase 5 on staging, verify Organizations/Teams created
- [ ] Run Phase 2 on staging with `--limit=100`, spot-check
- [ ] Run Phase 2 on staging (full)
- [ ] Run Phase 3 on staging (all collections)
- [ ] Run Phase 4 on staging — **must pass** (0 critical failures)
- [ ] Run Phase 6 (analyze → copy → rewrite) on staging
- [ ] Manual QA: Load 10 profiles in V3 web app, verify data
- [ ] Switch `--target=production` and repeat all phases
- [ ] Run Phase 4 on production — **must pass**
- [ ] Update application config to point to V3 collections
- [ ] Monitor error rates for 48 hours
