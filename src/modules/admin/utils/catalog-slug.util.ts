import { PrismaService } from '../../shared/database/prisma.service';

export function slugifyCatalogName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export async function uniqueCatalogSlug(
  prisma: PrismaService,
  table: 'city' | 'category',
  base: string,
  excludeId?: string,
): Promise<string> {
  let slug = base;
  let n = 0;
  while (true) {
    const existing =
      table === 'city'
        ? await prisma.city.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
        : await prisma.category.findFirst({
            where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
          });
    if (!existing) return slug;
    slug = `${base}-${++n}`;
  }
}
