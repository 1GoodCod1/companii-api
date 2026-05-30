import { GetPricingModifiersUseCase } from './get-pricing-modifiers.use-case';
import { UpdatePricingModifiersUseCase } from './update-pricing-modifiers.use-case';
import type { JwtPayload } from '../../auth/types/jwt-payload';

describe('Pricing Modifiers Use Cases', () => {
  let getUseCase: GetPricingModifiersUseCase;
  let updateUseCase: UpdatePricingModifiersUseCase;
  let prisma: any;
  let companyAuth: any;

  const mockUser: JwtPayload = {
    sub: 'user-123',
    email: 'owner@test.com',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-123',
    companyRole: 'OWNER',
    memberId: 'member-123',
  };

  beforeEach(() => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    companyAuth = {
      assertSameCompanyContext: jest.fn(),
      assertCompanyManagerAccess: jest.fn(),
    };
    getUseCase = new GetPricingModifiersUseCase(prisma as any, companyAuth as any);
    updateUseCase = new UpdatePricingModifiersUseCase(prisma as any, companyAuth as any);
  });

  describe('GetPricingModifiersUseCase', () => {
    it('returns filtered catalog based on company category slug', async () => {
      prisma.company.findUnique.mockResolvedValue({
        pricingModifiers: { 'fatade.height.over9m': 25 },
        category: { slug: 'fatade' },
      });

      const result = await getUseCase.execute(mockUser, 'company-123');

      expect(companyAuth.assertSameCompanyContext).toHaveBeenCalledWith(mockUser, 'company-123');
      expect(companyAuth.assertCompanyManagerAccess).toHaveBeenCalledWith(mockUser, 'company-123');

      // The catalog should only contain modifiers for category 'fatade'
      expect(result.catalog).toHaveLength(1);
      expect(result.catalog[0].key).toBe('fatade.height.over9m');
      expect(result.overrides).toEqual({ 'fatade.height.over9m': 25 });
    });

    it('returns empty catalog if company has no category slug', async () => {
      prisma.company.findUnique.mockResolvedValue({
        pricingModifiers: {},
        category: null,
      });

      const result = await getUseCase.execute(mockUser, 'company-123');
      expect(result.catalog).toEqual([]);
      expect(result.overrides).toEqual({});
    });
  });

  describe('UpdatePricingModifiersUseCase', () => {
    it('saves pricing modifiers and returns updated filtered catalog', async () => {
      prisma.company.findUnique.mockResolvedValue({
        pricingModifiers: {},
      });
      prisma.company.update.mockResolvedValue({
        pricingModifiers: { 'fatade.height.over9m': 30 },
        category: { slug: 'fatade' },
      });

      const result = await updateUseCase.execute(mockUser, 'company-123', {
        'fatade.height.over9m': 30,
      });

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: { pricingModifiers: { 'fatade.height.over9m': 30 } },
        select: {
          pricingModifiers: true,
          category: {
            select: {
              slug: true,
            },
          },
        },
      });

      expect(result.catalog).toHaveLength(1);
      expect(result.catalog[0].key).toBe('fatade.height.over9m');
      expect(result.overrides).toEqual({ 'fatade.height.over9m': 30 });
    });
  });
});
