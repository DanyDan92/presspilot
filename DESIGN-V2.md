# DESIGN-V2.md — PressPilot V2

Spec UI complète pour l'agent **Frontend Shell** et les agents **Features A/B**.
Lis aussi `public/css/tokens.css` : c'est la **seule** source des variables. N'invente
aucune valeur en dur, consomme les tokens.

> **Identité DCKAY conservée.** Encre `#1A1714` / Papier `#F5F1EA` / Cuivre `#9A5F25`.
> DM Serif Display (titres) · Instrument Sans (UI) · JetBrains Mono (données).
> **Correction V1 majeure : base typo passe de ~13px à 16px** (`--text-base`).

---

## 0. Principes directeurs

1. **Outil moderne, calme, dense quand il faut.** SaaS récent, pas de gadget.
2. **Le papier respire, l'encre structure, le cuivre guide.** Cuivre = accent unique
   (action primaire, focus, sélection). Pas de couleur décorative ailleurs.
3. **La donnée prime.** Tables lisibles, mono pour chiffres/dates/numéros.
4. **Mobile = citoyen de première classe**, pas une dégradation. Table → cartes.
5. **Tout token vit dans `tokens.css`.** Le reste (`layout.css`, `components.css`,
   `tables.css`, `responsive.css`) ne fait que les consommer.

---

## 1. Layout shell (desktop)

```
┌──────────────┬───────────────────────────────────────────────────────────┐
│  SIDEBAR     │  TOP BAR (contextuelle, sticky)            --topbar-h:60   │
│ --sidebar-w  │  ┌─ Titre page (serif)   ⌕ Recherche…   [actions ctx] ─┐   │
│   248px      ├──┴────────────────────────────────────────────────────┴───┤
│              │                                                            │
│ [PP] Press   │   ZONE CONTENU                                             │
│      Pilot   │   max-width: --content-max (1440), centrée, padding        │
│              │   --space-5/--space-6                                       │
│ ▣ Articles   │                                                            │
│ ▤ Magazines  │   ┌── Barre d'outils module (filtres, chips, densité) ──┐ │
│ ▥ Conducteur │   │  [filtres ▾] [chips actifs ✕]      [densité] [vues] │ │
│ ▦ Dashboard  │   └──────────────────────────────────────────────────────┘ │
│ ▧ Calendrier │                                                            │
│ ▨ Facturation│   ┌── Contenu (table / kanban / grille calendrier) ─────┐ │
│              │   │                                                      │ │
│ ───────────  │   └──────────────────────────────────────────────────────┘ │
│ ⚙ Réglages   │                                                            │
│ « replier    │                                                            │
└──────────────┴───────────────────────────────────────────────────────────┘
```

### Sidebar (gauche, collapsible)
- Fond **encre** `--ink`, texte `--text-on-ink`. Largeur `--sidebar-w` ↔
  `--sidebar-w-collapsed` (64px) via bouton « replier » en bas.
- En haut : logo `PP` (carré cuivre) + wordmark « PressPilot » (serif) + sous-titre
  `DCKAY AGENCY` en mono/caps `--text-xs` cuivre. En replié : logo seul.
- **Items de nav** : icône (24px) + label `--text-sm` 600. Ordre :
  **Articles, Magazines, Conducteur (CDF), Dashboard, Calendrier, Facturation**,
  puis séparateur, **Réglages** ancré en bas.
- État actif : barre cuivre 3px à gauche + fond `rgba(255,255,255,.08)` + texte
  pleine opacité. Inactif : texte `--text-on-ink` à 70%, hover → 100% + fond léger.
- Replié : labels masqués, **tooltip** au survol (titre natif + `aria-label`).
- Transition largeur `--transition-slow`. État persisté (localStorage `pp.sidebar`).

