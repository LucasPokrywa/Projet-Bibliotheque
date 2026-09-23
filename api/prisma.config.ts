import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Pour les commandes CLI connectées à la base. La génération ne nécessite pas d'URL.
  datasource: { url: process.env.DATABASE_URL },
});
