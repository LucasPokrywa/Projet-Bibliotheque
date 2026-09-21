# API Bibliothèque

NestJS et PostgreSQL via `pg`. Les requêtes SQL sont paramétrées. Les services
`UsersService`, `LivresService` et `BibliothequeService` gèrent respectivement les
utilisateurs, le catalogue partagé et la bibliothèque personnelle.

## Configuration et démarrage

À la racine du projet, renseigner `.env` à partir de `.env.example` :

- `POSTGRES_PASSWORD` : mot de passe PostgreSQL.
- `JWT_SECRET` : secret aléatoire d'au moins 32 octets. Pour le générer :
  `openssl rand -hex 32`.

Exécuter `./start.sh`. Compose transmet les variables `PG*` et `JWT_SECRET`
à l'API. En développement hors Docker, il faut les exporter explicitement ;
Nest ne charge pas automatiquement le `.env` racine.

## Swagger : explorer et tester les routes

Après démarrage, ouvrir [Swagger UI](http://localhost:3000/docs).
La spécification OpenAPI est disponible sur [docs-json](http://localhost:3000/docs-json),
notamment pour l’importer dans Postman. Adapter le port si `API_PORT` a été modifié.

1. Ouvrir `POST /auth/register`, cliquer sur **Try it out**, remplir le JSON et exécuter.
2. Appeler `POST /auth/login` avec les mêmes identifiants.
3. Copier `access_token`, cliquer sur **Authorize** et coller le jeton seul, sans `Bearer`.
4. Tester les routes utilisateurs, livres et bibliothèque.

La documentation précise les champs requis, exemples, réponses et erreurs.
Les appels exécutent réellement les opérations sur la base configurée.
Le jeton n’est pas conservé après rechargement de la page.

## Base existante

Une base neuve reçoit automatiquement le schéma et la migration d'authentification.
Pour un volume PostgreSQL déjà initialisé, exécuter depuis la racine, avant de
lancer la nouvelle API :

```bash
docker compose exec -T bdd sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < bdd/migrations/02-auth.sql
```

La migration est réexécutable et transactionnelle. Si des emails identiques sans
tenir compte de la casse, ou des doublons utilisateur/livre existent, elle échoue
sans supprimer de données : résoudre ces doublons avant de la relancer.
Les anciens mots de passe en clair ne sont pas acceptés par l'authentification ;
les comptes concernés nécessitent une réinitialisation de mot de passe (flux non
implémenté ici).

## Authentification et sessions

- `POST /auth/register` : `{ "pseudo": "lucas", "email": "lucas@example.com", "mot_de_passe": "une-phrase-secrete-longue" }`.
  Retourne le profil public. Le mot de passe doit contenir entre 12 et 128 caractères.
- `POST /auth/login` : `{ "email": "lucas@example.com", "mot_de_passe": "une-phrase-secrete-longue" }`.
  Retourne `access_token`, `token_type: "Bearer"` et `expires_in: 3600`.
- `POST /auth/logout` : révoque la session courante, réponse 204.
- `POST /auth/logout-all` : révoque toutes les sessions de l'utilisateur, réponse 204.
- `GET /users/me` : profil de l'utilisateur connecté, sans hash.

Les routes protégées attendent `Authorization: Bearer <access_token>`.
Les JWT utilisent HS256 avec contrôle de signature, émetteur, audience et expiration.
Chaque requête vérifie aussi la session en base. Un JWT expire après une heure ;
il faut alors se reconnecter (pas de refresh token). Les tokens ne sont pas stockés
en base. Les mots de passe utilisent scrypt (N=131072, r=8, p=1), un sel aléatoire
par mot de passe et une comparaison à temps constant.

Les inscriptions sont limitées à 5/minute/IP et les connexions à 10/minute/IP.
Le compteur est en mémoire de chaque instance et se réinitialise au redémarrage.
Utiliser HTTPS pour exposer cette API et ne pas journaliser les tokens ou mots de passe.

## Livres et bibliothèque (authentification obligatoire)

| Méthode | Route | Corps / résultat |
| --- | --- | --- |
| GET | `/livres` | Les 100 premiers livres du catalogue, par identifiant |
| GET | `/livres/:id` | Un livre |
| POST | `/livres` | `{ "titre": "...", "auteur": "...", "isbn": "...", "date_publication": "2026-01-01" }` ; ISBN et date facultatifs |
| GET | `/bibliotheque` | Livres de l'utilisateur connecté avec leur statut `lu` |
| POST | `/bibliotheque` | `{ "livre_id": 1 }` |
| PATCH | `/bibliotheque/:livreId` | `{ "lu": true }` |
| DELETE | `/bibliotheque/:livreId` | Retire le livre de sa bibliothèque ; réponse 204 |

L'identité vient exclusivement de la session. Un même livre ne peut apparaître
qu'une fois dans la bibliothèque d'un utilisateur. Tout utilisateur connecté peut
ajouter un livre au catalogue ; la modification/suppression globale du catalogue
et l'administration des utilisateurs ne sont pas exposées.

## Tests

```bash
npm run build
npm test
npm run test:e2e
npm run lint
```

`npm run test:integration` utilise une vraie base de test initialisée avec
`bdd/init.sql` et `bdd/migrations/02-auth.sql`. Définir les variables `PG*`,
`JWT_SECRET` et `BIBLIO_TEST_DB=1`. Il couvre hachage, validation, connexion,
JWT expirés/falsifiés, sessions révoquées, doublons et isolation des bibliothèques.
Il crée ses propres utilisateurs/livres et les supprime à la fin.

## Permissions et administrateur initial

`utilisateurs.permission` vaut **0** pour un utilisateur normal et **1** pour
un administrateur. L'inscription publique impose la valeur par défaut 0 ;
le client ne peut pas fournir ce champ. Le profil retourné par `/users/me`
expose cette permission. Aucune route réservée aux administrateurs n'est encore définie.

Pour une base neuve, `bdd/init.sql` crée un administrateur si `ADMIN_EMAIL`,
`ADMIN_PSEUDO` et `ADMIN_PASSWORD_HASH` sont renseignés dans le `.env` racine.
Le hash doit être au format scrypt utilisé par l'API, jamais un mot de passe en clair.
Entourer le hash de guillemets simples dans `.env` pour conserver ses caractères `$`.
Sans ces trois valeurs, aucun compte initial n'est créé. Les changements de ces
variables n'affectent pas les comptes d'un volume déjà initialisé.

Sur une base existante, la migration `bdd/migrations/03-admin.sql` ajoute le champ
avec la valeur 0 sans promouvoir automatiquement de compte. Elle s'applique avec
la même commande `psql` que la migration 02, en remplaçant le nom du fichier.
La promotion d'un compte existant doit être faite explicitement en base.

## Recherche ISBN avec Python

`POST /livres/isbn` (JWT obligatoire) cherche d’abord dans PostgreSQL. Si aucun
livre ne correspond, la route appelle `python_script/isbn_scrap.py` :

```json
{ "isbn": "9782070612758" }
```

La réponse 200 conserve le même format quelle que soit la source. En base,
`titre` devient `title` et `auteur` devient un élément du tableau `authors`.
Les espaces, tirets et la casse des ISBN stockés sont ignorés pour la comparaison.
Exemple :

```json
{ "title": "Le Petit Prince", "authors": ["Antoine de Saint-Exupéry"] }
```

La route ne crée pas de livre en base. ISBN-10 et ISBN-13 sont acceptés, avec
normalisation des espaces et tirets. Un ISBN invalide donne 400, un livre non
trouvé 404 (corps `{"error":"..."}` du programme), une erreur du script 502,
un délai supérieur à 25 secondes 504, et trop de recherches simultanées 503.
La route accepte 10 requêtes/minute/IP, avec au plus 4 scripts simultanés par instance.

L'image Docker installe Python et `api/requirements.txt`. Compose charge la clé
optionnelle `GOOGLE_BOOKS_API_KEY` depuis `api/python_script/.env`, sans l'inclure
dans l'image. En local, installer les dépendances dans un environnement Python
extérieur à `python_script`, puis définir `PYTHON_BIN` vers son interpréteur si
nécessaire. Le dossier `python_script` est utilisé sans modification.

Reconstruire l'image avec `./start.sh` après cette modification.
