import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const TRUSTED_ORIGINS = [
  'http://localhost:4321',
  'https://bibliotheque.lucaspokrywa.site',
  'https://api.bibliotheque.lucaspokrywa.site',
];

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.get('origin');
    if (origin) {
      const sameOrigin = `${request.protocol}://${request.get('host')}`;
      if (origin !== sameOrigin && !TRUSTED_ORIGINS.includes(origin)) {
        throw new ForbiddenException('Origine de la requête non autorisée');
      }
    } else if (request.get('sec-fetch-site') === 'cross-site') {
      throw new ForbiddenException('Origine de la requête non autorisée');
    }
    return true;
  }
}
