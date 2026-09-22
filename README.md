# Bibliotheque

## Description

## Organisation projet

La base de données : 

![Base de données](assets/bdd.png)

L'api permet de créer un utilisateur. Ajouter un livre grâce a son ISBN. Ajouter un livre à la bibliothèque d'un utilisateur, et le marquer comme lu si tels quel. 


## Sauvegarde et restauration

Sauvegardes PostgreSQL chiffrées avec Restic, stockées localement sur le VPS,
planification quotidienne et test mensuel de restauration : [procédure](ops/BACKUPS.md).

## Déploiement HTTPS

Sur le VPS, renseigner `API_DOMAIN` puis lancer `./start.sh --production` pour
activer Caddy et HTTPS automatique : [procédure](ops/HTTPS.md).
Le démarrage local reste `./start.sh`.
