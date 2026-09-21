#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
    echo "Erreur : Docker doit être installé." >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "Erreur : le plugin Docker Compose doit être installé." >&2
    exit 1
fi

docker compose config --quiet

if [[ ! -f api/package.json ]]; then
    echo "Erreur : api/package.json est absent. Ajoutez l'API avec un script npm start avant de démarrer." >&2
    exit 1
fi

exec docker compose up --build --detach --wait "$@"
