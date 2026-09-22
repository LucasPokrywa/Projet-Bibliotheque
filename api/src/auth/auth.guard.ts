import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { readSessionCookie } from './session-cookie.js';
import { AuthService } from './auth.service.js';
import type { SessionIdentity } from './auth.service.js';

type AuthenticatedRequest = Request & { identity: SessionIdentity };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException('Cookie de session requis');
    request.identity = await this.auth.authenticate(token);
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionIdentity =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().identity,
);
