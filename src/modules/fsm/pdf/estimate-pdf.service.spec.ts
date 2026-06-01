import { filterStagesForPdf } from './estimate-pdf.service';

describe('filterStagesForPdf', () => {
  it('keeps stages that have line items', () => {
    const stages = [
      {
        id: '1',
        name: 'Montaj aparataj',
        stageTotal: 8047.2,
        lines: [{ id: 'l1', description: 'Lucrări', qty: 6, unitPrice: 900, lineTotal: 5400 }],
      },
    ] as unknown as Parameters<typeof filterStagesForPdf>[0];

    expect(filterStagesForPdf(stages)).toHaveLength(1);
  });

  it('drops empty stages with 0 total and no lines', () => {
    const stages = [
      {
        id: '1',
        name: 'Proiect & traseu',
        stageTotal: 0,
        lines: [],
      },
      {
        id: '2',
        name: 'Montaj aparataj',
        stageTotal: 8047.2,
        lines: [{ id: 'l1', description: 'Lucrări', qty: 6, unitPrice: 900, lineTotal: 5400 }],
      },
    ] as unknown as Parameters<typeof filterStagesForPdf>[0];

    const filtered = filterStagesForPdf(stages);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Montaj aparataj');
  });

  it('keeps stages without lines but with positive stageTotal', () => {
    const stages = [
      {
        id: '1',
        name: 'Extra',
        stageTotal: 100,
        lines: [],
      },
    ] as unknown as Parameters<typeof filterStagesForPdf>[0];

    expect(filterStagesForPdf(stages)).toHaveLength(1);
  });
});
