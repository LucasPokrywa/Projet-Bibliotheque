import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { DatabaseService } from '../dist/database.service.js';
import { UsersService } from '../dist/users/users.service.js';
import { hashPassword } from '../dist/auth/password.js';

await test('Connexion et révocation par cookie HttpOnly', async () => {
  process.env.JWT_SECRET = 'cookie-test-secret-at-least-32-bytes-long';
  process.env.NODE_ENV = 'production';
  const sessions = new Map();
  const password = 'mot-de-passe-test-2026';
  const hash = await hashPassword(password);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue({
      query: async (sql, values) => {
        if (sql.startsWith('INSERT INTO sessions')) sessions.set(values[0], true);
        if (sql.startsWith('SELECT id FROM sessions')) return { rows: sessions.get(values[0]) ? [{ id: values[0] }] : [] };
        if (sql.startsWith('UPDATE sessions')) {
          if (typeof values[0] === 'number') sessions.clear();
          else sessions.delete(values[0]);
        }
        return { rows: [] };
      },
    })
    .overrideProvider(UsersService).useValue({
      findCredentials: async () => ({ id: 1, mot_de_passe: hash }),
    }).compile();
  const app = module.createNestApplication();
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = (origin, pass = password) => fetch(`${base}/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ email: 'test@example.com', mot_de_passe: pass }),
    });
    assert.equal((await login('https://evil.example')).status, 403);
    const denied = await login(undefined, 'incorrect-password');
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('set-cookie'), null);
    const result = await login('http://localhost:4321');
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { expires_in: 3600 });
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const setCookie = result.headers.get('set-cookie');
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=None', 'Path=/v1', 'Max-Age=3600']) assert.ok(setCookie.includes(attribute), attribute);
    assert.ok(!setCookie.includes('Domain='));
    const cookie = setCookie.split(';')[0];
    const call = (headers = {}, path = '/v1/livres', method = 'GET') => fetch(`${base}${path}`, { headers, method });
    assert.equal((await call({ Cookie: cookie })).status, 200);
    assert.equal((await call()).status, 401);
    assert.equal((await call({ Authorization: `Bearer ${cookie.split('=')[1]}` })).status, 401);
    assert.equal((await call({ Cookie: 'bibliotheque_session=%ZZ' })).status, 401);
    assert.equal((await call({ Cookie: `${cookie}invalid` })).status, 401);
    assert.equal((await call({ Cookie: `${cookie}; ${cookie}` })).status, 401);
    assert.equal((await call({ Cookie: cookie, Origin: 'https://evil.example' }, '/v1/auth/logout', 'POST')).status, 403);
    assert.equal((await call({ Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' }, '/v1/auth/logout', 'POST')).status, 403);
    const logout = await call({ Cookie: cookie }, '/v1/auth/logout', 'POST');
    assert.equal(logout.status, 204);
    assert.ok(logout.headers.get('set-cookie').includes('SameSite=None'));
    assert.ok(logout.headers.get('set-cookie').includes('Secure'));
    assert.match(logout.headers.get('set-cookie'), /bibliotheque_session=; Path=\/v1; Expires=Thu, 01 Jan 1970/);
    assert.equal((await call({ Cookie: cookie })).status, 401);
    const a = (await login()).headers.get('set-cookie').split(';')[0];
    const b = (await login()).headers.get('set-cookie').split(';')[0];
    const all = await call({ Cookie: a }, '/v1/auth/logout-all', 'POST');
    assert.equal(all.status, 204);
    assert.ok(all.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
    assert.equal((await call({ Cookie: b })).status, 401);
    process.env.NODE_ENV = 'development';
    const local = await login();
    assert.ok(!local.headers.get('set-cookie').includes('Secure'));
    assert.ok(local.headers.get('set-cookie').includes('HttpOnly'));
    assert.ok(local.headers.get('set-cookie').includes('SameSite=Lax'));
  } finally {
    await app.close();
  }
});
