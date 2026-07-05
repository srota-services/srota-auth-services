/**
 * Attaches a $transaction mock that runs callbacks against the same mock client.
 */
export function attachPrismaTransaction<T extends Record<string, unknown>>(
   mock: T,
): T & { $transaction: jest.Mock } {
   const prisma = mock as T & { $transaction: jest.Mock };
   prisma.$transaction = jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
         return (arg as (tx: T) => Promise<unknown>)(mock);
      }
      return Promise.all(arg as Promise<unknown>[]);
   });
   return prisma;
}
