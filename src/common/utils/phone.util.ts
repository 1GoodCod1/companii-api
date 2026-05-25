const MD_PHONE_DIGITS = /^(\+373|373|0)?(\d{8})$/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const compact = input.replace(/[\s\-().]/g, '');
  const digitsOnly = compact.replace(/\D/g, '');

  if (digitsOnly.length === 8) {
    return `+373${digitsOnly}`;
  }

  if (digitsOnly.startsWith('373') && digitsOnly.length === 11) {
    return `+${digitsOnly}`;
  }

  if (compact.startsWith('+') && digitsOnly.length >= 10) {
    return `+${digitsOnly}`;
  }

  const match = compact.match(MD_PHONE_DIGITS);
  if (match?.[2]) {
    return `+373${match[2]}`;
  }

  return compact;
}

export function phoneVariants(input: string | null | undefined): string[] {
  const normalized = normalizePhone(input);
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, '');
  const local = digits.startsWith('373') ? digits.slice(3) : digits;

  return [...new Set([normalized, digits, `+${digits}`, local, `0${local}`])];
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = phoneVariants(a);
  const right = phoneVariants(b);
  if (left.length === 0 || right.length === 0) return false;
  return left.some((value) => right.includes(value));
}

export function isEmailLogin(value: string): boolean {
  return value.includes('@');
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(' '),
  };
}
