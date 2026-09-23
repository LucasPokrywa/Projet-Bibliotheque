import { BookProofService, BOOK_COOKIE } from './book-proof.service.js';
import { SignJWT } from 'jose';
import { createHmac } from 'node:crypto';

const secret = 'test-book-proof-secret-at-least-32-bytes';
const identity = { userId: 1, sessionId: 'session-one' };
const isbn = '9791035805340';
const result = { title: 'Le Rouge et le Noir', authors: ['Stendhal'] };
const cookie = (token: string) => `${BOOK_COOKIE}=${token}`;
let service: BookProofService;
beforeEach(() => {
  vi.stubEnv('JWT_SECRET', secret);
  service = new BookProofService();
});
afterEach(() => vi.unstubAllEnvs());

it('restitue uniquement les informations signées pour la bonne session et le bon ISBN', async () => {
  const token = await service.issue(isbn, result, identity);
  expect(await service.verify(cookie(token), isbn, identity)).toEqual({
    isbn,
    titre: result.title,
    auteur: 'Stendhal',
  });
});
it('refuse cookies absents, malformés, modifiés ou dupliqués', async () => {
  const token = await service.issue(isbn, result, identity);
  const pieces = token.split('.');
  const payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString());
  payload.book.titre = 'Titre falsifié';
  pieces[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
  for (const header of [
    undefined,
    cookie('%XX'),
    cookie(pieces.join('.')),
    `${cookie(token)}; ${cookie(token)}`,
  ]) {
    await expect(service.verify(header, isbn, identity)).rejects.toMatchObject({
      status: 403,
    });
  }
});
it('refuse un autre utilisateur, une autre session et un autre ISBN', async () => {
  const token = await service.issue(isbn, result, identity);
  for (const other of [
    { ...identity, userId: 2 },
    { ...identity, sessionId: 'session-two' },
  ]) {
    await expect(
      service.verify(cookie(token), isbn, other),
    ).rejects.toMatchObject({ status: 403 });
  }
  await expect(
    service.verify(cookie(token), '9782070612758', identity),
  ).rejects.toMatchObject({ status: 403 });
});
it('refuse expiration, mauvaise audience, mauvais algorithme et signature de session', async () => {
  const key = createHmac('sha256', secret)
    .update('bibliotheque:book-proof:v1')
    .digest();
  for (const [audience, expiration, alg, signingKey] of [
    ['catalogue-add', '-1s', 'HS256', key],
    ['bibliotheque', '10m', 'HS256', key],
    ['catalogue-add', '10m', 'HS384', key],
    ['catalogue-add', '10m', 'HS256', new TextEncoder().encode(secret)],
  ] as const) {
    const token = await new SignJWT({
      book: { isbn, titre: result.title, auteur: 'Stendhal' },
      sid: identity.sessionId,
    })
      .setProtectedHeader({ alg, typ: 'book-proof+jwt' })
      .setSubject('1')
      .setIssuer('bibliotheque-api')
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(signingKey);
    await expect(
      service.verify(cookie(token), isbn, identity),
    ).rejects.toMatchObject({ status: 403 });
  }
});
it('refuse les données incomplètes, trop longues ou dépassant la taille du cookie', async () => {
  for (const data of [
    { title: null, authors: [] },
    { title: 'x'.repeat(256), authors: ['a'] },
    {
      title: 'x' + '\u0001'.repeat(254),
      authors: ['x' + '\u0001'.repeat(254)],
    },
  ]) {
    await expect(service.issue(isbn, data, identity)).rejects.toMatchObject({
      status: 422,
    });
  }
});
