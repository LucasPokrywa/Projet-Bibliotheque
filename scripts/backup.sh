#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/backup/common.sh"
start_operation sauvegarde
require_tools tar
reason="${1:-manual}"
[[ "$reason" =~ ^(manual|scheduled|pre-migration)$ ]] || { echo "Usage : backup.sh [manual|scheduled|pre-migration]" >&2; exit 1; }
mkdir -p "$WORK_DIR/bundle/config"
# L'export termine avant toute publication de snapshot. Une erreur de pg_dump
# interrompt l'opération ; un fichier partiel ne sera jamais envoyé à Restic.
docker compose exec -T bdd sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$WORK_DIR/bundle/database.dump"
docker compose exec -T bdd pg_restore --list < "$WORK_DIR/bundle/database.dump" > /dev/null
docker compose exec -T bdd sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$WORK_DIR/bundle/globals.sql"
docker compose exec -T bdd sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW server_version_num"' > "$WORK_DIR/bundle/postgres-version.txt"
cp -- .env "$WORK_DIR/bundle/config/project.env"
cp -- docker-compose.yml "$WORK_DIR/bundle/config/docker-compose.yml"
if [[ -f api/python_script/.env ]]; then cp -- api/python_script/.env "$WORK_DIR/bundle/config/python.env"; fi
if [[ -f compose.prod.yml ]]; then cp -- compose.prod.yml "$WORK_DIR/bundle/config/compose.prod.yml"; fi
if [[ -d ops/caddy ]]; then cp -R -- ops/caddy "$WORK_DIR/bundle/config/caddy"; fi
cp -R -- bdd "$WORK_DIR/bundle/config/bdd"
git rev-parse HEAD > "$WORK_DIR/bundle/commit.txt" 2>/dev/null || printf 'unknown\n' > "$WORK_DIR/bundle/commit.txt"
python3 "$BACKUP_PROJECT_DIR/scripts/backup/bundle.py" manifest "$WORK_DIR/bundle"
# --stdin-from-command refuse un snapshot si tar échoue.
restic backup --host "$BACKUP_HOST" --tag "$BACKUP_TAG" --tag "$reason" \
    --stdin-filename bibliotheque.tar --stdin-from-command -- tar -C "$WORK_DIR/bundle" -cf - .
# Nettoyage uniquement après un export et un archivage réussis, limité à ce projet.
restic forget --host "$BACKUP_HOST" --tag "$BACKUP_TAG" --group-by host \
    --keep-last 3 --keep-within 2d --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
printf '%s\n' "$(date -u +%FT%TZ)" > "$BACKUP_STATE_DIR/last-backup-success"
echo "Sauvegarde chiffrée terminée ; rétention appliquée."
