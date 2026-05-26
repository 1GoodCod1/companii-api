import { parseCustomerImportCsv, isDuplicatePhoneInFile } from './customer-import.parser';
import { buildCustomerImportCsvTemplate } from './customer-import.template';

describe('customer import', () => {
  it('parses semicolon CSV with required columns', () => {
    const { buffer } = buildCustomerImportCsvTemplate();
    const rows = parseCustomerImportCsv(buffer);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.fullName).toBe('Ion Popescu');
    expect(rows[0]?.address).toContain('Ștefan cel Mare');
    expect(rows[0]?.phone).toBe('+37369123456');
  });

  it('detects duplicate phones within the same file', () => {
    const rows = [
      { rowNumber: 2, fullName: 'A', phone: '+37369111111', address: 'Addr 1' },
      { rowNumber: 3, fullName: 'B', phone: '069111111', address: 'Addr 2' },
    ];
    expect(isDuplicatePhoneInFile(rows, '+37369111111', 3)).toBe(true);
  });
});
