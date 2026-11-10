# Planning des publications

Application React et TypeScript construite avec Vite. Le planning affiche les créneaux Matin, Midi et Soir de chaque compte. Il permet de renseigner le nombre de posts, la légende +1K, le lien et le responsable. Le menu **Comptes** permet de gérer les modèles et de rattacher plusieurs profils à chacun. Deux modèles renommables sont proposés au départ. Tu peux en ajouter ou supprimer ceux qui sont vides. Les profils existants apparaissent dans **Sans modèle** jusqu’à leur rattachement. Dans le planning, le filtre par modèle affiche les comptes correspondants. Le bouton **Exporter en CSV** exporte les saisies du planning.

Dans **Scrapping Tylan**, tu peux ajouter et modifier des publications de référence. Chaque fiche contient la légende, l’auteur, le lien, le nombre de réactions et le nom de l’agent qui a saisi la fiche. Les champs restent modifiables manuellement.

Avec **Utiliser la légende**, choisis un modèle, un compte, une date et un créneau. Le texte est copié dans le planning et la fiche garde la liste des comptes et modèles qui l’ont utilisé. Répète l’action pour les autres comptes. Un créneau qui contient déjà une autre légende doit être modifié depuis le planning.

## Démarrer sur ton ordinateur

Installe Node.js 24 LTS, extrais l’archive, puis ouvre un terminal dans le dossier qui contient `package.json`.

```bash
npm ci
npm run dev
```

Ouvre l’adresse affichée dans le terminal, généralement `http://localhost:5173`. Clique sur **Créer un compte**, indique ton e-mail et choisis un mot de passe d’au moins 12 caractères. Le premier compte créé devient administrateur et accède immédiatement au panneau. Les inscriptions suivantes restent en attente. Dans **Gestion des accès**, un administrateur peut **Approuver** ou **Refuser** une demande. Une demande approuvée devient un compte simple. Dans **Comptes autorisés**, utilise **Nommer administrateur** ou **Passer en compte simple** pour changer le rôle. Le dernier administrateur doit conserver son rôle. L’e-mail est utilisé comme identifiant, sans vérification par envoi de message.

## Comptes et données locales

L’e-mail sert d’identifiant. Le serveur local stocke les comptes et les sessions dans `.data/auth.sqlite`, à côté de `package.json`. Les mots de passe sont hachés avec scrypt. Pour conserver les comptes en déplaçant le projet, copie le dossier `.data` lorsque le serveur est arrêté. Garde ce dossier privé. Si tu mets à jour la version précédente, le plus ancien compte existant devient administrateur et les autres comptes doivent être approuvés. Leurs sessions précédentes expirent lors de la mise à jour.

Chaque compte a son propre planning dans le stockage du navigateur. Le premier compte créé peut récupérer le planning de la version précédente en utilisant le même navigateur et la même adresse. Les plannings ne sont pas synchronisés entre les navigateurs. Les données du navigateur restent accessibles à une personne ayant accès à ce profil Chrome ou à ses outils de développement.

Cette version est configurée pour une utilisation locale. Le serveur Vite doit tourner pour l’authentification et la récupération Threads.

## Récupérer la légende, l’auteur et les J’aime de Threads

1. Crée une clé dans [ton compte ScrapeAtlas](https://scrapeatlas.com/account/).
2. Dans PowerShell, depuis le dossier du projet, lance `Copy-Item .env.example .env.local`.
3. Ouvre `.env.local` et colle la clé après `SCRAPEATLAS_API_KEY=`. Garde ce fichier privé.
4. Relance `npm run dev`. Dans **Scrapping Tylan**, colle le lien direct ou le lien de partage d’un post public Threads et clique sur **Récupérer les données du post**.

Le formulaire remplit la légende, le nombre de J’aime et le champ Auteur avec l’identifiant Threads de la publication (@identifiant) à partir de la même requête. Si une valeur manque, le champ correspondant conserve sa saisie et reste modifiable. Le bouton fonctionne avec le serveur Vite local (`npm run dev` ou `npm run preview`). La version statique dans `dist/` doit disposer d’une route serveur équivalente pour activer cette fonction sur un hébergement. Sans clé ou si la publication est inaccessible, tu peux renseigner les champs à la main.

## Doublons et statistiques du planning

Une publication Threads est identifiée par son code. Les liens de partage sont résolus avant l’enregistrement dans Scrapping Tylan. Si un ancien lien de partage n’est plus accessible, corrige son adresse ou supprime sa fiche pour vérifier les nouvelles fiches Threads. Le bouton **Supprimer** retire la fiche et son suivi dans Scrapping Tylan. Une légende déjà copiée reste dans le planning.

Dans le planning, enregistre la légende seule si le post n’est pas encore publié. Une fois publié, ajoute son lien Threads au même créneau et enregistre. Le serveur tente alors de récupérer les J’aime et les commentaires directs. Les compteurs disponibles s’affichent dans la carte et sont inclus dans le CSV. Le créneau reste enregistrable si Threads ou ScrapeAtlas ne renvoie pas les compteurs.

## Compiler le projet

```bash
npm run build
npm run preview
```

La compilation vérifie le TypeScript et génère le site statique dans `dist/`.

## Organisation

- `src/App.tsx` contient les composants du planning, des comptes et des formulaires.
- `src/Tylan.tsx` contient la liste et le formulaire des publications de référence.
- `src/planning.ts` contient les types, les dates, la sauvegarde locale et l’export CSV.
- `src/styles.css` contient les styles de l’interface.

Les saisies sont stockées par adresse de site et par navigateur. Sur l’adresse de l’application d’origine, la version React retrouve les saisies existantes grâce au même format de stockage. Une copie exécutée sur localhost commence avec son propre planning. Le CSV sert à consulter ou conserver une copie des saisies.
