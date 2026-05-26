import { CompanyLeadSource } from '@prisma/client';

export const LEAD_SOURCE_LABELS: Record<CompanyLeadSource, string> = {
  SERVICE_REQUEST: 'Cerere serviciu',
  PROJECT_REQUEST: 'Cerere proiect',
  MANUAL: 'Cerere manuală',
  PHONE: 'Telefon',
  WEBSITE: 'Site',
};

export function isGalleryVideoUrl(url: string): boolean {
  const lower = url.split('?')[0]?.toLowerCase() ?? '';
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm');
}
