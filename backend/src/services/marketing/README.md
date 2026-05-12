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
├── email/                          # Email-specific marketing assets
│   ├── campaigns/                  # Campaign orchestration logic
│   │   └── legacy/                 # Legacy campaign implementations
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
- Shared email templates go under email/templates/
- Never call provider SDK/API directly from routes or campaigns
- Use the centralized outbound service for every marketing send path

## Scope for Future Growth

This domain is intended to expand for:

- Campaign scheduling and cadence control
- Audience segmentation and targeting
- A/B testing and variant management
- Delivery analytics and attribution hooks
- Provider failover and routing policies
- Channel expansion (email, SMS, push) via adapter boundaries
