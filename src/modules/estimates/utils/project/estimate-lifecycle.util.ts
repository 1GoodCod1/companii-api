import { EstimateProjectStatus, InterventionStatus, Prisma } from '@prisma/client';

export function shouldCloseEstimateProject(
  interventionStatuses: InterventionStatus[],
): boolean {
  if (interventionStatuses.length === 0) return false;
  const allClosed = interventionStatuses.every(
    (s) => s === InterventionStatus.PAID || s === InterventionStatus.CANCELLED,
  );
  const anyPaid = interventionStatuses.some((s) => s === InterventionStatus.PAID);
  return allClosed && anyPaid;
}

export async function reconcileEstimateProjectLifecycle(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  const project = await tx.estimateProject.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) return;
  if (
    project.status !== EstimateProjectStatus.IN_EXECUTION &&
    project.status !== EstimateProjectStatus.DONE
  ) {
    return;
  }

  const interventions = await tx.intervention.findMany({
    where: { estimateProjectId: projectId },
    select: { status: true },
  });

  const allCancelledOrEmpty =
    interventions.length === 0 ||
    interventions.every((i) => i.status === InterventionStatus.CANCELLED);

  if (allCancelledOrEmpty) {
    await tx.estimateProject.update({
      where: { id: projectId },
      data: { status: EstimateProjectStatus.ACCEPTED },
    });
    const sourceLead = await tx.companyLead.findFirst({
      where: { estimateProjectId: projectId },
    });
    // Reopen the lead only if it isn't a dead deal. A LOST lead must stay closed:
    // cancelling its interventions should never silently revive it.
    if (sourceLead && sourceLead.status !== 'LOST') {
      await tx.companyLead.update({
        where: { id: sourceLead.id },
        data: { status: 'IN_PROGRESS', convertedAt: null },
      });
    }
    return;
  }

  const shouldBeDone = shouldCloseEstimateProject(interventions.map((i) => i.status));

  if (shouldBeDone && project.status === EstimateProjectStatus.IN_EXECUTION) {
    await tx.estimateProject.update({
      where: { id: projectId },
      data: { status: EstimateProjectStatus.DONE },
    });
  } else if (!shouldBeDone && project.status === EstimateProjectStatus.DONE) {
    await tx.estimateProject.update({
      where: { id: projectId },
      data: { status: EstimateProjectStatus.IN_EXECUTION },
    });
  }
}
