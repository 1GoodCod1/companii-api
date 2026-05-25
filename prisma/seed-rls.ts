import { Prisma, PrismaClient } from '@prisma/client';

const SEED_RLS_CONTEXT = {
  userId: 'system',
  accountKind: 'PLATFORM_ADMIN' as const,
};

export async function withSeedRlsContext<T>(
  prisma: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config('app.current_user_id', ${SEED_RLS_CONTEXT.userId}, true),
             set_config('app.current_company_id', '', true),
             set_config('app.user_role', ${SEED_RLS_CONTEXT.accountKind}, true),
             set_config('app.current_company_role', '', true),
             set_config('app.current_member_id', '', true),
             set_config('app.current_customer_id', '', true)
    `;
    return work(tx);
  });
}
