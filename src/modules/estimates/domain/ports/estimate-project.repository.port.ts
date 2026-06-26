import type { EstimateProjectDetail } from '../../estimate.constants';
import type { EstimateProject } from '@/modules/estimates/domain/entities/estimate-project.entity';
import type { CursorPage } from '@/common/utils/cursor-page.util';

export const ESTIMATE_PROJECT_REPOSITORY = Symbol('EstimateProjectRepository');

export interface EstimateProjectRepository {
  findById(id: string): Promise<EstimateProjectDetail | null>;
  findByCompanyId(companyId: string, id: string): Promise<EstimateProjectDetail | null>;
  findByCustomerId(customerId: string, projectId: string): Promise<EstimateProjectDetail | null>;
  listByCompany(
    companyId: string,
    cursor?: string,
    limit?: number,
  ): Promise<CursorPage<EstimateProjectDetail>>;
  create(project: EstimateProject): Promise<EstimateProjectDetail>;
  update(id: string, data: Record<string, unknown>, version: number): Promise<EstimateProjectDetail>;
  delete(id: string): Promise<void>;
  lockRow(tx: unknown, id: string): Promise<void>;
  findWithLock(tx: unknown, id: string): Promise<EstimateProjectDetail | null>;
  save(project: EstimateProject): Promise<void>;
}