export type CustomerImportRowAction = 'create' | 'update' | 'skip' | 'error';

export type ParsedCustomerImportRow = {
  rowNumber: number;
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  notes?: string;
};

export type CustomerImportPreviewRow = ParsedCustomerImportRow & {
  action: CustomerImportRowAction;
  reason?: string;
  existingCustomerId?: string;
};

export type CustomerImportPreviewResult = {
  rows: CustomerImportPreviewRow[];
  summary: {
    total: number;
    create: number;
    update: number;
    skip: number;
    error: number;
  };
};

export type CustomerImportConfirmRow = {
  action: 'create' | 'update';
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  notes?: string;
  existingCustomerId?: string;
};

export type CustomerImportConfirmResult = {
  created: number;
  updated: number;
  skipped: number;
  customerIds: string[];
};
