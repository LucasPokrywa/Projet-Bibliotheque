BEGIN;

-- L'index refuse les doublons existants sans supprimer de données.
CREATE UNIQUE INDEX IF NOT EXISTS utilisateurs_email_lower_unique ON utilisateurs (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS bibliotheque_utilisateur_livre_unique ON bibliotheque (utilisateur_id, livre_id);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_utilisateur_idx ON sessions (utilisateur_id);
CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions (expires_at);

COMMIT;
