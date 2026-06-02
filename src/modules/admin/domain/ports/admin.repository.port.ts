import type {
  Prisma,
  ReviewStatus,
  User,
  Company,
  CompanyReview,
  City,
  Category,
  CompanyWaitlist,
  AuditLog,
  EstimateBlueprint,
} from '@prisma/client';
import type { AdminAuditQueryDto } from '@/modules/admin/dto/admin-audit-query.dto';
import { companyListInclude, companyDetailInclude } from '../../admin.constants';

export const ADMIN_REPOSITORY = Symbol('AdminRepository');

export type AdminAuditLogWithUser = AuditLog & {
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
};

export type AdminClientListItem = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: Date;
  portalCustomer: {
    id: string;
    fullName: string;
    company: { id: string; name: string };
  } | null;
};

export type AdminCompanyListItem = Prisma.CompanyGetPayload<{ include: typeof companyListInclude }>;
export type AdminCompanyDetail = Prisma.CompanyGetPayload<{ include: typeof companyDetailInclude }>;

export type AdminReviewWithRelations = CompanyReview & {
  company: { id: string; name: string; slug: string | null } | null;
  author: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  intervention: { id: string; number: string } | null;
};

export type AdminCityWithCount = City & { _count: { companies: number } };
export type AdminCategoryWithCount = Category & { _count: { companies: number; companyServices: number } };

export type AdminBlueprintListItem = EstimateBlueprint & {
  category: { id: string; name: string; slug: string };
  _count: { projects: number };
};


export type AdminBlueprintMutationResult = EstimateBlueprint & {
  category: { id: string; name: string; slug: string };
};

export type AdminBlueprintDetail = EstimateBlueprint & {
  category: Category;
  _count: { projects: number };
};

export interface AdminRepository {
  getStats(): Promise<{ companies: number; users: number; interventions: number; waitlist: number }>;
  listWaitlist(): Promise<CompanyWaitlist[]>;
  listAuditLogs(query: AdminAuditQueryDto): Promise<AdminAuditLogWithUser[]>;

  listClients(): Promise<AdminClientListItem[]>;
  findClientById(id: string): Promise<User | null>;
  updateClient(id: string, data: Prisma.UserUncheckedUpdateInput): Promise<AdminClientListItem>;

  pendingCompanies(): Promise<AdminCompanyListItem[]>;
  findCompanyById(id: string, includeDetails?: boolean): Promise<Company | AdminCompanyDetail | null>;
  listCompanies(): Promise<AdminCompanyListItem[]>;
  updateCompany(id: string, data: Prisma.CompanyUncheckedUpdateInput, includeDetails?: boolean): Promise<Company | AdminCompanyDetail>;

  listReviews(): Promise<AdminReviewWithRelations[]>;
  findReviewById(id: string): Promise<CompanyReview | null>;
  updateReviewStatus(id: string, status: ReviewStatus): Promise<AdminReviewWithRelations>;

  listCities(): Promise<AdminCityWithCount[]>;
  findCityById(id: string): Promise<AdminCityWithCount | null>;
  createCity(data: Prisma.CityCreateInput): Promise<AdminCityWithCount>;
  updateCity(id: string, data: Prisma.CityUpdateInput): Promise<AdminCityWithCount>;
  deleteCity(id: string): Promise<void>;

  listCategories(): Promise<AdminCategoryWithCount[]>;
  findCategoryById(id: string): Promise<AdminCategoryWithCount | null>;
  createCategory(data: Prisma.CategoryCreateInput): Promise<AdminCategoryWithCount>;
  updateCategory(id: string, data: Prisma.CategoryUpdateInput): Promise<AdminCategoryWithCount>;
  deleteCategory(id: string): Promise<void>;

  uniqueCitySlug(base: string, excludeId?: string): Promise<string>;
  uniqueCategorySlug(base: string, excludeId?: string): Promise<string>;

  listBlueprints(): Promise<AdminBlueprintListItem[]>;
  findBlueprintById(id: string): Promise<AdminBlueprintDetail | null>;
  findBlueprintByCategoryId(categoryId: string): Promise<EstimateBlueprint | null>;
  createBlueprint(data: Prisma.EstimateBlueprintUncheckedCreateInput): Promise<AdminBlueprintMutationResult>;
  updateBlueprint(id: string, data: Prisma.EstimateBlueprintUncheckedUpdateInput): Promise<AdminBlueprintMutationResult>;
  deleteBlueprint(id: string): Promise<void>;
}
