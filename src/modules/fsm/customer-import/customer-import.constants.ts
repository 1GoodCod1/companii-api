export const CUSTOMER_IMPORT_MAX_ROWS = 1000;

export const CUSTOMER_IMPORT_TEMPLATE_FILENAME = 'faber-clienti-import';

/** Romanian headers used in the official template (order matters for export). */
export const CUSTOMER_IMPORT_TEMPLATE_COLUMNS = [
  { key: 'fullName' as const, header: 'Nume complet *', width: 28 },
  { key: 'phone' as const, header: 'Telefon *', width: 18 },
  { key: 'email' as const, header: 'Email', width: 28 },
  { key: 'address' as const, header: 'Adresă *', width: 40 },
  { key: 'notes' as const, header: 'Note', width: 32 },
];

export const CUSTOMER_IMPORT_HEADER_ALIASES: Record<
  keyof Omit<import('./customer-import.types').ParsedCustomerImportRow, 'rowNumber'>,
  string[]
> = {
  fullName: ['nume complet', 'nume', 'full name', 'name', 'client', 'denumire'],
  phone: ['telefon', 'phone', 'tel', 'mobile', 'gsm'],
  email: ['email', 'e-mail', 'mail'],
  address: ['adresă', 'adresa', 'address', 'adresă lucru', 'adresa lucru', 'locatie', 'locație'],
  notes: ['note', 'notes', 'observații', 'observatii', 'comentariu'],
};

export const CUSTOMER_IMPORT_EXAMPLE_ROWS = [
  {
    fullName: 'Ion Popescu',
    phone: '+37369123456',
    email: 'ion.popescu@example.md',
    address: 'str. Ștefan cel Mare 12, Chișinău',
    notes: 'Preferă contact dimineața',
  },
  {
    fullName: 'Maria Rusu',
    phone: '069876543',
    email: '',
    address: 'bd. Dacia 45, ap. 7, Chișinău',
    notes: '',
  },
];
