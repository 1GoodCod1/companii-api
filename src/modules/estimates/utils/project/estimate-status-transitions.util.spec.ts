import { EstimateProjectStatus } from '@prisma/client';
import {
  assertEstimateTransition,
  canTransitionEstimate,
  getAllowedEstimateTransitions,
  isEstimateRecalculable,
  isTerminalEstimateStatus,
} from './estimate-status-transitions.util';

describe('estimate-status-transitions.util', () => {
  it('allows the canonical forward path', () => {
    expect(canTransitionEstimate('DRAFT', 'CALCULATED')).toBe(true);
    expect(canTransitionEstimate('CALCULATED', 'APPROVED')).toBe(true);
    expect(canTransitionEstimate('APPROVED', 'SENT')).toBe(true);
    expect(canTransitionEstimate('SENT', 'ACCEPTED')).toBe(true);
    expect(canTransitionEstimate('ACCEPTED', 'IN_EXECUTION')).toBe(true);
    expect(canTransitionEstimate('IN_EXECUTION', 'DONE')).toBe(true);
  });

  it('allows the revision back-edges', () => {
    expect(canTransitionEstimate('APPROVED', 'CALCULATED')).toBe(true);
    expect(canTransitionEstimate('SENT', 'CALCULATED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransitionEstimate('DRAFT', 'ACCEPTED')).toBe(false);
    expect(canTransitionEstimate('CALCULATED', 'IN_EXECUTION')).toBe(false);
    expect(canTransitionEstimate('ACCEPTED', 'CALCULATED')).toBe(false);
    expect(canTransitionEstimate('IN_EXECUTION', 'SENT')).toBe(false);
  });

  it('treats DONE and CANCELLED as terminal', () => {
    expect(isTerminalEstimateStatus('DONE')).toBe(true);
    expect(isTerminalEstimateStatus('CANCELLED')).toBe(true);
    expect(getAllowedEstimateTransitions('DONE')).toEqual([]);
    expect(getAllowedEstimateTransitions('CANCELLED')).toEqual([]);
    expect(canTransitionEstimate('DONE', 'IN_EXECUTION')).toBe(false);
  });

  it('marks only pre-send states as recalculable', () => {
    expect(isEstimateRecalculable('DRAFT')).toBe(true);
    expect(isEstimateRecalculable('CALCULATED')).toBe(true);
    expect(isEstimateRecalculable('APPROVED')).toBe(true);
    expect(isEstimateRecalculable('SENT')).toBe(false);
    expect(isEstimateRecalculable('ACCEPTED')).toBe(false);
    expect(isEstimateRecalculable('IN_EXECUTION')).toBe(false);
  });

  it('assertEstimateTransition throws a coded error on invalid transitions', () => {
    expect(() => assertEstimateTransition('IN_EXECUTION', 'DONE')).not.toThrow();
    expect(() => assertEstimateTransition('DONE', 'IN_EXECUTION')).toThrow(
      /ESTIMATE_TRANSITION_INVALID/,
    );
    expect(() => assertEstimateTransition('ACCEPTED', 'ACCEPTED')).not.toThrow();
  });

  it('covers every status as a transition source (no missing map keys)', () => {
    for (const status of Object.values(EstimateProjectStatus)) {
      expect(() => getAllowedEstimateTransitions(status)).not.toThrow();
    }
  });
});
