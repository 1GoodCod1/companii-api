export const SEO_REPOSITORY = Symbol('SeoRepository');

export interface SeoRepository {
  getPublishedCompanies(): Promise<Array<{ slug: string | null; updatedAt: Date }>>;
  getCategories(): Promise<Array<{ slug: string }>>;
  getCities(): Promise<Array<{ slug: string }>>;
}
