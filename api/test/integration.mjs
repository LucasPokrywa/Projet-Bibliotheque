import { IsbnService } from '../dist/livres/isbn.service.js';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import { AppModule } from '../dist/app.module.js';
import { verifyPassword } from '../dist/auth/password.js';

await test('Authentification, sessions et bibliothèque avec PostgreSQL', async (t) => {
  assert.equal(
    process.env.BIBLIO_TEST_DB,
    '1',
    'Utiliser une base de test et définir BIBLIO_TEST_DB=1',
  );
  const db = new Pool();
  const app = await NestFactory.create(AppModule, { logger: false });
  let bookId;
  const emails = [
    `a-${randomUUID()}@example.com`,
    `b-${randomUUID()}@example.com`,
  ];
  const password = 'mot-de-passe-de-test-2026';
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    async function call(path, method = 'GET', body, token, proof = '') {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Cookie: `bibliotheque_session=${token}; ${proof}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        proof: response.headers.getSetCookie().findLast((value) => value.startsWith('bibliotheque_book=') && value.includes('Max-Age='))?.split(';')[0],
        token: response.headers.getSetCookie()[0]?.split(";")[0].split("=")[1],
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    }
    let tokenA, tokenB, userA, sessionId;
    await t.test(
      'refuse les routes privées et les entrées invalides',
      async () => {
        assert.equal((await call('/v1/users/me')).status, 401);
        assert.equal((await call('/v1/livres')).status, 401);
        assert.equal((await call('/v1/bibliotheque')).status, 401);
        assert.equal(
          (
            await call('/v1/auth/register', 'POST', {
              email: 'invalide',
              pseudo: 'a',
              mot_de_passe: 'court',
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call('/v1/auth/register', 'POST', {
              email: emails[0],
              pseudo: 'a',
              mot_de_passe: password,
              admin: true,
            })
          ).status,
          400,
        );
      },
    );
    await t.test('inscrit deux utilisateurs sans exposer le hash', async () => {
      for (const email of emails) {
        const result = await call('/v1/auth/register', 'POST', {
          email,
          pseudo: 'Lecteur',
          mot_de_passe: password,
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.mot_de_passe, undefined);
          assert.equal(result.body.permission, 0);
      }
      const result = await db.query(
        'SELECT id, mot_de_passe FROM utilisateurs WHERE email = $1',
        [emails[0]],
      );
      userA = result.rows[0].id;
      assert.notEqual(result.rows[0].mot_de_passe, password);
      assert.equal(
        await verifyPassword(password, result.rows[0].mot_de_passe),
        true,
      );
      assert.equal(
        await verifyPassword('incorrect', result.rows[0].mot_de_passe),
        false,
      );
      const hashes = await db.query(
        'SELECT mot_de_passe FROM utilisateurs WHERE email = ANY($1::text[])',
        [emails],
      );
      assert.notEqual(hashes.rows[0].mot_de_passe, hashes.rows[1].mot_de_passe);
      assert.equal(
        (
          await call('/v1/auth/register', 'POST', {
            email: emails[0].toUpperCase(),
            pseudo: 'Doublon',
            mot_de_passe: password,
          })
        ).status,
        409,
      );
    });
    await t.test('authentifie et refuse les mauvais identifiants', async () => {
      assert.equal(
        (
          await call('/v1/auth/login', 'POST', {
            email: emails[0],
            mot_de_passe: 'incorrect-password',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await call('/v1/auth/login', 'POST', {
            email: 'absent@example.com',
            mot_de_passe: password,
          })
        ).status,
        401,
      );
      const a = await call('/v1/auth/login', 'POST', {
        email: emails[0].toUpperCase(),
        mot_de_passe: password,
      });
      assert.equal(a.status, 200);
      tokenA = a.token;
      tokenB = (
        await call('/v1/auth/login', 'POST', {
          email: emails[1],
          mot_de_passe: password,
        })
      ).token;
      sessionId = JSON.parse(
        Buffer.from(tokenA.split('.')[1], 'base64url').toString(),
      ).sid;
      const me = await call('/v1/users/me', 'GET', undefined, tokenA);
      assert.equal(me.status, 200);
      assert.equal(me.body.id, userA);
      assert.equal(me.body.mot_de_passe, undefined);
    });
    await t.test(
      'refuse les JWT falsifiés, expirés et sans session',
      async () => {
        assert.equal(
          (await call('/v1/users/me', 'GET', undefined, `${tokenA}invalid`))
            .status,
          401,
        );
        const sign = (sid, expiry) =>
          new SignJWT({ sid })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(String(userA))
            .setIssuer('bibliotheque-api')
            .setAudience('bibliotheque')
            .setIssuedAt()
            .setExpirationTime(expiry)
            .sign(new TextEncoder().encode(process.env.JWT_SECRET));
        assert.equal(
          (
            await call(
              '/v1/users/me',
              'GET',
              undefined,
              await sign(sessionId, Math.floor(Date.now() / 1000) - 60),
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await call(
              '/v1/users/me',
              'GET',
              undefined,
              await sign(randomUUID(), '1h'),
            )
          ).status,
          401,
        );
        await db.query(
          "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
          [sessionId],
        );
        assert.equal(
          (await call('/v1/users/me', 'GET', undefined, tokenA)).status,
          401,
        );
        await db.query(
          "UPDATE sessions SET expires_at = NOW() + INTERVAL '1 hour' WHERE id = $1",
          [sessionId],
        );
      },
    );
    await t.test('gère les livres et isole les bibliothèques', async () => {
      const prefix = '978' + String(randomInt(1_000_000_000)).padStart(9, '0');
      const check = (10 - prefix.split('').reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10) % 10;
      const book = {
        titre: 'Test',
        auteur: 'Auteur',
        isbn: prefix + check,
        date_publication: '2026-01-01',
      };
      assert.equal(
        (
          await call(
            '/v1/livres',
            'POST',
            { ...book, date_publication: '2026-02-30' },
            tokenA,
          )
        ).status,
        400,
      );
      const lookup = app.get(IsbnService);
      const originalLookup = lookup.lookup.bind(lookup);
      let prepared;
      try {
        lookup.lookup = async () => ({ title: book.titre, authors: [book.auteur] });
        prepared = await call('/v1/livres/isbn', 'POST', { isbn: book.isbn }, tokenA);
      } finally { lookup.lookup = originalLookup; }
      assert.equal(prepared.status, 200);
      assert.equal((await call('/v1/livres', 'POST', { isbn: book.isbn }, tokenA)).status, 403);
      const created = await call('/v1/livres', 'POST', { isbn: book.isbn }, tokenA, prepared.proof);
      assert.equal(created.status, 201);
      bookId = created.body.id;
      assert.equal((await call('/v1/livres', 'POST', { isbn: book.isbn }, tokenA, prepared.proof)).status, 409);
      assert.equal(
        (await call(`/v1/livres/${bookId}`, 'GET', undefined, tokenA)).status,
        200,
      );
      assert.equal(
        (
          await call(
            '/v1/bibliotheque',
            'POST',
            { livre_id: bookId, utilisateur_id: userA },
            tokenB,
          )
        ).status,
        400,
      );
      assert.equal(
        (await call('/v1/bibliotheque', 'POST', { livre_id: bookId }, tokenA))
          .status,
        201,
      );
      assert.equal(
        (await call('/v1/bibliotheque', 'POST', { livre_id: bookId }, tokenA))
          .status,
        409,
      );
      assert.deepEqual(
        (await call('/v1/bibliotheque', 'GET', undefined, tokenB)).body,
        [],
      );
      assert.equal(
        (await call(`/v1/bibliotheque/${bookId}`, 'PATCH', { lu: true }, tokenB))
          .status,
        404,
      );
      assert.equal(
        (await call(`/v1/bibliotheque/${bookId}`, 'DELETE', undefined, tokenB))
          .status,
        404,
      );
      assert.equal(
        (
          await call(
            `/v1/bibliotheque/${bookId}`,
            'PATCH',
            { lu: 'false' },
            tokenA,
          )
        ).status,
        400,
      );
      assert.equal(
        (await call(`/v1/bibliotheque/${bookId}`, 'PATCH', { lu: true }, tokenA))
          .body.lu,
        true,
      );
      assert.equal(
        (await call(`/v1/bibliotheque/${bookId}`, 'DELETE', undefined, tokenA))
          .status,
        204,
      );
    });
    await t.test('révoque une session puis toutes les sessions', async () => {
      const second = (
        await call('/v1/auth/login', 'POST', {
          email: emails[0],
          mot_de_passe: password,
        })
      ).token;
      assert.equal(
        (await call('/v1/auth/logout', 'POST', undefined, tokenA)).status,
        204,
      );
      assert.equal(
        (await call('/v1/users/me', 'GET', undefined, tokenA)).status,
        401,
      );
      assert.equal(
        (await call('/v1/users/me', 'GET', undefined, second)).status,
        200,
      );
      const third = (
        await call('/v1/auth/login', 'POST', {
          email: emails[0],
          mot_de_passe: password,
        })
      ).token;
      assert.equal(
        (await call('/v1/auth/logout-all', 'POST', undefined, second)).status,
        204,
      );
      assert.equal(
        (await call('/v1/users/me', 'GET', undefined, second)).status,
        401,
      );
      assert.equal(
        (await call('/v1/users/me', 'GET', undefined, third)).status,
        401,
      );
      assert.equal(
        (await call('/v1/users/me', 'GET', undefined, tokenB)).status,
        200,
      );
    });
    await t.test('limite les tentatives de connexion', async () => {
      let result;
      for (let i = 0; i < 11; i++) {
        result = await call('/v1/auth/login', 'POST', {
          email: 'invalid',
          mot_de_passe: 'short',
        });
        if (result.status === 429) break;
      }
      assert.equal(result.status, 429);
    });
  } finally {
    await app.close();
    await db.query('DELETE FROM utilisateurs WHERE email = ANY($1::text[])', [
      emails,
    ]);
    if (bookId) await db.query('DELETE FROM livres WHERE id = $1', [bookId]);
    await db.end();
  }
});
