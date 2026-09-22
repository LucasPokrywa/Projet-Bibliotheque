#!/usr/bin/env bash
# Bibliothèque interne : la configuration est un fichier shell de confiance.
set -Eeuo pipefail
umask 077
BACKUP_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_CONFIG="${BACKUP_CONFIG:-$BACKUP_PROJECT_DIR/.env.backup}"
if [[ ! -r "$BACKUP_CONFIG" ]]; then
    echo "Configuration absente : copiez .env.backup.example vers .env.backup et renseignez les chemins locaux." >&2
    exit 1
fi
set -a
# shellcheck disable=SC1090
source "$BACKUP_CONFIG"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY doit être configuré}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE doit pointer vers la clé Restic}"
[[ -s "$RESTIC_PASSWORD_FILE" ]] || { echo "Clé Restic absente ou vide." >&2; exit 1; }
BACKUP_STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/bibliotheque-backup}"
BACKUP_HOST="${BACKUP_HOST:-bibliotheque-vps}"
BACKUP_TAG=bibliotheque
RESTORE_POSTGRES_IMAGE="${RESTORE_POSTGRES_IMAGE:-postgres:18.6-trixie}"
[[ "$RESTIC_REPOSITORY" == /* ]] || { echo "Un chemin absolu local est requis pour RESTIC_REPOSITORY." >&2; exit 1; }
[[ "$BACKUP_STATE_DIR" == /* && "$BACKUP_STATE_DIR" != / ]] || { echo "BACKUP_STATE_DIR doit être un répertoire absolu dédié." >&2; exit 1; }
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
mkdir -p "$BACKUP_STATE_DIR"
chmod 700 "$BACKUP_STATE_DIR"
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-$BACKUP_STATE_DIR/cache}"
cd -- "$BACKUP_PROJECT_DIR"

require_tools() {
    local tool
    for tool in "$@"; do
        command -v "$tool" >/dev/null || { echo "Dépendance absente : $tool" >&2; exit 1; }
    done
}

backup_lock() {
    exec 9>"$BACKUP_STATE_DIR/operation.lock"
    flock -w 300 9 || { echo "Une autre opération de sauvegarde/restauration est en cours." >&2; exit 1; }
}


finish() {
    local status=$?
    trap - EXIT
    if [[ -n "${RESTORE_CONTAINER:-}" ]]; then
        docker stop --time 5 "$RESTORE_CONTAINER" >/dev/null 2>&1 || status=1
    fi
    if [[ -n "${WORK_DIR:-}" && "$WORK_DIR" == "$BACKUP_STATE_DIR"/work.* ]]; then
        rm -rf -- "$WORK_DIR"
    fi
    if (( status != 0 )); then echo "Échec : ${BACKUP_TASK:-opération}. Consulter les journaux locaux." >&2; fi
    exit "$status"
}

start_operation() {
    BACKUP_TASK="$1"
    trap finish EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    require_tools docker restic python3 flock
    backup_lock
    WORK_DIR="$(mktemp -d "$BACKUP_STATE_DIR/work.XXXXXXXX")"
}

resolve_snapshot() {
    local requested="${1:-latest}"
    [[ "$requested" == latest || "$requested" =~ ^[a-f0-9]{8,64}$ ]] || { echo "Identifiant de snapshot invalide." >&2; return 1; }
    # Résoudre une seule fois : aucun risque de changer de snapshot entre fichiers.
    restic snapshots --host "$BACKUP_HOST" --tag "$BACKUP_TAG" --json > "$WORK_DIR/snapshots.json"
    SNAPSHOT_ID="$(python3 "$BACKUP_PROJECT_DIR/scripts/backup/bundle.py" snapshot "$WORK_DIR/snapshots.json" "$requested")"
}

fetch_bundle() {
    resolve_snapshot "${1:-latest}"
    restic dump "$SNAPSHOT_ID" /bibliotheque.tar > "$WORK_DIR/bibliotheque.tar"
    python3 "$BACKUP_PROJECT_DIR/scripts/backup/bundle.py" extract "$WORK_DIR/bibliotheque.tar" "$WORK_DIR/bundle"
    python3 "$BACKUP_PROJECT_DIR/scripts/backup/bundle.py" verify "$WORK_DIR/bundle"
}
