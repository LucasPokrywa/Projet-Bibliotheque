# Ma Bibliothèque

Application de gestion de livres avec un catalogue partagé et une bibliothèque
personnelle. Disponible sur le web et dans une application mobile Expo.

Recherchez un ISBN ou scannez son code-barres depuis le mobile : le serveur
retrouve les informations du livre et l’enregistre automatiquement dans le
catalogue. Vous choisissez ensuite de l’ajouter à votre bibliothèque et pouvez
le marquer comme lu.

## Fonctionnalités

- Inscription, connexion et sessions avec cookie HttpOnly ; mots de passe hachés avec scrypt.
- Recherche ISBN dans PostgreSQL, puis auprès d’Open Library et Google Books via Python si nécessaire.
- Ajout automatique au catalogue, sans saisie manuelle du titre ou des auteurs.
- Bibliothèque privée : ajout, retrait via l’API et suivi de lecture.
- Profil du compte connecté sur `/profil/pseudo` ; bibliothèque sur `/bibliotheque`.
- Application mobile : connexion, scan EAN-13, recherche et suivi des livres.
- Déploiement Docker Compose avec HTTPS, contrôles de santé et scripts de sauvegarde.

Les profils et bibliothèques ne sont pas publics. L’API détermine l’utilisateur
à partir de sa session, pas du pseudo présent dans l’URL.

## Architecture

| Dossier | Contenu |
| --- | --- |
| [`front/`](front/) | Site Astro 7, compilé en fichiers statiques et servi par Caddy |
| [`api/`](api/) | API NestJS 12 / TypeScript, accès PostgreSQL avec Prisma ORM 7, routes sous `/v1` |
| [`api/python_script/`](api/python_script/) | Recherche des métadonnées des livres par ISBN |
| [`bdd/`](bdd/) | PostgreSQL 18, initialisation SQL et migrations |
| [`mobile/`](mobile/) | Application React Native / Expo |
| [`ops/`](ops/) | Configuration HTTPS, procédures et unités systemd |
| [`scripts/`](scripts/) | Sauvegarde, restauration et migrations |
| [`.github/workflows/`](.github/workflows/) | Déploiement sur le VPS par SSH |

Le Compose démarre PostgreSQL, l’API et le frontend. En production, un Caddy
supplémentaire reçoit les connexions HTTPS et les transmet au service concerné.
Les données PostgreSQL et les certificats sont conservés dans des volumes Docker.
L’application mobile se construit séparément.

## Démarrage avec Docker

**Prérequis :** Docker Engine et Docker Compose **2.24.4 ou supérieur**.
Pour travailler hors Docker, utiliser Node.js compatible avec les `package.json`
(le frontend demande au moins Node 22.12). Les images Node du projet utilisent
`26-alpine3.23`.

Depuis la racine du dépôt, créer la configuration si elle n’existe pas déjà :

```bash
cp .env.example .env
```

Renseigner au minimum les valeurs suivantes dans `.env` :

```dotenv
POSTGRES_PASSWORD=remplacer_par_un_mot_de_passe_robuste
JWT_SECRET=remplacer_par_une_valeur_aleatoire_d_au_moins_32_octets
NODE_ENV=development
```

Pour générer une valeur aléatoire, utiliser `openssl rand -hex 32`.
Choisir des valeurs différentes pour le mot de passe PostgreSQL et la clé JWT.

Pour Google Books, créer si nécessaire `api/python_script/.env` :

```dotenv
GOOGLE_BOOKS_API_KEY=votre_cle_google_books
```

Compose transmet ce fichier facultatif à l’API. Ne pas versionner les fichiers
contenant des secrets. Après modification d’une variable, recréer le conteneur
concerné : un simple redémarrage ne recharge pas son environnement.

Lancer les services :

```bash
./start.sh
docker compose ps
```

| Service | Adresse locale par défaut |
| --- | --- |
| Site web | `http://localhost:4321` |
| API | `http://localhost:3000/v1` |
| Santé API et connexion PostgreSQL | `http://localhost:3000/v1/health` |
| Swagger, hors production | `http://localhost:3000/docs` |

**Le frontend utilise actuellement l’API HTTPS de production**, même lorsqu’il
est servi en local. Pour travailler entièrement en local, adapter les URL dans
[`front/src/lib/auth.ts`](front/src/lib/auth.ts),
[`front/src/pages/livres.astro`](front/src/pages/livres.astro) et
[`front/src/pages/bibliotheque.astro`](front/src/pages/bibliotheque.astro).
Utiliser `localhost` pour le site et l’API, et `NODE_ENV=development` pour les
cookies en HTTP. Modifier les domaines implique aussi d’adapter les origines
CORS/CSRF dans [`api/src/auth/csrf.guard.ts`](api/src/auth/csrf.guard.ts).

