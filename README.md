# Puzzle (React)

Application de puzzle “tuiles” (type grille), avec:
- import image par **upload** ou **URL**
- choix **50 / 100 / 200 / 500 / 1000** pièces
- pièces **mélangées**
- **rotation optionnelle** par pas de 90° (touche `R` ou bouton)
- **aide activable** (zone simple / medium / advanced)
- **sélection + placement**: clique une pièce (tray), puis clique sur la grille pour tenter de la poser (feedback vert/rouge)
- rendu en **formes “jigsaw”** (ergots/creux) au plus proche d’un puzzle physique

## Démarrer

1) Installer les dépendances:

```bash
npm install
```

2) Lancer le dev server:

```bash
npm run dev
```

## Notes

- Les puzzles sont découpés en **grille** (pas une découpe “jigsaw” avec ergots).
- Une URL externe peut échouer à cause du **CORS**: dans ce cas, utilise l’upload fichier.


