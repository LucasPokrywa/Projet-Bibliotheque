import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DatabaseService } from '../dist/database.service.js';
import { UsersService } from '../dist/users/users.service.js';
import { IsbnService } from '../dist/livres/isbn.service.js';

function randomIsbn() {
  const prefix = '978' + String(randomInt(1_000_000_000)).padStart(9, '0');
  const sum = prefix.split('').reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return prefix + (10 - sum % 10) % 10;
}

await test('Prisma : compatibilité des données existantes et scans concurrents', async () => {
  assert.equal(process.env.BIBLIO_TEST_DB, '1', 'Utiliser une base de test dédiée');
  const db = new DatabaseService();
  const marker = randomUUID();
  const emails = [`a_b-${marker}@example.com`, `axb-${marker}@example.com`, `a%b-${marker}@example.com`];
  const normalized = randomIsbn();
  const formatted = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  const concurrentIsbn = randomIsbn();
  try {
    await db.onModuleInit();
    const users = new UsersService(db);
    const first = await users.create('Ancien', emails[0], 'existing-hash');
    await users.create('Autre', emails[1], 'other-hash');
    const percent = await users.create('Pourcent', emails[2], 'percent-hash');
    assert.equal((await users.findCredentials(emails[0].toUpperCase())).id, first.id);
    assert.equal((await users.findCredentials(emails[2])).id, percent.id);
    assert.equal(await users.findCredentials(`%-${marker}@example.com`), null);
    // L'index fonctionnel PostgreSQL continue à refuser les doublons insensibles à la casse.
    await assert.rejects(db.utilisateurs.create({ data: { pseudo: 'Doublon', email: emails[0].toUpperCase(), mot_de_passe: 'hash' } }), { code: 'P2002' });
    await assert.rejects(db.utilisateurs.update({ where: { id: first.id }, data: { permission: 2 } }));
    const book = await db.livres.create({ data: { titre: 'Historique', auteur: 'Auteur', isbn: formatted } });
    const isbn = new IsbnService(db);
    assert.equal((await isbn.scan(normalized)).id, book.id);
    const ids = await Promise.all(Array.from({ length: 3 }, async () => {
      const service = new IsbnService(db);
      service.lookupWithPython = async () => ({ title: 'Concurrent', authors: ['Auteur'] });
      return (await service.scan(concurrentIsbn)).id;
    }));
    assert.equal(new Set(ids).size, 1);
    assert.equal(await db.livres.count({ where: { isbn: concurrentIsbn } }), 1);
    assert.equal((await users.findCredentials(emails[0])).mot_de_passe, 'existing-hash');
  } finally {
    try {
      await db.utilisateurs.deleteMany({ where: { email: { in: emails } } });
      await db.livres.deleteMany({ where: { isbn: { in: [formatted, concurrentIsbn] } } });
    } finally { await db.onModuleDestroy(); }
  }
});
