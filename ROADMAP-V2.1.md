# PressPilot — Roadmap v2.1

> État au merge v2 → prod. Tout ce qui suit est **à venir** (non développé).
> v2 livre : refonte UI (sidebar encre, design system, responsive + vue carte mobile),
> les 9 demandes initiales + les 8 retours du 2e lot, CDF refait (grille alignée + Page 0 + doubles),
> modules Équipe / Reporting / Échéancier, QA Playwright.

---

## 🔜 À développer en priorité — Module Archives

Stoppé en cours d'investigation (rien de commité). À reprendre.

- [ ] **Module `Archives`** (`public/js/archives.js` + `archives.css` + nav 📦 + route dans `main.js`)
  - Liste les numéros **terminés** (statut `Bouclé`, `Déposé`, `Publié`, `Paru`), groupés par magazine ou par mois de bouclage.
  - Par numéro : magazine, N°, statut, rédacteur (couleur), date de bouclage, nb d'articles.
  - Actions par ligne : « Voir articles » (→ Articles filtré) et « CDF ».
  - KPIs en tête (nb archivés, par magazine). Read-only.
- [ ] **Alléger la table Magazines** : masquer les numéros terminés par défaut + toggle « Inclure les bouclés » (persisté localStorage). Rien n'est supprimé, c'est un filtre d'affichage. Ne pas toucher le Dashboard.

---

## ✨ Améliorations v2.1

### UX / Design
- [ ] **Skeletons de chargement** (tables, kanban, dashboard, reporting) + transitions douces.
- [ ] Passe **mobile** complémentaire (modales bottom-sheet partout, tap targets, scroll).
- [ ] Micro-copie : corriger l'accord « 1 modification **sera appliquée** » (Paramètres) et harmoniser les libellés d'action.
- [ ] **Notifications / rappels** de deadlines proches (badge sur la nav Échéancier).

### Modules & fonctionnel
- [ ] **CDF** : vue impression / export PDF du chemin de fer ; bouton « page de garde ».
- [ ] **Reporting** : filtres par période/magazine, export des chiffres (xlsx), comparaison mois N / N-1.
- [ ] **Échéancier** : vue calendrier alternative + filtre par type (rédaction / bouclage).
- [ ] **Recherche globale (Cmd+K)** : étendre aux articles et aux numéros (pas seulement la nav).
- [ ] **Réordonnancement des colonnes** (drag) en plus du resize/show-hide (déjà en place).

### Technique / QA
- [ ] **Flag `DISABLE_RATE_LIMIT`** lu par `server.js` et activé par le `webServer` Playwright → suite e2e 100 % reproductible (le rate-limiter sature la suite sinon).
- [ ] Étendre la suite Playwright aux nouveaux modules (Équipe, Reporting, Échéancier, Archives).
- [ ] Audit **accessibilité AA** complet (focus, contrastes, ARIA) sur tous les modules.
- [ ] Nettoyage : centraliser les helpers de date, dédupliquer le CSS résiduel.

---

## 🗒️ Notes de mise en prod
- La bascule ne déploie que le **code** ; les données Railway ne sont pas touchées.
- Au 1er chargement post-déploiement, le seed crée les rédacteurs/types dans la config prod (une fois).
- Base de dev locale (`data/dev.db`) gitignored — ne part jamais en prod.
