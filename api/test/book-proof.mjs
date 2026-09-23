import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { DatabaseService } from '../dist/database.service.js';
import { AuthService } from '../dist/auth/auth.service.js';
import { IsbnService } from '../dist/livres/isbn.service.js';

await test('Recherche signée puis ajout au catalogue via HTTP', async () => {
  process.env.JWT_SECRET = 'test-book-cookie-secret-at-least-32-bytes';
  process.env.NODE_ENV = 'production';
  const inserts = [];
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue({ query: async (sql, values) => {
      if (sql.startsWith('INSERT INTO livres')) {
        inserts.push(values);
        return { rows: [{ id: 1, titre: values[0], auteur: values[1], isbn: values[2] }] };
      }
      return { rows: [] };
    } })
    .overrideProvider(AuthService).useValue({ authenticate: async (token) => ({ userId: 1, sessionId: token }) })
    .overrideProvider(IsbnService).useValue({ lookup: async () => ({ title: 'Le Rouge et le Noir', authors: ['Stendhal'] }) })
    .compile();
  const app = module.createNestApplication();
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const isbn = '9791035805340';
    const call = (path, body, proof = '', session = 'one', origin) => fetch(`${base}/v1/livres${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `bibliotheque_session=${session}; ${proof}`, ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
    const lookup = await call('/isbn', { isbn });
    assert.equal(lookup.status, 200);
    assert.deepEqual(await lookup.json(), { title: 'Le Rouge et le Noir', authors: ['Stendhal'] });
    const header = lookup.headers.getSetCookie().findLast((value) => value.includes('Max-Age=600'));
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=None', 'Path=/v1/livres']) assert.ok(header.includes(attribute));
    assert.equal(lookup.headers.get('cache-control'), 'no-store');
    const proof = header.split(';')[0];
    assert.equal(inserts.length, 0);
    assert.equal((await call('', { isbn })).status, 403);
    assert.equal((await call('', { isbn }, `${proof}broken`)).status, 403);
    assert.equal((await call('', { isbn }, proof, 'two')).status, 403);
    assert.equal((await call('', { isbn: '9782070612758' }, proof)).status, 403);
    assert.equal((await call('', { isbn, titre: 'Faux', auteur: 'Faux' }, proof)).status, 400);
    assert.equal((await call('', { isbn }, proof, 'one', 'https://evil.example')).status, 403);
    assert.equal(inserts.length, 0);
    const created = await call('', { isbn }, proof);
    assert.equal(created.status, 201);
    assert.deepEqual(inserts[0], ['Le Rouge et le Noir', 'Stendhal', isbn, null]);
    assert.ok(created.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
  } finally { await app.close(); }
});
