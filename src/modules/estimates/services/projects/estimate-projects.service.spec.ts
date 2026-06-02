import { NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { ESTIMATE_VALIDATION_FAILED } from '../../utils/blueprint/estimate-custom-fields-validation.util';
import { ENABLED_WORK_MODULES_KEY } from '../../utils/blueprint/work-modules.util';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimatePricingEngine } from '../../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { EstimateProjectsService } from './estimate-projects.service';
import { EstimateProjectActualsService } from './estimate-project-actuals.service';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import type { EstimateProjectDetail } from '../../estimate.constants';

describe('EstimateProjectsService.create (C-14)', () => {
  const user: JwtPayload = {
    sub: 'user-1',
    email: 'owner@test.local',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: 'OWNER',
    memberId: 'member-1',
  };

  const customer = { id: 'customer-1', companyId: 'company-1', address: 'Str. Test 1' };
  const excludedCategory = { id: 'cat-excluded', slug: 'smm-marketing', name: 'SMM' };

  function buildService(blueprint: unknown) {
    const prisma = {
      inSerial: jest.fn().mockResolvedValue([customer, excludedCategory, blueprint]),
      $transaction: jest.fn(),
    };
    const ctx = new EstimatesContextService();
    const pricing = new EstimatePricingEngine();
    const access = {
      nextProjectNumber: jest.fn(),
    } as unknown as EstimateProjectAccessService;
    const actuals = {} as any;

    return {
      service: new EstimateProjectsService(
        prisma as never,
        ctx,
        pricing,
        access,
        actuals,
      ),
      prisma,
    };
  }

  it('rejects project creation when category has no blueprint', async () => {
    const { service } = buildService(null);

    await expect(
      service.create(user, {
        customerId: customer.id,
        categoryId: excludedCategory.id,
      }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.create(user, {
        customerId: customer.id,
        categoryId: excludedCategory.id,
      }),
    ).rejects.toThrow('Blueprint not found for category');
  });

  it('does not start a transaction when blueprint is missing', async () => {
    const { service, prisma } = buildService(null);

    await expect(
      service.create(user, {
        customerId: customer.id,
        categoryId: excludedCategory.id,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('EstimateProjectsService.update validation (D-01, D-03)', () => {
  const user: JwtPayload = {
    sub: 'user-1',
    email: 'owner@test.local',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: 'OWNER',
    memberId: 'member-1',
  };

  const blueprint = {
    id: 'bp-1',
    config: lucrariFinisajBlueprint,
  };

  const project = {
    id: 'proj-1',
    blueprint,
    diagnosticAnswers: {},
    number: 'EST-00001',
    title: 'Test project',
    version: 1,
  };

  function buildUpdateService() {
    const updatedProject = { ...project, title: 'Updated', number: 'EST-00001', version: 1 };
    const tx = {
      estimateProject: {
        update: jest.fn().mockResolvedValue(updatedProject),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedProject),
      },
      estimateAppliedMutation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      estimateProject: {
        update: jest.fn().mockResolvedValue(updatedProject),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ctx = new EstimatesContextService();
    const pricing = new EstimatePricingEngine();
    const access = {
      findProjectOrThrow: jest.fn().mockResolvedValue(project),
    } as unknown as EstimateProjectAccessService;
    const actuals = {
      computeProjectActualsAndVariance: jest.fn().mockImplementation((p) => p),
    } as any;

    const service = new EstimateProjectsService(
      prisma as never,
      ctx,
      pricing,
      access,
      actuals,
    );

    return { service, prisma, updatedProject };
  }

  it('throws structured field errors for invalid diagnostic answers (D-01)', async () => {
    const { service } = buildUpdateService();

    await expect(
      service.update(user, project.id, {
        diagnosticAnswers: {
          finishArea: 'not-a-number',
          paintArea: 20,
          finishLevel: 'standard',
          [ENABLED_WORK_MODULES_KEY]: ['paint'],
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: ESTIMATE_VALIDATION_FAILED,
        fields: { finishArea: 'Trebuie să fie un număr valid' },
      },
    });
  });

  it('returns warnings array when diagnostic update succeeds (D-03)', async () => {
    const { service } = buildUpdateService();

    const result = await service.update(user, project.id, {
      diagnosticAnswers: {
        finishArea: 30,
        paintArea: 30,
        finishLevel: 'standard',
        [ENABLED_WORK_MODULES_KEY]: ['paint'],
      },
    });

    expect(result.warnings).toEqual([]);
  });
});

describe('EstimateProjectsService Epic V (V-04, V-05, V-13)', () => {
  const user: JwtPayload = {
    sub: 'user-1',
    email: 'owner@test.local',
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: 'OWNER',
    memberId: 'member-1',
  };

  it('correctly calculates actuals and variance metrics (V-04)', () => {
    const service = new EstimateProjectActualsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const mockProject = {
      id: 'proj-123',
      title: 'Baie',
      marginPct: 20,
      stages: [
        {
          id: 'stage-1',
          lines: [
            {
              id: 'line-1',
              description: 'Tevi apa',
              qty: 5,
              unit: 'm',
              unitPrice: 100,
              lineTotal: 500,
              actualStatus: 'PURCHASED',
              actualUnitPrice: 120,
              actualLineTotal: 600,
            },
            {
              id: 'line-2',
              description: 'Manopera',
              qty: 10,
              unit: 'ore',
              unitPrice: 150,
              lineTotal: 1500,
              actualStatus: 'PENDING',
            },
            {
              id: 'line-3',
              description: 'Nisip',
              qty: 2,
              unit: 'sac',
              unitPrice: 50,
              lineTotal: 100,
              actualStatus: 'SKIPPED',
            }
          ]
        }
      ]
    };

    const enriched = service.computeProjectActualsAndVariance(mockProject as unknown as EstimateProjectDetail);

    expect(enriched.materialBudget).toBe(600); // 500 (line-1) + 100 (line-3)
    expect(enriched.materialActual).toBe(600); // 600 (line-1)
    expect(enriched.materialVariance).toBe(0);
    expect(enriched.materialVariancePct).toBe(0);
    expect(enriched.materialLinesTotal).toBe(2); // Tevi apa, Nisip
    expect(enriched.materialLinesPurchased).toBe(1);
    expect(enriched.materialLinesSkipped).toBe(1);
    expect(enriched.materialLinesPending).toBe(0);
    expect(enriched.actualsCompletionPct).toBe(100);
    expect(enriched.materialActualSpent).toBe(600);
  });

  it('sends a variance alert when lockActuals is called and materialVariancePct > 15% (V-09)', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn) => fn(prisma)),
      $executeRaw: jest.fn(),
      estimateStage: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      estimateLine: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      estimateProject: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'proj-123' }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Test SRL',
          contactEmail: 'manager@test.local',
          owner: { email: 'owner@test.local' },
          members: []
        }),
      },
      runOutsideRlsContext: jest.fn((fn) => fn()),
    };

    const ctx = {
      companyId: jest.fn().mockReturnValue('company-1'),
      assertManagement: jest.fn(),
    };

    const access = {
      findProjectOrThrow: jest.fn().mockResolvedValue({
        id: 'proj-123',
        number: 'EST-00001',
        title: 'Project Test',
        marginPct: 20,
        stages: [
          {
            id: 'stage-1',
            lines: [
              {
                id: 'line-1',
                unit: 'm',
                description: 'Tevi',
                lineTotal: 100,
                actualStatus: 'PURCHASED',
                actualUnitPrice: 200,
                actualLineTotal: 200, // +100% variance
              }
            ]
          }
        ]
      }),
    };

    const email = {
      sendEstimateVarianceAlertEmail: jest.fn().mockResolvedValue(true),
    };

    const service = new EstimateProjectActualsService(
      prisma as any,
      ctx as any,
      access as any,
      email as any,
    );

    await service.lockActuals(user, 'proj-123');

    expect(email.sendEstimateVarianceAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateNumber: 'EST-00001',
        projectName: 'Project Test',
        variance: 100,
        variancePct: 100,
      })
    );
  });
});
