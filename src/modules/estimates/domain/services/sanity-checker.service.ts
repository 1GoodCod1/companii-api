export interface SanityWarning {
  key: string;
  severity: 'warning' | 'error';
  message: string;
}

export class SanityCheckerService {
  check(categorySlug: string | undefined, measurements: Record<string, number>, _diagnostic: Record<string, unknown>): SanityWarning[] {
    const warnings: SanityWarning[] = [];
    if (!categorySlug) return warnings;

    const totalLines = Object.keys(measurements).length;
    if (totalLines === 0) {
      warnings.push({
        key: 'noMeasurements',
        severity: 'warning',
        message: 'Nicio măsurătoare nu a fost derivată din planul 2D.',
      });
    }

    const suspiciousKeys = Object.entries(measurements).filter(([, v]) => v < 0);
    for (const [key] of suspiciousKeys) {
      warnings.push({
        key: 'negativeMeasurement',
        severity: 'error',
        message: `Măsurătoarea "${key}" este negativă. Verificați datele.`,
      });
    }

    return warnings;
  }
}