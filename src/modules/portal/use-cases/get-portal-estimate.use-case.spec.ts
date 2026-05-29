import { GetPortalEstimateUseCase } from './get-portal-estimate.use-case';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimateProjectStatus } from '@prisma/client';

describe('GetPortalEstimateUseCase', () => {
  let useCase: GetPortalEstimateUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      companyCustomer: {
        findFirst: jest.fn(),
      },
      estimateProject: {
        findFirst: jest.fn(),
      },
    };
    useCase = new GetPortalEstimateUseCase(prisma as any);
  });

  const mockUser: JwtPayload = {
    sub: 'user-123',
    email: 'client@test.com',
    accountKind: 'END_CLIENT',
  };

  const mockCustomer = {
    id: 'customer-123',
  };

  const mockProject = {
    id: 'project-123',
    number: 'EST-001',
    status: EstimateProjectStatus.SENT,
    marginPct: 15,
    laborRate: 45,
    stages: [
      {
        id: 'stage-1',
        name: 'Plumbing',
        laborRate: 45,
        marginPct: 15,
        laborCost: 100,
        materialCost: 200,
        lines: [
          {
            id: 'line-1',
            name: 'Pipes',
            laborRate: 45,
            marginPct: 15,
            laborCost: 50,
            materialCost: 100,
          },
        ],
      },
    ],
  };

  it('successfully fetches and sanitizes estimate details for end client', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(mockCustomer);
    prisma.estimateProject.findFirst.mockResolvedValue(mockProject);

    const result = await useCase.execute(mockUser, 'project-123');

    // Sensitive properties must be omitted at the top level
    expect(result.marginPct).toBeUndefined();
    expect(result.laborRate).toBeUndefined();
    expect(result.id).toBe('project-123');

    // Sensitive properties must be omitted at the stage level
    const stage = result.stages[0];
    expect(stage.laborRate).toBeUndefined();
    expect(stage.marginPct).toBeUndefined();
    expect(stage.laborCost).toBeUndefined();
    expect(stage.materialCost).toBeUndefined();

    // Sensitive properties must be omitted at the line level
    const line = stage.lines[0];
    expect(line.laborRate).toBeUndefined();
    expect(line.marginPct).toBeUndefined();
    expect(line.laborCost).toBeUndefined();
    expect(line.materialCost).toBeUndefined();
    expect(line.name).toBe('Pipes');

    expect(prisma.estimateProject.findFirst).toHaveBeenCalled();
  });

  it('throws NotFound if the estimate does not exist or does not belong to client', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(mockCustomer);
    prisma.estimateProject.findFirst.mockResolvedValue(null);

    await expect(useCase.execute(mockUser, 'invalid-id')).rejects.toThrow();
  });
});
