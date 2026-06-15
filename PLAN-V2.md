# PressPilot V2 — Plan de refonte (équipe d'agents)

> Objectif : refonte complète de l'UI (outil moderne, menu latéral gauche, identité DCKAY conservée),
> UX parfaite sur mobile **et** desktop, + tout le backlog fonctionnel, livré d'un seul tenant.
> Dev en environnement local isolé. Passage en prod uniquement après validation de Dany.

---

## 1. Principe directeur

- **On ne réécrit PAS en framework.** On garde Node 22 + Express + `node:sqlite` + front vanilla JS.
- On **modularise** le monolithe (`app.js` 90 Ko, `style.css` 42 Ko) : prérequis du travail parallèle.
- On **réutilise** le maximum de l'existant : API REST, table `views` (vues sauvegardées serveur, sync multi-appareils), `config_values` (couleurs), export xlsx, auth/session, undo/toast.
- **Nouvelle UI** : shell type SaaS récent — sidebar gauche collapsible, top bar contextuelle, palette de commandes, responsive mobile soigné. Identité DCKAY conservée (encre / papier / cuivre ; DM Serif Display / Instrument Sans / JetBrains Mono).

---

## 2. Environnement de développement isolé

- **Branche `v2`** créée depuis `main`. La prod reste sur `main` (auto-deploy Railway), **intouchée pendant tout le dev**.
- **Base de dev** : copier `data/sommaire.db` → `data/dev.db`. On ne travaille jamais sur la base prod-miroir.
- **Lancement local V2** : `DB_PATH=./data/dev.db PORT=3838 node server.js` → http://localhost:3838
  (la prod tourne sur 3737 / Railway, aucun chevauchement).
- **Worktrees git** : chaque agent travaille dans son propre worktree depuis `v2`. L'orchestrateur merge les branches de feature dans `v2`.
- **Passage en prod** : seulement après validation Dany → merge `v2` → `main` → Railway déploie. Snapshot data via `GET /api/admin/export` avant bascule si besoin.

---

## 3. Équipe et modèles

| Agent | Modèle | Justification |
|-------|--------|---------------|
| **Orchestrateur** | Opus 4.8 | Setup env, séquencement, merges, arbitrage, validation |
| **Backend** | Sonnet 4.6 | SQL / Node / API, économique et solide |
| **UX/UI Lead** | Opus 4.8 (fondations) → Sonnet 4.6 (exécution CSS) | Poste critique : invente la nouvelle UI + design system |
| **Frontend Shell** | Sonnet 4.6 | Implémente le shell (sidebar, routing, responsive, modules) |
| **Frontend Features A** | Sonnet 4.6 | Tables Articles/Magazines : colonnes, resize, show/hide, filtres, modale commentaire |
| **Frontend Features B** | Sonnet 4.6 | CDF cliquable + deep-link, Calendrier, Dashboard, Facturation |
| **Test & QA** | Sonnet 4.6 (suite e2e) + Haiku 4.5 (passes répétitives) | Playwright mobile+desktop + checklist UX/a11y |

> Pas de Fable ici (modèle rédaction). Opus réservé à l'orchestration + aux fondations design (là où le jugement compte). Sonnet pour tout le code de prod. Haiku pour les vérifs QA répétitives.

---

## 4. Séquencement (dépendances)

```
PHASE 0 — Fondations (bloquant)
  Orchestrateur : branche v2, base dev.db, worktrees, port 3838
  UX/UI Lead    : direction UI nouvelle (sidebar) + tokens design (Opus)
  Frontend Shell: découpe app.js + style.css en modules ; nouveau shell vide mais navigable
  Backend       : migrations + endpoints enrichis (CDF source+id, filtres pages, format vues)

PHASE 1 — Reconstruction sur le nouveau shell (parallèle)
  Frontend Shell    : routing modules dans le nouveau layout, responsive de base, burger mobile
  Features A        : table Articles dans le nouveau shell (édition inline, colonnes)
  Features B        : Dashboard + Calendrier dans le nouveau shell
  UX/UI Lead        : implémentation CSS de masse (Sonnet), composants

PHASE 2 — Features demandées + UX avancée (parallèle)
  Features A        : numéro éditable séparé, resize+save, show/hide colonnes, filtres pages, modale commentaire
  Features B        : CDF (lien source visible+cliquable dans la case ; clic case = deep-link article), Facturation
  UX/UI Lead        : vue carte mobile, densité, skeletons, états vides, focus a11y

PHASE 3 — QA + polish
  Test & QA : Playwright mobile+desktop, checklist a11y, rapport bugs
  Tous      : corrections sur retours QA jusqu'au vert complet
```

