# Atelier Rénovation

Configurateur web interactif pour préparer l'aménagement et le budget d'une pièce à rénover.

Le projet permet de dessiner une pièce irrégulière, de générer un doublage BA13, de positionner les aménagements, de préparer les réseaux électriques et sanitaires, puis d'estimer les matériaux et les produits nécessaires.

## Fonctionnalités

- murs existants avec angles, biais et décrochements ;
- doublage BA13 automatique avec tolérance pour les angles droits ;
- portes, fenêtres et points techniques intégrés aux murs ;
- placement, redimensionnement et ordre d'affichage des aménagements ;
- tracés électriques, eau froide et eau chaude suivant les murs BA13 ;
- nœuds de passage imposés et sorties vers une autre pièce ;
- outil de mesure et couches de cotes indépendantes ;
- métrés pour rails, montants, isolation, BA13 et carrelage ;
- catalogue de produits avec conditionnements, quantités et prix modifiables ;
- configurations nommées sauvegardées localement dans le navigateur ;
- impression du plan cadrée automatiquement sur une page A4.

## Démonstration

[Ouvrir l'application en ligne](https://configurateur-cuisine-emmanuel.emmanuel-galland117.chatgpt.site)

## Développement local

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm ci
npm run dev
```

Puis ouvrir l'adresse indiquée par Vite dans le terminal.

## Vérifications

```bash
npm run lint
npm test
```

## Technologies

- React 19 et TypeScript ;
- Next.js 16 avec Vinext/Vite ;
- rendu SVG interactif ;
- stockage local côté navigateur ;
- déploiement OpenAI Sites.

## Données

Les projets, configurations et produits personnalisés restent enregistrés dans le stockage local du navigateur. Le dépôt ne contient aucune donnée personnelle saisie dans l'application.
