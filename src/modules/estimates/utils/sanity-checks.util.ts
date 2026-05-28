import type { MeasurementMap } from '../pricing/pricing-engine.service';

export type SanityWarningSeverity = 'info' | 'warning';

export type SanityWarning = {
  key: string;
  severity: SanityWarningSeverity;
  message: string;
};

type Check = {
  key: string;
  severity: SanityWarningSeverity;
  /** Returns the warning message if the situation looks off, else null. */
  test: (m: MeasurementMap, diagnostic: Record<string, unknown>) => string | null;
};

function readDiagnosticNumber(d: Record<string, unknown>, key: string): number | undefined {
  const v = d[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Per-category sanity checks. Each rule is conservative: it only fires when the
 * disparity is large enough that a human probably wants to double-check.
 * Returning `null` = no warning.
 */
const CHECKS_BY_SLUG: Record<string, Check[]> = {
  elektrika: [
    {
      key: 'cableLengthLowForRoomCount',
      severity: 'warning',
      test: (m) => {
        const room = m.roomCount ?? 0;
        const cable = m.cableLengthM ?? 0;
        if (room < 2 || cable === 0) return null;
        const expectedMin = room * 8; // ~8m per room is the floor estimate
        if (cable < expectedMin) {
          return `Cablu electric ${cable}m pare scurt pentru ${room} camere (estimat min. ${expectedMin}m). Verificați.`;
        }
        return null;
      },
    },
    {
      key: 'noElectricPoints',
      severity: 'info',
      test: (m) => {
        const points = m.electricPoints ?? 0;
        if ((m.roomCount ?? 0) > 0 && points === 0) {
          return 'Niciun punct electric (priză/întrerupător/lumină) — verificați aparataj.';
        }
        return null;
      },
    },
  ],
  santehnika: [
    {
      key: 'pipeShortForBathrooms',
      severity: 'warning',
      test: (m) => {
        const bath = m.bathroomCount ?? 0;
        const pipe = m.pipeLengthM ?? 0;
        if (bath < 2 || pipe === 0) return null;
        const expectedMin = bath * 5;
        if (pipe < expectedMin) {
          return `Țeavă ${pipe}m pare scurtă pentru ${bath} băi (estimat min. ${expectedMin}m).`;
        }
        return null;
      },
    },
  ],
  clima: [
    {
      key: 'routeShortForUnits',
      severity: 'warning',
      test: (m) => {
        const ac = m.acUnits ?? 0;
        const route = m.routeLengthM ?? 0;
        if (ac < 1 || route === 0) return null;
        if (route < ac * 3) {
          return `Traseu ${route}m pare scurt pentru ${ac} split-uri (minim ~3m/unitate).`;
        }
        return null;
      },
    },
  ],
  'panouri-solare': [
    {
      key: 'missingSystemPower',
      severity: 'warning',
      test: (m, d) => {
        const panels = m.panelCount ?? 0;
        const kw = m.systemPowerKw ?? 0;
        if (panels < 1) return null;
        if (kw === 0 && readDiagnosticNumber(d, 'panelWp') === undefined) {
          return `Puterea sistemului = 0 kW pentru ${panels} panouri. Setați "Putere instalată (kW)" sau "Wp per panou" pentru calcul corect.`;
        }
        return null;
      },
    },
    {
      key: 'inverterMismatch',
      severity: 'info',
      test: (m) => {
        const panels = m.panelCount ?? 0;
        const inverters = m.inverterCount ?? 0;
        if (panels > 20 && inverters === 1) {
          return `${panels} panouri pe 1 invertor — verificați dacă invertorul are capacitate suficientă.`;
        }
        return null;
      },
    },
  ],
  pavaj: [
    {
      key: 'bordersTooShort',
      severity: 'warning',
      test: (m) => {
        const area = m.pavementArea ?? 0;
        const borders = m.borderLengthM ?? 0;
        if (area < 5 || borders === 0) return null;
        const perimeterEst = Math.sqrt(area) * 3; // conservative lower bound
        if (borders < perimeterEst) {
          return `Borduri ${borders}m pare scurt pentru ${area} m² pavaj (perimetru estimat min. ${Math.round(perimeterEst)}m).`;
        }
        return null;
      },
    },
  ],
  'okna-dveri': [
    {
      key: 'noFenestration',
      severity: 'warning',
      test: (m) => {
        const w = m.windowCount ?? 0;
        const d = m.doorCount ?? 0;
        if (w + d === 0) {
          return 'Niciun geam / ușă — adăugați cel puțin un element pentru ofertă validă.';
        }
        return null;
      },
    },
  ],
  mobila: [
    {
      key: 'noFurniture',
      severity: 'warning',
      test: (m) => {
        const cab = m.cabinetCount ?? 0;
        const ward = m.wardrobeCount ?? 0;
        const linear = m.linearMeters ?? 0;
        if (cab + ward === 0 && linear === 0) {
          return 'Nici corpuri, nici metri liniari — completați "Număr corpuri" sau "Metri liniari".';
        }
        return null;
      },
    },
  ],
  acoperis: [
    {
      key: 'steepSlopeNoteworthy',
      severity: 'info',
      test: (m) => {
        const slope = m.roofSlope ?? 0;
        if (slope > 60) {
          return `Pantă ${slope}° este foarte abruptă — verificare manuală recomandată.`;
        }
        return null;
      },
    },
  ],
  constructii: [
    {
      key: 'preliminaryReminder',
      severity: 'info',
      test: (m) => {
        if ((m.preliminaryEstimate ?? 0) > 0) {
          return 'Estimare construcție este preliminară (MVP) — verificare manuală obligatorie înainte de ofertă.';
        }
        return null;
      },
    },
  ],
};

const UNIVERSAL_CHECKS: Check[] = [
  {
    key: 'requiresManualReview',
    severity: 'warning',
    test: (m) =>
      (m.requiresManualReview ?? 0) > 0
        ? 'Smeta necesită verificare manuală (parametri în afara intervalului standard).'
        : null,
  },
];

export function runSanityChecks(
  categorySlug: string | null | undefined,
  measurements: MeasurementMap,
  diagnostic: Record<string, unknown> | null | undefined,
): SanityWarning[] {
  const diag = diagnostic ?? {};
  const warnings: SanityWarning[] = [];

  const all = [...UNIVERSAL_CHECKS, ...(categorySlug ? CHECKS_BY_SLUG[categorySlug] ?? [] : [])];
  for (const check of all) {
    const msg = check.test(measurements, diag);
    if (msg) warnings.push({ key: check.key, severity: check.severity, message: msg });
  }
  return warnings;
}