### Top bar (contextuelle, sticky)
- Hauteur `--topbar-h`, fond `--surface`, bordure basse `--border`, `--shadow-sm`.
- Gauche : **titre de la page courante** en serif `--text-xl`.
- Centre/droite : **recherche** (input `--control-h`, icône loupe, placeholder
  « Rechercher… »), puis **actions contextuelles** du module (ex. `+ Article`,
  `+ Numéro`, « Exporter »). Bouton primaire cuivre à droite.
- À droite extrême : indicateur **« Enregistré »** (voir §6) + menu compte/déconnexion.
- Sur mobile la top bar accueille le **burger** à gauche (voir §4).

### Zone contenu
- `max-width: --content-max`, centrée (`margin-inline:auto`), padding
  `--space-5` (mobile) → `--space-6` (desktop).
- Fond `--bg` (papier). Cartes/tables en `--surface`.

---

## 2. Navigation & routing (pour Shell)

- 7 routes ⇒ hash routing : `#/articles` (défaut), `#/magazines`, `#/cdf`,
  `#/dashboard`, `#/calendrier`, `#/facturation`, `#/reglages`.
- **Deep-link CDF → Articles** (backlog §2) : `#/articles?article=<id>` ou
  `?pages=<deb>-<fin>` ⇒ ouvre Articles avec le filtre pré-appliqué + chip actif.
- Le module actif met à jour : item sidebar actif, titre top bar, actions
  contextuelles, document.title.

---

## 3. Système typographique (résolu)

| Usage                        | Token         | Police        | Exemple              |
|------------------------------|---------------|---------------|----------------------|
| Titre de page                | `--text-xl`   | serif         | « Articles »         |
| KPI / chiffre hero           | `--text-3xl`  | serif         | « 367 »              |
| Sous-titre / gros label      | `--text-lg`   | sans 600      | « Magazines & N° »   |
| **Corps / cellule / input**  | `--text-base` | sans 400      | texte courant 16px   |
| Texte secondaire / dense     | `--text-sm`   | sans 400      | meta lignes          |
| Légende / méta / caps        | `--text-xs`   | sans/mono 600 | « DEADLINE »         |
| Données : N°, pages, dates, € | `--text-sm`  | **mono**      | `N°59` `p.12–14`     |

Règle : **jamais sous `--text-sm` (14px)** pour du texte lisible. `--text-xs` réservé
aux labels caps/meta. Interlignes : titres `--leading-tight`, UI `--leading-normal`,
blocs de lecture `--leading-relaxed`.

---

## 4. Responsive

### Breakpoints (à déclarer dans `responsive.css`)
| Nom      | Largeur        | Comportement clé                                        |
|----------|----------------|---------------------------------------------------------|
| Mobile   | `< 640px`      | Sidebar → drawer + **bottom-nav** ; tables → **cartes** |
| Tablette | `640–1023px`   | Sidebar repliée par défaut (icônes) ; tables scroll-x   |
| Desktop  | `>= 1024px`    | Sidebar déployée ; layout complet                       |
| Large    | `>= 1440px`    | Contenu plafonné à `--content-max`                      |

### Sidebar mobile → drawer + bottom-nav
- **Bottom-nav** fixe en bas (`--surface`, bordure haute, `--shadow-lg` inversée) :
  5 icônes max (Articles, Magazines, CDF, Dashboard, Calendrier). Item actif = cuivre.
- **Burger** dans la top bar → ouvre un **drawer** plein-hauteur depuis la gauche
  (overlay `--overlay`) avec la nav complète + Facturation + Réglages.
- Pas de hover-tooltip sur mobile (pointeur tactile).

### Table → vue carte (mobile)
Sous 640px, les tables Articles/Magazines deviennent une **liste de cartes** :

```
┌──────────────────────────────────────┐
│ Titre de l'article (sans 600)        │
│ ┌─────────┐                          │
│ │ ●In prog │  N°59 · p.12–14 (mono)  │  ← badge statut + méta mono
│ └─────────┘                          │
│ Rubrique · Mode          [D] (rédac) │  ← chip rédacteur à droite
│ « début du résumé tronqué… »         │
└──────────────────────────────────────┘   tap = ouvre la fiche/édition
```
- Carte = `--surface`, `--radius`, `--shadow-sm`, padding `--space-4`, gap `--space-3`.
- Desktop garde la table dense avec **header sticky** + **1ʳᵉ colonne épinglée**
  en scroll horizontal (mécanique Shell).

