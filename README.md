# Bibliotheque

## Description

## Organisation projet

La base de données : 

![Base de données](assets/bdd.png)

L'api permet de créer un utilisateur. Ajouter un livre grâce a son ISBN. Ajouter un livre à la bibliothèque d'un utilisateur, et le marquer comme lu si tels quel. 


## Sauvegarde et restauration

Sauvegardes PostgreSQL chiffrées avec Restic, stockées localement sur le VPS,
planification quotidienne et test mensuel de restauration : [procédure](ops/BACKUPS.md).

## Déploiement HTTPS

Sur le VPS, renseigner `API_DOMAIN` et `FRONT_DOMAIN` puis lancer `./start.sh --production` pour
activer Caddy et HTTPS automatique : [procédure](ops/HTTPS.md).
Le démarrage local reste `./start.sh` ; le frontend compilé est servi sur `http://localhost:4321`.

## Authentification par cookie

`POST /v1/auth/login` renvoie `{ "expires_in": 3600 }` et place le JWT dans
le cookie `bibliotheque_session` (HttpOnly, chemin `/v1`, durée
une heure, sans Domain). Le JWT n'est plus exposé dans le JSON et les routes
protégées utilisent ce cookie, sans en-tête Authorization.

Depuis le frontend, utiliser `credentials: 'include'` pour la connexion **et**
les appels suivants :

```js
await fetch(`${apiUrl}/v1/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, mot_de_passe }),
});
```

`POST /v1/auth/logout` et `/v1/auth/logout-all` révoquent les sessions et effacent
le cookie. Swagger utilise automatiquement le cookie après un appel à login.
Les origines autorisées pour CORS et la protection CSRF sont définies ensemble
dans `api/src/auth/csrf.guard.ts`.

En production ou lorsque l'API reçoit une requête HTTPS, le cookie utilise
`SameSite=None; Secure`, ce qui permet notamment un frontend local autorisé
(`http://localhost:4321`) appelant l'API distante en HTTPS. La protection CSRF
continue à vérifier l'origine des requêtes qui modifient des données.

Pour tester entièrement en HTTP local, utiliser `NODE_ENV=development` : le
cookie utilise alors `SameSite=Lax` sans `Secure`. Accéder au frontend et à
l'API avec le même nom d'hôte (`localhost` pour les deux).

Si le navigateur bloque les cookies tiers, `SameSite=None` ne suffit pas :
servir le frontend et l'API sur le même site (même protocole et même domaine
enregistrable, sous-domaines possibles), ou utiliser un proxy du frontend vers l'API.

## Scan ISBN et ajout automatique au catalogue

`POST /v1/livres/isbn` avec `{ "isbn": "9791035805340" }` réutilise le livre
présent en base ou recherche ses informations avec Python et les enregistre
automatiquement. La réponse est `{ "id": 123, "title": "…", "authors": ["…"] }`.
Les scans simultanés du même ISBN normalisé réutilisent le même identifiant.
Seul l’ISBN est accepté du client : titre et auteur viennent des sources serveur.
Les informations incomplètes ou trop longues sont refusées (`422`) sans insertion.

Le frontend propose ensuite « Ajouter à ma bibliothèque », qui appelle
`POST /v1/bibliotheque` avec `{ "livre_id": 123 }`. Cette action reste explicite.
Les deux requêtes nécessitent la session et `credentials: 'include'`.

La confirmation manuelle `POST /v1/livres` et le cookie JWT du livre sont supprimés.
`GET /v1/livres/isbn/:isbn` reste une consultation sans écriture en base.
Le dossier `api/python_script` est inchangé.
