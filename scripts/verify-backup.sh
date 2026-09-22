#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/backup/common.sh"
start_operation test-restauration
restic check
fetch_bundle "${1:-latest}"
# Aucun port publié, aucun réseau, aucun montage du volume de production.
# Le volume anonyme de ce conteneur --rm est supprimé avec lui.
RESTORE_CONTAINER="$(docker run --detach --rm --network none \
    --label bibliotheque.backup-test=true \
    -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_check \
    "$RESTORE_POSTGRES_IMAGE")"
ready=false
for ((i=0; i<60; i++)); do
    # L'initialisation utilise un serveur temporaire ; attendre le serveur final.
    if docker exec "$RESTORE_CONTAINER" sh -c '[ "$(cat /proc/1/comm)" = postgres ] && pg_isready -U postgres -d restore_check' >/dev/null 2>&1; then
        ready=true; break
    fi
    sleep 1
done
[[ "$ready" == true ]] || { echo "PostgreSQL de test n'a pas démarré." >&2; exit 1; }
docker exec -i "$RESTORE_CONTAINER" pg_restore -U postgres -d restore_check \
    --no-owner --no-privileges --single-transaction --exit-on-error < "$WORK_DIR/bundle/database.dump"
docker exec -i "$RESTORE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d restore_check < "$BACKUP_PROJECT_DIR/scripts/backup/verify.sql"
printf '%s\n' "$(date -u +%FT%TZ)" > "$BACKUP_STATE_DIR/last-restore-test-success"
echo "Snapshot $SNAPSHOT_ID restauré et vérifié dans PostgreSQL isolé."