**Règle anti-collision** : un fichier = un agent à la fois. Le découpage modulaire Phase 0 rend ça possible (un module par domaine).

---

## 5. Backlog fonctionnel

### Demandes explicites de Dany
1. **CDF — lien source dans la case** : afficher le lien source, visible et **cliquable** dans la case (ouvre la source).
2. **CDF — clic sur la case = deep-link** : cliquer la case (hors lien) envoie vers **l'article correspondant dans le module Articles** (filtré sur ce seul article).
3. **Resize des colonnes** (Articles + Magazines) avec **sauvegarde** (persistée via table `views`).
4. **Magazine et Numéro en 2 colonnes distinctes**, toutes deux **éditables** inline.
5. **Afficher / cacher les colonnes** au choix, persisté.
6. **Commentaire** tronqué (1 ligne) + **pop-up plein texte éditable** au clic.
7. **Filtre par page début / page fin / les deux**.
8. **Lisibilité** : agrandir, échelle typographique plus lisible (actuellement un peu petit).
9. **Nouvelle UI** : outil moderne, **menu latéral gauche**, identité DCKAY conservée.

### Indispensables UX ajoutés
10. **Mobile : vue carte** au lieu du tableau illisible ; tableau en scroll horizontal avec 1ʳᵉ colonne figée en repli.
11. **Header de table sticky** + 1ʳᵉ colonne épinglée au scroll.
12. **Navigation clavier** dans les tables (flèches, Entrée pour éditer, Échap, Tab).
13. **Chips de filtres actifs** (visibles, retirables en un clic).
14. **Toggle de densité** (compact / confortable).
15. **Nav responsive** : sidebar → drawer/burger ou bottom-nav sur mobile.
16. **États de chargement** (skeletons) + états vides soignés.
17. **Indicateur de sauvegarde** ("enregistré") sur l'édition inline.
18. **Palette de commandes** (Cmd/Ctrl+K) : sauter à un magazine / article / onglet.
19. **Accessibilité** : focus visibles, contraste AA, labels ARIA.

---

## 6. Tâches ordonnées par agent

### 🟫 Orchestrateur (Opus 4.8)
1. Créer la branche `v2` depuis `main`. Copier `data/sommaire.db` → `data/dev.db`.
2. Configurer le lancement local : `DB_PATH=./data/dev.db PORT=3838`.
3. Créer un worktree git par agent depuis `v2`.
4. Distribuer les briefs, suivre les dépendances de phase, merger les branches dans `v2`.
5. Faire tourner la gate QA avant de marquer une feature "Done".
6. Ne **jamais** toucher `main`. Préparer la bascule prod uniquement sur validation Dany.

### 🟦 Backend (Sonnet 4.6)
1. `GET /api/cdf` : renvoyer aussi `id` et `article_source` par case (pour lien + deep-link).
2. Endpoint / params filtre articles par `page_debut` / `page_fin` / plage.
3. Garantir `numero` exploitable comme colonne éditable séparée (valeur défaut, `PATCH` OK).
4. Étendre le `state` JSON de `views` : largeurs colonnes, colonnes visibles, ordre (documenter le format).
5. Vérifier `commentaires` (TEXT long) en lecture/écriture pour la modale.
6. Non-régression API (avec QA). Auth / rate-limiter inchangés.

