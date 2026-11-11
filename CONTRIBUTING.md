# Contribuer

Merci de vouloir contribuer à Pornhub Video Organizer. Les contributions doivent respecter les lois applicables et les conditions d'utilisation des sites concernés. Ce projet est réservé aux adultes (18+).

## Préparer l'environnement

- Windows est la plateforme de développement prioritaire.
- Installez [Node.js 20 ou plus](https://nodejs.org).
- Clonez le dépôt et installez les dépendances :

```powershell
git clone https://github.com/TITI14ONI/Pornhub-Video-Organizer.git
cd Pornhub-Video-Organizer
npm install
```

Opera GX est nécessaire uniquement pour tester les fonctions qui pilotent ce navigateur. La source `pornhub.js` peut être utilisée sans Opera GX, avec des mots-clés.

## Lancer et vérifier les changements

```powershell
npm run app          # application de bureau
npm start            # tri en terminal
npm run random       # tirage au hasard en terminal
```

Il n'y a pas actuellement de suite de tests automatisés configurée. Pour chaque fichier JavaScript modifié, vérifiez au minimum sa syntaxe :

```powershell
node --check chemin\du\fichier.js
```

Pour les changements d'interface ou de comportement, lancez l'application et vérifiez manuellement le parcours concerné. N'effectuez pas de test réel sur un site externe sans en respecter les règles et les lois applicables.

Les commandes `npm run dist` et `npm run dist:portable` génèrent les exécutables Windows; elles ne sont généralement pas nécessaires pour une pull request.

## Pull requests

1. Créez une branche dédiée à votre changement.
2. Gardez la modification ciblée et suivez le style déjà utilisé dans les fichiers concernés.
3. Vérifiez le comportement touché et indiquez les commandes de test exécutées ainsi que leur résultat.
4. Ouvrez une pull request avec un résumé du problème et de la solution. Pour un changement d'interface, ajoutez des étapes de vérification; les captures d'écran sont facultatives.
5. Ne joignez pas de données personnelles, de fichiers de profil Opera, de journaux contenant des informations sensibles, ni de secrets ou clés.

Pour proposer une idée ou signaler un problème non sensible, utilisez les [Issues du projet](https://github.com/TITI14ONI/Pornhub-Video-Organizer/issues). Pour une faille de sécurité, suivez plutôt les consignes de [SECURITY.md](./SECURITY.md); ne la publiez pas dans une issue.