### Toggle densité (compact / confortable)
- Switch dans la barre d'outils module **et** Réglages. Écrit
  `data-density="compact"` sur `<html>` (persisté `pp.density`).
- `tokens.css` surcharge `--row-py`, `--control-h`, `--cell-fs` (déjà câblé).
  Les composants n'ont qu'à consommer ces variables.

---

## 5. Composants

Tous les composants consomment les tokens. Spécifications de référence ci-dessous.

### Boutons
| Variante     | Fond            | Texte             | Bordure        | Usage                    |
|--------------|-----------------|-------------------|----------------|--------------------------|
| **Primaire** | `--copper`      | `--text-on-copper`| —              | action principale        |
| **Secondaire**| `--surface`    | `--text`          | `--border`     | action secondaire        |
| **Ghost**    | transparent     | `--text-muted`    | — (hover fond `--paper-2`) | tertiaire / icône |
| **Danger**   | `--danger-soft` | `--danger`        | —              | suppression              |

- Hauteur `--control-h`, padding inline `--space-4`, `--radius`, `--text-sm` 600.
- Primaire hover → `--copper-deep`. Tous : `:focus-visible` = `--focus-ring`.
- Bouton-icône carré (`--control-h`), `--radius`, ghost par défaut.

### Badges statut (mappés sur sémantiques)
Pill `--radius-full`/`--radius-sm`, `--text-xs` 600, padding `2px 8px`, point coloré
optionnel à gauche. Mapping **fond = `*-soft`, texte = couleur pleine** :

| Statut métier                         | Sémantique | Fond            | Texte         |
|---------------------------------------|------------|-----------------|---------------|
| Done · Done but not sure              | success    | `--success-soft`| `--success`   |
| In progress · Fact-check              | info       | `--info-soft`   | `--info`      |
| ReWork · Sujet à revoir · Trop court · Stand by | warning | `--warning-soft`| `--warning` |
| Problème                              | danger     | `--danger-soft` | `--danger`    |
| À faire · Not started                 | neutre     | `--paper-2`     | `--text-muted`|

### Badges rédacteur (Dany / Coralie / Lena)
Chip `--radius-full`, `--text-xs` 600, fond `*-soft` + texte couleur :
- **Dany** → `--redac-dany-soft` / `--redac-dany`
- **Coralie** → `--redac-coralie-soft` / `--redac-coralie`
- **Lena** → `--redac-lena-soft` / `--redac-lena`
Variante compacte = pastille initiale (`[D]`/`[C]`/`[L]`) avec `aria-label` complet.

### Inputs / selects / textarea
- Fond `--surface`, bordure `--border`, `--radius`, hauteur `--control-h`,
  `--text-base`, padding inline `--space-3`.
- `:focus` → bordure `--copper` + `--focus-ring`. Placeholder `--text-muted`.
- Label `--text-xs` 600 caps `--text-muted` au-dessus. États `:invalid` → `--danger`.
- **Édition inline en table** : cellule éditable transparente, hover `--paper-2`,
  focus anneau cuivre, déclenche l'indicateur « Enregistré » (§6).

### Modales fluides (fini le px fixe)
> V1 défaut : modales en largeur px fixe (`width:480px`…). V2 : **fluides + responsive.**
- Overlay `--overlay`, z `--z-modal`. Panneau `--surface`, `--radius-lg`, `--shadow-lg`,
  padding `--space-6`.
- **Largeur fluide** : `width: min(92vw, <max>)` où `<max>` ∈ { 420, 560, 720, 960 }
  selon le contenu (jamais de px fixe nu). Hauteur `max-height: 90vh`, corps scrollable,
  header + footer (actions) collants.
