-- La base est créée par l'image PostgreSQL via POSTGRES_DB.
-- Ce script initialise les tables dans cette base au premier démarrage.

-- =========================
-- TABLE : livres
-- =========================

CREATE TABLE livres (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    auteur VARCHAR(255) NOT NULL,
    isbn VARCHAR(20) UNIQUE,
    date_publication DATE
);


-- =========================
-- TABLE : utilisateurs
-- =========================

CREATE TABLE utilisateurs (
    id SERIAL PRIMARY KEY,
    pseudo VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    permission SMALLINT NOT NULL DEFAULT 0 CHECK (permission IN (0, 1)),
    date_inscription TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- TABLE : bibliotheque
-- Lien entre utilisateurs et livres
-- =========================

CREATE TABLE bibliotheque (
    id SERIAL PRIMARY KEY,

    utilisateur_id INTEGER NOT NULL,
    livre_id INTEGER NOT NULL,

    lu BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_bibliotheque_utilisateur
        FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateurs(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_bibliotheque_livre
        FOREIGN KEY (livre_id)
        REFERENCES livres(id)
        ON DELETE CASCADE
);

-- Administrateur initial fourni par l'environnement (aucun secret versionné).
\set admin_email ''
\set admin_pseudo ''
\set admin_password_hash ''
\getenv admin_email ADMIN_EMAIL
\getenv admin_pseudo ADMIN_PSEUDO
\getenv admin_password_hash ADMIN_PASSWORD_HASH
SELECT length(:'admin_email') > 0
   AND length(:'admin_pseudo') > 0
   AND length(:'admin_password_hash') > 0 AS seed_admin \gset
\if :seed_admin
INSERT INTO utilisateurs (pseudo, email, mot_de_passe, permission)
VALUES (:'admin_pseudo', lower(trim(:'admin_email')), :'admin_password_hash', 1);
\endif
