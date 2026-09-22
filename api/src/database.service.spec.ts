import { DatabaseService } from './database.service.js';

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));
vi.mock('pg', () => ({
  Pool: class {
    on() {}
    connect = connect;
  },
}));

describe('Contrôle PostgreSQL', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    release.mockReset();
    connect.mockReset().mockResolvedValue({ query, release });
  });

  it('borne la requête et rend la connexion au pool', async () => {
    await new DatabaseService().checkHealth();
    expect(query).toHaveBeenCalledWith({
      text: 'SELECT 1',
      query_timeout: 2000,
    });
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('détruit une connexion en échec plutôt que de la réutiliser', async () => {
    query.mockRejectedValue(new Error('Query read timeout'));
    await expect(new DatabaseService().checkHealth()).rejects.toThrow(
      'Query read timeout',
    );
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('signale une impossibilité d’acquérir une connexion', async () => {
    connect.mockRejectedValue(new Error('Connection timeout'));
    await expect(new DatabaseService().checkHealth()).rejects.toThrow(
      'Connection timeout',
    );
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
