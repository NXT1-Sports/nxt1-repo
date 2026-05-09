import sys

filepath = "packages/ui/src/agent-x/components/chat/agent-x-operation-chat-session.facade.ts"

with open(filepath, 'r') as f:
    content = f.read()

original_len = len(content)

# ── Fix 1: Replace building loop with type-split version ──
old1 = (
    "    // Interruption operations (ask_user / approval / pause) are active turns.\n"
    "    // Keep their historical assistant trajectory intact on reload so earlier\n"
    "    // progress text does not disappear when the latest yielded card is shown.\n"
    "    const yieldedOperationIds = new Set<string>();\n"
    "    for (const item of items) {\n"
    "      if (item.role !== 'assistant') continue;\n"
    "      const opId = typeof item.operationId === 'string' ? item.operationId.trim() : '';\n"
    "      if (!opId) continue;\n"
    "\n"
    "      const semanticYield = item.semanticPhase === 'assistant_yield';\n"
    "      const persistedYieldState = this.coercePersistedYieldState(item.resultData?.['yieldState']);\n"
    "      const pendingApprovalCard = (item.parts ?? []).some(\n"
    "        (part) =>\n"
    "          part.type === 'card' &&\n"
    "          part.card.type === 'confirmation' &&\n"
    "          !!this.coercePersistedYieldState(\n"
    "            (part.card.payload as Record<string, unknown> | undefined)?.['yieldState']\n"
    "          )\n"
    "      );\n"
    "      const pendingAskUserCard = (item.parts ?? []).some(\n"
    "        (part) => part.type === 'card' && part.card.type === 'ask_user'\n"
    "      );\n"
    "\n"
    "      if (semanticYield || persistedYieldState || pendingApprovalCard || pendingAskUserCard) {\n"
    "        yieldedOperationIds.add(opId);\n"
    "      }\n"
    "    }"
)

