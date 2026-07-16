# Agent X Runtime Hardening Roadmap (2026)

> Status: ACTIVE (2026-07-10) Scope: Keep the current TypeScript runtime
> architecture and harden execution quality, reliability, and safety.

## Purpose

This document captures the remaining high-value runtime upgrades after closing
the larger enterprise-architecture and markdown-migration tracks.

## Current Baseline

- Tool retry behavior exists in `BaseAgent.executeToolWithRetry()` for eligible
  non-mutation tool calls.
- Parallel read-only tool execution is implemented via agent tool concurrency in
  the ReAct loop.
- Mid-loop context compression is implemented to bound prompt/token growth in
  long runs.
- Core agent orchestration, queueing, tool routing, and memory are already in
  production.

## Remaining Work

## 1) Automated Guardrail Pipeline (Pre/Post)

- Status: OPEN
- Goal: Enforce safety classifications before routing and before user output.
- Plan: Add centralized guardrail service and integrate in router + final output
  path.

## 2) Evaluation and Regression Pipeline

- Status: OPEN
- Goal: Detect routing/tool-quality regressions before production.
- Plan: Add deterministic eval suites for routing/tool selection plus nightly
  quality evals.

## Success Metrics

- Guardrail block/pass rates are measurable against adversarial and benign test
  sets.
- Eval suite runs on PRs touching agent runtime surfaces.

## Out of Scope

- Migrating agent definitions to markdown-native prompt files.
- Re-opening closed enterprise refactor tracks.
