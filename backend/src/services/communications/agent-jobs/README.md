# Agent Job Communications

This folder contains operational email flows related to Agent X background job
failures, recovery attempts, and successful automatic resolutions.

## Purpose

- Keep Agent Job communication flows grouped under one backend boundary.
- Separate transactional support emails from marketing campaigns.
- Mirror the marketing folder structure with a focused `email/` subtree.

## Folder Structure

```
backend/src/services/communications/agent-jobs/
├── email/
│   ├── agent-job-failure-alert.service.ts
│   ├── agent-job-recovery-started-email.service.ts
│   ├── agent-job-resolution-email.service.ts
│   └── templates/
│       └── support-email-template.ts
└── README.md
```

## Conventions

- Failure alerts are internal operational emails.
- Recovery-started and resolution emails are customer-facing support emails.
- Shared email presentation helpers live under `email/templates/`.
- Agent job modules should import from this domain rather than duplicating
  inline email composition logic.
