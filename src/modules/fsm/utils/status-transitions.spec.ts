import {
  assertPaymentTransition,
  getAllowedPaymentTransitions,
} from './status-transitions';

describe('status-transitions payment', () => {
  it('allows client proof submission from UNPAID and OVERDUE', () => {
    expect(getAllowedPaymentTransitions('UNPAID')).toContain('PENDING_CONFIRMATION');
    expect(getAllowedPaymentTransitions('OVERDUE')).toContain('PENDING_CONFIRMATION');
    assertPaymentTransition('UNPAID', 'PENDING_CONFIRMATION');
    assertPaymentTransition('OVERDUE', 'PENDING_CONFIRMATION');
  });

  it('allows manager confirm or reject from PENDING_CONFIRMATION', () => {
    expect(getAllowedPaymentTransitions('PENDING_CONFIRMATION')).toEqual(
      expect.arrayContaining(['PAID', 'UNPAID', 'OVERDUE', 'CANCELLED']),
    );
    assertPaymentTransition('PENDING_CONFIRMATION', 'PAID');
    assertPaymentTransition('PENDING_CONFIRMATION', 'UNPAID');
  });

  it('keeps cash override UNPAID/OVERDUE → PAID', () => {
    assertPaymentTransition('UNPAID', 'PAID');
    assertPaymentTransition('OVERDUE', 'PAID');
  });
});
