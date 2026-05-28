export const QUEUE_NAMES = {
  ESTIMATE_CALCULATE: 'estimate-calculate',
  ESTIMATE_PDF: 'estimate-pdf',
  ESTIMATE_EMAIL: 'estimate-email',
  INVOICE_PDF: 'invoice-pdf',
  ESTIMATE_CONVERT: 'estimate-convert',
} as const;

export const QUEUE_SMALL_THRESHOLD = 40;
export const QUEUE_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};