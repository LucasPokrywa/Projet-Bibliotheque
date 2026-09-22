#!/usr/bin/env python3
"""Manifestes, choix de snapshot et extraction contrôlée des sauvegardes."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile


def digest(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def file_hashes(root):
    return {p.relative_to(root).as_posix(): digest(p)
            for p in sorted(root.rglob('*')) if p.is_file() and p.name != 'manifest.json'}


def main():
    command, *args = sys.argv[1:]
    if command == 'snapshot':
        snapshots = json.loads(Path(args[0]).read_text()) or []
        requested = args[1]
        if requested == 'latest':
            matches = sorted(snapshots, key=lambda s: s['time'])[-1:]
        else:
            matches = [s for s in snapshots if s['id'].startswith(requested)]
        if len(matches) != 1:
            raise ValueError('Snapshot absent ou identifiant ambigu pour cet hôte/projet')
        print(matches[0]['id'])
    elif command == 'manifest':
        root = Path(args[0])
        version = int((root / 'postgres-version.txt').read_text().strip()) // 10000
        if version != 18:
            raise ValueError('Ces procédures sont prévues pour PostgreSQL 18')
        manifest = {'format': 1, 'postgres_major': version, 'sha256': file_hashes(root)}
        (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    elif command == 'extract':
        destination = Path(args[1])
        destination.mkdir(mode=0o700)
        with tarfile.open(args[0]) as archive:
            members = archive.getmembers()
            for member in members:
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                    raise ValueError('Archive non conforme : chemin ou type de fichier interdit')
            # Pas de liens, de chemins absolus ni de traversée : écrire seulement
            # les données, sans appliquer propriétaires et permissions de tar.
            for member in members:
                target = destination / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True, mode=0o700)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with archive.extractfile(member) as source, target.open('wb') as output:
                        for chunk in iter(lambda: source.read(1024 * 1024), b''):
                            output.write(chunk)
                    target.chmod(0o600)
    elif command == 'verify':
        root = Path(args[0])
        manifest = json.loads((root / 'manifest.json').read_text())
        if manifest.get('format') != 1 or manifest.get('postgres_major') != 18:
            raise ValueError('Format ou version PostgreSQL incompatible')
        required = {'database.dump', 'globals.sql', 'postgres-version.txt', 'commit.txt', 'config/project.env', 'config/docker-compose.yml'}
        if not required.issubset(manifest['sha256']) or file_hashes(root) != manifest['sha256']:
            raise ValueError('Sauvegarde incomplète ou somme de contrôle incorrecte')
    else:
        raise ValueError('Commande inconnue')


if __name__ == '__main__':
    main()
