import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { DatabaseService } from '../database.service.js';
import { UsersService } from '../users/users.service.js';
import { hashPassword, verifyPassword } from './password.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';

export interface SessionIdentity {
  userId: number;
  sessionId: string;
}
const ISSUER = 'bibliotheque-api';
const AUDIENCE = 'bibliotheque';
const TTL = 3600;

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;
  private readonly dummyHash: Promise<string>;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32)
      throw new Error('JWT_SECRET doit contenir au moins 32 octets aléatoires');
    this.key = new TextEncoder().encode(secret);
    this.dummyHash = hashPassword(randomUUID());
  }

  async register(dto: RegisterDto) {
    return this.users.create(
      dto.pseudo,
      dto.email,
      await hashPassword(dto.mot_de_passe),
    );
  }

  async login(dto: LoginDto) {
    const user = await this.users.findCredentials(dto.email);
    const valid = await verifyPassword(
      dto.mot_de_passe,
      user?.mot_de_passe ?? (await this.dummyHash),
    );
    if (!user || !valid)
      throw new UnauthorizedException('Identifiants invalides');
    const sessionId = randomUUID();
    const expires = Math.floor(Date.now() / 1000) + TTL;
    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(user.id))
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(this.key);
    await this.db.query(
      'INSERT INTO sessions (id, utilisateur_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, user.id, new Date(expires * 1000)],
    );
    return { access_token: token, token_type: 'Bearer', expires_in: TTL };
  }

  async authenticate(token: string): Promise<SessionIdentity> {
    let identity: SessionIdentity;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        requiredClaims: ['exp', 'iat', 'sub', 'sid'],
      });
      const userId = Number(payload.sub);
      if (
        !Number.isSafeInteger(userId) ||
        userId <= 0 ||
        typeof payload.sid !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.sid,
        )
      )
        throw new Error('Claims invalides');
      identity = { userId, sessionId: payload.sid };
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée');
    }
    const result = await this.db.query(
      'SELECT id FROM sessions WHERE id = $1 AND utilisateur_id = $2 AND expires_at > NOW() AND revoked_at IS NULL',
      [identity.sessionId, identity.userId],
    );
    if (!result.rows.length)
      throw new UnauthorizedException('Session invalide ou expirée');
    return identity;
  }

  async logout(identity: SessionIdentity): Promise<void> {
    await this.db.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND utilisateur_id = $2',
      [identity.sessionId, identity.userId],
    );
  }

  async logoutAll(userId: number): Promise<void> {
    await this.db.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE utilisateur_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }
}
