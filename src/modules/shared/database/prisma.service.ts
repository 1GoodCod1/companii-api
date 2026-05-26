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
import { wrapSerialTransactionClient } from '../../../common/rls/rls-tx-serial.util';
import type { RlsContext } from '../../../common/types/rls-context';

function resolvePoolMax(): number {
  const fromEnv = parseInt(process.env.PG_POOL_MAX ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  switch (process.env.NODE_ENV) {
    case 'test':
      return 3;
    case 'production':
      return 20;
    default:
      return 10;
  }
}

function createPgPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: resolvePoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    maxLifetimeSeconds: 30 * 60,
    keepAlive: true,
  });
}

const RLS_DELEGATE_KEYS = new Set([
  'withRlsContext',
  'runOutsideRlsContext',
  'deferOutsideRlsContext',
  'inSerial',
  'runInteractiveTransaction',
  'onModuleInit',
  'onModuleDestroy',
  'pool',
  'logger',
  'boundTransaction',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly pool: Pool;
  private readonly boundTransaction: PrismaClient['$transaction'];

  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>('database.url') ??
      configService.get<string>('DATABASE_URL');
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
    this.boundTransaction = this.$transaction.bind(this);
    const boundTransaction = this.boundTransaction;

    return new Proxy(this, {
      get: (target, prop) => {
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop);
        }

        if (prop === '$transaction') {
          const existing = rlsTxStorage.getStore();
          if (existing) {
            return <T>(
              arg: Array<Promise<unknown>> | ((tx: Prisma.TransactionClient) => Promise<T>),
              _options?: unknown,
            ) => {
              if (Array.isArray(arg)) {
                return (async () => {
                  const results: unknown[] = [];
                  for (const item of arg) {
                    results.push(await item);
                  }
                  return results as T;
                })();
              }
              return arg(existing);
            };
          }

          const baseTransaction = boundTransaction;

          return (<R>(
            arg:
              | readonly Prisma.PrismaPromise<unknown>[]
              | ((tx: Prisma.TransactionClient) => Promise<R>),
            options?: Parameters<PrismaClient['$transaction']>[1],
          ) => {
            if (Array.isArray(arg)) {
              return baseTransaction(arg, options);
            }
            return baseTransaction(
              async (rawTx) => {
                const tx = wrapSerialTransactionClient(rawTx);
                return (arg as (tx: Prisma.TransactionClient) => Promise<R>)(tx);
              },
              options,
            );
          }) as PrismaClient['$transaction'];
        }

        const tx = rlsTxStorage.getStore();
        if (tx && !RLS_DELEGATE_KEYS.has(prop)) {
          return (tx as Record<string, unknown>)[prop];
        }

        if (RLS_DELEGATE_KEYS.has(prop) || prop.startsWith('$')) {
          return Reflect.get(target, prop);
        }

        return Reflect.get(target, prop);
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

    return this.runInteractiveTransaction(async (tx) => {
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

  private runInteractiveTransaction<R>(
    callback: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: Parameters<PrismaClient['$transaction']>[1],
  ): Promise<R> {
    return this.boundTransaction(
      async (rawTx) => {
        const tx = wrapSerialTransactionClient(rawTx);
        return callback(tx);
      },
      options,
    );
  }

  runOutsideRlsContext<T>(work: () => Promise<T>): Promise<T> {
    return rlsTxStorage.run(undefined, work);
  }

  async inSerial<T extends readonly unknown[]>(
    factories: readonly [...{ [K in keyof T]: () => Promise<T[K]> }],
  ): Promise<T> {
    const results: unknown[] = [];
    for (const factory of factories) {
      results.push(await factory());
    }
    return results as unknown as T;
  }

  deferOutsideRlsContext(work: () => Promise<void>): void {
    void this.runOutsideRlsContext(work).catch((err) => {
      this.logger.warn('Deferred DB side-effect failed', err);
    });
  }
}