### 🟪 UX/UI Lead (Opus fondations → Sonnet exécution)
1. **(Opus)** Concevoir la **nouvelle UI** : sidebar gauche collapsible (icônes + labels), top bar contextuelle (titre + recherche + actions), zone contenu. Maquette/spec des écrans clés. Identité DCKAY conservée.
2. **(Opus)** `tokens.css` : échelle typo lisible (corrige le "trop petit"), palette encre/papier/cuivre, espacements, rayons, ombres, hauteurs de ligne, contrastes AA.
3. **(Opus)** Stratégie responsive : breakpoints, sidebar → drawer/bottom-nav, table → vue carte, densité.
4. **(Sonnet)** Implémenter les composants : boutons, badges (statut/rédacteur), inputs, modales fluides (les modales actuelles sont en largeur px fixe).
5. **(Sonnet)** Vue carte mobile (Articles + Magazines), skeletons, états vides, indicateur "enregistré", focus a11y.

### 🟩 Frontend Shell (Sonnet 4.6)
1. Découper `app.js` en modules ES : `state`, `api`, `views`, `articles`, `issues`, `dashboard`, `calendar`, `billing`, `cdf`, `settings`, `helpers`, `ui-shell`.
2. Découper `style.css` : `tokens`, `layout`, `components`, `tables`, `responsive`.
3. Construire le **nouveau shell** (sidebar + top bar + routing modules) selon la spec UX Lead.
4. Système générique de **persistance colonnes** (largeur/visibilité/ordre) branché sur `views`, réutilisable Articles + Magazines.
5. Header table sticky + 1ʳᵉ colonne épinglée (mécanique commune).
6. Nav responsive (burger/drawer mobile) + palette de commandes (Cmd/Ctrl+K).

### 🟧 Frontend Features A — Tables (Sonnet 4.6)
1. Colonne **Numéro** éditable, séparée de **Magazine** (les deux inline).
2. **Resize colonnes** (drag bordure) + save via système Shell.
3. **Show/hide colonnes** (menu de sélection, persisté).
4. **Filtres pages** (début / fin / plage) dans la barre Articles.
5. **Modale commentaire** : cellule tronquée 1 ligne → pop-up plein texte éditable + save.
6. **Chips de filtres actifs** + toggle densité.
7. Appliquer la même grille colonnes à la table **Magazines**.

### 🟥 Frontend Features B — Vues spéciales (Sonnet 4.6)
1. **CDF** : dans chaque case, afficher le **lien source visible et cliquable** (ouvre la source, ne déclenche pas la navigation).
2. **CDF** : clic sur la case (hors lien) → bascule onglet **Articles filtré sur ce seul article** (via filtre pages/id).
3. Adapter **Dashboard (Kanban)**, **Calendrier**, **Facturation** au nouveau shell.
4. Vérifier drag & drop Kanban (ajouter si absent), responsive de ces vues.

### ⬛ Test & QA (Sonnet 4.6 + Haiku 4.5)
1. **(Sonnet)** Installer Playwright, 2 projets : mobile (390px) + desktop (1440px).
2. **(Sonnet)** e2e critiques : login, CRUD article, édition inline, filtres pages, resize+persistance colonnes, show/hide, modale commentaire, CDF lien source, deep-link CDF→article, vue carte mobile, sidebar responsive.
3. **(Haiku)** Checklist UX/a11y à chaque livraison : lisibilité, contraste AA, clavier, scroll mobile, débordements, états vides/chargement.
4. **(Haiku)** Rapport de bugs structuré aux agents concernés.
5. **(Sonnet)** Non-régression API avec Backend.
6. Gate finale : pas de "Done" tant que mobile + desktop ne sont pas verts.

---

## 7. Definition of Done

- ✅ Fonctionne desktop **et** mobile (Playwright + visuel).
- ✅ Persistance OK (réglages colonnes survivent au refresh, sync via `views`).
- ✅ Lisibilité + contraste AA validés.
- ✅ Navigation clavier OK.
- ✅ Aucune régression sur les parcours e2e.
- ✅ Code dans le bon module (pas de retour au monolithe).
- ✅ Rien de mergé dans `main` sans validation Dany.

---

## 8. Lancement local (rappel commandes)

```bash
# depuis pilotage-editorial/, sur la branche v2
cp data/sommaire.db data/dev.db          # base de dev isolée (une seule fois)
DB_PATH=./data/dev.db PORT=3838 node server.js
# → http://localhost:3838  (la prod reste sur Railway, intouchée)
```
