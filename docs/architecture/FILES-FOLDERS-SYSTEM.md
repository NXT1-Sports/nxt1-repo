# Files And Folders System

This document explains how the NXT1 files and folders system works as of
June 2026.

The short version:

- Team Files and personal workspace files are the source of truth for saved
  artifacts.
- Saved artifacts live in `UniversalFiles`.
- Folder hierarchy lives in `TeamFileFolders`.
- Agent X should read, organize, create, update, and share files through this
  system.
- Legacy parallel playbook storage is not the primary workflow.

## Core Mental Model

NXT1 has one file-library system that supports both:

- personal workspace files
- team workspace files

The system is not just a binary upload bucket. It stores:

- uploaded files such as PDFs, CSVs, videos, images, and docs
- structured strategy documents such as playbooks, callsheets, practice scripts,
  and game plans
- derivative artifacts such as notes, summaries, classifications, and
  AI-generated metadata
- folder organization and direct sharing rules
- semantic sync metadata used to power retrieval and search

In practice, this means a coach can:

1. upload a playbook PDF, CSV, image set, or similar file
2. keep it inside the workspace file library
3. ask Agent X to read it, analyze it, generate notes, or build derivative
   artifacts
4. save those derivatives back into the same workspace system
5. organize the results into folders and share them

## Storage Model

### `UniversalFiles`

`UniversalFiles` is the main collection for saved files and saved structured
documents.

Each record can represent one of these types:

- `file`
- `film_review`
- `game_plan`
- `playbook`
- `callsheet`
- `practice_script`

Common fields include:

- `id`
- `teamId` when the artifact belongs to a team workspace
- `organizationId` when relevant
- `type`
- `documentSubtype`
- `classification`
- `title`
- `normalizedTitle`
- `status`
- `sport`
- `summary`
- `tags`
- `folderId`
- `thumbnailUrl`
- `ownerUserId`
- `createdByUserId`
- `updatedByUserId`
- `readAccessKeys`
- `writeAccessKeys`
- `acl`
- `semanticSync`
- `sourceRef`
- `createdAt`
- `updatedAt`

### `TeamFileFolders`

`TeamFileFolders` stores the folder tree used by the file library.

Important fields include:

- `id`
- `teamId` for team-scoped folders
- `organizationId` when relevant
- `name`
- `normalizedName`
- `parentId`
- `sortOrder`
- `acl`
- `readAccessKeys`
- `writeAccessKeys`
- `createdByUserId`
- `createdAt`
- `updatedAt`

Folders form a hierarchy through `parentId`. A file or document is placed in a
folder by setting `folderId` on the `UniversalFiles` record.

## Scope Model

The system supports two major workspace modes:

- personal scope
- team scope

Personal scope is the default when the user is working in their own workspace
and has not explicitly switched to a team artifact.

Team scope is used when:

- the user explicitly asks to work inside team files
- the selected artifact already belongs to a team
- the surrounding workflow clearly belongs to a team strategy context

This is one unified system, not two unrelated products. The difference is scope
and access control, not a separate architecture.

## Native Files, Pointer Files, And Structured Documents

### Native file records

Native file records store payload data directly in the `UniversalFiles` record.

For uploaded binary assets, the payload can include:

- `mimeType`
- `kind`
- `origin`
- `sizeBytes`
- `url`
- `storagePath`
- `thumbnailUrl`
- platform-specific media fields

Typical origins are:

- `files_upload`
- `agent_chat_input`
- `agent_chat_output`

### Pointer-backed file records

Some `file` records are pointers instead of raw editable documents.

Pointer records use:

- `payloadKind: "pointer"`
- a payload with `documentId`, `collectionName`, and optional `preview`

These records are useful when the file library is surfacing another underlying
object without copying the whole object into a second schema.

Important rule:

- pointer-backed uploads or specialized artifacts should not be treated as raw
  editable text documents unless the owning workflow explicitly supports that
  behavior

### Structured documents

Structured strategy documents are first-class saved records in the same library.

Current structured document subtypes include:

- `game_plan`
- `playbook`
- `callsheet`
- `practice_script`

These are not a separate hidden database. They are saved Team Files or personal
workspace files that happen to have structured payloads and consistent
classification.

## Classification And Routing

Each saved record can include `classification` metadata that helps Agent X and
the backend understand what the artifact is.

Important classification fields:

- `primary`
- `route`
- `labels`
- optional `facets`

Examples:

- playbook: `route: "playbook"`
- callsheet: `route: "callsheet"`
- practice script: `route: "practice_script"`
- game plan: `route: "game_plan"`
- scout report: `route: "scout_report"`
- opponent report: `route: "opponent_report"`
- install sheet: `route: "install_sheet"`
- weekly plan: `route: "weekly_plan"`

This routing metadata is what lets Agent X list or inspect the correct saved
artifacts without pretending there is a second parallel playbook store.

## Access Control And Sharing

The system supports direct access control on both folders and documents.

### Access keys

Both folders and files can carry:

- `readAccessKeys`
- `writeAccessKeys`

These are the fast, flattened access-control surfaces used during authorization
checks.

### ACL object

Folders and files may also carry an `acl` object with:

