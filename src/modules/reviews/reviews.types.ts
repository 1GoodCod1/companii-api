import { InterventionStatus } from '@prisma/client';

export const REVIEWABLE_INTERVENTION_STATUSES: InterventionStatus[] = [
  'COMPLETED',
  'INVOICED',
  'PAID',
];

export type CompanyReviewPublicDto = {
  id: string;
  rating: number;
  comment: string | null;
  clientName: string | null;
  createdAt: Date;
  intervention: {
    id: string;
    number: string;
    type: string;
  };
};

export type CanCreateReviewDto = {
  canCreate: boolean;
  interventionId?: string;
  alreadyReviewed?: boolean;
  notReviewable?: boolean;
};