- **Mobile (< 640px) : bottom-sheet** — collé en bas, `width:100%`,
  `border-radius: --radius-lg --radius-lg 0 0`, animation slide-up `--transition-slow`,
  poignée de drag visuelle, fermeture par swipe-down/overlay/✕.
- Focus-trap, `Esc` ferme, retour focus au déclencheur. `role="dialog"`/`aria-modal`.

### Chips de filtres actifs
- Pill `--radius-full`, fond `--copper-soft`, texte `--text`, bordure `--copper` 1px,
  `--text-xs`. Format : `Magazine: Voici  ✕`. Le `✕` retire le filtre (focusable).
- Affichées dans la barre d'outils sous les selects. Bouton « Tout effacer » si ≥ 2.

### Skeletons (chargement)
- Blocs `--paper-2` `--radius-sm` avec shimmer (gradient animé `--transition-slow` boucle).
- Table : 6–8 lignes de barres grises. Cartes mobiles : carte fantôme.
- Kanban/calendrier : colonnes/cellules grisées. Jamais d'écran blanc nu.

### États vides
- Centré : petite icône/illustration monochrome encre, titre serif `--text-lg`,
  phrase `--text-sm` `--text-muted`, + **CTA primaire** quand une action est possible.
- Exemples : Articles « Aucun article. Sélectionne un magazine ou ajoute-en un. »
  + `+ Article`. Calendrier vide, Facturation vide, recherche sans résultat.

### Indicateur « Enregistré »
- Micro-état d'autosave sur l'édition inline. Cycle :
  `Enregistrement…` (point cuivre pulsé) → `Enregistré ✓` (point `--success`, fondu
  après ~1,5 s) → en cas d'échec `Échec ✗` (`--danger`) + retry.
- Emplacement : à droite de la top bar (global) et/ou inline près de la cellule.
  S'appuie sur le toast existant si pertinent. `aria-live="polite"`.

### Toast / Undo (conserver l'existant)
- Bas-centre, `--surface`, `--shadow-lg`, `--radius`, avec « ↩ Annuler ». z `--z-toast`.

---

## 6. Accessibilité (AA)

- **Focus visible partout** : `:focus-visible { box-shadow: --focus-ring }`. Ne jamais
  faire `outline:none` sans remplaçant.
- **Contraste** : tous les couples texte/fond des tokens sémantiques et de base sont
  ≥ AA (texte courant `--text` sur `--surface`/`--paper`, badges *-soft/couleur pleine).
- **ARIA** : nav `role="navigation"` + `aria-current="page"` sur l'item actif ;
  modales `role="dialog"` `aria-modal="true"` + focus-trap ; toasts/indicateur
  `aria-live` ; icônes seules → `aria-label` ; tables = `<table>` sémantique avec
  `<th scope>`, tri annoncé `aria-sort`.
- **Clavier** : tab order logique, `Esc` ferme modale/drawer, navigation flèches dans
  les tables (backlog §12), cibles tactiles ≥ 44px sur mobile.
- **Reduced motion** : `@media (prefers-reduced-motion: reduce)` neutralise shimmer,
  slide-up, transitions de largeur.

---

## 7. Maquettes ASCII — écrans clés

### 7.1 Articles — desktop
```
┌─Sidebar─┬─────────────────────────────────────────────────────────────────┐
│ ▣Article│ Articles            ⌕ Rechercher…        [vues ▾] [+ Article]    │ topbar
│ ▤Magazi │─────────────────────────────────────────────────────────────────│
│ ▥CDF    │ [Magazine ▾][N° ▾][Statut ▾][Rédac ▾][Pages: ▭–▭]  ⊞compact  ⊟ │ outils
│ ▦Dashbo │ Filtres: ⟨Magazine: Voici ✕⟩ ⟨Statut: In progress ✕⟩  Effacer  │ chips
│ ▧Calend │┌──────────────────────────────────────────────────────────────┐ │
│ ▨Factur │║Mag │N° │Pg │Titre / sujet      │Type │Statut    │Réd│Comm…  │ │ ← header sticky
│         │╟────┼───┼───┼───────────────────┼─────┼──────────┼───┼───────╢ │   col 1 figée
│ ⚙Réglag │║Voici│59│12 │Tendances été 2026 │Mode │●In prog  │[D]│ texte…│ │
│ «replier│║Voici│59│14 │Interview créatrice│Itw  │●Done     │[C]│ texte…│ │
│         │└──────────────────────────────────────────────────────────────┘ │
└─────────┴─────────────────────────────────────────────────────────────────┘
```

