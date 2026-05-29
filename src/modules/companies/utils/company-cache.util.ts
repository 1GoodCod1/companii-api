import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

export async function invalidateCompanyCacheById(
  prisma: PrismaService,
  cache: CacheService,
  companyId: string,
): Promise<void> {
  const company = await prisma.runOutsideRlsContext(() =>
    prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
  );
  if (company?.slug) await cache.invalidatePublicCompanies(company.slug);
}
