import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimatePricingEngine } from '../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { EstimateProjectsService } from './estimate-projects.service';
import { EstimateWorksheetService } from './estimate-worksheet.service';
import type { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import type { EmailService } from '../../email/email.service';

function buildUser(role: 'OWNER' | 'MANAGER' | 'MEMBER'): JwtPayload {
  return {
    sub: `user-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@test.local`,
    accountKind: 'COMPANY_STAFF',
    activeCompanyId: 'company-1',
    companyRole: role,
    memberId: `member-${role.toLowerCase()}`,
  };
}

describe('Estimate permissions (F-01, F-02, F-03)', () => {
  describe('EstimateProjectsService.get sanitization (F-01)', () => {
    const fullProject = {
      id: 'proj-1',
      number: 'EST-00001',
      title: 'Renovare baie',
      status: 'CALCULATED',
      siteType: 'apartment',
      address: 'Str. Test 1',
      notes: 'internal',
      createdAt: new Date('2026-05-01T00:00:00Z'),
      marginPct: 20,
      laborTotal: 1000,
      materialTotal: 500,
      grandTotal: 1800,
      customer: { fullName: 'Ion', phone: '+37360000000', address: 'addr', email: 'a@b.c' },
      category: { name: 'Sanitar', slug: 'santehnika' },
      sitePlan: { plan2d: { rooms: [], points: [] } },
      measurements: [{ key: 'plumbingPoints', label: 'Points', value: 6, unit: 'buc' }],
      stages: [
        {
          id: 'stage-1',
          name: 'Demontare',
          code: 'demontare',
          kind: 'MIXED',
          description: '',
          durationDays: 1,
          checklist: ['x'],
          laborHours: 4,
          laborRate: 100,
          laborCost: 400,
          materialCost: 50,
          stageTotal: 450,
          lines: [
            {
              id: 'line-1',
              description: 'Demontaj wc',
              qty: 1,
              unit: 'buc',
              unitPrice: 200,
              lineTotal: 200,
              source: 'rule',
              materialStore: 'Bricostore',
            },
          ],
        },
      ],
    };

    function build() {
      const ctx = new EstimatesContextService();
      const pricing = new EstimatePricingEngine();
      const access = {
        findProjectOrThrow: jest.fn().mockResolvedValue(fullProject),
      } as unknown as EstimateProjectAccessService;
      return new EstimateProjectsService(
        {} as never,
        ctx,
        pricing,
        access,
        null as unknown as EstimatePdfService,
        null as unknown as EmailService,
      );
    }

    it('returns full project for OWNER/MANAGER', async () => {
      const service = build();
      const project = await service.get(buildUser('MANAGER'), fullProject.id);
      expect((project as unknown as typeof fullProject).grandTotal).toBe(1800);
      expect((project as unknown as typeof fullProject).marginPct).toBe(20);
      expect((project as unknown as typeof fullProject).stages[0].lines[0].unitPrice).toBe(200);
    });

    it('strips financial fields for MEMBER (F-01)', async () => {
      const service = build();
      const project = (await service.get(buildUser('MEMBER'), fullProject.id)) as Record<
        string,
        unknown
      >;

      expect(project).not.toHaveProperty('grandTotal');
      expect(project).not.toHaveProperty('laborTotal');
      expect(project).not.toHaveProperty('materialTotal');
      expect(project).not.toHaveProperty('marginPct');

      const stages = project.stages as Array<Record<string, unknown>>;
      expect(stages[0]).not.toHaveProperty('laborCost');
      expect(stages[0]).not.toHaveProperty('materialCost');
      expect(stages[0]).not.toHaveProperty('stageTotal');
      expect(stages[0]).not.toHaveProperty('laborRate');
      expect(stages[0]).not.toHaveProperty('laborHours');

      const lines = stages[0].lines as Array<Record<string, unknown>>;
      expect(lines[0]).not.toHaveProperty('unitPrice');
      expect(lines[0]).not.toHaveProperty('lineTotal');
      expect(lines[0]).toHaveProperty('description');
      expect(lines[0]).toHaveProperty('qty');
      expect(lines[0]).toHaveProperty('materialStore');
    });
  });

  describe('EstimateWorksheetService.getByProject (F-02)', () => {
    it('rejects MEMBER with forbidden', async () => {
      const ctx = new EstimatesContextService();
      const access = {} as EstimateProjectAccessService;
      const service = new EstimateWorksheetService({} as never, ctx, access);

      await expect(service.getByProject(buildUser('MEMBER'), 'proj-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('EstimateWorksheetService.listAssignedForTechnician (F-03, F-04)', () => {
    function build(findMany: jest.Mock) {
      const ctx = new EstimatesContextService();
      const prisma = { intervention: { findMany } };
      const access = {} as EstimateProjectAccessService;
      return new EstimateWorksheetService(prisma as never, ctx, access);
    }

    it('blocks OWNER from /worksheets/my (member-only endpoint)', async () => {
      const findMany = jest.fn();
      const service = build(findMany);
      await expect(
        service.listAssignedForTechnician(buildUser('OWNER')),
      ).rejects.toThrow(ForbiddenException);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('filters by assigned technicianId for MEMBER (F-03)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = build(findMany);

      await service.listAssignedForTechnician(buildUser('MEMBER'));

      expect(findMany).toHaveBeenCalledTimes(1);
      const args = findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        companyId: 'company-1',
        technicianId: 'member-member',
      });
      expect(args.where.estimateProjectId).toEqual({ not: null });
      expect(args.select.estimateProject.select).not.toHaveProperty('grandTotal');
      expect(args.select.estimateProject.select).not.toHaveProperty('laborTotal');
    });
  });
});
