# HTTPS sur le VPS avec Caddy

Le Compose local reste `docker-compose.yml`. En production, `compose.prod.yml`
ajoute Caddy, ses certificats persistants et un réseau proxy dédié ; il supprime
la publication du port 3000 de l'API. PostgreSQL n'a pas de port public.
La directive `!reset` demande Docker Compose 2.24.4 ou plus récent.

## Préparer le VPS

1. Faire pointer le DNS de `api.ton-domaine.fr` vers l'IP publique du VPS.
   Si un enregistrement AAAA existe, son IPv6 doit aussi joindre le VPS.
2. Libérer et autoriser les ports TCP 80 et 443 sur le VPS et le pare-feu hébergeur.
   Ne pas lancer ce service si un autre reverse proxy utilise déjà ces ports.
3. Ajouter dans le `.env` du VPS :

   ```dotenv
   API_DOMAIN=api.ton-domaine.fr
   ```

   Utiliser un nom de domaine uniquement, sans `https://`, port ou chemin.
   Le serveur doit aussi pouvoir joindre les autorités de certification sur Internet.
4. Démarrer depuis la racine du projet :

   ```bash
   ./start.sh --production
   ```

Cette commande construit/démarre l'API, PostgreSQL et Caddy. Le nom du projet
Compose et le volume PostgreSQL sont conservés par rapport au démarrage local
(sauf si vous avez explicitement changé `COMPOSE_PROJECT_NAME` ou `-p`).
Caddy attend que l'API soit saine, obtient un certificat public et le renouvelle
automatiquement. HTTP est redirigé vers HTTPS. Ne pas supprimer `caddy_data` lors
des mises à jour : ce volume contient les clés et certificats.

Les chemins restent inchangés :

- `https://api.ton-domaine.fr/v1/health`
- `https://api.ton-domaine.fr/v1/livres`
- `https://api.ton-domaine.fr/docs`

Swagger est donc également accessible en HTTPS. Les routes authentifiées
conservent leur protection JWT ; la route de santé reste publique.

## Commandes de production

Toujours utiliser les deux fichiers pour les opérations qui créent/modifient
les conteneurs. Exécuter simplement `./start.sh` correspond au mode local et
pourrait republier le port 3000.

```bash
docker compose -f docker-compose.yml -f compose.prod.yml ps
docker compose -f docker-compose.yml -f compose.prod.yml logs --tail=100 caddy
curl --fail https://api.ton-domaine.fr/v1/health
```

Le healthcheck de Caddy vérifie son API d'administration locale (jamais publiée).
Il confirme que Caddy fonctionne, pas que le certificat public a déjà été délivré :
valider l'URL HTTPS et les journaux lors du premier déploiement.

Après modification du Caddyfile, le recharger explicitement :

```bash
docker compose -f docker-compose.yml -f compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Adresses IP des clients

Caddy est seul exposé à Internet. Il relaie les en-têtes proxy et NestJS fait
confiance uniquement à son IP `172.30.81.2`, via `TRUST_PROXY_IP`.
Cela permet à la limitation des tentatives de distinguer les adresses des clients.
Ne pas publier directement l'API ni remplacer cette configuration par une confiance
globale dans tous les en-têtes envoyés par les clients.

Si le sous-réseau `172.30.81.0/24` est déjà utilisé sur le VPS, configurer ensemble
`CADDY_SUBNET`, `CADDY_IP` et `API_PROXY_IP` dans `.env`, avec deux adresses distinctes et libres dans ce sous-réseau.
L’API utilise par défaut `172.30.81.3` et Caddy `172.30.81.2` :
les deux adresses sont fixes pour éviter une collision à leur démarrage.
Le Compose maintient automatiquement la même adresse côté Caddy et NestJS.
Cette configuration suppose que Caddy reçoit directement les clients ; un CDN ou
un autre proxy en amont nécessite une configuration supplémentaire de confiance.

## Sauvegardes

Le script de sauvegarde archive aussi `compose.prod.yml` et `ops/caddy/`, ainsi
que `.env` contenant le domaine. Les certificats ne sont pas inclus dans le dump :
ils persistent dans `caddy_data`. En cas de perte de ce volume, Caddy peut les
réémettre si le DNS et l'accès public sont corrects, sous réserve des limites de
l'autorité de certification. Conserver le volume évite les réémissions inutiles.
