# Sauvegardes locales sur le VPS

Le projet utilise `pg_dump` et un dépôt Restic **sur le disque du VPS**.
Aucun stockage distant et aucune alerte ne sont configurés. Les échecs apparaissent
dans les journaux systemd et les scripts retournent un code non nul.
La perte du disque du VPS emporte donc aussi ces sauvegardes.

## Contenu et rétention

Chaque snapshot contient une archive `bibliotheque.tar` avec :

- `database.dump` : sauvegarde PostgreSQL au format personnalisé, incluant schéma,
  données et séquences ; l'API peut rester active pendant `pg_dump`.
- `globals.sql` : rôles et permissions globales, dont les hashes des mots de passe
  PostgreSQL ; ce fichier n'est jamais réappliqué automatiquement.
- `config/project.env`, `config/python.env` si présent, `config/docker-compose.yml`
  `config/compose.prod.yml` et `config/caddy/` si présents,
  et `config/bdd/` : configurations, secrets et migrations nécessaires à la reprise.
- Le commit Git et un manifeste SHA-256 de tous les fichiers de l'archive.

Restic chiffre l'archive avec la clé locale. La clé Restic et `.env.backup` ne sont
pas archivés : conserver une copie de la clé dans son gestionnaire de mots de passe.
Le code applicatif se récupère depuis Git au commit enregistré ; un déploiement
avec du code non commité n'est pas couvert par cette copie du code.

Rétention : 7 quotidiennes, 4 hebdomadaires, 6 mensuelles ; les 3 dernières et toutes
celles des 2 derniers jours sont également conservées (notamment avant migrations).
Ces catégories peuvent se recouper. La rétention est limitée à l'hôte configuré
et au tag `bibliotheque`. Utiliser un dépôt dédié à cette application.
Le nettoyage n'est exécuté qu'après une sauvegarde réussie.

Les dumps temporaires en clair sont dans un répertoire privé, supprimé en fin
normale ou en cas d'erreur. Après une coupure électrique/SIGKILL, vérifier les
répertoires `work.*` restants avant de les supprimer. Prévoir l'espace disque pour
l'export, le dépôt Restic et une restauration temporaire complète.

## Installation initiale sur le VPS

Prérequis : Docker Compose, Bash, Python 3, Restic **0.17 ou plus récent**, `flock`
(util-linux), `tar`, `git` et `openssl`. Vérifier `restic version` : certaines
versions de distribution sont trop anciennes pour `--stdin-from-command`.
L'utilisateur exécutant les tâches doit pouvoir utiliser Docker et lire le `.env`.
Les unités fournies s'exécutent en root et supposent `/opt/bibliotheque`.

Depuis le dossier du projet, sur le VPS :

```bash
sudo install -d -m 700 /etc/bibliotheque
sudo sh -c 'umask 077; test ! -e /etc/bibliotheque/restic-password && openssl rand -base64 48 > /etc/bibliotheque/restic-password'
sudo install -m 600 .env.backup.example .env.backup
# Adapter les chemins dans .env.backup si nécessaire.
sudo ./scripts/restic.sh init
sudo ./scripts/backup.sh
sudo ./scripts/verify-backup.sh
```

Ne pas régénérer la clé si le dépôt existe déjà. `.env.backup` est un fichier shell
local de confiance, ignoré par Git. La valeur `BACKUP_HOST` doit rester stable pour
retrouver les snapshots. Le dépôt par défaut est `/var/backups/bibliotheque-restic`
et l'espace temporaire `/var/lib/bibliotheque-backup`.

La base doit être démarrée et initialisée. Le compte `POSTGRES_USER` sert aux
exports ; actuellement il a les droits nécessaires. Si un compte applicatif
restreint est ajouté, garder un compte de sauvegarde capable d'exporter la base
et les rôles globaux.

## Planification systemd

Après la première sauvegarde et son test réussis, adapter `WorkingDirectory` et
`ExecStart` dans les fichiers `.service` si le projet n'est pas dans
`/opt/bibliotheque`, puis :

```bash
sudo cp ops/systemd/bibliotheque-*.service ops/systemd/bibliotheque-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bibliotheque-backup.timer bibliotheque-restore-test.timer
systemctl list-timers 'bibliotheque-*'
```

La sauvegarde démarre tous les jours à 03 h, le test de restauration le premier
du mois à 05 h, selon le fuseau horaire du VPS, avec au plus 10 minutes de décalage.
`Persistent=true` rattrape une exécution manquée lorsque le serveur revient.
Les timers ne sont pas installés/activés automatiquement par le dépôt.

