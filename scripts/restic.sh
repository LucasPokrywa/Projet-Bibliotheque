#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/backup/common.sh"
require_tools restic
# L'initialisation est explicite : un dépôt inaccessible ne doit jamais être
# remplacé silencieusement par un nouveau dépôt vide lors d'une sauvegarde.
exec restic "$@"
