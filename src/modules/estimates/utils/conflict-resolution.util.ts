import { AppErrors } from '../../../common/errors';
import type { Prisma, PrismaClient } from '@prisma/client';

export const ESTIMATE_VERSION_CONFLICT = 'ESTIMATE_VERSION_CONFLICT';

export type ConflictMetadata = {
  expectedVersion?: number;
  clientMutationId?: string;
  clientDraftId?: string;
  kind?: string;
};

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * M-05: optimistic concurrency check. Throws a typed 409 when the
 * expected version doesn't match the current row version. Callers should
 * be inside a transaction with `FOR UPDATE` so version cannot change
 * between this check and the subsequent UPDATE.
 */
export function assertVersionMatch(
  current: number,
  expected: number | undefined,
  serverPayload: { number: string; title: string },
): void {
  if (expected === undefined) return;
  if (current === expected) return;
  throw AppErrors.conflict({
    code: ESTIMATE_VERSION_CONFLICT,
    expectedVersion: expected,
    serverVersion: current,
    number: serverPayload.number,
    title: serverPayload.title,
  });
}

/**
 * Returns `true` if this mutation was already applied — caller should
 * skip the write and reply with the current server state (idempotent
 * replay safety for the offline queue).
 */
export async function isMutationAlreadyApplied(
  tx: TxClient,
  projectId: string,
  mutationId: string,
): Promise<boolean> {
  const existing = await tx.estimateAppliedMutation.findFirst({
    where: { projectId, mutationId },
  });
  return existing !== null;
}

export async function recordAppliedMutation(
  tx: TxClient,
  projectId: string,
  mutationId: string | undefined,
  kind: string,
  clientDraftId?: string,
): Promise<void> {
  if (!mutationId) return;
  await tx.estimateAppliedMutation.create({
    data: { projectId, mutationId, kind, clientDraftId },
  });
}
