// @ts-check
import { defineConfig } from 'astro/config';

/** @param {import('vite').ViteDevServer | import('vite').PreviewServer} server */
function profileRoutes(server) {
  server.middlewares.use((request, _response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/profil/') && url.pathname !== '/profil/') {
      request.url = `/profil/${url.search}`;
    }
    next();
  });
}

export default defineConfig({
  vite: {
    plugins: [{ name: 'profile-routes', configureServer: profileRoutes, configurePreviewServer: profileRoutes }],
  },
});
