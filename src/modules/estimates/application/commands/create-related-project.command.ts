import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { createEstimateProjectWithStages } from '../../utils/project/create-estimate-project.util';
import { resolveEstimateGroupId } from '../../utils/project/ensure-estimate-group.util';
import { projectInclude } from '../../estimate.constants';
import { AppErrors, AppErrorMessages } from '../../../../common/errors';
import { canHostEstimateRelatedProjects, canLinkEstimateCategories } from '../../../../common/constants/estimate-category-slugs.constants';

export interface CreateRelatedProjectCommand {
  user: JwtPayload;
  sourceProjectId: string;
  data: {
    categoryId: string;
    title?: string;
  };
}

@Injectable()
export class CreateRelatedProjectCommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async execute(command: CreateRelatedProjectCommand) {
    const { user, sourceProjectId, data } = command;
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    const source = await this.prisma.estimateProject.findFirst({
      where: { id: sourceProjectId, companyId: cid },
      select: {
        id: true,
        customerId: true,
        groupId: true,
        address: true,
        siteType: true,
        title: true,
        categoryId: true,
        category: { select: { slug: true } },
      },
    });
    if (!source) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const [category, blueprint, company] = await this.prisma.inSerial([
      () => this.prisma.category.findUnique({ where: { id: data.categoryId } }),
      () =>
        this.prisma.estimateBlueprint.findFirst({
          where: { categoryId: data.categoryId, isActive: true },
        }),
      () => this.prisma.company.findUnique({ where: { id: cid } }),
    ]);

    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!blueprint) throw AppErrors.notFound('Blueprint not found for category');
    if (!canHostEstimateRelatedProjects(source.category.slug)) {
      throw AppErrors.badRequest(
        'Calculele conexe pot fi adăugate doar din categoria finisaje / renovare.',
      );
    }
    if (!canLinkEstimateCategories(source.category.slug, category.slug)) {
      throw AppErrors.badRequest(
        'Categoria selectată nu poate fi legată de acest calcul.',
      );
    }

    const config = this.ctx.parseBlueprintConfig(blueprint.config);

    return this.prisma.$transaction(async (tx) => {
      const groupId = await resolveEstimateGroupId(tx, {
        companyId: cid,
        customerId: source.customerId,
        address: source.address,
        title: source.address?.trim() || source.title,
        existingGroupId: source.groupId,
        anchorProjectId: source.groupId ? undefined : source.id,
      });

      const number = await this.access.nextProjectNumber(tx, cid);
      const { id } = await createEstimateProjectWithStages(tx, {
        companyId: cid,
        customerId: source.customerId,
        categoryId: data.categoryId,
        blueprintId: blueprint.id,
        config,
        number,
        title: data.title?.trim() || `Calcul de preț ${category.name}`,
        siteType: source.siteType,
        address: source.address,
        isTvaPayer: company?.isTvaPayer ?? false,
        groupId,
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });
    });
  }
}
