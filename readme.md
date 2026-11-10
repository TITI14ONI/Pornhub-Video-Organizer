# Pornhub Video Organizer

> 🔞 **Contenu réservé aux adultes (18+).** Cet outil manipule des liens vers des sites pour adultes. Il ne contient aucun contenu explicite, ne télécharge aucune vidéo et n'enregistre que des liens et des métadonnées (titre, chaîne, tags…).

**Pornhub Video Organizer** t'aide à trier une grande quantité de vidéos en ne gardant que ce qui te plaît. Tu réponds oui ou non pour les premières, puis le programme apprend tes goûts (à partir des titres, des tags et des chaînes) et classe automatiquement le reste. Il fonctionne **en terminal** ou via une **application de bureau**.

*English summary: a small Node.js/Electron tool that fetches video listings, asks you to like/dislike the first few, learns your taste from titles/tags/channels and auto-sorts the rest into two JSON files. CLI + desktop app with a first-run questionnaire. Links and metadata only, nothing is downloaded. 18+ only.*

---

## Fonctionnalités

- 🔎 Récupère des listes de vidéos (avec ou sans mot-clé) et en extrait titre, vues, note, tags, chaîne et lien.
- 👍👎 Te demande ton avis jusqu'à ce que tu aies validé N vidéos au total, puis **trie automatiquement** les suivantes. Les vidéos déjà validées comptent : on ne te redemande ton avis que s'il en manque.
- 🗂️ Sauvegarde dans deux fichiers lisibles : `liked.json` et `disliked.json`.
- 🎲 Tire une vidéo au hasard parmi tes sauvegardes (« Tu l'as regardée ? », « Ça te plaît ? »).
- 🖥️ Application de bureau avec fiches vidéo (miniature, chaîne, tags), boutons 👍/👎 et raccourcis clavier.
- 🧭 **Questionnaire de première ouverture** expliqué pas à pas (VPN, Opera GX installé…) : l'application choisit elle-même la bonne source et te montre ce qu'elle va faire. Tout est modifiable ensuite dans les paramètres.
- 📚 Bibliothèque : recherche, tri, déplacement d'une vidéo d'une liste à l'autre, suppression.
- 📥 **Import** de tes anciennes sauvegardes (par exemple celles créées en terminal) : l'application les détecte et les fusionne sans doublons.
- 🔒 Tout reste en local : aucun compte, aucun serveur, aucune télémétrie.

## Sources de données

| Source | Option | Particularités |
|---|---|---|
| **Pornhub via Opera GX** (par défaut) | `--source opera` | Pilote ton navigateur Opera GX (donc son VPN intégré si tu l'actives). Donne tags, chaîne, vues et note. Fonctionne sans mot-clé. |
| **Pornhub via pornhub.js** | `--source pornhub` | Sans navigateur. Mots-clés obligatoires, pas de tags ni de chaîne. |

> Certains sites sont restreints dans certains pays. Il t'appartient de respecter les lois locales et les conditions d'utilisation des sites. Le programme ne contourne rien automatiquement : le mode Opera GX se contente de lire les pages avec ton propre navigateur, VPN que **tu** actives compris.

## Installation (application, sans terminal)

**Windows, le plus simple :** télécharge l'installeur dans l'onglet *Releases* du dépôt, installe-le, puis ouvre **Pornhub Video Organizer** depuis le menu Démarrer. Aucun terminal n'est nécessaire. Au premier lancement, un questionnaire adapte l'application à ton installation.

**Depuis les sources :** prérequis [Node.js](https://nodejs.org) 20 ou plus. Opera GX n'est nécessaire que pour la source `opera`.

```bash
git clone <url-du-depot>
cd Pornhub-Video-Organizer
npm install      # une seule fois
```

Lance ensuite l'application avec `npm run app`.

**Créer les exécutables Windows :**

- `npm run dist` génère l'installeur NSIS dans `dist/`. Le fichier `Pornhub Video Organizer Setup ...exe` est autonome et installe l'application.
- `npm run dist:portable` génère un EXE portable autonome que tu peux déplacer et lancer sans installation ni fichiers voisins. Les données restent dans le dossier utilisateur Windows. Opera GX doit toujours être installé séparément pour ouvrir les vidéos.
- L'EXE situé dans `dist/win-unpacked/` n'est pas autonome : il doit rester avec les autres fichiers du dossier.

Les builds ne sont pas signés par défaut. Pour supprimer l'avertissement de l'éditeur inconnu, il faut un certificat de signature de code approuvé par Windows SmartScreen. Ne partage pas le mot de passe de la clé privée et ne le stocke pas dans le dépôt; electron-builder accepte un certificat au moyen de variables d'environnement `CSC_LINK` et `CSC_KEY_PASSWORD`.

> Évite de placer le dossier dans OneDrive : la synchronisation peut bloquer l'installation d'Electron.

## Utilisation en terminal (facultatif)

```bash
npm start                         # liste du moment, via Opera GX
npm start -- "mots clés"          # avec une recherche
npm start -- --ask 20 --pages 5   # avis demandé pour 20 vidéos, 5 pages parcourues
npm run random                    # une vidéo au hasard parmi tes sauvegardes
```

| Option | Description | Défaut |
|---|---|---|
| `--source` | `opera` ou `pornhub` | `opera` |
| `--pages` | Nombre de pages de résultats à parcourir | `3` |
| `--ask` | Objectif **total** d'avis donnés par toi (entrées avec `auto: false`) : tu n'es sollicité que pour celles qui manquent (`all` = toutes) | `10` |
| `--order` | Sans mot-clé : `hot`, `viewed`, `rated`, `new` | `hot` |
| `--exclude` | Mots à ignorer dans les titres et tags | `sfw,vlog,vlogs` |
| `--skip-vpn-check` | Mode Opera : ne pas vérifier le pays | désactivé |
| `--blocked-countries` | Mode Opera : pays considérés comme « VPN inactif » | `FR` |

En mode Opera, une fenêtre Opera GX s'ouvre avec un profil dédié (`opera-profile/`). Au premier lancement, termine l'installation de départ d'Opera et active son VPN si tu en as besoin, puis reviens au terminal.

## Application de bureau

Lance l'application avec l'installeur ou `npm run app`.

- **Première ouverture** : un questionnaire explique chaque question (âge, pays, site restreint ou non, VPN, Opera GX et son emplacement, source, réglages de tri), puis affiche un récapitulatif de ce que l'application va faire. Exemples d'adaptation : sans Opera GX, elle bascule sur Pornhub.js avec des mots-clés ; avec un VPN pour tout l'ordinateur, elle ne vérifie pas le pays.
- **Trier** : une fiche par vidéo (miniature, durée, vues, note, chaîne, tags), des boutons 👍 / 👎 / Passer, une barre de progression, puis la liste des vidéos classées automatiquement. Raccourcis : `O` ou `→` (👍), `N` ou `←` (👎), `S` ou `↓` (passer).
- **Au hasard** : ouvre une seule fenêtre Opera GX avec un seul onglet. La vidéo tirée s'y affiche; après tes réponses, le même onglet passe automatiquement à une autre vidéo. La sauvegarde et la liste correspondante sont mises à jour. Utilise « Arrêter » pour terminer la session.
- **Ouvrir la vidéo** : les boutons de l'application ouvrent les liens dans Opera GX configuré dans les paramètres, avec le profil de navigation de l'application.
- **Bibliothèque** : parcours, filtre et tri de tes listes ; une vidéo peut changer de liste ou être supprimée. Un bouton importe tes anciennes sauvegardes.
- **Paramètres** : réglages regroupés par thème; les questions sur Opera GX et le VPN apparaissent seulement si tes réponses les rendent utiles. Le récapitulatif montre la source active.

Les données de l'application (config, listes, profil Opera) sont dans le dossier utilisateur de l'application, pas dans le dépôt. Si tu as déjà des `liked.json` / `disliked.json` créés en terminal, l'application te propose de les **importer** au premier lancement (ou via « Importer des sauvegardes… »).

## Format des sauvegardes

```json
{
  "titre": "Titre de la vidéo",
  "vue": "6.2K",
  "like": "92%",
  "tag": ["tag1", "tag2"],
  "chaine": "NomDeLaChaine",
  "lien": "https://…",
  "duree": "12:56",
  "miniature": "https://…",
  "auto": false
}
```

- `duree` et `miniature` sont facultatifs (absents des anciennes sauvegardes).
- `auto: true` : classée automatiquement (ces entrées ne servent pas à l'apprentissage).
- Après `npm run random`, les champs `vu` et `plait` (booléens) sont ajoutés, et la vidéo est déplacée dans l'autre fichier si ton avis contredit son classement.

## Structure

```
src/curate.js     programme de tri (terminal ; option --json pour l'application)
src/random.js     tirage au hasard (terminal ; option --json pour l'application)
src/opera.js      lancement partagé d'Opera GX avec Puppeteer
desktop/          application Electron : interface, questionnaire, bibliothèque, import
scripts/          lanceur de l'application
```

## Limites connues

- Le mode Opera lit le code HTML des pages : si un site change sa structure, les tags, la chaîne ou les vues peuvent apparaître vides.
- Le tri automatique ne regarde que les mots (titre, tags, chaîne) : il est approximatif et s'améliore avec le nombre d'avis donnés.
- Développé et testé sous Windows en priorité. L'installeur Windows est créé par `npm run dist`.

## Avertissement

Projet indépendant, non affilié aux sites mentionnés. Utilisation à titre personnel, sous ta responsabilité, dans le respect des lois de ton pays et des conditions des sites. Réservé aux personnes majeures.