Le frontend Docker est une version compilée : relancer `./start.sh` après une
modification. Pour développer avec rechargement automatique :

```bash
cd front
npm ci
npm run dev -- --background
```

Libérer auparavant le port 4321 s’il est occupé par le conteneur frontend.

### Variables principales

| Variable | Usage |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER` | Base et utilisateur PostgreSQL ; défaut : `bibliotheque` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL obligatoire |
| `JWT_SECRET` | Secret de signature des sessions, au moins 32 octets |
| `NODE_ENV` | `development` en HTTP local, `production` sur le VPS |
| `API_PORT`, `FRONT_PORT` | Ports locaux, respectivement 3000 et 4321 |
| `API_DOMAIN`, `FRONT_DOMAIN` | Domaines HTTPS, sans protocole ni chemin |
| `ADMIN_EMAIL`, `ADMIN_PSEUDO`, `ADMIN_PASSWORD_HASH` | Compte administrateur facultatif lors de l’initialisation d’une base vide |

`ADMIN_PASSWORD_HASH` attend un hash compatible avec l’API, pas un mot de passe
en clair. Le champ `permission` vaut `0` pour un utilisateur et `1` pour un admin.
Les scripts d’initialisation PostgreSQL ne sont exécutés que sur un volume vide.

## Accès PostgreSQL avec Prisma

L’API utilise Prisma ORM et son adaptateur PostgreSQL. Le schéma est dans
[`api/prisma/schema.prisma`](api/prisma/schema.prisma) ; `npm run build --prefix api`
génère automatiquement le client. Les variables `PG*` de Compose restent valides.
La migration de l’API ne recrée pas les tables et conserve les données existantes.
Les migrations SQL de `bdd/` restent la référence pour faire évoluer la base.
Voir le [guide Prisma de l’API](api/README.md) avant toute modification du schéma.

## API : parcours principal

Les routes du catalogue et de la bibliothèque nécessitent une session valide.
Dans le navigateur, utiliser `credentials: 'include'` pour la connexion et les
appels suivants. Le JWT de session est transmis dans le cookie
`bibliotheque_session`, pas dans le JSON ni dans un en-tête Bearer.
La session dure une heure et peut être révoquée à la déconnexion.

| Méthode | Route | Effet |
| --- | --- | --- |
| POST | `/v1/auth/register` | Créer un compte avec `pseudo`, `email`, `mot_de_passe` |
| POST | `/v1/auth/login` | Se connecter avec `email`, `mot_de_passe` |
| POST | `/v1/auth/logout` | Révoquer la session courante |
| POST | `/v1/auth/logout-all` | Révoquer toutes ses sessions |
| GET | `/v1/users/me` | Lire son profil |
| GET | `/v1/livres` | Lister les 100 premiers livres du catalogue |
| GET | `/v1/livres/:id` | Consulter un livre |
| POST | `/v1/livres/isbn` | Rechercher et enregistrer automatiquement un ISBN |
| GET | `/v1/livres/isbn/:isbn` | Rechercher sans écrire en base |
| GET | `/v1/bibliotheque` | Lire sa bibliothèque |
| POST | `/v1/bibliotheque` | Ajouter un livre avec `{ "livre_id": 123 }` |
| PATCH | `/v1/bibliotheque/:livreId` | Modifier la lecture avec `{ "lu": true }` ou `{ "lu": false }` |
| DELETE | `/v1/bibliotheque/:livreId` | Retirer un livre de sa bibliothèque |
| GET | `/v1/health` | Vérifier publiquement la santé de l’API et de PostgreSQL |

Exemple de scan :

```http
POST /v1/livres/isbn
Content-Type: application/json

