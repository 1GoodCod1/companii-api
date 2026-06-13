import type { Prisma, File } from '@prisma/client';

export const FILES_REPOSITORY = Symbol('FilesRepository');

export interface FilesRepository {
  create(data: Prisma.FileUncheckedCreateInput): Promise<File>;
  findById(id: string): Promise<File | null>;
  delete(id: string): Promise<File>;
  canAccessFile(fileId: string, companyId: string | null, portalUserId: string): Promise<boolean>;
}
