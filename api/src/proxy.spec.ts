import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureProxy } from './proxy.js';

describe('Confiance dans le reverse proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ne fait confiance à aucun proxy en développement', () => {
    vi.stubEnv('TRUST_PROXY_IP', '');
    const set = vi.fn();
    configureProxy({ set } as unknown as NestExpressApplication);
    expect(set).not.toHaveBeenCalled();
  });

  it('limite la confiance à l’adresse exacte de Caddy', () => {
    vi.stubEnv('TRUST_PROXY_IP', '172.30.81.2');
    const set = vi.fn();
    configureProxy({ set } as unknown as NestExpressApplication);
    expect(set).toHaveBeenCalledWith('trust proxy', '172.30.81.2');
  });

  it.each(['true', '*', '0.0.0.0/0'])(
    'refuse une confiance globale : %s',
    (value) => {
      vi.stubEnv('TRUST_PROXY_IP', value);
      expect(() =>
        configureProxy({ set: vi.fn() } as unknown as NestExpressApplication),
      ).toThrow('adresse IP unique');
    },
  );
});
