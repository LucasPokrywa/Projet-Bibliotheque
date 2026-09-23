// @ts-check
import { defineConfig } from 'astro/config';

/** @param {import('vite').ViteDevServer | import('vite').PreviewServer} server */
function userRoutes(server) {
  server.middlewares.use((request, _response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    for (const page of ['profil']) {
      if (url.pathname.startsWith(`/${page}/`) && url.pathname !== `/${page}/`) {
        request.url = `/${page}/${url.search}`;
        break;
      }
    }
    next();
  });
}

export default defineConfig({
  vite: {
    plugins: [{ name: 'user-routes', configureServer: userRoutes, configurePreviewServer: userRoutes }],
  },
});
