import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { rlsTxStorage } from '../../../common/rls/rls.storage';
import type { RlsContext } from '../../../common/types/rls-context';

function createPgPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: process.env.NODE_ENV === 'test' ? 3 : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const RLS_DELEGATE_KEYS = new Set([
  'withRlsContext',
  'onModuleInit',
  'onModuleDestroy',
  'pool',
  'logger',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    const pool = createPgPool(connectionString);
    super({
      adapter: new PrismaPg(pool),
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
    this.pool = pool;

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }

        if (prop === '$transaction') {
          const existing = rlsTxStorage.getStore();
          if (existing) {
            return <T>(
              arg: Array<Promise<unknown>> | ((tx: Prisma.TransactionClient) => Promise<T>),
              _options?: unknown,
            ) => {
              if (Array.isArray(arg)) {
                return Promise.all(arg) as Promise<unknown> as Promise<T>;
              }
              return arg(existing);
            };
          }
        }

        if (RLS_DELEGATE_KEYS.has(prop) || prop.startsWith('$')) {
          return Reflect.get(target, prop, receiver);
        }

        const tx = rlsTxStorage.getStore();
        if (tx && prop in tx) {
          return (tx as Record<string, unknown>)[prop];
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as PrismaService;
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
      this.logger.warn('DB connect failed (dev continues)', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async withRlsContext<T>(
    ctx: RlsContext,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const existing = rlsTxStorage.getStore();
    if (existing) {
      return work(existing);
    }

    return this.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_user_id', ${ctx.userId}, true),
               set_config('app.current_company_id', ${ctx.companyId ?? ''}, true),
               set_config('app.user_role', ${ctx.accountKind}, true),
               set_config('app.current_company_role', ${ctx.companyRole ?? ''}, true),
               set_config('app.current_member_id', ${ctx.memberId ?? ''}, true),
               set_config('app.current_customer_id', ${ctx.customerId ?? ''}, true)
      `;
      return rlsTxStorage.run(tx, () => work(tx));
    });
  }
}
