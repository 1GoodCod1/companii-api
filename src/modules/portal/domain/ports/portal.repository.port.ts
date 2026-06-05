import type {
  CompanyCustomer,
  CompanyInvoice,
  CompanyLead,
  CompanyReview,
  Company,
  Category,
  Quote,
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

export type PortalCompanyRef = { id: string; name: string; slug: string | null };

export interface PortalDashboardData {
  interventions: PortalDashboardIntervention[];
  quotes: (Quote & { company: PortalCompanyRef })[];
  invoices: (CompanyInvoice & { company: PortalCompanyRef })[];
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
  // All customer-bound reads/writes are scoped by the portal USER (a user may be
  // a customer of several companies); ownership = customer.portalUserId === userId.
  findCustomerByUserId(userId: string): Promise<CompanyCustomer>;
  listMyLeads(userId: string, take: number, cursor?: string): Promise<PortalLead[]>;
  // Atomically accept/reject a quote the user owns. Locks the row, asserts it is
  // still SENT, and maps the action to the concrete QuoteStatus — the client can
  // never write an arbitrary status (security #3).
  acceptOrRejectQuote(
    userId: string,
    quoteId: string,
    action: 'ACCEPTED' | 'REJECTED',
  ): Promise<Quote>;
  findProjectForUser(projectId: string, userId: string): Promise<EstimateProject | null>;
  findOwnedInvoiceCustomerId(invoiceId: string, userId: string): Promise<string | null>;

  getDashboardData(userId: string): Promise<PortalDashboardData>;

  acceptOrRejectEstimate(
    userId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateActionResult>;

  requestEstimateChanges(
    userId: string,
    projectId: string,
    comment: string,
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateChangesResult>;

  getInvoicePdfData(invoiceId: string, userId: string): Promise<Prisma.CompanyInvoiceGetPayload<{
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

  getEstimatePdfData(projectId: string, userId: string): Promise<Prisma.EstimateProjectGetPayload<{
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

  checkProjectOwnership(projectId: string, userId: string): Promise<void>;
}
