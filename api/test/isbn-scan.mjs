import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { DatabaseService } from '../dist/database.service.js';
import { AuthService } from '../dist/auth/auth.service.js';
import { IsbnService } from '../dist/livres/isbn.service.js';

await test('Scan ISBN, enregistrement automatique et ajout explicite à la bibliothèque', async () => {
  const books = new Map();
  const library = [];
  let calls = 0;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue({ query: async (sql, values) => {
      if (sql.startsWith('SELECT id, titre, auteur FROM livres')) return { rows: books.has(values[0]) ? [books.get(values[0])] : [] };
      if (sql.startsWith('INSERT INTO livres')) {
        if (books.has(values[2])) return { rows: [] };
        const book = { id: books.size + 1, titre: values[0], auteur: values[1], isbn: values[2] };
        books.set(values[2], book);
        return { rows: [book] };
      }
      if (sql.startsWith('SELECT id FROM livres')) return { rows: [{ id: 1 }] };
      if (sql.startsWith('INSERT INTO bibliotheque')) {
        library.push(values);
        return { rows: [{ id: 1, livre_id: values[1], lu: false }] };
      }
      return { rows: [] };
    } })
    .overrideProvider(AuthService).useValue({ authenticate: async () => ({ userId: 2, sessionId: 'session' }) }).compile();
  const app = module.createNestApplication();
  app.get(IsbnService).lookupWithPython = async () => { calls++; return { title: 'Livre', authors: ['Auteur'] }; };
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const call = (path, body, auth = true, origin) => fetch(`${base}/v1/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: 'bibliotheque_session=test' } : {}), ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
    const body = { isbn: '9791035805340' };
    assert.equal((await call('livres/isbn', body, false)).status, 401);
    assert.equal((await call('livres/isbn', body, true, 'https://evil.example')).status, 403);
    assert.equal((await call('livres/isbn', { ...body, titre: 'Faux' })).status, 400);
    assert.equal(books.size, 0);
    const response = await call('livres/isbn', body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(await response.json(), { id: 1, title: 'Livre', authors: ['Auteur'] });
    assert.equal(books.size, 1);
    assert.equal(library.length, 0);
    const repeated = await call('livres/isbn', body);
    assert.equal((await repeated.json()).id, 1);
    assert.equal(calls, 1);
    assert.equal((await call('bibliotheque', { livre_id: 1 })).status, 201);
    assert.deepEqual(library, [[2, 1]]);
    assert.equal((await call('livres', body)).status, 404);
  } finally { await app.close(); }
});
