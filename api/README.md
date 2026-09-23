# API Bibliothèque

API NestJS avec PostgreSQL et **Prisma ORM 7**. Le client est généré depuis
[`prisma/schema.prisma`](prisma/schema.prisma). Les modèles reprennent les noms,
les types SQL, les clés étrangères et les relations de la base existante.

## Installation et démarrage

```bash
npm ci
npm run prisma:generate
npm run start:dev
```

Fournir `JWT_SECRET` (au moins 32 octets) et les variables PostgreSQL avant le
démarrage : `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`.
`DATABASE_URL` peut les remplacer ; ses identifiants doivent être encodés dans
l’URL. Le client utilise l’adaptateur `@prisma/adapter-pg`, qui conserve `pg`
comme pilote PostgreSQL.

Dans Docker, la configuration `PG*` existante fonctionne sans changement.
`npm run build` génère le client puis compile l’application. Le client compilé
est inclus dans l’image de production ; ni génération ni migration ne sont
exécutées au démarrage du conteneur. Les fichiers générés dans
`src/generated/prisma/` sont exclus de Git et du contexte Docker.

## Mise à jour d’un déploiement existant

Cette migration vers Prisma **ne modifie pas le schéma de la base** et n’exige
ni export/import ni réinitialisation du volume. Depuis la racine du projet :

```bash
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build --no-deps --wait api
```

Les utilisateurs, hashes de mots de passe, sessions, livres et bibliothèques
restent dans les tables existantes. Les réponses des routes restent compatibles
avec le frontend et le mobile.

## Schéma et migrations

L’initialisation et les migrations restent gérées par **`bdd/init.sql` et
`bdd/migrations/*.sql`**, avec `scripts/migrate.sh` après configuration des
sauvegardes. Prisma Migrate n’est pas activé dans cette migration de l’accès aux
données : il n’existe pas encore d’historique `_prisma_migrations` de référence.

Deux contraintes PostgreSQL ne sont pas entièrement représentables dans le
schéma Prisma : l’index unique sur `lower(email)` et le `CHECK` limitant
`permission` à 0 ou 1. Ils restent définis et conservés dans les scripts SQL.
Ne pas lancer `prisma migrate reset` ou `prisma db push` sur la base existante.

Pour une évolution du schéma, ajouter une migration SQL dans `bdd/migrations/`,
mettre à jour `prisma/schema.prisma`, puis régénérer le client et tester sur une
base dédiée. Une adoption ultérieure de Prisma Migrate nécessitera une baseline
vérifiée de la base existante.

Pour les commandes CLI nécessitant une connexion, définir `DATABASE_URL` dans
l’environnement ; `prisma.config.ts` la lit directement. Aucun `.env` n’est
chargé automatiquement par ce fichier. La génération seule ne requiert pas de
connexion :

```bash
npm run prisma:generate
npx prisma validate
```

## Accès aux données

`DatabaseService` expose un client Prisma partagé et gère sa connexion ainsi que
sa fermeture. Les services utilisent les modèles Prisma pour les utilisateurs,
sessions, livres et relations de bibliothèque. Les conflits d’unicité et les
ressources absentes gardent leurs statuts HTTP métier.

La recherche ISBN conserve une requête **Prisma `$queryRaw` paramétrée** pour
reconnaître les anciens ISBN stockés avec espaces ou tirets (`regexp_replace`).
Le contrôle de santé utilise également du SQL statique via Prisma avec des
délais bornés. Aucune concaténation de paramètres utilisateur en SQL n’est utilisée.

## Routes et authentification

Les routes sont sous `/v1`. `POST /v1/auth/login` crée un cookie HttpOnly ; les
requêtes navigateur utilisent `credentials: 'include'`. Swagger est disponible
sur `/docs` lorsque `NODE_ENV` n’est pas `production` : commencer par le login,
puis tester les routes protégées avec le cookie enregistré par le navigateur.

Le scan `POST /v1/livres/isbn` réutilise le livre existant ou recherche ses
informations via Python et l’enregistre. L’ajout à la bibliothèque reste une
action séparée. Le [README du projet](../README.md) décrit les routes et le
déploiement complet ; le script Python n’est pas modifié par cette migration.

## Vérifications

```bash
npm run build
npm run lint
npm test
npm run test:errors
npm run test:cookies
npm run test:isbn-scan
```

`npm run test:integration` utilise PostgreSQL réel. Définir `BIBLIO_TEST_DB=1`,
`JWT_SECRET` et les variables `PG*` d’une **base de test dédiée**, initialisée
avec les SQL de `bdd/`. Ces tests créent et suppriment des données. Ils vérifient
notamment les sessions, l’isolation entre utilisateurs, les contraintes, les
emails contenant des caractères spéciaux et les scans ISBN concurrents.
