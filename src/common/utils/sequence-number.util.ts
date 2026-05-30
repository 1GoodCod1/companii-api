import type { Prisma } from '@prisma/client';

/** Deterministic 32-bit hash for advisory-lock keys (uniform across replicas). */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Per-company advisory-lock key, namespaced so different sequences never collide. */
export function companySequenceLockKey(namespace: string, companyId: string): bigint {
  return BigInt(fnv1a32(`${namespace}::${companyId}`));
}

/**
 * B7 — issue the next per-company sequential number (`PREFIX-00001`) safely.
 *
 * Must run inside a transaction: takes a per-company advisory lock so two
 * concurrent callers can't both read the same count and race on the same
 * number (the unique-constraint retry loop is kept as a belt-and-braces guard).
 * Mirrors the proven invoice-number issuance in fsm/services/invoices.service.ts.
 */
export async function nextCompanyNumber(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    /** Lock namespace, e.g. 'intervention-number'. */
    namespace: string;
    /** Number prefix, e.g. 'INT'. */
    prefix: string;
    count: () => Promise<number>;
    exists: (candidate: string) => Promise<boolean>;
  },
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${companySequenceLockKey(opts.namespace, opts.companyId)}::bigint)`;
  const base = await opts.count();
  let number = `${opts.prefix}-${String(base + 1).padStart(5, '0')}`;
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (!(await opts.exists(number))) return number;
    number = `${opts.prefix}-${String(base + 1 + attempt).padStart(5, '0')}`;
  }
  return number;
}
