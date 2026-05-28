import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

interface VersionSnapshot {
  projectId: string;
  version: number;
  label?: string;
  lineCount: number;
  grandTotal: number;
  stages: Array<{
    name: string;
    lines: Array<{
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
      lineTotal: number;
    }>;
  }>;
}

export interface VersionSummary {
  id: string;
  version: number;
  label: string | null;
  lineCount: number;
  grandTotal: number;
  createdAt: string;
}

export interface VersionDiff {
  versionA: number;
  versionB: number;
  lineCountDelta: number;
  grandTotalDelta: number;
  addedLines: string[];
  removedLines: string[];
}

@Injectable()
export class EstimateVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  /** Snapshot the current state of a project as a new version. */
  async snapshot(companyId: string, projectId: string, label?: string): Promise<VersionSummary> {
    const project = await this.access.loadProjectForPdf(companyId, projectId);

    // Determine next version number
    const lastVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    let lineCount = 0;
    const stages = (project.stages ?? []).map((stage) => {
      const lines = (stage.lines ?? []).map((line) => {
        lineCount++;
        return {
          description: line.description,
          qty: Number(line.qty),
          unit: line.unit,
          unitPrice: Number(line.unitPrice),
          lineTotal: Number(line.lineTotal),
        };
      });
      return { name: stage.name, lines };
    });

    const snapshot: VersionSnapshot = {
      projectId,
      version: nextVersion,
      label,
      lineCount,
      grandTotal: Number(project.grandTotal),
      stages,
    };

    const created = await this.prisma.estimateVersion.create({
      data: {
        projectId,
        version: nextVersion,
        label: label ?? `v${nextVersion}`,
        snapshot: snapshot as any,
        lineCount,
        grandTotal: Number(project.grandTotal),
      },
    });

    return {
      id: created.id,
      version: created.version,
      label: created.label,
      lineCount: created.lineCount,
      grandTotal: Number(created.grandTotal),
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listVersions(projectId: string): Promise<VersionSummary[]> {
    const versions = await this.prisma.estimateVersion.findMany({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        label: true,
        lineCount: true,
        grandTotal: true,
        createdAt: true,
      },
    });
    return versions.map((v) => ({
      ...v,
      grandTotal: Number(v.grandTotal),
      createdAt: v.createdAt.toISOString(),
    }));
  }

  async diff(
    projectId: string,
    versionA: number,
    versionB: number,
  ): Promise<VersionDiff> {
    const [a, b] = await Promise.all([
      this.prisma.estimateVersion.findUniqueOrThrow({
        where: { projectId_version: { projectId, version: versionA } },
        select: { version: true, snapshot: true, lineCount: true, grandTotal: true },
      }),
      this.prisma.estimateVersion.findUniqueOrThrow({
        where: { projectId_version: { projectId, version: versionB } },
        select: { version: true, snapshot: true, lineCount: true, grandTotal: true },
      }),
    ]);

    const snapA = a.snapshot as unknown as VersionSnapshot;
    const snapB = b.snapshot as unknown as VersionSnapshot;

    // Collect all line descriptions from both versions
    const linesA = new Set<string>();
    const linesB = new Set<string>();

    for (const stage of snapA.stages ?? []) {
      for (const line of stage.lines ?? []) {
        linesA.add(`[${stage.name}] ${line.description}`);
      }
    }
    for (const stage of snapB.stages ?? []) {
      for (const line of stage.lines ?? []) {
        linesB.add(`[${stage.name}] ${line.description}`);
      }
    }

    const addedLines: string[] = [];
    const removedLines: string[] = [];

    for (const line of linesB) {
      if (!linesA.has(line)) addedLines.push(line);
    }
    for (const line of linesA) {
      if (!linesB.has(line)) removedLines.push(line);
    }

    return {
      versionA,
      versionB,
      lineCountDelta: b.lineCount - a.lineCount,
      grandTotalDelta: Math.round((Number(b.grandTotal) - Number(a.grandTotal)) * 100) / 100,
      addedLines: addedLines.slice(0, 50),
      removedLines: removedLines.slice(0, 50),
    };
  }
}