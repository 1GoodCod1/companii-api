import type { Prisma } from '@prisma/client';

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function companySequenceLockKey(namespace: string, companyId: string): bigint {
  return BigInt(fnv1a32(`${namespace}::${companyId}`));
}

export async function nextCompanyNumber(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    namespace: string;
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
