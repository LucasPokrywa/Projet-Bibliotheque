import type { NestExpressApplication } from '@nestjs/platform-express';
import { isIP } from 'node:net';

export function configureProxy(app: NestExpressApplication): void {
  const proxyIp = process.env.TRUST_PROXY_IP;
  if (!proxyIp) return;
  if (!isIP(proxyIp))
    throw new Error('TRUST_PROXY_IP doit être une adresse IP unique');
  // Ne faire confiance qu'à l'adresse du conteneur Caddy sur le réseau dédié.
  app.set('trust proxy', proxyIp);
}
