# Backend Scripts Directory

Professional organization of all backend utility scripts by function and domain.

## Directory Structure

```
scripts/
├── archive/                  # Deprecated & one-off scripts (safe to delete)
├── config/                   # Configuration & settings updates
├── data-migrations/          # Data backfill, migration, and reconciliation
├── deployments/              # MCP and service deployments
├── email/                    # Email campaign setup & operations
├── migration/                # v1 → v2 legacy data migration
├── utilities/                # Admin, maintenance, and utility operations
└── validation/               # Testing, validation, and introspection
```

## Script Categories

### 📦 `archive/` (3 scripts)

Temporary, one-off, or deprecated scripts. Safe to review and delete.

- `cleanup-analytics-lifecycle-noise.ts`
- `manual-hudl-planner-run.ts`
- `manual-hudl-planner-run-after.ts`

### ⚙️ `config/` (3 scripts)

Configuration updates and settings management.

- `update-planner-prompts-firestore.mjs`
- `update-planner-prompts-firestore.ts`
- `updateRoleUiOverrides.ts`

### 📊 `data-migrations/` (12 scripts)

Backfill operations, data patches, and reconciliation tasks.

- **Backfill**: `backfill-activity-badges.ts`,
  `backfill-agent-message-interactions.ts`
- **Migrate**: `migrate-agent-config.ts`, `migrate-engagement.ts`,
  `migrate-mongo-environment.ts`, `migrate-search-indexes.ts`
- **Patch**: `patch-prod-models.ts`, `patch-staging-models.ts`
- **Reconcile**: `reconcile-team-counters.ts`, `reconcile-usage-events.ts`
- **Maintenance**: `fix-index.ts`, `remove-useprimaryagent-flag.ts`

### 🚀 `deployments/` (7 scripts)

Service and MCP deployments.

- **MCP Deployment**: `deploy-chart-mcp.sh`, `deploy-ffmpeg-mcp.sh`,
  `deploy-microsoft-365-mcp.sh`, `deploy-stateful-mcp.sh`
- **Other**: `deploy-mobile-bundle.ts`, `deploy.sh`

### 📧 `email/` (1 script)

Email campaign and provider operations.

- `setup-brevo-migration-campaign.mjs`

### 🔄 `migration/` (14 scripts)

Legacy v1 → v2 data migration (reference: see `migration/README.md`).

- **Analyze**: `analyze-legacy-metrics.ts`, `analyze-legacy-users.ts`,
  `analyze-legacy-videos.ts`
- **Migrate**: `migrate-legacy-subs-to-usage.ts`, `migrate-metrics-to-root.ts`,
  `migrate-storage-to-v2.ts`, `migrate-team-logos-to-team-path.ts`,
  `migrate-teamcodes-to-v2.ts`, `migrate-user-content-to-v2.ts`,
  `migrate-users-to-v2.ts`, `migrate-videos-to-posts.ts`
- **Utilities**: `migration-utils.ts`, `validate-user-migration.ts`

### 🔧 `utilities/` (3 scripts)

General-purpose admin and maintenance utilities.

- `clear-cache.ts` — Clear cache by prefix
- `configure-storage-cors.sh` — Configure Firebase Storage CORS
- `register-cf-webhook.ts` — Register Cloudflare webhooks

### ✅ `validation/` (3 scripts)

Testing, validation, and introspection scripts.

- `check-agentconfig-prompts.ts` — Validate agent configuration
- `test-introspection.ts` — Test API introspection
- `webhook-server.mjs` — Local webhook server for testing

## Running Scripts

### From Monorepo Root

```bash
# Data migration
node backend/scripts/data-migrations/backfill-activity-badges.ts

# Deployment
bash backend/scripts/deployments/deploy.sh

# Utilities
npx ts-node backend/scripts/utilities/clear-cache.ts

# Email
node backend/scripts/email/setup-brevo-migration-campaign.mjs
```

### From Backend Directory

```bash
cd backend
node scripts/data-migrations/migrate-agent-config.ts
```

## Best Practices

1. **Keep `archive/` clean** — Review periodically and delete obsolete scripts
2. **Document new scripts** — Add inline comments explaining purpose and usage
3. **Use TypeScript** — Prefer `.ts` over `.js` for type safety
4. **Naming conventions**:
   - Backfill: `backfill-*.ts`
   - Migration: `migrate-*.ts`
   - Deployment: `deploy-*.sh` or `deploy-*.ts`
   - Cleanup: `cleanup-*.ts` or `clear-*.ts`
5. **Error handling** — All scripts should handle errors gracefully

## Common Tasks

### Clear Cache

```bash
node scripts/utilities/clear-cache.ts
```

### Repair Email/Password Sign-In

```bash
npm run auth:repair-email-password -- --email user@example.com --password NXT1-Reset7! --target production
npm run auth:repair-email-password -- --email user@example.com --password NXT1-Reset7! --target production --commit
```

The first command is a dry run. It resolves the existing Firebase Auth UID by
email, falls back to the matching `Users` document by email, and prints the
planned account repair without changing Auth. Add `--commit` only after the UID
and Firestore profile match the account you intend to preserve.

### Backfill Activity Badges

```bash
node scripts/data-migrations/backfill-activity-badges.ts
```

### Check Agent Configuration

```bash
node scripts/validation/check-agentconfig-prompts.ts
```

### Swap Agent Model Routing Presets

```bash
# Dry run: stage uses the current production routing preset
npm run model-routing:staging:use-prod-current --workspace=@nxt1/backend

# Commit the same change
npm run model-routing:staging:use-prod-current --workspace=@nxt1/backend -- --commit

# Generic form
npm run model-routing:apply --workspace=@nxt1/backend -- --target=staging --preset=staging-current --commit
```

Available presets:

- `production-current` — Copy of the current production modelRouting block
- `staging-current` — Copy of the current staging/dev modelRouting block

---

**Last organized**: May 10, 2026