new1 = (
    "    // Interruption operations (ask_user / approval / pause) are active turns.\n"
    "    // needs_input (ask_user): card-only replacement — suppress prior trajectory.\n"
    "    // needs_approval: inline card alongside tool steps — keep prior trajectory.\n"
    "    const yieldedOperationIds = new Set<string>();\n"
    "    const inputYieldedOpIds = new Set<string>();    // needs_input only\n"
    "    const approvalYieldedOpIds = new Set<string>(); // needs_approval only\n"
    "    for (const item of items) {\n"
    "      if (item.role !== 'assistant') continue;\n"
    "      const opId = typeof item.operationId === 'string' ? item.operationId.trim() : '';\n"
    "      if (!opId) continue;\n"
    "\n"
    "      const semanticYield = item.semanticPhase === 'assistant_yield';\n"
    "      const persistedYieldState = this.coercePersistedYieldState(item.resultData?.['yieldState']);\n"
    "      // Raw reason: works without pendingToolCall so assistant_yield rows\n"
    "      // written without the full yieldState shape are still classified.\n"
    "      const rawYieldReason = (\n"
    "        item.resultData?.['yieldState'] as Record<string, unknown> | undefined\n"
    "      )?.['reason'];\n"
    "      // Any 'confirmation' card = approval yield (no payload validation needed).\n"
    "      const pendingApprovalCard = (item.parts ?? []).some(\n"
    "        (part) => part.type === 'card' && part.card.type === 'confirmation'\n"
    "      );\n"
    "      const pendingAskUserCard = (item.parts ?? []).some(\n"
    "        (part) => part.type === 'card' && part.card.type === 'ask_user'\n"
    "      );\n"
    "\n"
    "      if (semanticYield || persistedYieldState || pendingApprovalCard || pendingAskUserCard) {\n"
    "        yieldedOperationIds.add(opId);\n"
    "        const isApproval =\n"
    "          pendingApprovalCard ||\n"
    "          persistedYieldState?.reason === 'needs_approval' ||\n"
    "          rawYieldReason === 'needs_approval';\n"
    "        if (isApproval) {\n"
    "          approvalYieldedOpIds.add(opId);\n"
    "        } else {\n"
    "          inputYieldedOpIds.add(opId);\n"
    "        }\n"
    "      }\n"
    "    }"
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("Fix 1 OK: building loop")
else:
    print("Fix 1 FAILED: building loop not found")
    sys.exit(1)

# ── Fix 2: Add Pass 2c before Pass 3 ──
old2 = (
    "    // ── Pass 3: legacy rows (no semanticPhase) ───────────────────────────\n"
    "    // Collect operationIds that appear on multiple untagged assistant rows.\n"
    "    const legacyMultiMap = new Map<string, AgentMessage[]>();"
)

new2 = (
    "    // ── Pass 2c: collapse tool_call rows for completed approval ops ─────────\n"
    "    // Approval flows accumulate tool_call rows before the yield point. When the\n"
    "    // operation later completes (assistant_final exists), keep only the LAST\n"
    "    // tool_call so pre-approval context renders as one clean bubble above the final.\n"
    "    const completedApprovalToolCallSuppressedIds = new Set<string>();\n"
    "    {\n"
    "      const lastSeenToolCall = new Map<string, string>(); // operationId → id\n"
    "      for (const item of items) {\n"
    "        if (\n"
    "          item.role === 'assistant' &&\n"
    "          item.semanticPhase === 'assistant_tool_call' &&\n"
    "          item.operationId &&\n"
    "          approvalYieldedOpIds.has(item.operationId) &&\n"
    "          finalOperationIds.has(item.operationId)\n"
    "        ) {\n"
    "          const prev = lastSeenToolCall.get(item.operationId);\n"
    "          if (prev) completedApprovalToolCallSuppressedIds.add(prev);\n"
    "          lastSeenToolCall.set(item.operationId, item.id);\n"
    "        }\n"
    "      }\n"
    "    }\n"
    "\n"
    "    // ── Pass 3: legacy rows (no semanticPhase) ───────────────────────────\n"
    "    // Collect operationIds that appear on multiple untagged assistant rows.\n"
    "    const legacyMultiMap = new Map<string, AgentMessage[]>();"
)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Fix 2 OK: Pass 2c added")
else:
    print("Fix 2 FAILED: Pass 3 start not found")
    sys.exit(1)

# ── Fix 3: Change yieldedOperationIds suppression to inputYieldedOpIds ──
old3 = (
    "      // Yield operations should render as card-only interruptions in chat.\n"
    "      // Suppress all non-yield assistant trajectory rows for those operation ids\n"
    "      // (tool-call prose, partial snapshots, etc.) so no tool-call row appears.\n"
    "      if (item.operationId && yieldedOperationIds.has(item.operationId)) {\n"
    "        return false;\n"
    "      }"
)

new3 = (
    "      // ask_user (needs_input) operations render as card-only interruptions.\n"
    "      // Suppress prior trajectory for input ops only.\n"
    "      // needs_approval ops keep their tool steps visible alongside the card.\n"
    "      if (item.operationId && inputYieldedOpIds.has(item.operationId)) {\n"
    "        return false;\n"
    "      }"
)

if old3 in content:
    content = content.replace(old3, new3, 1)
    print("Fix 3 OK: yield suppression -> inputYieldedOpIds")
else:
    print("Fix 3 FAILED: yield suppression block not found")
    sys.exit(1)

# ── Fix 4: finalOperationIds — keep tool_calls for completed approval ops ──
old4 = (
    "      // When assistant_final exists for this operationId, keep only the final\n"
    "      // row. Suppress everything else — including assistant_partial snapshots\n"
    "      // and untagged trajectory rows written by ThreadMessageWriter — to\n"
    "      // prevent duplicate bubbles with repeated media/cards.\n"
    "      if (item.operationId && finalOperationIds.has(item.operationId)) {\n"
    "        return item.semanticPhase === 'assistant_final';\n"
    "      }"
)

new4 = (
    "      // When assistant_final exists for this operationId, keep only the final\n"
    "      // row. Suppress everything else — including assistant_partial snapshots\n"
    "      // and untagged trajectory rows written by ThreadMessageWriter — to\n"
    "      // prevent duplicate bubbles with repeated media/cards.\n"
    "      //\n"
    "      // Exception: completed approval flows also keep the last tool_call row\n"
    "      // so pre-approval context (search results, step summaries) stays visible.\n"
    "      if (item.operationId && finalOperationIds.has(item.operationId)) {\n"
    "        if (approvalYieldedOpIds.has(item.operationId)) {\n"
    "          return (\n"
    "            item.semanticPhase === 'assistant_final' ||\n"
    "            item.semanticPhase === 'assistant_tool_call'\n"
    "          );\n"
    "        }\n"
    "        return item.semanticPhase === 'assistant_final';\n"
    "      }"
)

if old4 in content:
    content = content.replace(old4, new4, 1)
    print("Fix 4 OK: finalOperationIds approval exception")
else:
    print("Fix 4 FAILED: finalOperationIds check not found")
    sys.exit(1)

# ── Fix 5: Add completedApproval check + partial-supersedes exemption ──
old5 = (
    "      // Suppress all-but-last assistant_tool_call rows (no final path).\n"
    "      if (toolCallSuppressedIds.has(item.id)) return false;\n"
    "\n"
    "      // If a partial snapshot exists for this in-flight operation (and no\n"
    "      // final/yield exists), prefer partial over tool_call so only one\n"
    "      // assistant bubble renders during rehydrate.\n"
    "      // Do not remove without updating the regression test referenced above.\n"
    "      if (\n"
    "        item.semanticPhase === 'assistant_tool_call' &&\n"
    "        item.operationId &&\n"
    "        operationIdsWithPartialNoFinal.has(item.operationId)\n"
    "      ) {\n"
    "        return false;\n"
    "      }"
)

new5 = (
    "      // Suppress all-but-last assistant_tool_call rows (no final path).\n"
    "      if (toolCallSuppressedIds.has(item.id)) return false;\n"
    "\n"
    "      // Suppress earlier tool_call rows for completed approval ops (keep only last).\n"
    "      if (completedApprovalToolCallSuppressedIds.has(item.id)) return false;\n"
    "\n"
    "      // If a partial snapshot exists for this in-flight operation (and no\n"
    "      // final/yield exists), prefer partial over tool_call so only one\n"
    "      // assistant bubble renders during rehydrate.\n"
    "      // Do not remove without updating the regression test referenced above.\n"
    "      //\n"
    "      // Exception: approval flows carry an inline card on the partial row AND\n"
    "      // a separate tool_call showing pre-approval context. Both must render,\n"
    "      // so skip the partial-supersedes-tool_call rule for approval ops.\n"
    "      if (\n"
    "        item.semanticPhase === 'assistant_tool_call' &&\n"
    "        item.operationId &&\n"
    "        operationIdsWithPartialNoFinal.has(item.operationId) &&\n"
    "        !approvalYieldedOpIds.has(item.operationId)\n"
    "      ) {\n"
    "        return false;\n"
    "      }"
)

if old5 in content:
    content = content.replace(old5, new5, 1)
    print("Fix 5 OK: partial-supersedes exemption + completedApproval check")
else:
    print("Fix 5 FAILED: toolCallSuppressedIds block not found")
    sys.exit(1)

with open(filepath, 'w') as f:
    f.write(content)

print(f"Done. File grew by {len(content) - original_len} bytes.")
