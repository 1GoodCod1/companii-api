export function formatMoney(value: number): string {
  return `${value.toLocaleString('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

export function formatDate(value: Date, locale: string = 'ro-MD'): string {
  return value.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}