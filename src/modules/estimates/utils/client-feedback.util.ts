import { Prisma } from '@prisma/client';

export type EstimateClientFeedbackKind = 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGES';

export type EstimateClientFeedbackEntry = {
  kind: EstimateClientFeedbackKind;
  comment?: string;
  createdAt: string;
};

const FEEDBACK_KINDS: ReadonlySet<EstimateClientFeedbackKind> = new Set([
  'ACCEPT',
  'REJECT',
  'REQUEST_CHANGES',
]);

export function readClientFeedback(raw: unknown): EstimateClientFeedbackEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is EstimateClientFeedbackEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const kind = (entry as { kind?: unknown }).kind;
    return typeof kind === 'string' && FEEDBACK_KINDS.has(kind as EstimateClientFeedbackKind);
  });
}

export function appendClientFeedback(
  current: unknown,
  entry: Omit<EstimateClientFeedbackEntry, 'createdAt'> & { createdAt?: string },
): Prisma.InputJsonValue {
  const history = readClientFeedback(current);
  const next: EstimateClientFeedbackEntry = {
    kind: entry.kind,
    comment: entry.comment?.trim() || undefined,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  return [...history, next] as unknown as Prisma.InputJsonValue;
}
