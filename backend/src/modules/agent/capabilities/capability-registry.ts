/**
 * @fileoverview Capability Registry — Live, Self-Generated Capability Card
 * @module @nxt1/backend/modules/agent/capabilities
 *
 * Single source of truth for "what can Agent X do RIGHT NOW?" — auto-generated
 * at boot from the live ToolRegistry, SkillRegistry, and the coordinator
 * inventory. Never written by hand. Never copy-pasted into prompts.
 *
 * The Primary Agent injects the COMPACT card into its system prompt every
 * turn (cacheable via OpenRouter prompt cache, keyed by `versionHash`).
 * The DETAILED card is exposed via the `whoami_capabilities` tool so the
 * model can answer deep "what can you do?" questions on demand.
 *
 * Versioning: every snapshot carries a 32-bit FNV-1a content hash. When the
 * underlying registries change (tool registered/unregistered, coordinator
 * UI override updated, etc.) callers can call `refresh()` to rebuild and
 * the hash will bump — invalidating downstream prompt caches automatically.
 */

import type { ToolRegistry } from '../tools/tool-registry.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { AgentDescriptor, AgentIdentifier, AgentToolDefinition } from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import { getCachedAgentAppConfig } from '../config/agent-app-config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompactToolEntry {
  readonly name: string;
  readonly oneLiner: string;
  readonly category?: string;
  readonly isMutation: boolean;
}

export interface CompactSkillEntry {
  readonly name: string;
  readonly oneLiner: string;
}

export interface CompactCoordinatorEntry {
  readonly id: AgentIdentifier;
  readonly name: string;
  readonly oneLiner: string;
  readonly capabilities: readonly string[];
}

export interface CapabilityCard {
  /** Stable content hash — bumps when any underlying registry mutates. */
  readonly versionHash: string;
  /** When this snapshot was built (epoch ms). */
  readonly builtAtMs: number;
  /** Compact form (default in the system prompt). One line per item. */
  readonly compact: {
    readonly coordinators: readonly CompactCoordinatorEntry[];
    readonly tools: readonly CompactToolEntry[];
    readonly skills: readonly CompactSkillEntry[];
  };
  /** Detailed form (exposed via `whoami_capabilities` on demand). */
  readonly detailed: {
    readonly coordinators: readonly AgentDescriptor[];
    readonly tools: readonly AgentToolDefinition[];
    readonly skills: readonly CompactSkillEntry[];
  };
  /** Pre-rendered markdown blocks ready for prompt injection. */
  readonly rendered: {
    readonly compactMarkdown: string;
    readonly detailedMarkdown: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function firstSentence(text: string, maxChars = 140): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return '';
  const sentenceEnd = /[.!?](\s|$)/.exec(trimmed);
  const cut = sentenceEnd ? trimmed.slice(0, sentenceEnd.index + 1) : trimmed;
  return cut.length > maxChars ? `${cut.slice(0, maxChars - 1).trimEnd()}…` : cut;
}

// ─── Registry ────────────────────────────────────────────────────────────────

export class CapabilityRegistry {
  private snapshot: CapabilityCard | null = null;
  private readonly listeners = new Set<(card: CapabilityCard) => void>();
  private autoRefreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry?: SkillRegistry
  ) {}

  /** Build (or rebuild) the capability card. Cheap; safe to call frequently. */
  refresh(): CapabilityCard {
    const tools = this.toolRegistry.getDefinitions();

    const coordinatorDescriptors = COORDINATOR_AGENT_IDS.map((id) => {
      const cfg = getCachedAgentAppConfig().coordinators.find((c) => c.id === id);
      return cfg
        ? ({
            id: cfg.id,
            name: cfg.name,
            description: cfg.description,
            ...(cfg.icon ? { icon: cfg.icon } : {}),
            capabilities: cfg.capabilities,
          } as AgentDescriptor)
        : null;
    }).filter((d): d is AgentDescriptor => d !== null);

    const compactCoordinators: CompactCoordinatorEntry[] = coordinatorDescriptors.map((d) => ({
      id: d.id,
      name: d.name,
      oneLiner: firstSentence(d.description),
      capabilities: d.capabilities,
    }));

    const compactTools: CompactToolEntry[] = tools.map((t) => ({
      name: t.name,
      oneLiner: firstSentence(t.description),
      ...(t.category ? { category: t.category } : {}),
      isMutation: t.isMutation,
    }));

    const compactSkills: CompactSkillEntry[] = (this.skillRegistry?.listAll() ?? []).map(
      (name) => ({
        name,
        oneLiner: firstSentence(this.skillRegistry?.get(name)?.description ?? ''),
      })
    );

    const compactMarkdown = renderCompactMarkdown({
      coordinators: compactCoordinators,
      tools: compactTools,
      skills: compactSkills,
    });

    const detailedMarkdown = renderDetailedMarkdown({
      coordinators: coordinatorDescriptors,
      tools,
      skills: compactSkills,
    });

    // Hash payload — covers shape, names, descriptions, mutation flags.
    const hashPayload = JSON.stringify({
      c: compactCoordinators.map((c) => [c.id, c.name, c.capabilities.length, c.oneLiner]),
      t: compactTools.map((t) => [t.name, t.isMutation, t.category, t.oneLiner.length]),
      s: compactSkills.map((s) => s.name),
    });
    const versionHash = fnv1a(hashPayload);

    const card: CapabilityCard = Object.freeze({
      versionHash,
      builtAtMs: Date.now(),
      compact: Object.freeze({
        coordinators: Object.freeze(compactCoordinators),
        tools: Object.freeze(compactTools),
        skills: Object.freeze(compactSkills),
      }),
      detailed: Object.freeze({
        coordinators: Object.freeze(coordinatorDescriptors),
        tools: Object.freeze(tools),
        skills: Object.freeze(compactSkills),
      }),
      rendered: Object.freeze({
        compactMarkdown,
        detailedMarkdown,
      }),
    });

    this.snapshot = card;
    for (const listener of this.listeners) {
      try {
        listener(card);
      } catch {
        /* listener errors are non-fatal */
      }
    }
    return card;
  }

