import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { isISBN } from 'class-validator';
import type { Request } from 'express';
import type { SessionIdentity } from '../auth/auth.service.js';
import { sessionCookieOptions } from '../auth/session-cookie.js';
import type { IsbnResultDto } from './isbn.dto.js';

export const BOOK_COOKIE = 'bibliotheque_book';
export const BOOK_TTL = 600;
const ISSUER = 'bibliotheque-api';
const AUDIENCE = 'catalogue-add';
const TYPE = 'book-proof+jwt';

interface VerifiedBook {
  isbn: string;
  titre: string;
  auteur: string;
}

export function bookCookieOptions(request: Request) {
  return { ...sessionCookieOptions(request), path: '/v1/livres' };
}

@Injectable()
export class BookProofService {
  private readonly key: Uint8Array;

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32)
      throw new Error('JWT_SECRET doit contenir au moins 32 octets aléatoires');
    // Une clé dérivée et une audience dédiées séparent ces preuves des sessions.
    this.key = createHmac('sha256', secret)
      .update('bibliotheque:book-proof:v1')
      .digest();
  }

  private validBook(book: unknown): book is VerifiedBook {
    if (!book || typeof book !== 'object') return false;
    const value = book as Record<string, unknown>;
    return (
      typeof value.isbn === 'string' &&
      isISBN(value.isbn) &&
      typeof value.titre === 'string' &&
      value.titre.trim().length > 0 &&
      value.titre.length <= 255 &&
      typeof value.auteur === 'string' &&
      value.auteur.trim().length > 0 &&
      value.auteur.length <= 255
    );
  }

  async issue(
    isbn: string,
    result: IsbnResultDto,
    identity: SessionIdentity,
  ): Promise<string> {
    const book = {
      isbn,
      titre: result.title?.trim() ?? '',
      auteur: result.authors.join(', ').trim(),
    };
    if (!this.validBook(book))
      throw new UnprocessableEntityException(
        'Les informations trouvées sont incomplètes ou trop longues pour le catalogue.',
      );
    const token = await new SignJWT({ book, sid: identity.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: TYPE })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(String(identity.userId))
      .setIssuedAt()
      .setExpirationTime(`${BOOK_TTL}s`)
      .sign(this.key);
    if (Buffer.byteLength(token) > 3500)
      throw new UnprocessableEntityException(
        'Les informations du livre sont trop volumineuses pour le cookie.',
      );
    return token;
  }

  async verify(
    header: string | undefined,
    isbn: string,
    identity: SessionIdentity,
  ): Promise<VerifiedBook> {
    try {
      const matches = (header ?? '')
        .split(';')
        .map((value) => value.trim())
        .filter((value) => value.startsWith(`${BOOK_COOKIE}=`));
      if (matches.length !== 1) throw new Error('Cookie absent ou ambigu');
      const token = decodeURIComponent(
        matches[0].slice(BOOK_COOKIE.length + 1),
      );
      if (token.length > 3500) throw new Error('Cookie trop long');
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        typ: TYPE,
        issuer: ISSUER,
        audience: AUDIENCE,
        requiredClaims: ['exp', 'iat', 'sub', 'sid', 'book'],
        maxTokenAge: BOOK_TTL,
      });
      if (
        payload.sub !== String(identity.userId) ||
        payload.sid !== identity.sessionId ||
        !this.validBook(payload.book) ||
        payload.book.isbn !== isbn
      )
        throw new Error('Preuve incompatible');
      return payload.book;
    } catch {
      throw new ForbiddenException(
        'Cookie du livre absent, invalide ou expiré. Relancez la recherche ISBN.',
      );
    }
  }
}
