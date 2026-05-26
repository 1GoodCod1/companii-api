export function formatMoney(value: number): string {
  return `${value.toLocaleString('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString('ro-MD', { day: '2-digit', month: 'long', year: 'numeric' });
}
