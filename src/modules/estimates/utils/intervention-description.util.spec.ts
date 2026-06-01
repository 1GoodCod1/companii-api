import {
  buildInterventionDescriptionFromEstimate,
  buildSingleInterventionDescription,
  sanitizeInterventionDescriptionForTechnician,
} from './intervention-description.util';

describe('intervention description util', () => {
  it('builds operational description without prices', () => {
    const description = buildSingleInterventionDescription('EST-00001', {
      stages: [
        { code: 'a', name: 'Proiect & traseu', stageTotal: 0, lines: [] },
        { code: 'b', name: 'Montaj aparataj', stageTotal: 6238, lines: [{ source: 'rule' }] },
      ],
      blueprint: null,
      diagnosticAnswers: null,
    });

    expect(description).toContain('Montaj aparataj');
    expect(description).not.toContain('MDL');
    expect(description).not.toContain('Proiect & traseu');
  });

  it('builds stage-scoped description for by-stage interventions', () => {
    const description = buildInterventionDescriptionFromEstimate(
      {
        number: 'EST-00001',
        stages: [
          { id: 's1', code: 'a', name: 'Proiect & traseu', stageTotal: 0, lines: [] },
          { id: 's2', code: 'b', name: 'Montaj aparataj', stageTotal: 6238, lines: [{ source: 'rule' }] },
        ],
        blueprint: null,
        diagnosticAnswers: null,
      },
      's2',
    );

    expect(description).toBe('Montaj aparataj');
  });

  it('builds client-facing description without internal references', () => {
    const description = buildSingleInterventionDescription(
      'EST-00001',
      {
        stages: [
          { code: 'a', name: 'Proiect & traseu', stageTotal: 0, lines: [] },
          { code: 'b', name: 'Montaj aparataj', stageTotal: 6238, lines: [{ source: 'rule' }] },
        ],
        blueprint: null,
        diagnosticAnswers: null,
      },
      'client',
    );

    expect(description).toBe('Lucrare din smetă EST-00001:\n• Montaj aparataj');
    expect(description).not.toContain('Fișă execuție');
    expect(description).not.toContain('MDL');
  });

  it('strips legacy price suffixes for technicians', () => {
    const sanitized = sanitizeInterventionDescriptionForTechnician(
      'Din smetă EST-00001:\n• Proiect & traseu (0 MDL)\n• Montaj aparataj (6238 MDL)',
    );

    expect(sanitized).toBe('Din smetă EST-00001:\n• Montaj aparataj');
  });
});
