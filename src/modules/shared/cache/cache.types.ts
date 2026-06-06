export type CacheOptions = {
  ttl?: number;
};

export type CompaniiCacheKeyBuilders = {
  companiesList: (params: {
    cityId?: string;
    categoryId?: string;
    page: number;
    limit: number;
  }) => string;
  companyBySlug: (slug: string) => string;
  servicesList: (companySlug: string | null) => string;
  plansAll: () => string;
  blueprintsAll: () => string;
  blueprintByCategorySlug: (slug: string) => string;
  categoriesList: () => string;
  citiesList: () => string;
  analyticsOverview: (companyId: string, period: string) => string;
  subscriptionUsage: (companyId: string) => string;
  portalDashboard: (userId: string) => string;
  fsmServicesList: (companyId: string) => string;
};
