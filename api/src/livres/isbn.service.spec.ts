import type { DatabaseService } from '../database.service.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsbnDto } from './isbn.dto.js';
import { IsbnService } from './isbn.service.js';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) };
});

describe('Recherche ISBN', () => {
  const query = vi.fn();
  const database = { query } as unknown as DatabaseService;
  beforeEach(() => {
    execute.mockReset();
    query.mockReset().mockResolvedValue({ rows: [] });
  });

  it('renvoie le livre en base sans lancer Python', async () => {
    query.mockResolvedValue({
      rows: [{ titre: 'Livre local', auteur: 'Auteur local' }],
    });
    expect(await new IsbnService(database).lookup('978-2-07-061275-8')).toEqual(
      { title: 'Livre local', authors: ['Auteur local'] },
    );
    expect(query.mock.calls[0][1]).toEqual(['9782070612758']);
    expect(execute).not.toHaveBeenCalled();
  });

  it('ne masque pas une panne PostgreSQL par une recherche Python', async () => {
    query.mockRejectedValue(new Error('Base indisponible'));
    await expect(
      new IsbnService(database).lookup('9782070612758'),
    ).rejects.toThrow('Base indisponible');
    expect(execute).not.toHaveBeenCalled();
  });

  it('passe un argument sans shell et renvoie le JSON', async () => {
    const result = {
      title: 'Le Petit Prince',
      authors: ['Antoine de Saint-Exupéry'],
    };
    execute.mockResolvedValue({ stdout: JSON.stringify(result) });
    expect(await new IsbnService(database).lookup('9782070612758')).toEqual(
      result,
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    const [, args, options] = execute.mock.calls[0];
    expect(args[0]).toMatch(/python_script\/isbn_scrap\.py$/);
    expect(args[1]).toBe('9782070612758');
    expect(options.shell).toBeUndefined();
    expect(options.timeout).toBe(25000);
    expect(options.env.PYTHONDONTWRITEBYTECODE).toBe('1');
  });

  it('préserve l’erreur JSON du script avec un statut 404', async () => {
    execute.mockRejectedValue({
      code: 1,
      stdout: '{"error":"Aucun livre trouvé"}',
    });
    await expect(
      new IsbnService(database).lookup('9782070612758'),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'Aucun livre trouvé' },
    });
  });

  it('renvoie 504 en cas de dépassement du délai', async () => {
    execute.mockRejectedValue({ killed: true });
    await expect(
      new IsbnService(database).lookup('9782070612758'),
    ).rejects.toMatchObject({ status: 504 });
  });

  it.each(['pas du JSON', '{"authors":[]}'])(
    'rejette une réponse invalide : %s',
    async (stdout) => {
      execute.mockResolvedValue({ stdout });
      await expect(
        new IsbnService(database).lookup('9782070612758'),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it('masque les détails internes d’une erreur Python', async () => {
    execute.mockRejectedValue({ code: 1, stderr: 'trace sensible' });
    await expect(
      new IsbnService(database).lookup('9782070612758'),
    ).rejects.toMatchObject({
      status: 502,
      message: 'Le script de recherche ISBN a échoué',
    });
  });

  it('limite la concurrence puis libère les emplacements', async () => {
    let complete!: (value: { stdout: string }) => void;
    execute.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const service = new IsbnService(database);
    const pending = Array.from({ length: 4 }, () =>
      service.lookup('9782070612758'),
    );
    await expect(service.lookup('9782070612758')).rejects.toMatchObject({
      status: 503,
    });
    complete({ stdout: '{"title":null,"authors":[]}' });
    await Promise.all(pending);
    await expect(service.lookup('9782070612758')).resolves.toEqual({
      title: null,
      authors: [],
    });
  });

  it('normalise les tirets', async () => {
    const dto = plainToInstance(IsbnDto, { isbn: '978-2-07-061275-8' });
    expect(dto.isbn).toBe('9782070612758');
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['9782070612750', '123; touch /tmp/test', '', 9782070612758])(
    'rejette un ISBN invalide : %s',
    async (isbn) => {
      expect(
        (await validate(plainToInstance(IsbnDto, { isbn }))).length,
      ).toBeGreaterThan(0);
    },
  );
});
