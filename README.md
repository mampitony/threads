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

En local, le serveur Vite gère l’authentification et la récupération Threads. La procédure ci-dessous configure le serveur en ligne sur Vercel.

## Récupérer la légende, l’auteur et les J’aime de Threads

1. Crée une clé dans [ton compte ScrapeAtlas](https://scrapeatlas.com/account/).
2. Dans PowerShell, depuis le dossier du projet, lance `Copy-Item .env.example .env.local`.
3. Ouvre `.env.local` et colle la clé après `SCRAPEATLAS_API_KEY=`. Garde ce fichier privé.
4. Relance `npm run dev`. Dans **Scrapping Tylan**, colle le lien direct ou le lien de partage d’un post public Threads et clique sur **Récupérer les données du post**.

Le formulaire remplit la légende, le nombre de J’aime et le champ Auteur avec l’identifiant Threads de la publication (@identifiant) à partir de la même requête. Si une valeur manque, le champ correspondant conserve sa saisie et reste modifiable. Le bouton fonctionne avec le serveur Vite local (`npm run dev` ou `npm run preview`). Sur Vercel, les routes du dossier `api/` assurent la connexion et la récupération Threads. Sans clé ou si la publication est inaccessible, tu peux renseigner les champs à la main.

## Doublons et statistiques du planning

Une publication Threads est identifiée par son code. Les liens de partage sont résolus avant l’enregistrement dans Scrapping Tylan. Si un ancien lien de partage n’est plus accessible, corrige son adresse ou supprime sa fiche pour vérifier les nouvelles fiches Threads. Le bouton **Supprimer** retire la fiche et son suivi dans Scrapping Tylan. Une légende déjà copiée reste dans le planning.

Dans le planning, colle un lien Threads dans le créneau. La légende, les J’aime et les commentaires directs se chargent avant l’enregistrement. Le compteur de posts vaut 1 si tu laisses ce champ vide et enregistres un lien. Le bouton **Actualiser les données du post** permet de relancer la récupération. Tu peux encore enregistrer une légende seule ou compléter les champs manuellement si certaines données manquent. Les compteurs disponibles s’affichent sur la carte et dans le CSV.

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

## Déployer sur Vercel

1. Crée une base PostgreSQL, par exemple via [Neon](https://neon.tech/). Dans son éditeur SQL, exécute le contenu de `server/schema-postgres.sql` sur la base destinée à la production.
2. Dans Vercel, importe ton dépôt GitHub. Choisis le préréglage **Vite** et le dossier racine qui contient `package.json`. Utilise Node.js 24, la commande `npm run build` et le dossier de sortie `dist`.
3. Ajoute ces variables dans **Environment Variables**, pour **Production**.

   | Variable | Valeur |
   | --- | --- |
   | `DATABASE_URL` | Chaîne de connexion PostgreSQL avec pool, fournie par Neon |
   | `SCRAPEATLAS_API_KEY` | Clé utilisée pour récupérer les données Threads |
   | `ADMIN_EMAIL` | Ton adresse e-mail pour le premier compte administrateur |
   | `ADMIN_SETUP_CODE` | Code aléatoire privé, de 32 caractères ou plus |

   Pour générer le code d’installation dans le terminal VS Code, utilise `node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"`. Copie les valeurs dans Vercel. Garde les secrets hors du dépôt Git.

4. Clique sur **Déployer**. Ouvre ensuite l’adresse de production, puis **Créer un compte**. Saisis l’e-mail configuré dans `ADMIN_EMAIL` et choisis ton mot de passe. Ouvre **Premier administrateur sur Vercel**, saisis le code d’installation et valide. Les autres comptes pourront ensuite demander l’accès.
5. Une fois le premier compte créé, le code d’installation ne sert plus. Tu peux retirer `ADMIN_SETUP_CODE` des variables de production et redéployer.

La base PostgreSQL commence vide. Les comptes SQLite existants demandent une migration distincte. En production, le planning est partagé entre les administrateurs et les comptes approuvés. En local, le planning reste séparé par compte et par navigateur. Les données de localhost ne sont pas transférées automatiquement vers le domaine de production.

### Mettre à jour un projet Vercel déjà déployé

1. Dans l’éditeur SQL de Neon, sur la base utilisée par `DATABASE_URL` en production, exécute `server/schema-planning.sql`. Cette migration ajoute une table au projet existant.
2. Sur Vercel, configure `SCRAPEATLAS_API_KEY` pour **Production** si la clé manque. Publie le code mis à jour et redéploie.
3. Ouvre le site avec deux comptes approuvés. Les modèles, les comptes Threads, les créneaux et les références Scrapping Tylan partagent la même base. Les autres onglets actualisent le planning toutes les cinq secondes et quand ils reprennent le focus.

Si le planning partagé est vide, un administrateur peut cliquer sur **Importer mon ancien planning** depuis le navigateur et l’adresse qui contiennent ses anciennes données. Cette opération initialise le planning partagé avec sa copie. Les anciennes données des autres navigateurs ne sont pas fusionnées automatiquement. Les ajouts manquants peuvent être ressaisis dans le planning partagé.
