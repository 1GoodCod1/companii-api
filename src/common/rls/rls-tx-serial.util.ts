import type { Prisma } from '@prisma/client';

const txSerialQueues = new WeakMap<object, Promise<unknown>>();

function enqueueOnTxClient<T>(tx: object, work: () => Promise<T>): Promise<T> {
  const previous = txSerialQueues.get(tx) ?? Promise.resolve();
  const next = previous.then(work, work);
  txSerialQueues.set(
    tx,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function wrapTxModelDelegate(tx: object, delegate: object): object {
  return new Proxy(delegate, {
    get(modelTarget, method) {
      const value = Reflect.get(modelTarget, method);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        enqueueOnTxClient(tx, async () =>
          Reflect.apply(value, modelTarget, args) as Promise<unknown>,
        );
    },
  });
}

/** pg client inside a Prisma interactive transaction cannot run concurrent queries. */
export function wrapSerialTransactionClient(
  tx: Prisma.TransactionClient,
): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, prop) {
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop);
      }

      const value = Reflect.get(target, prop);

      if (value && typeof value === 'object' && typeof prop === 'string' && !prop.startsWith('$')) {
        return wrapTxModelDelegate(target, value as object);
      }

      if (typeof value === 'function') {
        return (...args: unknown[]) =>
          enqueueOnTxClient(target, async () =>
            Reflect.apply(value, target, args) as Promise<unknown>,
          );
      }

      return value;
    },
  }) as Prisma.TransactionClient;
}
