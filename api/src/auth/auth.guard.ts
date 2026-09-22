import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { SessionIdentity } from './auth.service.js';

type AuthenticatedRequest = Request & { identity: SessionIdentity };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException('Jeton Bearer requis');
    request.identity = await this.auth.authenticate(match[1]);
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionIdentity =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().identity,
);
