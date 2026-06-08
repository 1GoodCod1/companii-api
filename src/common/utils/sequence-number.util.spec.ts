import { nextCompanyNumber } from './sequence-number.util';

describe('nextCompanyNumber', () => {
  let txMock: any;

  beforeEach(() => {
    txMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
  });

  it('generates a formatted sequence number starting with 00001 when count is 0', async () => {
    const year = new Date().getFullYear();
    const countMock = jest.fn().mockResolvedValue(0);
    const existsMock = jest.fn().mockResolvedValue(false);

    const result = await nextCompanyNumber(txMock, {
      companyId: 'company-123',
      namespace: 'test-namespace',
      prefix: 'TST',
      count: countMock,
      exists: existsMock,
    });

    expect(countMock).toHaveBeenCalledWith(year);
    expect(existsMock).toHaveBeenCalledWith(`TST-${year}-00001`);
    expect(result).toBe(`TST-${year}-00001`);
  });

  it('increments the sequence number when collisions are detected via exists callback', async () => {
    const year = new Date().getFullYear();
    const countMock = jest.fn().mockResolvedValue(5);
    const existsMock = jest
      .fn()
      .mockImplementation(async (candidate: string) => {
        // Mock collision on TST-YYYY-00006 and TST-YYYY-00007, but not TST-YYYY-00008
        return candidate === `TST-${year}-00006` || candidate === `TST-${year}-00007`;
      });

    const result = await nextCompanyNumber(txMock, {
      companyId: 'company-123',
      namespace: 'test-namespace',
      prefix: 'TST',
      count: countMock,
      exists: existsMock,
    });

    expect(existsMock).toHaveBeenNthCalledWith(1, `TST-${year}-00006`);
    expect(existsMock).toHaveBeenNthCalledWith(2, `TST-${year}-00007`);
    expect(existsMock).toHaveBeenNthCalledWith(3, `TST-${year}-00008`);
    expect(result).toBe(`TST-${year}-00008`);
  });
});
