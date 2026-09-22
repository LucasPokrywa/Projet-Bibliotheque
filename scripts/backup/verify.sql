-- Ces requêtes échouent si les tables/colonnes attendues sont absentes.
SELECT count(*) AS utilisateurs FROM utilisateurs;
SELECT count(*) AS livres FROM livres;
SELECT count(*) AS bibliotheques FROM bibliotheque;
SELECT count(*) AS sessions FROM sessions;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM utilisateurs WHERE permission NOT IN (0, 1)) THEN
        RAISE EXCEPTION 'Permission utilisateur invalide';
    END IF;
    IF EXISTS (
        SELECT 1 FROM bibliotheque b
        LEFT JOIN utilisateurs u ON u.id = b.utilisateur_id
        LEFT JOIN livres l ON l.id = b.livre_id
        WHERE u.id IS NULL OR l.id IS NULL
    ) THEN RAISE EXCEPTION 'Référence bibliothèque invalide'; END IF;
    IF EXISTS (
        SELECT 1 FROM sessions s LEFT JOIN utilisateurs u ON u.id = s.utilisateur_id
        WHERE u.id IS NULL
    ) THEN RAISE EXCEPTION 'Session orpheline'; END IF;
END $$;
