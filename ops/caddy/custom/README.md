# Configuration Caddy personnalisée

Placer les fichiers `*.caddy` dans ce dossier, par exemple `perso.caddy`.
Ils sont importés automatiquement par le Caddyfile du reverse proxy.
Chaque fichier peut contenir des blocs de sites supplémentaires.
Ne pas dupliquer les domaines déjà définis dans le Caddyfile principal.

Le dossier `ops/caddy` est monté intégralement dans `/etc/caddy` en lecture
seule. Aucun montage supplémentaire n’est nécessaire.

Si un fichier existe sur le VPS dans `caddy/custom`, le déplacer dans
`ops/caddy/custom` avant de recréer le conteneur.

Depuis la racine du projet, appliquer le changement de montage :

```sh
docker compose -f docker-compose.yml -f compose.prod.yml up -d --no-deps --force-recreate caddy
```

Pour les modifications suivantes, valider puis recharger si la validation réussit :

```sh
docker compose -f docker-compose.yml -f compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile &&
docker compose -f docker-compose.yml -f compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```
