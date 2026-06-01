import {
  formatWorksheetMaterialDescription,
  isWorksheetMaterialLine,
} from './worksheet-stage-filter.util';

describe('worksheet stage filter util', () => {
  it('treats lucrări lines as labor, not material', () => {
    expect(
      isWorksheetMaterialLine({
        unit: 'buc',
        description: 'Priză — lucrări montaj',
        source: 'rule',
      }),
    ).toBe(false);
  });

  it('keeps material lines for worksheet inventory', () => {
    expect(
      isWorksheetMaterialLine({
        unit: 'buc',
        description: 'Priză — material',
        source: 'rule',
      }),
    ).toBe(true);
  });

  it('shortens material descriptions for fișa de execuție', () => {
    expect(formatWorksheetMaterialDescription('Priză — material')).toBe('Priză');
    expect(formatWorksheetMaterialDescription('Punct lumină — material')).toBe('Punct lumină');
    expect(formatWorksheetMaterialDescription('Cablu + tub (secțiune ajustabilă)')).toBe(
      'Cablu + tub (secțiune ajustabilă)',
    );
  });
});
