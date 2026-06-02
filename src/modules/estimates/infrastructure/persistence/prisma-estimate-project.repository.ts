import { PrismaService } from '../../../shared/database/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import type { EstimateProjectRepository } from '../../domain/ports/estimate-project.repository.port';
import type { EstimateProjectDetail } from '../../estimate.constants';

export class PrismaEstimateProjectRepository implements EstimateProjectRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findById(id: string): Promise<EstimateProjectDetail | null> {
    return await this.prisma.estimateProject.findUnique({
      where: { id },
      include: this.fullInclude(),
    }) as unknown as EstimateProjectDetail | null;
  }

  async findByCompanyId(companyId: string, id: string): Promise<EstimateProjectDetail | null> {
    return await this.prisma.estimateProject.findFirst({
      where: { id, companyId },
      include: this.fullInclude(),
    }) as unknown as EstimateProjectDetail | null;
  }

  async findByCustomerId(customerId: string, projectId: string): Promise<EstimateProjectDetail | null> {
    return await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId },
      include: this.fullInclude(),
    }) as unknown as EstimateProjectDetail | null;
  }

  async listByCompany(companyId: string, cursor?: string, limit = 20): Promise<EstimateProjectDetail[] | { items: EstimateProjectDetail[]; nextCursor: string | null }> {
    const take = Math.min(Math.max(limit, 1), 100);
    const items = await this.prisma.estimateProject.findMany({
      where: { companyId },
      select: this.listSelect(),
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });

    if (!cursor) return items as unknown as EstimateProjectDetail[];
    return { items: items as unknown as EstimateProjectDetail[], nextCursor: items.length === take ? items[items.length - 1]?.id : null };
  }

  create(project: import('../../domain/entities/estimate-project.entity').EstimateProject): Promise<EstimateProjectDetail> {
    throw new Error('Use create with transaction');
  }

  async update(id: string, data: Record<string, unknown>, version: number): Promise<EstimateProjectDetail> {
    const updated = await this.prisma.estimateProject.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: this.fullInclude(),
    });
    return updated as unknown as EstimateProjectDetail;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.estimateProject.delete({ where: { id } });
  }

  async lockRow(tx: unknown, id: string): Promise<void> {
    const client = tx as { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<void> };
    await client.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${id} FOR UPDATE`;
  }

  async findWithLock(tx: unknown, id: string): Promise<EstimateProjectDetail | null> {
    const client = tx as { $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T[]> };
    const rows = await client.$queryRaw<Array<{ id: string }>>`SELECT id FROM estimate_projects WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) return null;
    return this.findById(id);
  }

  async save(project: import('../../domain/entities/estimate-project.entity').EstimateProject): Promise<void> {
    await this.prisma.estimateProject.update({
      where: { id: project.id },
      data: {
        status: project.status,
        version: { increment: 1 },
      },
    });
  }

  private fullInclude() {
    return {
      customer: true,
      category: true,
      blueprint: true,
      sitePlan: true,
      quote: true,
      sourceLead: true,
      measurements: { orderBy: { key: 'asc' as const } },
      photos: { orderBy: { sortOrder: 'asc' as const } },
      stages: {
        orderBy: { sortOrder: 'asc' as const },
        include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
      },
      interventions: {
        select: {
          id: true,
          number: true,
          status: true,
          type: true,
          scheduledAt: true,
          technician: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
    };
  }

  private listSelect() {
    return {
      id: true,
      number: true,
      title: true,
      status: true,
      createdAt: true,
      grandTotal: true,
      grandTotalWithVat: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      category: { select: { id: true, name: true, slug: true } },
      quote: { select: { id: true, number: true, status: true } },
      stages: { select: { id: true, name: true, sortOrder: true, stageTotal: true } },
    };
  }
}