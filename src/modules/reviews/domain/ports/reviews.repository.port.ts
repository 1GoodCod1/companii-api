import type { Prisma, CompanyReview, CompanyCustomer, Intervention } from '@prisma/client';
import type { CompanyReviewPublicDto } from '../../reviews.types';
import type { RlsContext } from '@/common/types/rls-context';

export const REVIEWS_REPOSITORY = Symbol('ReviewsRepository');

export interface ReviewsRepository {
  findCustomerByUserId(userId: string): Promise<CompanyCustomer | null>;
  findInterventionForReview(companyId: string, customerId: string): Promise<{ id: string } | null>;
  findInterventionWithReview(id: string, customerId: string): Promise<(Intervention & { review: { id: string } | null }) | null>;
  findInterventionDetail(id: string, customerId: string): Promise<(Intervention & { review: CompanyReview | null }) | null>;
  findUserById(userId: string): Promise<{ firstName: string | null; lastName: string | null } | null>;
  createReview(data: Prisma.CompanyReviewUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<CompanyReview>;
  findReviewsForCompany(companyId: string, skip: number, take: number): Promise<[CompanyReviewPublicDto[], number]>;
  findCompanyBySlug(slug: string): Promise<{ id: string } | null>;
  findReviewsByCustomer(customerId: string): Promise<Array<CompanyReviewPublicDto & { companyId: string; interventionId: string | null }>>;
  recalculateRating(companyId: string, tx: Prisma.TransactionClient): Promise<void>;
  runWithRls<T>(context: RlsContext, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
