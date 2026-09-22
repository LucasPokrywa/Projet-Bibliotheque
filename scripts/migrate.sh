#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# Si l'export ou l'archivage échoue, aucune migration n'est exécutée.
./scripts/backup.sh pre-migration
for migration in bdd/migrations/*.sql; do
    printf 'Application de %s\n' "$migration"
    docker compose exec -T bdd sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
done
