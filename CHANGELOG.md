# Changelog

Ce fichier décrit les fonctionnalités de la première version, qui n'a pas encore été publiée. Les prochaines versions seront ajoutées en tête avec leur numéro et leur date de publication.

## [Première version — V.1.0.0]

### Ajouté

- **Deux modes d'utilisation**
  - Outil en ligne de commande avec `npm start` pour le tri et `npm run random` pour le tirage au hasard.
  - Application de bureau Windows avec questionnaire de première ouverture, navigation et paramètres.
- **Sources de vidéos**
  - Pornhub consulté dans Opera GX, avec ou sans recherche, et possibilité d'utiliser son VPN intégré.
  - `pornhub.js` comme solution sans navigateur pour les recherches par mots-clés.
  - Sélection automatique de la source selon la configuration et Opera GX disponible.
- **Tri et apprentissage**
  - Recherche par mots-clés ou parcours des listes générales par tendance, vues, note ou date.
  - Réglage du nombre de pages, du nombre d'avis demandés et des mots à exclure.
  - Classement manuel avec 👍, 👎 ou passer; raccourcis clavier dans l'application.
  - Classement automatique à partir des titres, tags et chaînes, après collecte d'avis positifs et négatifs.
  - Conservation des listes « Aimées » et « Refusées » dans `liked.json` et `disliked.json`.
- **Mode hasard**
  - Tirage parmi les vidéos enregistrées, avec option d'inclure celles déjà regardées.
  - Questions pour indiquer si la vidéo a été regardée et si elle plaît; mise à jour des réponses et déplacement entre les listes si nécessaire.
  - Dans l'application, ouverture successive des vidéos dans un seul onglet Opera GX.
- **Bibliothèque**
  - Affichage séparé des vidéos aimées et refusées.
  - Filtrage par titre, chaîne et tags; tri par date ou titre.
  - Déplacement d'une vidéo d'une liste à l'autre et suppression.
- **Configuration et données**
  - Questionnaire avec questions conditionnelles sur l'âge légal, la source, Opera GX, les restrictions régionales et le VPN.
  - Paramètres modifiables, détection et sélection du chemin d'Opera GX, et résumé de la configuration active.
  - Détection et import des anciennes sauvegardes, fusion sans doublons.
  - Configuration et listes de l'application conservées localement; aucune vidéo n'est téléchargée.

### Corrigé et fiabilisé

- Les fichiers JSON vides sont lus comme des listes vides.
- Les boutons d'ouverture utilisent Opera GX configuré dans les paramètres.
- Le mode hasard réutilise une seule fenêtre et un seul onglet pour naviguer entre les vidéos.
- Les navigations lentes d'Opera sont mieux tolérées; les vidéos qui ne s'ouvrent pas peuvent être ignorées.
- Les lectures de page réessaient après une navigation qui détruit le contexte JavaScript.
- Les images, médias et polices nécessaires aux pages consultées dans Opera ne sont pas bloqués.
- Les erreurs de récupération de page sont signalées comme des échecs plutôt que comme une fin normale du tri.

### Limites connues

- Opera GX doit être installé séparément pour les fonctions qui l'utilisent.
- La version de Pornhub via `pornhub.js` nécessite une recherche par mots-clés et fournit moins de métadonnées.
- Les exécutables Windows ne sont pas signés; Windows peut donc afficher un avertissement de sécurité.
