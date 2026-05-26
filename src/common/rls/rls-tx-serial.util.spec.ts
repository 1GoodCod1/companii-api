import { wrapSerialTransactionClient } from './rls-tx-serial.util';

describe('wrapSerialTransactionClient', () => {
  it('runs model queries one at a time on the same tx client', async () => {
    const order: string[] = [];
    let firstStarted = false;

    const rawTx = {
      company: {
        findMany: async () => {
          order.push('findMany:start');
          firstStarted = true;
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push('findMany:end');
          return [];
        },
        count: async () => {
          order.push('count:start');
          expect(firstStarted).toBe(true);
          order.push('count:end');
          return 0;
        },
      },
    };

    const tx = wrapSerialTransactionClient(rawTx as never);

    await Promise.all([tx.company.findMany(), tx.company.count()]);

    expect(order).toEqual(['findMany:start', 'findMany:end', 'count:start', 'count:end']);
  });
});
