# Application mobile Ma Bibliothèque

Application Expo pour Android et iOS. Connexion obligatoire avec un compte créé sur le site, bibliothèque personnelle et ajout par ISBN saisi ou code-barres EAN-13 scanné. Le scan ou la saisie recherche et enregistre d'abord le livre dans le catalogue (`POST /v1/livres/isbn`), puis demande confirmation avant de l'ajouter à la bibliothèque (`POST /v1/bibliotheque`).

## Démarrer

```bash
cd mobile
npm install
npx expo install --fix
npm start
```

Ouvrez Expo Go sur un téléphone pour tester la caméra (un émulateur n'a généralement pas de code-barres physique). L'API HTTPS de production est configurée par défaut ; pour une autre API, définissez `EXPO_PUBLIC_API_URL` avant `npm start` (une adresse accessible depuis le téléphone). Ne mettez aucun secret dans cette variable.

L'authentification utilise le cookie de session HttpOnly de l'API, transmis par les appels natifs avec `credentials: 'include'`. La session expire au bout d'une heure ; l'application demande une nouvelle connexion si l'API répond 401. Le comportement de conservation du cookie après fermeture dépend du système et du client natif ; une nouvelle connexion peut être nécessaire. La création de compte reste disponible sur le site web.
