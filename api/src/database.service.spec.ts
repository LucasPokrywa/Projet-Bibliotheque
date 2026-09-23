import { DatabaseService } from './database.service.js';

const { query, execute, connect, disconnect, transaction } = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
vi.mock('./generated/prisma/client.js', () => ({ PrismaClient: class {
  $connect = connect;
  $disconnect = disconnect;
  $transaction = transaction;
} }));

describe('Contrôle PostgreSQL via Prisma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ '?column?': 1 }]);
    execute.mockResolvedValue(0);
    transaction.mockImplementation(async (callback) => callback({ $executeRaw: execute, $queryRaw: query }));
  });
  it('borne la transaction et le délai SQL du contrôle de santé', async () => {
    await new DatabaseService().checkHealth();
    expect(transaction.mock.calls[0][1]).toEqual({ maxWait: 5000, timeout: 3000 });
    expect(execute.mock.calls[0][0][0]).toContain("statement_timeout = '2s'");
    expect(query.mock.calls[0][0][0]).toBe('SELECT 1');
  });
  it('propage une panne de la base', async () => {
    query.mockRejectedValue(new Error('Base indisponible'));
    await expect(new DatabaseService().checkHealth()).rejects.toThrow('Base indisponible');
  });
  it('connecte au démarrage et ferme le client à l’arrêt', async () => {
    const db = new DatabaseService();
    await db.onModuleInit();
    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
    await db.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
