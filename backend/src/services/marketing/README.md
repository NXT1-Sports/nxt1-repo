# Marketing Service Domain

This folder is the long-term backend domain for lifecycle messaging, campaigns,
audience workflows, and related marketing operations.

## Purpose

- Provide one stable backend boundary for outbound marketing communication.
- Keep campaign logic, templates, and provider integrations in one place.
- Make provider selection pluggable so campaign code is transport-agnostic.

## Folder Structure

```
backend/src/services/marketing/
├── lifecycle/                      # Cross-channel lifecycle orchestration
├── email/                          # Email-specific marketing assets
│   ├── campaigns/                  # Campaign orchestration logic
│   │   ├── b2b/                    # B2B partner awareness campaigns
│   │   └── legacy/                 # Legacy campaign implementations
│   │   ├── signup/                 # Signup drip campaign variants
│   │   └── welcome/                # Immediate signup welcome email
│   ├── templates/                  # HTML/email templates
│   ├── providers/                  # Email provider adapters and registry
│   └── outbound-email.service.ts   # Single send boundary for callers
├── index.ts                        # Public exports for this domain
└── README.md
```

## Architecture

Callers should only use outbound-email.service.ts.

- Campaigns build message content and context.
- Outbound service validates input and delegates transport.
- Provider registry selects adapter using MARKETING_EMAIL_PROVIDER.
- Provider adapters implement the send contract.

This keeps route and campaign code independent from provider-specific APIs.

## Provider Agnostic Contract

Provider adapters must implement:

- key: provider identity
- send(input): dispatch one outbound message and return provider result metadata

Current adapters:

- platform SMTP adapter
- Brevo transactional API adapter

Operational lifecycle routing:

- `SLACK_ALERT_WEBHOOK_URL` remains the generic fallback webhook
- `SLACK_NEW_ATHLETES_WEBHOOK_URL` routes athlete signup alerts
- `SLACK_NEW_TEAMS_WEBHOOK_URL` routes team/staff signup alerts

App Hosting secret names:

- Production: `SLACK_NEW_ATHLETES_WEBHOOK_URL`, `SLACK_NEW_TEAMS_WEBHOOK_URL`
- Staging: `STAGING_SLACK_NEW_ATHLETES_WEBHOOK_URL`,
  `STAGING_SLACK_NEW_TEAMS_WEBHOOK_URL`

## Signup Lifecycle

The signup lifecycle now has two backend-owned phases:

- Immediate completion lifecycle in
  `lifecycle/completed-signup-lifecycle.service.ts`
  - sends the dedicated Slack signup alert
  - sends the role-aware welcome email
  - enrolls the user into the smart signup drip state machine
- Daily smart drip evaluation in `lifecycle/signup-drip.service.ts`
  - reads durable backend signals only
  - branches by athlete vs team/staff track
  - branches by unpaid vs paid/org-covered billing state
  - skips setup nudges once profile enrichment already happened
  - skips Agent X activation nudges once Agent X is already active

Current drip cadence:

- Day 3: profile/setup follow-up
- Day 7: Agent X activation follow-up
- Day 14: re-engagement/value or conversion follow-up depending on billing state

Backend cron endpoint:

- `POST /api/v1/marketing/cron/signup-drip`

Cloud Scheduler entry point:

- `apps/functions/src/scheduled/signupDrip.ts`

## Configuration

Base selector:

- MARKETING_EMAIL_PROVIDER=platform_smtp or brevo

Brevo adapter env:

- BREVO_API_KEY
- BREVO_SENDER_EMAIL (optional)
- BREVO_SENDER_NAME (optional)
- BREVO_API_BASE_URL (optional; defaults to Brevo v3 API)

## Conventions

- New email campaign logic goes under email/campaigns/
- Lifecycle orchestration that coordinates email plus operational alerts goes
  under lifecycle/
- Shared email templates go under email/templates/
- Never call provider SDK/API directly from routes or campaigns
- Use the centralized outbound service for every marketing send path

## Current Manual Campaigns

- B2B partner brand awareness:
  `npm run email:b2b-partner:dry-run --prefix backend`
- Send B2B partner brand awareness:
  `npm run email:b2b-partner:send --prefix backend`

## Scope for Future Growth

This domain is intended to expand for:

- Campaign scheduling and cadence control
- Audience segmentation and targeting
- A/B testing and variant management
- Delivery analytics and attribution hooks
- Provider failover and routing policies
- Channel expansion (email, SMS, push) via adapter boundaries
