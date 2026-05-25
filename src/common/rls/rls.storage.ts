import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export const rlsTxStorage = new AsyncLocalStorage<Prisma.TransactionClient | undefined>();
