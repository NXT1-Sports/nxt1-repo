# Primary Agent: Single Front-Door Architecture

**Date:** April 28, 2026  
**Status:** Production-Ready (Grade A+)  
**Impact:** Unified conversational and task-planning architecture replacing the
legacy 3-tier pipeline.

---

## Executive Summary

The Agent X routing architecture has been completely upgraded. We have **removed
the legacy 3-agent triage pipeline** (Classifier → Conversation → Planner) and
replaced it with a single, streaming, native tool-calling agent: the **Primary
Agent** (`PrimaryAgent`).

Modeled after OpenAI Assistants v2, Anthropic Computer Use, and Cursor, this
optimization ensures:

- **Single Front-Door**: All requests go through one intelligent agent.
- **Native Tool Calling**: The agent natively decides whether to answer
  directly, perform a lookup, or delegate complex multi-step work.
- **Streaming ReAct Loop**: Seamless execution and yield/approval handling
  without rigid stage-gates.
- **Cost & Latency Optimization**: Factual/conversational queries execute
  instantly in the first loop via fast-path tools, completely bypassing heavy
  planner/coordinator initialization.

---

## Architecture: The Unified Primary Agent

```text
┌──────────────────────────────────────────────────────────────────────┐
│ User sends chat message                                              │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
                   ▼
   ┌───────────────────────────────────────────────┐
   │ Primary Agent (The Single Front-Door)         │
   │ Model: Configurable (defaults to routing tier)│
   │                                               │
   │ Identity: Built from AGENT_X_IDENTITY +       │
   │           CapabilityRegistry + User Summary   │
   └───────────────────────┬───────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────┐
          │ Native Tool Calling (ReAct Loop) │
          └───────────┬─────────────┬────────┘
                      │             │
              [Fast-Path Tool]  [Escalation Tool]
                      │             │
                      ▼             ▼
        ┌──────────────────┐   ┌───────────────────────────┐
        │ Direct Execution │   │ Dispatcher Interception   │
        │                  │   │                           │
        │ - get_user_profile│  │ - delegate_to_coordinator │
        │ - search_web     │   │ - plan_and_execute        │
        │ - search_memory  │   │                           │
        │                  │   │ Throws control-flow       │
        │ Evaluated and    │   │ exception caught by the   │
        │ returned to user │   │ Primary Agent to pause    │
        │ in the same loop.│   │ and route seamlessly.     │
        └──────────────────┘   └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │ Coordinator / DAG Planner │
                               │ executes heavy mutation & │
                               │ generative background jobs│
                               └───────────────────────────┘
```

---

## Implementation Details

### 1. No More Intent Classifier

The legacy `classifyIntentTier` step has been completely removed. We no longer
ask an LLM "is this conversational or complex" before running the actual agent.
Instead, the `PrimaryAgent` is given the user's prompt and a curated list of
tools, and it makes the decision natively via its first tool call (or direct
response).

### 2. Curated Fast-Path Tools

The Primary Agent holds a curated set of read-only or low-risk one-shot tools
(e.g., `get_user_profile`, `search_nxt1_platform`, `search_web`,
`get_active_threads`). It calls these **directly** to answer factual questions,
avoiding hallucination and the latency of delegating a simple lookup to a
coordinator.

### 3. Escalation via Exceptions

Coordinators (Marketing, Scouting, etc.) are **NOT** in the Primary's direct
tool list. Instead, the Primary has access to two orchestration tools:

- `delegate_to_coordinator`: For handing off a specific domain task.
- `plan_and_execute`: For breaking down a massive multi-step request.

When the LLM invokes these tools, the tool execution throws a specific
control-flow exception (`DelegateToCoordinatorException` or
`PlanAndExecuteException`). The `PrimaryAgent` catches this exception, marks the
tool step as completed/delegated in the stream, and effortlessly routes the
execution payload to the `PrimaryDispatcher` to continue the work.

### 4. Wire-Level Compatibility

The internal Agent Identifier remains `id = 'router'` for backward compatibility
with the existing frontend, which keys its 5-phase progress UI off the `router`
agentId. The underlying architecture and class names (`PrimaryAgent`,
`PrimaryDispatcher`) are what have been thoroughly modernized.
