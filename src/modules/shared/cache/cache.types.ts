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
  packagesList: (companySlug: string | null) => string;
  plansAll: () => string;
};
