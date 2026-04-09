# TODO: Team Roster Entry Approvals

**Status:** Backend Service Exists, Missing API & UI

## Context

The platform's database has a `RosterEntries` collection which serves as the
junction table connecting Users to Teams. Currently, entries are created
automatically by an internal scraper pipeline for public school rosters (e.g.,
`source: "scraper"`, `status: "pending"`). The intended workflow for team
management requires verified coaches to log in, view pending athletes, and
"Approve" them to join the team.

## Current State

- **Backend Service:** `RosterEntryService.approveRosterEntry()` exists in
  `backend/src/services/roster-entry.service.ts` and handles status updates and
  logging the approver.
- **Missing API:** There are no API router endpoints exposing this service
  method to the frontend.
- **Missing UI:** The Angular/Ionic UI under `@nxt1/ui` does not have an
  interface for coaches to view "Pending" members or a button to trigger the
  approval process.

## Action Items

- [ ] **Backend:** Add an endpoint (e.g.,
      `POST /api/v1/teams/:teamId/roster/:entryId/approve`) that calls
      `RosterEntryService.approveRosterEntry()`.
- [ ] **Frontend Core:** Add the corresponding API method to `@nxt1/core` API
      factory (e.g., `manage-team.api.ts`).
- [ ] **Frontend UI:** Build out the component to list pending approvals for a
      coach's team.
- [ ] **Frontend UI:** Wire up the "Approve" button to call the API endpoint.
