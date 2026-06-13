import { estimateClientPriceFactor, toClientPrice } from './client-price.util';

describe('estimateClientPriceFactor', () => {
  it('returns 1 when margin and risk are absent', () => {
    expect(estimateClientPriceFactor({ marginPct: null, riskReservePct: null })).toBe(1);
    expect(estimateClientPriceFactor({ marginPct: 0, riskReservePct: 0 })).toBe(1);
  });

  it('compounds risk reserve and margin like recalcStageTotals does', () => {
    // grandTotal = subtotal × (1 + risk/100) × (1 + margin/100)
    expect(estimateClientPriceFactor({ marginPct: 15, riskReservePct: 5 })).toBeCloseTo(
      1.05 * 1.15,
      10,
    );
  });

  it('accepts Prisma.Decimal-like values', () => {
    const decimalLike = { toString: () => '10' };
    expect(estimateClientPriceFactor({ marginPct: decimalLike, riskReservePct: null })).toBeCloseTo(
      1.1,
      10,
    );
  });
});

describe('toClientPrice', () => {
  it('scales and rounds to 2 decimals', () => {
    expect(toClientPrice(100, 1.2075)).toBe(120.75);
    expect(toClientPrice(33.33, 1.15)).toBe(38.33);
  });

  it('keeps the scaled per-stage sum aligned with the project grandTotal within cents', () => {
    const factor = estimateClientPriceFactor({ marginPct: 15, riskReservePct: 5 });
    const stageTotals = [1234.56, 789.01, 4567.89];
    const subtotal = stageTotals.reduce((a, b) => a + b, 0);
    const grandTotal = Math.round(subtotal * factor * 100) / 100;
    const scaledSum = stageTotals.reduce((acc, st) => acc + toClientPrice(st, factor), 0);
    expect(Math.abs(scaledSum - grandTotal)).toBeLessThan(0.05);
  });
});
