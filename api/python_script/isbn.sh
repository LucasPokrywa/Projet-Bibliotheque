#!/bin/bash

chemin="$(cd "$(dirname "$0")" && pwd)"
python3 "$chemin/isbn_scrap.py" "$1"