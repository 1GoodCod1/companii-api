export const EMAIL_SENDER = Symbol('EmailSender');

export interface EmailSender {
  sendEstimateEmail(params: {
    to: string;
    companyName: string;
    estimateNumber: string;
    title: string;
    total: number;
    portalUrl: string;
  }): Promise<void>;

  sendEstimateStatusEmail(params: {
    to: string;
    companyName: string;
    estimateNumber: string;
    title: string;
    clientName: string;
    status: string;
    total: number;
  }): Promise<void>;

  sendEstimateVarianceAlertEmail(params: {
    to: string;
    estimateNumber: string;
    projectName: string;
    variance: number;
    variancePct: number;
  }): Promise<void>;

  sendEstimateFeedbackEmail(params: {
    to: string;
    estimateNumber: string;
    title: string;
    clientName: string;
    comment: string;
  }): Promise<void>;
}