{ "isbn": "9791035805340" }
```

La réponse contient l’identifiant du livre enregistré ou déjà présent :

```json
{
  "id": 123,
  "title": "Le Rouge et le Noir",
  "authors": ["Stendhal"]
}
```

L’ajout au catalogue est automatique ; l’ajout à la bibliothèque reste une
seconde action explicite. Le client ne fournit pas le titre ni les auteurs.
Les erreurs utilisent `application/problem+json` avec notamment `status` et
`detail`, ainsi que `errors` pour les erreurs de validation.

## Application mobile

Créer d’abord un compte sur le site web, puis démarrer le client Expo :

```bash
cd mobile
npm ci
npm start
```

L’API de production est utilisée par défaut. `EXPO_PUBLIC_API_URL` permet de
choisir une autre adresse accessible depuis le téléphone, sans suffixe `/v1`.
Un téléphone physique permet de tester le scan avec la caméra.
Voir le [guide mobile](mobile/README.md) et les [profils EAS](mobile/eas.json)
pour la configuration et les builds Android/iOS.

## Déploiement sur le VPS

1. Installer Docker et Compose, puis placer le dépôt sur le VPS.
2. Faire pointer les deux domaines vers le VPS et ouvrir les ports TCP 80 et 443.
3. Renseigner les secrets et les domaines dans le `.env` du VPS :

   ```dotenv
   NODE_ENV=production
   API_DOMAIN=api.bibliotheque.lucaspokrywa.site
   FRONT_DOMAIN=bibliotheque.lucaspokrywa.site
   ```

4. Lancer `./start.sh --production`.

Caddy gère les certificats et la redirection HTTP vers HTTPS. Les ports de l’API
et du frontend ne sont pas publiés directement en production ; PostgreSQL ne
publie aucun port. Swagger est désactivé avec `NODE_ENV=production`.
Voir la [procédure HTTPS](ops/HTTPS.md) pour les détails et les conflits de ports.

### GitHub Actions

Le [workflow de déploiement](.github/workflows/deploy.yaml) se lance à chaque
push sur `main`, ou manuellement. Configurer dans GitHub :

| Type | Nom | Valeur |
| --- | --- | --- |
| Secret | `VPS_HOST` | Adresse du VPS |
| Secret | `VPS_USER` | Utilisateur SSH autorisé à utiliser Docker |
| Secret | `VPS_SSH_KEY` | Clé privée SSH de déploiement |
| Variable | `VPS_PROJECT_PATH` | Chemin absolu du dépôt sur le VPS |

Le dépôt doit déjà exister sur le VPS et pouvoir accéder à son remote `origin`.
Le workflow synchronise son contenu avec `origin/main`, puis reconstruit et
redémarre les services. Il utilise `git reset --hard` : les modifications locales
des fichiers suivis sur le VPS sont remplacées. Les secrets restent dans les
fichiers `.env` non suivis. Le dossier `mobile/` est exclu du dossier de travail
par sparse checkout ; les objets Git peuvent toujours être téléchargés.

Le workflow actuel déploie sans exécuter de tests préalables.

## Vérifications

Depuis la racine, après installation des dépendances :

```bash
npm ci --prefix api
npm run build --prefix api
npm run lint --prefix api
npm test --prefix api
npm run test:errors --prefix api
npm run test:cookies --prefix api
npm run test:isbn-scan --prefix api

npm ci --prefix front
npm run build --prefix front

npm ci --prefix mobile
npm run typecheck --prefix mobile
```

Les tests HTTP ci-dessus utilisent des dépendances simulées. Pour tester avec
PostgreSQL réel, utiliser `npm run test:integration --prefix api` avec une
**base de test dédiée**, les variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, un `JWT_SECRET` valide et `BIBLIO_TEST_DB=1`. Son schéma doit être
initialisé ; ce test crée et supprime des données.

## Exploitation et sauvegardes

```bash
# État et journaux en production
docker compose -f docker-compose.yml -f compose.prod.yml ps
docker compose -f docker-compose.yml -f compose.prod.yml logs --tail=100 api front caddy

# Reconstruire l’API et le frontend après une mise à jour
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build --no-deps --wait api front
```

La [procédure de sauvegarde/restauration](ops/BACKUPS.md) décrit les sauvegardes
PostgreSQL chiffrées avec Restic, stockées **sur le VPS**, ainsi que les timers
systemd pour les sauvegardes quotidiennes et les tests de restauration mensuels.
Ces timers nécessitent une installation séparée ; le déploiement ne les active
pas. Il n’y a ni copie distante ni alerte externe. Une perte du disque du VPS
emporte aussi les sauvegardes locales.

## Dépannage rapide

| Symptôme | Vérification |
| --- | --- |
| Réponse ISBN sans `id` | Vérifier le POST `/v1/livres/isbn` et reconstruire l’API : l’ancien parcours ou le GET renvoie seulement le titre et les auteurs. |
| Script fonctionnel à la main mais pas via l’API | Exécuter le script dans le conteneur API ; vérifier que `GOOGLE_BOOKS_API_KEY` y est présente. |
| « Introuvable » malgré un ISBN connu | Le script peut confondre une erreur HTTP d’une source, notamment un quota Google, avec un livre absent. |
| Cookie rejeté ou session non conservée | Vérifier HTTPS en production, `credentials: 'include'`, les origines autorisées et le blocage des cookies tiers. |
| `Address already in use` au démarrage | Vérifier les ports 80/443, le réseau proxy et ses adresses dans `.env` ; voir le guide HTTPS. |

## Licence

Le dépôt contient la licence [GNU AGPL v3](LICENCE).
