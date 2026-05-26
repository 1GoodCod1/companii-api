import ExcelJS from 'exceljs';
import {
  CUSTOMER_IMPORT_EXAMPLE_ROWS,
  CUSTOMER_IMPORT_TEMPLATE_COLUMNS,
  CUSTOMER_IMPORT_TEMPLATE_FILENAME,
} from './customer-import.constants';

const BRAND_VIOLET = 'FF5B21B6';
const BRAND_VIOLET_LIGHT = 'FFF5F3FF';
const HEADER_FONT = 'FFFFFFFF';
const EXAMPLE_FONT = 'FF6B7280';
const BORDER_COLOR = 'FFE5E7EB';

function escapeCsv(value: string): string {
  if (/[",;\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCustomerImportCsvTemplate(): { buffer: Buffer; filename: string } {
  const header = CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map((col) => col.header).join(';');
  const exampleLines = CUSTOMER_IMPORT_EXAMPLE_ROWS.map((row) =>
    [
      escapeCsv(row.fullName),
      escapeCsv(row.phone),
      escapeCsv(row.email),
      escapeCsv(row.address),
      escapeCsv(row.notes),
    ].join(';'),
  );

  const content = `\uFEFF${header}\n${exampleLines.join('\n')}\n`;
  return {
    buffer: Buffer.from(content, 'utf8'),
    filename: `${CUSTOMER_IMPORT_TEMPLATE_FILENAME}.csv`,
  };
}

export async function buildCustomerImportXlsxTemplate(): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Faber Companii';
  workbook.created = new Date();

  const instructions = workbook.addWorksheet('Instrucțiuni', {
    views: [{ showGridLines: true }],
  });
  instructions.columns = [{ width: 92 }];

  const instructionLines = [
    'ȘABLON IMPORT CLIENȚI — FABER COMPANII',
    '',
    '1. Completați datele în foaia «Clienți». Nu modificați rândul de antet.',
    '2. Coloane obligatorii (*): Nume complet, Telefon, Adresă.',
    '3. Telefon: format Moldova (+373XXXXXXXX sau 0XXXXXXXX). Un client = un telefon.',
    '4. Ștergeți rândurile exemplu înainte de import sau înlocuiți-le cu clienții dvs.',
    '5. Dacă telefonul există deja în baza companiei, datele vor fi actualizate la import.',
    '6. Limită: 1000 clienți per fișier. Formate acceptate: .xlsx, .csv',
    '',
    'Coloane:',
    '• Nume complet * — persoană de contact',
    '• Telefon * — unic per client (folosit pentru identificare)',
    '• Email — opțional',
    '• Adresă * — adresă lucrare / livrare',
    '• Note — observații interne (cod interfon, program preferat)',
  ];

  instructionLines.forEach((line, index) => {
    const row = instructions.getRow(index + 1);
    row.getCell(1).value = line;
    row.getCell(1).font =
      index === 0
        ? { bold: true, size: 14, color: { argb: BRAND_VIOLET } }
        : { size: 11, color: { argb: 'FF374151' } };
    row.height = index === 0 ? 24 : 18;
  });

  const sheet = workbook.addWorksheet('Clienți', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
  });

  sheet.columns = CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map((col) => ({
    key: col.key,
    width: col.width,
  }));

  const headerRow = sheet.getRow(1);
  CUSTOMER_IMPORT_TEMPLATE_COLUMNS.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND_VIOLET },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    };
  });
  headerRow.height = 28;

  CUSTOMER_IMPORT_EXAMPLE_ROWS.forEach((example, rowIndex) => {
    const row = sheet.getRow(rowIndex + 2);
    row.values = [
      example.fullName,
      example.phone,
      example.email,
      example.address,
      example.notes,
    ];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { italic: true, color: { argb: EXAMPLE_FONT }, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BRAND_VIOLET_LIGHT },
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: BORDER_COLOR } },
      };
    });
  });

  sheet.getRow(CUSTOMER_IMPORT_EXAMPLE_ROWS.length + 2).eachCell({ includeEmpty: true }, (cell) => {
    cell.note = 'Exemplu — ștergeți sau înlocuiți înainte de import';
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    filename: `${CUSTOMER_IMPORT_TEMPLATE_FILENAME}.xlsx`,
  };
}

export async function buildCustomerImportTemplate(format: 'xlsx' | 'csv'): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
}> {
  if (format === 'csv') {
    const csv = buildCustomerImportCsvTemplate();
    return {
      ...csv,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  const xlsx = await buildCustomerImportXlsxTemplate();
  return {
    ...xlsx,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
