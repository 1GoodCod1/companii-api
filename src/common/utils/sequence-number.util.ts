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
    count: (year: number) => Promise<number>;
    exists: (candidate: string) => Promise<boolean>;
  },
): Promise<string> {
  const year = new Date().getFullYear();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${companySequenceLockKey(opts.namespace, opts.companyId)}::bigint)`;
  const base = await opts.count(year);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const number = `${opts.prefix}-${year}-${String(base + 1 + attempt).padStart(5, '0')}`;
    if (!(await opts.exists(number))) return number;
  }
  return `${opts.prefix}-${year}-${String(base + 1).padStart(5, '0')}`;
}