Consultation sans alerte externe :

```bash
journalctl -u bibliotheque-backup.service -n 100
journalctl -u bibliotheque-restore-test.service -n 100
sudo cat /var/lib/bibliotheque-backup/last-backup-success
sudo cat /var/lib/bibliotheque-backup/last-restore-test-success
sudo ./scripts/restic.sh snapshots
```

Les opérations se verrouillent mutuellement (attente maximale : 5 minutes).
Les marqueurs de réussite ne sont actualisés qu'en cas de succès.

## Avant une migration

```bash
sudo ./scripts/migrate.sh
```

Ce script sauvegarde d'abord puis applique, dans l'ordre, les fichiers de
`bdd/migrations/`. Si l'export ou l'archivage échoue, aucune migration ne démarre.
Les migrations actuelles 02 et 03 sont réexécutables ; tout futur fichier ajouté
doit l'être également, ou il faudra introduire un suivi de versions de migration.
Ce script ne remplace pas `init.sql` pour une base neuve et ne met pas l'API en
maintenance : une migration incompatible demande un arrêt planifié de l'API.
`start.sh` n'applique pas les migrations d'un volume existant.

## Tester une restauration

```bash
sudo ./scripts/verify-backup.sh             # dernier snapshot de cet hôte/projet
sudo ./scripts/verify-backup.sh <snapshot>  # snapshot précis
```

Le script vérifie le dépôt Restic, extrait un snapshot précis, contrôle les hashes,
puis restaure dans un conteneur PostgreSQL 18 isolé : aucun port publié, aucun
réseau, aucun montage de la base en service. Il vérifie les tables, la permission
des utilisateurs et les relations. Le conteneur et son volume anonyme sont
supprimés à la fin, même en cas d'échec traité. Un SIGKILL peut nécessiter un
nettoyage manuel des conteneurs étiquetés `bibliotheque.backup-test=true`.
Ce test utilise de vraies données restaurées mais n'exécute aucun appel API ni
programme Python. Le premier essai peut télécharger l'image PostgreSQL.

## Restaurer des données pour une reprise réelle

La cible doit être une **nouvelle base**, différente de celle utilisée par l'API :

```bash
sudo ./scripts/restic.sh snapshots
sudo ./scripts/restore.sh <snapshot> bibliotheque_restauree
```

Aucun `DROP DATABASE`, `--clean` ou écrasement de production n'est effectué. Si la
cible existe, la commande échoue. La restauration est transactionnelle ; si elle
échoue, la nouvelle base peut rester vide et doit être inspectée manuellement.
La source PostgreSQL doit être disponible : après une perte de l'installation,
recréer d'abord un service `bdd` et son compte d'administration.

Les configurations et rôles récupérés sont laissés dans le répertoire
`recovered-*` affiché, avec un accès privé. Ils ne remplacent pas les configurations
courantes. `--no-owner --no-privileges` attribue les objets au compte de restauration ;
si des rôles applicatifs spécifiques sont ajoutés, réappliquer les permissions
nécessaires après contrôle de `globals.sql` (qui contient des secrets).

Après inspection des données : arrêter l'API, modifier son `PGDATABASE` via
`POSTGRES_DB` dans `.env`, puis recréer les services avec `./start.sh --production` sur le VPS HTTPS
(ou `./start.sh` en environnement local). Ne pas
supprimer le volume PostgreSQL. Les configurations actuelles font utiliser la
même variable au healthcheck de la base et à l'API.
Une restauration ramène aussi les sessions à leur état sauvegardé : avant la
bascule, révoquer les sessions restaurées si nécessaire. Conserver l'ancienne
base jusqu'à validation complète. Pour revenir en arrière, arrêter l'API et
rétablir l'ancien nom de base.

## Vérifier les scripts avant installation

```bash
python3 scripts/tests/test_backup.py
```

Ce test requiert Docker Compose et Restic dans `PATH`. Il construit un projet
Compose temporaire dans `/tmp`, avec des données fictives, puis teste sauvegarde,
restauration isolée, récupération dans une nouvelle base, protection des bases
existantes, séquences, échec d'export, archive altérée et chemins d'archive interdits.
Il ne lit pas le `.env` du projet ni sa base. Ses conteneurs et volumes sont
supprimés en fin de test.
