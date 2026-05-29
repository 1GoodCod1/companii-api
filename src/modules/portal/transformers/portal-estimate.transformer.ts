export class PortalEstimateTransformer {
  static toClientView(project: any): any {
    if (!project) return null;
    const {
      marginPct,
      laborRate,
      ...sanitizedProject
    } = project;

    if (project.stages && Array.isArray(project.stages)) {
      sanitizedProject.stages = project.stages.map((stage: any) => {
        const {
          laborRate: stageLaborRate,
          marginPct: stageMarginPct,
          laborCost: stageLaborCost,
          materialCost: stageMaterialCost,
          lines,
          ...sanitizedStage
        } = stage;
        if (lines && Array.isArray(lines)) {
          sanitizedStage.lines = lines.map((line: any) => {
            const {
              laborRate: lineLaborRate,
              marginPct: lineMarginPct,
              laborCost: lineLaborCost,
              materialCost: lineMaterialCost,
              ...sanitizedLine
            } = line;
            return sanitizedLine;
          });
        }

        return sanitizedStage;
      });
    }

    return sanitizedProject;
  }
}