- `version`
- `mode`
- `sourceFolderId`
- `grants`
- `readKeys`
- `manageKeys`

The main ACL modes are:

- `explicit`
- `copied_from_folder`

Practical meaning:

- some files have explicitly assigned sharing rules
- some files inherit or copy access behavior from the folder they live in

### Folder inheritance

When folders are created or files are moved, access rules can be copied or
derived from the folder context.

This is why folder organization is not cosmetic. Moving a file can affect who
can read or edit it.

### Mutation gate

Folder and file mutations are permission-gated.

The important operational rule is:

- listing folders is not enough by itself to assume the user can reorganize
  everything
- callers should respect returned mutation permissions and only invoke create,
  move, rename, share, or delete operations when the user has the right access

## Semantic Sync And Search

Each file can carry a `semanticSync` block that tracks the relationship between
the saved file and semantic indexing/search.

Fields include:

- `status`
- `documentId`
- `contentHash`
- `version`
- `chunkCount`
- `lastAttemptAt`
- `syncedAt`
- `error`

Supported statuses are:

- `pending`
- `synced`
- `failed`
- `skipped`

This is the bridge between the visible file library and semantic retrieval. In
product terms:

- users save files in the workspace
- the platform can semantically index them
- Agent X can then search and reason over those saved artifacts

That is why Team Files and semantic search are complementary parts of one
system, not competing models.

## Agent X Workflow Rules

Agent X should treat this system as the primary save surface for user and team
artifacts.

### When the user wants to inspect saved strategy context

Agent X should prefer the saved-file/document workflow:

- list relevant saved documents
- inspect the selected document
- parse uploaded assets when needed
- use semantic retrieval where appropriate

It should not assume there is a separate hidden playbook database to read from.

### When the user wants to save a new artifact

Agent X should persist new strategy artifacts into the file system as Team Files
or personal workspace files.

Examples:

- playbooks
- game plans
- callsheets
- practice scripts
- scout reports
- opponent reports
- install sheets
- weekly plans
- checklists

### When the user wants notes added to the same selected file

There is a critical difference between:

- creating a new derivative document
- enriching the currently selected file record in place

If the user asks for notes, summary, key takeaways, or coaching annotations to
be saved back onto the same selected file, the system should update artifact
metadata on that same record instead of creating a second duplicate document.

Important artifact metadata fields include:

- `artifactSummary`
- `artifactNotes`
- `artifactTags`
- `artifactStatus`
- `artifactGeneratedAt`
- optional `artifactClassification`

This is how "generate notes on this file" should work.

### When the user wants to organize the library

Library organization should use the folder workflow:

1. inspect current folders
2. inspect current files/documents
3. create or rename folders as needed
4. move files into the correct folders
5. adjust sharing where required
6. delete obsolete folders only after contents are moved or the folder is
   confirmed empty

## Practical Examples

### Example 1: Coach uploads a playbook PDF

1. the uploaded PDF is saved as a `UniversalFiles` record
2. it may be placed in a team folder such as `Offense/Install`
3. semantic sync can index the contents
4. Agent X can parse the file and answer questions about it
5. if the coach asks for notes saved onto that same file, the record is enriched
   in place
6. if the coach asks for a new callsheet or practice script, that derivative is
   saved as a new structured document in the same system

### Example 2: Coach asks for a practice script from existing strategy material

1. Agent X reads the relevant Team Files strategy document
2. it generates a practice script draft from that source context
3. the finished script is saved as a `practice_script` document in
   `UniversalFiles`
4. the script can keep `sourceDocumentId` pointing back to the originating
   strategy file

### Example 3: Coach reorganizes the library

1. Agent X lists the folder tree
2. it creates missing folders if needed
3. it moves files by updating folder placement
4. it preserves or updates sharing rules based on folder and file access
   configuration

## What This Replaces

This system replaces the old mental model where saved strategy material lived in
a separate dedicated playbook CRUD surface.

The current product truth is:

- the user-facing workflow is files and folders
- semantic search is built on top of saved files
- strategy artifacts are saved into the same workspace system
- Agent X should operate through the file library and universal document
  surfaces

## Implementation Guidance

When adding or changing features, follow these rules:

- use `UniversalFiles` as the primary saved-artifact surface
- use `TeamFileFolders` for library hierarchy
- use classification `route` values consistently
- preserve `sourceDocumentId` links when generating derivatives from saved
  strategy files
- treat selected-file note generation as in-place metadata enrichment when the
  user asks for notes on the same file
- do not introduce a second hidden persistence path for playbooks or similar
  strategy artifacts
- treat semantic indexing as an extension of the file system, not a replacement
  for it

## Current Tooling Surfaces

At the agent/tooling layer, the system is exposed through two main categories.

### Library organization tools

- `list_team_file_folders`
- `create_team_file_folder`
- `update_team_file_folder`
- `delete_team_file_folder`
- `move_universal_file_to_folder`

### Saved document tools

- `list_universal_team_documents`
- `get_universal_team_document`
- `create_universal_team_document`
- `update_universal_team_document`
- `delete_universal_team_document`

These surfaces should be considered the normal way Agent X works with files,
folders, and saved strategy artifacts.
