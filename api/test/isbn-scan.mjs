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
    .overrideProvider(DatabaseService).useValue({
      $queryRaw: async (_strings, isbn) => books.has(isbn) ? [books.get(isbn)] : [],
      livres: { create: async ({ data }) => {
        if (books.has(data.isbn)) throw { code: 'P2002' };
        const book = { id: books.size + 1, ...data };
        books.set(data.isbn, book);
        return book;
      } },
      bibliotheque: { create: async ({ data }) => {
        library.push([data.utilisateur_id, data.livre_id]);
        return { id: 1, livre_id: data.livre_id, lu: false };
      } },
    })
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
