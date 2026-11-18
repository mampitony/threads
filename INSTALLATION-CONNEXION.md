# Connexion et réinitialisation du mot de passe

Copie les dossiers src, server et api ainsi que vite.config.mjs à la racine de ton projet en conservant leurs chemins.

## 1. Base Neon

Ouvre l’éditeur SQL de Neon et exécute le contenu de server/schema-password-reset.sql. Cette migration ajoute les tables utilisées pour les liens et la limitation des demandes.

## 2. Envoi des e-mails avec Resend

Crée ton compte sur https://resend.com et ajoute un domaine d’envoi que tu contrôles. Applique les enregistrements DNS indiqués par Resend et attends sa vérification. Crée ensuite une clé API d’envoi.

Dans Vercel, ouvre le projet puis Settings → Environment Variables. Configure ces trois variables pour l’environnement Production.

| Variable | Valeur |
| --- | --- |
| RESEND_API_KEY | Ta clé API Resend |
| RESET_EMAIL_FROM | Une adresse de ton domaine vérifié, par exemple Agence AV <connexion@ton-domaine.fr> |
| APP_URL | https://threads-tau-azure.vercel.app |

Garde DATABASE_URL et les variables existantes. La clé Resend doit rester côté serveur. Utilise une adresse d’expédition autorisée par Resend.

Pour un développement local, ces mêmes variables peuvent être placées dans .env.local. APP_URL doit désigner l’URL HTTPS du panneau auquel les liens doivent renvoyer.

## 3. Déploiement et vérification

Redéploie sur Vercel après avoir copié les fichiers et enregistré les variables.

Sur la page de connexion, clique sur « Mot de passe oublié ? », saisis l’adresse d’un compte approuvé et clique sur « Envoyer le lien ». Consulte aussi les courriers indésirables.

Ouvre le lien reçu, choisis un mot de passe d’au moins 12 caractères et confirme-le. Reconnecte-toi avec le nouveau mot de passe. Les sessions précédentes de ce membre sont invalidées lors du changement.

Les liens expirent après 30 minutes et fonctionnent une seule fois. Une nouvelle demande remplace le lien précédent. L’envoi est limité à cinq demandes par adresse et par IP sur 15 minutes. Les comptes en attente ou refusés conservent leur autorisation actuelle et ne reçoivent pas de lien.

## Vérifications réalisées

Compilation React et TypeScript réussie. Parcours de réinitialisation vérifié localement avec un envoi d’e-mail simulé, y compris les demandes concurrentes et l’expiration. L’envoi réel nécessite ta configuration Resend. Le navigateur de test local était indisponible, le rendu visuel reste à vérifier après déploiement.
