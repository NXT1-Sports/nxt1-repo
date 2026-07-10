export type UsageEventCostProjection = {
  readonly metadata?: Record<string, unknown>;
  readonly unitCostSnapshot?: number;
  readonly quantity?: number;
};

function readChargeBreakdownTotalCents(metadata?: Record<string, unknown>): number | null {
  const breakdown = metadata?.['chargeBreakdown'];
  if (!Array.isArray(breakdown)) return null;

  let total = 0;
  let hasAny = false;
  for (const line of breakdown) {
    if (!line || typeof line !== 'object') continue;
    const cents = (line as Record<string, unknown>)['chargeAmountCents'];
    if (typeof cents !== 'number' || !Number.isFinite(cents)) continue;
    total += Math.round(cents);
    hasAny = true;
  }

  return hasAny ? total : null;
}

export function resolveUsageEventCostCents(event: UsageEventCostProjection): number {
  const fromBreakdown = readChargeBreakdownTotalCents(event.metadata);
  if (fromBreakdown != null) return fromBreakdown;

  if (
    typeof event.unitCostSnapshot === 'number' &&
    Number.isFinite(event.unitCostSnapshot) &&
    typeof event.quantity === 'number' &&
    Number.isFinite(event.quantity)
  ) {
    return Math.round(event.unitCostSnapshot * event.quantity);
  }

  const verified = event.metadata?.['heliconeVerifiedCostCents'];
  return typeof verified === 'number' && Number.isFinite(verified) ? Math.round(verified) : 0;
}
