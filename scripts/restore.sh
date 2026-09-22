#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/backup/common.sh"
start_operation restauration
[[ $# -eq 2 ]] || { echo "Usage : restore.sh <snapshot|latest> <nouvelle_base>" >&2; exit 1; }
target="$2"
[[ "$target" =~ ^[a-z][a-z0-9_]{0,62}$ ]] || { echo "Nom de base invalide : lettres minuscules, chiffres et underscores." >&2; exit 1; }
current="$(docker compose exec -T bdd sh -c 'printf "%s" "$POSTGRES_DB"')"
[[ "$target" != "$current" && "$target" != postgres && "$target" != template0 && "$target" != template1 ]] || { echo "Refus de restaurer dans la base en service ou une base système." >&2; exit 1; }
fetch_bundle "$1"
# createdb échoue si la cible existe : aucune base n'est écrasée ni supprimée.
docker compose exec -T bdd sh -c 'exec createdb -U "$POSTGRES_USER" --template=template0 -- "$1"' _ "$target"
docker compose exec -T bdd sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --single-transaction --exit-on-error' _ "$target" < "$WORK_DIR/bundle/database.dump"
docker compose exec -T bdd sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' _ "$target" < "$BACKUP_PROJECT_DIR/scripts/backup/verify.sql"
# Configurations récupérées à part, sans remplacer celles du serveur.
recovery_dir="$BACKUP_STATE_DIR/recovered-$target-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$recovery_dir"
cp -R "$WORK_DIR/bundle/config" "$WORK_DIR/bundle/globals.sql" "$WORK_DIR/bundle/manifest.json" "$recovery_dir/"
printf 'Restauration terminée dans %s. Configurations récupérées : %s\n' "$target" "$recovery_dir"
echo "L'API utilise toujours sa base initiale. Valider les données avant toute bascule."
