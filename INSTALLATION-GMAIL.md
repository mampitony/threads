# Envoyer les liens de réinitialisation avec Gmail

Cette mise à jour complète connexion-mot-de-passe-oublie.zip. Copie les fichiers en conservant leurs dossiers.

## Configuration Google

1. Ouvre https://myaccount.google.com/security et active la validation en deux étapes.
2. Ouvre https://myaccount.google.com/apppasswords.
3. Crée un mot de passe d’application nommé « Planning publications ».
4. Copie le mot de passe généré directement dans Vercel.

Un compte d’organisation ou protégé par certaines options Google peut ne pas proposer les mots de passe d’application.

## Variables Vercel

Dans ton projet Vercel, ouvre Settings → Environment Variables, puis configure les valeurs suivantes pour Production.

| Variable | Valeur |
| --- | --- |
| GMAIL_USER | Ton adresse Gmail complète |
| GMAIL_APP_PASSWORD | Le mot de passe d’application généré par Google |
| APP_URL | https://threads-tau-azure.vercel.app |

Le code utilise automatiquement Gmail lorsque les deux variables GMAIL sont définies. RESET_EMAIL_FROM et RESEND_API_KEY sont facultatifs avec cette configuration.

Le secret doit rester dans les variables serveur. Évite tout préfixe VITE_ pour ces identifiants.

## Installation

Exécute npm install dans le projet après le remplacement de package.json et package-lock.json, puis redéploie dans Vercel.

La migration server/schema-password-reset.sql de la mise à jour précédente doit avoir été exécutée dans Neon.

Teste « Mot de passe oublié ? » avec l’adresse d’un membre approuvé, puis consulte sa boîte de réception et ses courriers indésirables.

L’envoi reste soumis aux limites et aux contrôles de connexion Gmail. En cas d’échec, consulte les journaux Vercel et vérifie le mot de passe d’application.

## Vérification

La compilation et la préparation du message Gmail ont été vérifiées localement. La livraison réelle reste à vérifier après configuration de ton compte.
