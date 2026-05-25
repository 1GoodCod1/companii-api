/**
 * Path segments for @Controller() (without global api/v1 prefix).
 */
export const CONTROLLER_PATH = {
  root: '',
  health: 'health',
  auth: 'auth',
  admin: 'admin',
  companies: 'companies',
  companiesWaitlist: 'companies/waitlist',
  packages: 'packages',
  fsm: 'fsm',
  portal: 'portal',
  subscriptions: 'subscriptions',
  payments: 'payments',
  files: 'files',
  consent: 'consent',
  reviews: 'reviews',
  estimates: 'estimates',
} as const;

export type ControllerPath =
  (typeof CONTROLLER_PATH)[keyof typeof CONTROLLER_PATH];
