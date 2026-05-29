import { InterventionStatus, Prisma } from '@prisma/client';

export const REVIEWABLE_INTERVENTION_STATUSES: InterventionStatus[] = [
  'COMPLETED',
  'INVOICED',
  'PAID',
];

export const REVIEW_PUBLIC_SELECT = Prisma.validator<Prisma.CompanyReviewSelect>()({
  id: true,
  rating: true,
  comment: true,
  clientName: true,
  createdAt: true,
  intervention: {
    select: { id: true, number: true, type: true },
  },
});

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
