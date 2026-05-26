# Communications Service Domain

This folder contains non-marketing communication flows and shared delivery
infrastructure for backend messaging.

## Structure

```
backend/src/services/communications/
├── agent-jobs/                 # Agent X operational email flows
│   ├── email/
│   └── README.md
├── connected-mail.service.ts   # Tracked outbound HTML helpers
├── messages.service.ts         # In-app or platform message flows
├── notification.service.ts     # Notification orchestration
├── platform-email.service.ts   # Shared transactional SMTP send boundary
├── rich-content-formatting.ts  # Shared content formatting helpers
└── team-join-notifications.ts  # Team invitation / join notifications
```

## Conventions

- Keep operational support emails out of `services/marketing`.
- Group feature-specific communication flows under their own subdomain folder.
- Keep shared transport and cross-domain helpers at the communications root.
- Do not leave empty placeholder folders behind after moving templates or
  services.
