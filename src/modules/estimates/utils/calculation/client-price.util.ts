import { round2 } from '../../estimate.constants';

type DecimalLike = number | { toString(): string };

type PricingFactors = {
  marginPct: DecimalLike | null;
  riskReservePct: DecimalLike | null;
};

/**
 * Multiplier turning internal (net) estimate amounts into the client-facing
 * price. Margin and risk reserve are applied at project level on top of raw
 * line/stage totals (see recalcStageTotals), so any amount leaving the
 * estimate — quote lines, per-stage intervention prices — must be scaled with
 * this factor, otherwise the company silently loses its margin downstream.
 */
export function estimateClientPriceFactor(project: PricingFactors): number {
  const margin = Number(project.marginPct ?? 0);
  const risk = Number(project.riskReservePct ?? 0);
  return (1 + risk / 100) * (1 + margin / 100);
}

export function toClientPrice(amount: DecimalLike, factor: number): number {
  return round2(Number(amount) * factor);
}
