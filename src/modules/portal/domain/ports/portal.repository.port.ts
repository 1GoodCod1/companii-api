import type {
  CompanyCustomer,
  CompanyInvoice,
  CompanyLead,
  CompanyReview,
  Company,
  Category,
  Quote,
  QuoteStatus,
  EstimateProject,
  EstimateProjectStatus,
  Intervention,
  InterventionStatus,
  Prisma,
} from '@prisma/client';

export const PORTAL_REPOSITORY = Symbol('PortalRepository');

export type PortalLead = CompanyLead & {
  company: { id: string; name: string; slug: string | null };
  category: { id: string; name: string; slug: string } | null;
};

export type PortalDashboardIntervention = Intervention & {
  company: { id: string; name: string; slug: string | null };
  review: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  } | null;
  description?: string | null;
  canReview: boolean;
};

export type PortalDashboardReview = {
  id: string;
  rating: number;
  comment: string | null;
  clientName: string | null;
  createdAt: Date;
  companyId: string;
  interventionId: string | null;
  intervention: { id: string; number: string; type: string } | null;
};

export type PortalDashboardEstimate = EstimateProject & {
  category: { id: string; name: string };
  company: { id: string; name: string; slug: string | null };
};

export interface PortalDashboardData {
  interventions: PortalDashboardIntervention[];
  quotes: Quote[];
  invoices: CompanyInvoice[];
  reviews: PortalDashboardReview[];
  estimates: PortalDashboardEstimate[];
}

export type PortalUpdatedProject = EstimateProject;

export type PortalFullProject = EstimateProject & {
  customer: { fullName: string };
  company: {
    name: string;
    contactEmail: string | null;
    owner: { email: string };
  };
};

export type PortalEstimateActionResult = {
  updatedProject: PortalUpdatedProject;
  fullProject: PortalFullProject;
};

export type PortalEstimateChangesResult = PortalEstimateActionResult & {
  quoteId: string | null;
};

export type FeedbackAppendFn = (currentFeedback: Prisma.JsonValue) => Prisma.InputJsonValue;

export interface PortalRepository {
  findCustomerByUserId(userId: string): Promise<CompanyCustomer>;
  listMyLeads(userId: string, take: number, cursor?: string): Promise<PortalLead[]>;
  findQuoteByIdAndCustomer(quoteId: string, customerId: string): Promise<Quote | null>;
  updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<Quote>;
  findProjectByIdAndCustomer(projectId: string, customerId: string): Promise<EstimateProject | null>;

  getDashboardData(customer: CompanyCustomer): Promise<PortalDashboardData>;

  acceptOrRejectEstimate(
    customerId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateActionResult>;

  requestEstimateChanges(
    customerId: string,
    projectId: string,
    comment: string,
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateChangesResult>;

  getInvoicePdfData(invoiceId: string, customerId: string): Promise<Prisma.CompanyInvoiceGetPayload<{
    include: {
      company: {
        select: {
          name: true;
          legalName: true;
          idno: true;
          legalAddress: true;
          contactPhone: true;
          contactEmail: true;
          isTvaPayer: true;
          tvaCode: true;
        };
      };
      intervention: { include: { customer: true } };
    };
  }> | null>;

  getEstimatePdfData(projectId: string, customerId: string): Promise<Prisma.EstimateProjectGetPayload<{
    include: {
      company: {
        select: {
          name: true;
          legalName: true;
          idno: true;
          legalAddress: true;
          contactPhone: true;
          contactEmail: true;
          isTvaPayer: true;
          tvaCode: true;
        };
      };
      customer: true;
      category: { select: { name: true } };
      stages: {
        include: { lines: true };
      };
    };
  }> | null>;

  getInvoiceDetails(invoiceId: string): Promise<Prisma.CompanyInvoiceGetPayload<{
    include: {
      intervention: { include: { customer: { select: { fullName: true } } } };
      company: {
        select: {
          name: true;
          contactEmail: true;
          owner: { select: { email: true } };
        };
      };
    };
  }>>;

  checkProjectOwnership(projectId: string, customerId: string): Promise<void>;
}
