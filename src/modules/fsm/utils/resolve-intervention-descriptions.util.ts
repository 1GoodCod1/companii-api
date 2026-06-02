import type { PrismaService } from '../../shared/database/prisma.service';
import {
  buildInterventionDescriptionFromEstimate,
  type InterventionDescriptionAudience,
} from '../../estimates/utils/worksheet/intervention-description.util';

const estimateProjectSelect = {
  id: true,
  number: true,
  diagnosticAnswers: true,
  blueprint: { select: { config: true } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      stageTotal: true,
      lines: { select: { source: true } },
    },
  },
};

export async function resolveInterventionDescriptions<
  T extends {
    estimateProjectId?: string | null;
    estimateStageId?: string | null;
    description?: string | null;
  },
>(
  prisma: PrismaService,
  items: T[],
  audience: InterventionDescriptionAudience = 'staff',
): Promise<T[]> {
  const projectIds = [
    ...new Set(items.map((item) => item.estimateProjectId).filter((id): id is string => !!id)),
  ];
  if (projectIds.length === 0) return items;

  const projects = await prisma.estimateProject.findMany({
    where: { id: { in: projectIds } },
    select: estimateProjectSelect,
  });
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return items.map((item) => {
    if (!item.estimateProjectId) return item;
    const project = projectById.get(item.estimateProjectId);
    if (!project) return item;
    return {
      ...item,
      description: buildInterventionDescriptionFromEstimate(
        project,
        item.estimateStageId,
        audience,
      ),
    };
  });
}
