import ExcelJS from 'exceljs';
import {
  CUSTOMER_IMPORT_HEADER_ALIASES,
  CUSTOMER_IMPORT_MAX_ROWS,
  CUSTOMER_IMPORT_TEMPLATE_COLUMNS,
} from './customer-import.constants';
import type { ParsedCustomerImportRow } from './customer-import.types';
import { normalizePhone, phonesMatch } from '../../../common/utils/phone.util';

type ColumnMap = Partial<
  Record<keyof Omit<ParsedCustomerImportRow, 'rowNumber'>, number>
>;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\*/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveColumnMap(headers: string[]): ColumnMap | null {
  const map: ColumnMap = {};
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeHeader(headers[index]);
    if (!header) continue;

    for (const [field, aliases] of Object.entries(CUSTOMER_IMPORT_HEADER_ALIASES) as Array<
      [keyof ColumnMap, string[]]
    >) {
      if (aliases.some((alias) => header === normalizeHeader(alias))) {
        map[field] = index;
      }
    }
  }

  if (
    map.fullName === undefined ||
    map.phone === undefined ||
    map.address === undefined
  ) {
    return null;
  }

  return map;
}

function cellValue(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return String(row[index] ?? '').trim();
}

function parseRowValues(
  row: string[],
  columnMap: ColumnMap,
  rowNumber: number,
): ParsedCustomerImportRow | null {
  const fullName = cellValue(row, columnMap.fullName);
  const phoneRaw = cellValue(row, columnMap.phone);
  const email = cellValue(row, columnMap.email).toLowerCase() || undefined;
  const address = cellValue(row, columnMap.address);
  const notes = cellValue(row, columnMap.notes) || undefined;

  if (!fullName && !phoneRaw && !address && !email && !notes) {
    return null;
  }

  const phone = normalizePhone(phoneRaw) ?? phoneRaw;

  return {
    rowNumber,
    fullName,
    phone,
    email,
    address,
    notes,
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    if ((char === ';' || char === '\t') && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8');
  }
  return buffer.toString('utf8');
}

export function parseCustomerImportCsv(buffer: Buffer): ParsedCustomerImportRow[] {
  const text = decodeCsvBuffer(buffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headerLine = lines[0]!;
  const delimiter =
    headerLine.includes(';') && !headerLine.includes(',') ? ';' : headerLine.includes('\t') ? '\t' : ',';
  const headers = (delimiter === ','
    ? parseCsvLine(headerLine)
    : headerLine.split(delimiter).map((cell) => cell.trim())
  ).map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, '') : cell));

  const columnMap = resolveColumnMap(headers);
  if (!columnMap) {
    throw new Error('Antetul fișierului CSV nu conține coloanele obligatorii: Nume complet, Telefon, Adresă.');
  }

  const rows: ParsedCustomerImportRow[] = [];
  for (let i = 1; i < lines.length && rows.length < CUSTOMER_IMPORT_MAX_ROWS; i += 1) {
    const line = lines[i]!;
    const cells =
      delimiter === ','
        ? parseCsvLine(line)
        : line.split(delimiter).map((cell) => cell.trim());
    const parsed = parseRowValues(cells, columnMap, i + 1);
    if (parsed) rows.push(parsed);
  }

  return rows;
}

export async function parseCustomerImportXlsx(buffer: Buffer): Promise<ParsedCustomerImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.getWorksheet('Clienți') ??
    workbook.getWorksheet('Clienti') ??
    workbook.worksheets[0];
  if (!sheet) return [];

  let headerRowNumber = 1;
  let columnMap: ColumnMap | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (columnMap) return;
    const headers = (row.values as unknown[])
      .slice(1)
      .map((value) => String(value ?? ''));
    const resolved = resolveColumnMap(headers);
    if (resolved) {
      columnMap = resolved;
      headerRowNumber = rowNumber;
    }
  });

  if (!columnMap) {
    throw new Error(
      'Fișierul Excel nu conține antetul obligatoriu (Nume complet, Telefon, Adresă). Folosiți șablonul Faber.',
    );
  }

  const rows: ParsedCustomerImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber || rows.length >= CUSTOMER_IMPORT_MAX_ROWS) return;

    const cells = Array.from({ length: 20 }, (_, index) =>
      String(row.getCell(index + 1).text ?? '').trim(),
    );

    const parsed = parseRowValues(cells, columnMap!, rowNumber);
    if (parsed) rows.push(parsed);
  });

  return rows;
}

export function parseCustomerImportFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCustomerImportRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return Promise.resolve(parseCustomerImportCsv(buffer));
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseCustomerImportXlsx(buffer);
  }
  throw new Error('Format neacceptat. Folosiți fișier .xlsx sau .csv.');
}

export function isDuplicatePhoneInFile(
  rows: ParsedCustomerImportRow[],
  phone: string,
  rowNumber: number,
): boolean {
  return rows.some(
    (row) => row.rowNumber < rowNumber && phonesMatch(row.phone, phone),
  );
}

export function isValidEmail(value: string | undefined): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