### 7.2 Articles — mobile (cartes + bottom-nav)
```
┌───────────────────────────┐
│ ☰  Articles          ⌕  + │ topbar (burger)
├───────────────────────────┤
│ [Magazine ▾] [Statut ▾]   │ filtres scroll-x
│ ⟨Voici ✕⟩ ⟨In progress ✕⟩ │ chips
│ ┌───────────────────────┐ │
│ │ Tendances été 2026    │ │
│ │ ●In progress          │ │
│ │ N°59 · p.12–14   [D]  │ │
│ │ Mode · « résumé… »    │ │
│ └───────────────────────┘ │
│ ┌───────────────────────┐ │
│ │ Interview créatrice   │ │
│ │ ●Done   N°59·p.14 [C] │ │
│ └───────────────────────┘ │
├───────────────────────────┤
│ ▣  ▤   ▥   ▦   ▧          │ bottom-nav
└───────────────────────────┘
```

### 7.3 Conducteur (CDF) — case
```
┌──────────────┐
│ p.12–14      │  ← pages (mono)
│ Tendances…   │  ← titre tronqué
│ ●In progress │  ← badge statut
│ 🔗 source    │  ← lien CLIQUABLE (ouvre la source, n'active pas le deep-link)
└──────────────┘
   ↑ clic ailleurs sur la case = deep-link → #/articles?article=<id>
```

### 7.4 Dashboard (Kanban) — desktop
```
 Dashboard      KPIs: [367 articles][12 en cours][5 done]      [vues ▾]
 [⌕][Mois ▾][Rédac ▾][Statut ▾]
 ┌──────────┐┌──────────┐┌──────────┐┌──────────┐
 │ À venir  ││ En cours ││ Fact-chk ││ Done     │  colonnes
 │ ──────── ││ ──────── ││ ──────── ││ ──────── │
 │ ▢ carte  ││ ▢ carte  ││ ▢ carte  ││ ▢ carte  │  drag & drop
 │ ▢ carte  ││ ▢ carte  ││          ││ ▢ carte  │
 └──────────┘└──────────┘└──────────┘└──────────┘
 (mobile : colonnes en scroll-x, snap, 1 colonne ~85vw)
```

### 7.5 Modale (desktop fluide) vs bottom-sheet (mobile)
```
 DESKTOP  width:min(92vw,560px)        MOBILE  bottom-sheet
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ Titre modale          ✕   │         │            (zone haute    │
 │───────────────────────────│         │             = overlay)    │
 │ corps scrollable…         │         ├───────────────────────────┤
 │                           │         │      ▁▁▁ (poignée)        │
 │───────────────────────────│         │ Titre modale          ✕   │
 │        [Annuler][Valider] │         │ corps…                    │
 └───────────────────────────┘         │ [Annuler]    [Valider]    │
                                        └───────────────────────────┘ slide-up
```

---

## 8. Contrat de tokens (rappel pour Shell)

`public/css/tokens.css` définit **toutes** les variables. Le Shell les importe **en
premier** (avant layout/components/tables/responsive). Groupes : base, texte,
sémantiques, rédacteurs (extra), polices, typo (base 16px), interlignes, espacements,
rayons, ombres, layout, extras (transitions, densité, focus-ring, z-index).
Densité compacte = `[data-density="compact"]` (surcharge déjà câblée dans tokens.css).
**Aucune valeur de couleur/taille en dur ailleurs.**
