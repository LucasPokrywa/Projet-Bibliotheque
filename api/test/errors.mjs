import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../dist/app.module.js';
import { DatabaseService } from '../dist/database.service.js';
import { AuthService } from '../dist/auth/auth.service.js';
import { IsbnService } from '../dist/livres/isbn.service.js';
import { setupSwagger } from '../dist/swagger.js';

await test('Erreurs HTTP standardisées RFC 9457', async (t) => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({
      query: async () => ({ rows: [] }),
      checkHealth: async () => {},
    })
    .overrideProvider(AuthService)
    .useValue({ authenticate: async () => ({ userId: 1, sessionId: 'test' }) })
    .overrideProvider(IsbnService)
    .useValue({
      lookup: async () => {
        throw new HttpException({ error: 'Aucun livre trouvé' }, 404);
      },
    })
    .compile();
  const app = module.createNestApplication();
  const db = app.get(DatabaseService);
  const lookup = app.get(IsbnService);
  const document = setupSwagger(app);
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    async function call(
      path,
      { method = 'GET', body, auth = true, raw = false } = {},
    ) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: 'Bearer test' } : {}),
        },
        ...(body === undefined
          ? {}
          : { body: raw ? body : JSON.stringify(body) }),
      });
      const data = await response.json();
      return { response, data };
    }
    function check(result, status, instance) {
      assert.equal(result.response.status, status);
      assert.match(
        result.response.headers.get('content-type'),
        /^application\/problem\+json/,
      );
      assert.equal(result.data.type, 'about:blank');
      assert.equal(result.data.status, status);
      assert.equal(typeof result.data.title, 'string');
      assert.equal(typeof result.data.detail, 'string');
      assert.equal(result.data.instance, instance);
      assert.equal(result.data.statusCode, undefined);
      assert.equal(result.data.message, undefined);
      assert.equal(result.data.error, undefined);
    }
    await t.test(
      'santé publique, panne PostgreSQL et récupération',
      async () => {
        const healthy = await call('/v1/health', { auth: false });
        assert.equal(healthy.response.status, 200);
        assert.equal(healthy.response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(healthy.data, { status: 'ok', database: 'up' });
        db.checkHealth = async () => {
          throw new Error('password=secret SQL connection failed');
        };
        const failed = await call('/v1/health', { auth: false });
        check(failed, 503, '/v1/health');
        assert.equal(
          failed.data.detail,
          'La connexion à PostgreSQL est indisponible.',
        );
        assert.ok(!JSON.stringify(failed.data).includes('secret'));
        db.checkHealth = async () => {};
        assert.equal(
          (await call('/v1/health', { auth: false })).response.status,
          200,
        );
        assert.ok(!document.paths['/v1/health'].get.security?.length);
      },
    );
    await t.test('les routes sont uniquement exposées sous /v1', async () => {
      assert.ok(Object.keys(document.paths).length > 0);
      assert.ok(
        Object.keys(document.paths).every(
          (path) => path === '/v1' || path.startsWith('/v1/'),
        ),
      );
      for (const path of ['/', '/livres', '/users/me', '/bibliotheque']) {
        check(await call(path), 404, path);
      }
      check(
        await call('/auth/login', { method: 'POST', body: {} }),
        404,
        '/auth/login',
      );
      const home = await fetch(`${base}/v1`);
      assert.equal(home.status, 200);
      assert.equal(await home.text(), 'Hello World!');
      assert.equal((await fetch(`${base}/docs`)).status, 200);
      const spec = await (await fetch(`${base}/docs-json`)).json();
      assert.ok(spec.paths['/v1/livres']);
      assert.ok(!spec.paths['/livres']);
    });
    await t.test(
      '401 avec challenge Bearer et sans paramètres de recherche',
      async () => {
        const result = await call('/v1/users/me?token=secret', { auth: false });
        check(result, 401, '/v1/users/me');
        assert.equal(result.response.headers.get('www-authenticate'), 'Bearer');
        assert.equal(result.data.detail, 'Jeton Bearer requis');
        assert.ok(!JSON.stringify(result.data).includes('secret'));
      },
    );
    await t.test(
      'recherche ISBN en GET avec paramètre et sans corps',
      async () => {
        const original = lookup.lookup.bind(lookup);
        const received = [];
        lookup.lookup = async (isbn) => {
          received.push(isbn);
          return { title: 'Livre trouvé', authors: ['Auteur'] };
        };
        try {
          check(
            await call('/v1/livres/isbn/9782070612758', { auth: false }),
            401,
            '/v1/livres/isbn/9782070612758',
          );
          const result = await call('/v1/livres/isbn/978-2-07-061275-8');
          assert.equal(result.response.status, 200);
          assert.deepEqual(result.data, {
            title: 'Livre trouvé',
            authors: ['Auteur'],
          });
          assert.deepEqual(received, ['9782070612758']);
          check(
            await call('/v1/livres/isbn', {
              method: 'POST',
              body: { isbn: '9782070612758' },
            }),
            404,
            '/v1/livres/isbn',
          );
          const operation = document.paths['/v1/livres/isbn/{isbn}'].get;
          assert.ok(operation);
          assert.equal(operation.requestBody, undefined);
          assert.ok(
            operation.parameters.some(
              (p) => p.name === 'isbn' && p.in === 'path' && p.required,
            ),
          );
          assert.equal(document.paths['/v1/livres/isbn'], undefined);
        } finally {
          lookup.lookup = original;
        }
      },
    );
    await t.test('400 validation avec la liste des contraintes', async () => {
      const result = await call('/v1/livres/isbn/invalide');
      check(result, 400, '/v1/livres/isbn/invalide');
      assert.ok(result.data.errors.length);
      assert.equal(result.data.detail, 'Les données envoyées sont invalides.');
    });
    await t.test('400 pour un corps JSON mal formé', async () => {
      const result = await call('/v1/livres', {
        method: 'POST',
        body: '{broken',
        raw: true,
      });
      check(result, 400, '/v1/livres');
    });
    await t.test('413 pour un corps trop volumineux', async () => {
      const result = await call('/v1/livres', {
        method: 'POST',
        body: { isbn: 'x'.repeat(110000) },
      });
      check(result, 413, '/v1/livres');
    });
    await t.test('404 pour une route inexistante', async () => {
      check(await call('/route-inconnue'), 404, '/route-inconnue');
    });
    await t.test('404 métier', async () => {
      const result = await call('/v1/livres/123');
      check(result, 404, '/v1/livres/123');
      assert.equal(result.data.detail, 'Livre introuvable');
    });
    await t.test('404 Python converti en Problem Details', async () => {
      const result = await call('/v1/livres/isbn/9782070612758');
      check(result, 404, '/v1/livres/isbn/9782070612758');
      assert.equal(result.data.detail, 'Aucun livre trouvé');
    });
    await t.test(
      '403, 409, 502, 503 et 504 conservent statut et détail',
      async () => {
        for (const status of [403, 409, 502, 503, 504]) {
          lookup.lookup = async () => {
            throw new HttpException('Message public', status);
          };
          const result = await call('/v1/livres/isbn/9782070612758');
          check(result, status, '/v1/livres/isbn/9782070612758');
          assert.equal(result.data.detail, 'Message public');
        }
      },
    );
    await t.test(
      '500 masque les erreurs SQL et les exceptions internes',
      async () => {
        for (const error of [
          new Error('SELECT secret FROM utilisateurs'),
          new HttpException('mot_de_passe=secret', 500),
        ]) {
          db.query = async () => {
            throw error;
          };
          const result = await call('/v1/livres');
          check(result, 500, '/v1/livres');
          assert.equal(result.data.detail, 'Une erreur interne est survenue.');
          assert.ok(!JSON.stringify(result.data).includes('secret'));
        }
        db.query = async () => ({ rows: [] });
      },
    );
    await t.test('429 garde Retry-After', async () => {
      lookup.lookup = async () => {
        throw new NotFoundException();
      };
      let result;
      for (let i = 0; i < 11; i++) {
        result = await call('/v1/livres/isbn/9782070612758');
        if (result.response.status === 429) break;
      }
      check(result, 429, '/v1/livres/isbn/9782070612758');
      assert.ok(Number(result.response.headers.get('retry-after')) > 0);
    });
    await t.test('les réponses de succès restent inchangées', async () => {
      const result = await call('/v1/livres');
      assert.equal(result.response.status, 200);
      assert.match(
        result.response.headers.get('content-type'),
        /^application\/json/,
      );
      assert.deepEqual(result.data, []);
    });
    await t.test(
      'Swagger décrit le même format pour toutes les erreurs',
      () => {
        for (const path of Object.values(document.paths)) {
          for (const method of ['get', 'post', 'patch', 'delete']) {
            const operation = path[method];
            if (!operation) continue;
            assert.ok(operation.responses['500']);
            for (const [status, response] of Object.entries(
              operation.responses,
            )) {
              if (status === 'default' || Number(status) >= 400) {
                assert.deepEqual(Object.keys(response.content), [
                  'application/problem+json',
                ]);
                assert.equal(
                  response.content['application/problem+json'].schema.$ref,
                  '#/components/schemas/ProblemDetailsDto',
                );
              }
            }
          }
        }
      },
    );
  } finally {
    await app.close();
  }
});
