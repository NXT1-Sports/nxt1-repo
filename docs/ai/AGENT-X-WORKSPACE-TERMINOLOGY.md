# Agent X Workspace Terminology

This note defines the canonical user-facing name for Agent X's saved artifact
workspace.

## Canonical Name

- Primary UI name: "The Lab"
- Secondary product alias: "Files"
- Descriptive/internal alias: "Files panel"

## Rule

Use "The Lab" as the primary user-facing label in prompts, product copy, and UI
headers. Use "Files" only when describing scope, folder ownership, or saved
artifacts such as "your Files" or "shared Files". Use "Files panel" only as an
explanatory alias when disambiguating the UI surface for developers or internal
prompt instructions.

## Why

- The UI already labels this surface as "The Lab".
- The storage model and tools still operate on Files concepts such as folders,
  shared Files, and personal Files scope.
- Keeping one primary user-facing name reduces prompt drift and makes
  help-center explanations easier to maintain.

## Recommended Pattern

1. Deterministic behavior stays in prompts and code.
2. Shared terminology lives in a central constant.
3. Help-center and knowledge-base content explain the concept in longer form.
