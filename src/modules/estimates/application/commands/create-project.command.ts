import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { createEstimateProjectWithStages } from '../../utils/create-estimate-project.util';
import { mergeEnabledWorkModulesIntoDiagnostic } from '../../utils/work-modules.util';
import { projectInclude } from '../../estimate.constants';
import { AppErrors, AppErrorMessages } from '../../../../common/errors';

export interface CreateProjectCommand {
  user: JwtPayload;
  data: {
    customerId: string;
    categoryId: string;
    title?: string;
    siteType?: string;
    address?: string;
    validUntil?: string;
  };
}

@Injectable()
export class CreateProjectCommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async execute(command: CreateProjectCommand) {
    const { user, data } = command;
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    const [customer, category, blueprint, company] = await this.prisma.inSerial([
      () =>
        this.prisma.companyCustomer.findFirst({
          where: { id: data.customerId, companyId: cid },
        }),
      () => this.prisma.category.findUnique({ where: { id: data.categoryId } }),
      () =>
        this.prisma.estimateBlueprint.findFirst({
          where: { categoryId: data.categoryId, isActive: true },
        }),
      () => this.prisma.company.findUnique({ where: { id: cid } }),
    ]);

    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!blueprint) throw AppErrors.notFound('Blueprint not found for category');

    const config = this.ctx.parseBlueprintConfig(blueprint.config);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.access.nextProjectNumber(tx, cid);
      const initialDiagnostic = mergeEnabledWorkModulesIntoDiagnostic({}, config);
      const { id } = await createEstimateProjectWithStages(tx, {
        companyId: cid,
        customerId: data.customerId,
        categoryId: data.categoryId,
        blueprintId: blueprint.id,
        config,
        number,
        title: data.title?.trim() || `Smetă ${category.name}`,
        siteType: data.siteType,
        address: data.address?.trim() || customer.address,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        isTvaPayer: company?.isTvaPayer ?? false,
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });
    });
  }
}