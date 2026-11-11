# Accessibilité

Pornhub Video Organizer devrait pouvoir être utilisé par le plus grand nombre. Cette page décrit les pratiques et les limites actuellement connues de l'application de bureau et des outils en terminal.

## État actuel

- L'application de bureau est une application Electron, développée et testée en priorité sous Windows.
- L'interface utilise des éléments HTML natifs, notamment des boutons, champs, listes déroulantes et sections dépliables.
- Certains raccourcis clavier sont disponibles dans l'écran de tri; ils ne remplacent pas les commandes à l'écran.
- Aucune évaluation formelle de conformité WCAG n'a été effectuée. La compatibilité avec les lecteurs d'écran et les différentes technologies d'assistance n'a pas été vérifiée de façon systématique. Nous ne revendiquons donc aucun niveau de conformité.

## Contribuer à l'accessibilité

Pour toute modification de l'interface, veuillez préserver le fonctionnement au clavier, les libellés compréhensibles des contrôles et les indicateurs de focus visibles. Ne communiquez pas une information uniquement par la couleur. Si une modification change une interaction, décrivez comment la tester au clavier dans la pull request.

## Signaler un obstacle

Ouvrez un ticket dans les [Issues du projet](https://github.com/TITI14ONI/Pornhub-Video-Organizer/issues). Décrivez la tâche concernée, ce qui s'est passé, ce que vous attendiez, votre système d'exploitation et, si pertinent, le lecteur d'écran ou la méthode de saisie utilisés. Une capture d'écran ou une vidéo peut aider, mais reste facultative. Aucune information personnelle ou justification médicale n'est nécessaire.

Il n'y a pas de délai garanti de réponse. Le mainteneur examinera les signalements selon leur impact et le temps disponible; vous pouvez ajouter un commentaire au ticket pour demander des nouvelles ou proposer une amélioration à cette page.

## Environnements et limites connus

Windows est la plateforme prioritaire. Les autres systèmes et les combinaisons avec des technologies d'assistance n'ont pas fait l'objet de tests systématiques. Le terminal dépend des possibilités d'accessibilité de l'environnement dans lequel Node.js est exécuté. Les pages vidéo ouvertes dans Opera GX sont fournies par le site externe et ne sont pas contrôlées par cette application.

Cette liste n'est pas le résultat d'un audit exhaustif. Merci de signaler les obstacles rencontrés, même s'ils ne sont pas mentionnés ici.
