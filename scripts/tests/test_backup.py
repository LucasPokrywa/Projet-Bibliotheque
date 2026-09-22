#!/usr/bin/env python3
"""Test réel, isolé : requiert Docker, Compose et Restic dans PATH.
Ne lit pas les données ni le .env du projet. Supprime ses conteneurs/volumes.
"""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]


def main():
    for tool in ('docker', 'restic'):
        if not shutil.which(tool):
            raise SystemExit(f'Outil requis : {tool}')
    with tempfile.TemporaryDirectory(prefix='biblio-backup-test-') as tmp:
        work = Path(tmp)
        project = work / 'project'
        project.mkdir()
        shutil.copytree(ROOT / 'scripts', project / 'scripts')
        shutil.copytree(ROOT / 'bdd', project / 'bdd')
        (project / '.env').write_text('POSTGRES_USER=backup_test\nPOSTGRES_PASSWORD=test-only\nPOSTGRES_DB=bibliotheque\n')
        (project / 'api/python_script').mkdir(parents=True)
        (project / 'api/python_script/.env').write_text('GOOGLE_BOOKS_API_KEY=test-only\n')
        (work / 'password').write_text('test-restic-key-' + uuid.uuid4().hex)
        (project / '.env.backup').write_text(
            f"RESTIC_REPOSITORY='{work}/repository'\n"
            f"RESTIC_PASSWORD_FILE='{work}/password'\n"
            f"BACKUP_STATE_DIR='{work}/state'\n"
            "BACKUP_HOST='backup-test'\n"
            "RESTORE_POSTGRES_IMAGE='postgres:18.6-trixie'\n"
        )
        (project / 'docker-compose.yml').write_text('''services:
  bdd:
    image: postgres:18.6-trixie
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      ADMIN_EMAIL: ""
      ADMIN_PSEUDO: ""
      ADMIN_PASSWORD_HASH: ""
    volumes:
      - ./bdd/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./bdd/migrations/02-auth.sql:/docker-entrypoint-initdb.d/02-auth.sql:ro
      - ./bdd/migrations/03-admin.sql:/docker-entrypoint-initdb.d/03-admin.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "test $$(cat /proc/1/comm) = postgres && pg_isready -U backup_test -d bibliotheque"]
      interval: 1s
      timeout: 2s
      retries: 60
''')
        env = os.environ.copy()
        for key in ('COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'BACKUP_CONFIG', 'RESTIC_PASSWORD', 'RESTIC_PASSWORD_COMMAND'):
            env.pop(key, None)
        env['COMPOSE_PROJECT_NAME'] = 'biblio-backup-test-' + uuid.uuid4().hex[:10]
        env['BACKUP_CONFIG'] = str(project / '.env.backup')

        def run(*args, input=None, success=True):
            result = subprocess.run(args, input=input, text=True, capture_output=True, env=env, cwd=project)
            if success and result.returncode:
                raise RuntimeError(f'{args[0:2]} a échoué :\n{result.stdout[-1500:]}\n{result.stderr[-1500:]}')
            if not success and result.returncode == 0:
                raise AssertionError(f'Échec attendu : {args[0:2]}')
            return result.stdout

        def sql(query, db='bibliotheque'):
            return run('docker', 'compose', 'exec', '-T', 'bdd', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'backup_test', '-d', db, '-At', input=query).strip()

        try:
            run('docker', 'compose', 'up', '-d', '--wait', '--wait-timeout', '90')
            sql("INSERT INTO utilisateurs (pseudo, email, mot_de_passe) VALUES ('Test', 'test@example.com', 'hash-fictif'); INSERT INTO livres (titre, auteur, isbn) VALUES ('Livre test', 'Auteur', '9782070612758'); INSERT INTO bibliotheque (utilisateur_id, livre_id, lu) VALUES (1, 1, true);")
            run('./scripts/restic.sh', 'init')
            run('./scripts/backup.sh', 'scheduled')
            snapshots = json.loads(run('./scripts/restic.sh', 'snapshots', '--json'))
            assert len(snapshots) == 1
            assert (work / 'state/last-backup-success').exists()
            assert not list((work / 'state').glob('work.*'))
            print('OK : export PostgreSQL, configuration et archivage Restic chiffré', flush=True)

            run('./scripts/verify-backup.sh')
            assert (work / 'state/last-restore-test-success').exists()
            print('OK : restauration et contrôles dans un conteneur isolé', flush=True)

            run('./scripts/restore.sh', 'latest', 'bibliotheque_restauree')
            assert sql('SELECT titre FROM livres;', 'bibliotheque_restauree') == 'Livre test'
            assert sql('SELECT lu FROM bibliotheque;', 'bibliotheque_restauree') == 't'
            # Les séquences sont restaurées, pas seulement les lignes.
            assert sql("INSERT INTO livres (titre, auteur) VALUES ('Deuxième', 'Auteur') RETURNING id;", 'bibliotheque_restauree').splitlines()[0] == '2'
            assert sql('SELECT count(*) FROM livres;') == '1'
            recovered = next((work / 'state').glob('recovered-*'))
            assert (recovered / 'config/project.env').read_text() == (project / '.env').read_text()
            run('./scripts/restore.sh', 'latest', 'bibliotheque_restauree', success=False)
            run('./scripts/restore.sh', 'latest', 'bibliotheque', success=False)
            assert sql('SELECT count(*) FROM livres;', 'bibliotheque_restauree') == '2'
            print('OK : données et séquences restaurées ; refus d’écraser les bases existantes', flush=True)

            run('./scripts/migrate.sh')
            assert sql('SELECT permission FROM utilisateurs;') == '0'
            before = json.loads(run('./scripts/restic.sh', 'snapshots', '--json'))
            mark = (work / 'state/last-backup-success').read_text()
            run('docker', 'compose', 'stop', 'bdd')
            run('./scripts/backup.sh', success=False)
            run('./scripts/migrate.sh', success=False)
            after = json.loads(run('./scripts/restic.sh', 'snapshots', '--json'))
            assert [s['id'] for s in before] == [s['id'] for s in after]
            assert (work / 'state/last-backup-success').read_text() == mark
            assert not list((work / 'state').glob('work.*'))
            print('OK : échec d’export = aucun snapshot partiel, aucune rétention ni migration', flush=True)

            # Extraction et manifestes : refus de traversée et détection de corruption.
            malicious = work / 'malicious.tar'
            with tarfile.open(malicious, 'w') as archive:
                member = tarfile.TarInfo('../outside')
                member.size = 1
                archive.addfile(member, io.BytesIO(b'x'))
            run('python3', 'scripts/backup/bundle.py', 'extract', str(malicious), str(work / 'unsafe'), success=False)
            assert not (work / 'outside').exists()
            bundle = work / 'minimal'
            (bundle / 'config').mkdir(parents=True)
            for name in ('database.dump', 'globals.sql', 'commit.txt', 'config/project.env', 'config/docker-compose.yml'):
                (bundle / name).write_text('fixture')
            (bundle / 'postgres-version.txt').write_text('180006')
            run('python3', 'scripts/backup/bundle.py', 'manifest', str(bundle))
            run('python3', 'scripts/backup/bundle.py', 'verify', str(bundle))
            (bundle / 'database.dump').write_text('corrupted')
            run('python3', 'scripts/backup/bundle.py', 'verify', str(bundle), success=False)
            print('OK : archive dangereuse et sauvegarde altérée refusées', flush=True)
        finally:
            run('docker', 'compose', 'down', '--volumes', '--remove-orphans')


if __name__ == '__main__':
    main()