  /** Return the latest snapshot (build if missing). */
  current(): CapabilityCard {
    if (!this.snapshot) return this.refresh();
    return this.snapshot;
  }

  /** Subscribe to refresh events. Returns an unsubscribe function. */
  subscribe(listener: (card: CapabilityCard) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Start a background timer that calls {@link refresh} on a fixed cadence.
   * Idempotent — subsequent calls are no-ops while a timer is active.
   * Reads `cfg.capabilityCard.refreshIntervalMs`; values <= 0 disable.
   * The timer is `unref()`'d so it never blocks process shutdown.
   */
  startAutoRefresh(): void {
    if (this.autoRefreshTimer) return;
    const ms = getCachedAgentAppConfig().capabilityCard?.refreshIntervalMs ?? 0;
    if (!ms || ms <= 0) return;
    this.autoRefreshTimer = setInterval(() => {
      try {
        this.refresh();
      } catch {
        /* refresh errors are non-fatal — old snapshot remains valid */
      }
    }, ms);
    if (typeof this.autoRefreshTimer.unref === 'function') {
      this.autoRefreshTimer.unref();
    }
  }

  /** Stop the auto-refresh timer, if running. */
  stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}

// ─── Markdown Rendering ──────────────────────────────────────────────────────

function renderCompactMarkdown(snapshot: {
  readonly coordinators: readonly CompactCoordinatorEntry[];
  readonly tools: readonly CompactToolEntry[];
  readonly skills: readonly CompactSkillEntry[];
}): string {
  const lines: string[] = [];

  lines.push('## Specialist Coordinators');
  for (const c of snapshot.coordinators) {
    lines.push(`- **${c.name}** (\`${c.id}\`): ${c.oneLiner}`);
  }
  lines.push('');

  lines.push('## Available Tools');
  const byCategory = new Map<string, CompactToolEntry[]>();
  for (const tool of snapshot.tools) {
    const key = tool.category ?? 'general';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(tool);
  }
  for (const [category, tools] of [...byCategory.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`### ${category}`);
    for (const t of tools) {
      const mut = t.isMutation ? ' [mutates]' : '';
      lines.push(`- \`${t.name}\`${mut} — ${t.oneLiner}`);
    }
  }
  lines.push('');

  if (snapshot.skills.length > 0) {
    lines.push('## Domain Skills');
    for (const s of snapshot.skills) {
      lines.push(`- **${s.name}** — ${s.oneLiner}`);
    }
  }

  return lines.join('\n');
}

function renderDetailedMarkdown(snapshot: {
  readonly coordinators: readonly AgentDescriptor[];
  readonly tools: readonly AgentToolDefinition[];
  readonly skills: readonly CompactSkillEntry[];
}): string {
  const lines: string[] = [];

  lines.push('# Agent X Live Capability Manifest');
  lines.push('');
  lines.push('## Specialist Coordinators');
  for (const c of snapshot.coordinators) {
    lines.push(`### ${c.name} (\`${c.id}\`)`);
    lines.push(c.description);
    if (c.capabilities.length > 0) {
      lines.push(`Capabilities: ${c.capabilities.map((cap) => `\`${cap}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Tools');
  for (const t of snapshot.tools) {
    lines.push(`### \`${t.name}\``);
    lines.push(t.description);
    lines.push(`- Mutation: ${t.isMutation ? 'yes' : 'no'}`);
    if (t.category) lines.push(`- Category: ${t.category}`);
    lines.push('');
  }

  if (snapshot.skills.length > 0) {
    lines.push('## Domain Skills');
    for (const s of snapshot.skills) {
      lines.push(`- **${s.name}** — ${s.oneLiner}`);
    }
  }

  return lines.join('\n');
}
