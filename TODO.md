# introuvable.elwen.dev — « fichier introuvable »

Jeu 3D easter egg servant de page 404 au portfolio [elwen.dev](https://elwen.dev).
Le visiteur qui tape une URL inexistante voit une boîte de dialogue macOS
(*« La page est introuvable. Voulez-vous la rechercher ? »*) puis est plongé
**dans** le disque dur pour retrouver lui-même le fichier perdu.

- **Repo** : `introuvable` (celui-ci) — app standalone, vanilla JS + Vite
- **Sous-domaine** : `introuvable.elwen.dev` (wildcard `*.elwen.dev` déjà en place sur Vercel)
- **Base technique** : skill **GameBlocks** (`~/.claude/skills/gameblocks`) — Three.js 0.161 + Rapier3D 0.14 (compat), modules copiés dans le repo
- **Pas dans le registre d'apps du portfolio** (`src/lib/apps.ts`) : le jeu n'est accessible **que** via la 404 — c'est le principe de l'easter egg

## Règles GameBlocks (à respecter sur tout le projet)

- [ ] Charger le skill `gameblocks` avant chaque phase de code jeu
- [ ] `modules/math/WorldBasis.js` = source de vérité unique pour les axes, le forward/right/up, le mouvement planaire et les headings — ne jamais bricoler des conversions d'axes à côté
- [ ] Copier chaque module choisi depuis le skill **en préservant sa structure de dossiers** (`src/modules/actor-motion/...`, `src/modules/camera/...`) pour que les imports relatifs continuent de fonctionner
- [ ] Module qui couvre le besoin → réutiliser **tel quel** ; besoin partiel → **adapter** l'existant, jamais réécrire de zéro
- [ ] Tenir `gameblocks_usage.md` à jour : module, rôle, réutilisé/adapté, changements clés, intégration

---

## Phase 0 — Setup du projet

- [ ] `npm create vite@latest . -- --template vanilla` (JS, pas TS — les modules GameBlocks sont en JS pur)
- [ ] Dépendances : `three@0.161.0`, `@dimforge/rapier3d-compat@0.14.0` (versions épinglées = celles attendues par les modules)
- [ ] Structure :
  - `src/main.js` — bootstrap (renderer, boucle, resize)
  - `src/game/` — code spécifique au jeu (monde, gameplay, UI)
  - `src/modules/` — modules GameBlocks copiés (structure du skill préservée)
  - `public/` — textures (wallpaper), sons, favicon
- [ ] Copier la base commune depuis le skill : `math/WorldBasis.js`, `math/Vector3Utils.js`, `math/ScalarUtils.js`, `math/TimeUtils.js`, `math/RandomUtils.js`, `world/Object3DUtils.js`
- [ ] Créer `gameblocks_usage.md` avec ce premier lot
- [ ] Boucle de rendu minimale : scène Three.js, lumière, sol plat, `requestAnimationFrame` avec delta time via `TimeUtils`
- [ ] Init Rapier (`await RAPIER.init()`) avant le premier frame
- [ ] `.gitignore`, repo git, premier commit

## Phase 1 — Le monde : bureau géant

Un plateau plat façon bureau macOS vu de l'intérieur, clos par des murs invisibles.

- [ ] Copier `world/environment/ArenaEnvironment.js` + `world/environment/PlanarUtils.js` + `world/environment/WorldBoundsColliderFactory.js` + `world/environment/SpawnAreaSampler.js`
- [ ] **Adapter** `ArenaEnvironment` → `src/game/DesktopEnvironment.js` :
  - sol = plan texturé avec le **wallpaper du portfolio** (continuité visuelle avec elwen.dev)
  - obstacles = **dossiers macOS géants** (meshes bleus low-poly, forme dossier : boîte + languette) posés en grille lâche, avec colliders Rapier
  - murs de bord de monde invisibles (`WorldBoundsColliderFactory`)
- [ ] Landmark : la **Corbeille** au fond du monde (cylindre maillé gris translucide, plus grand que tout le reste) — zone d'entrée marquée au sol
- [ ] Éclairage « Apple » : ambiante douce + directionnelle propre, ombres légères, fog discret vers les bords
- [ ] Spawn du joueur via `SpawnAreaSampler` (zone centrale, jamais dans un dossier)
- [ ] Documenter l'adaptation dans `gameblocks_usage.md`

## Phase 2 — Personnage & caméra : le curseur

Le joueur incarne le **pointeur macOS** (flèche noire liseré blanc, extrudée en 3D).
Contrôle principal **click-to-move** — on déplace le curseur en cliquant, comme sur un vrai Mac. Tap sur mobile = même geste.

- [ ] Copier `actor-motion/KinematicBatchResolver.js`, `actor-motion/character/BaseCharacterMotionController.js`, `actor-motion/character/WorldTargetCharacterMotionController.js`, `actor-motion/GeneralObjectModelController.js`
- [ ] Copier `camera/BaseCameraRig.js` + `camera/PositionFollowCameraRig.js` (pairing recommandé avec WorldTarget)
- [ ] Copier `gameplay/AimResolver.js` (raycast écran → point au sol pour le click-to-move)
- [ ] Copier `world/visual-effects/GroundClickIndicator.js` — le marqueur de clic **est** le feedback curseur, raccord parfait avec le thème
- [ ] Mesh du curseur : flèche macOS extrudée (ShapeGeometry + Extrude), légère inclinaison, ombre portée
- [ ] Câbler : clic/tap → `AimResolver` → point monde → `WorldTargetCharacterMotionController` → `KinematicBatchResolver` (collisions dossiers/murs) → `GeneralObjectModelController` (orientation du mesh vers la direction de déplacement)
- [ ] Caméra : `PositionFollowCameraRig` en vue isométrique haute (offset fixe, smoothing de base)
- [ ] Fallback clavier : flèches/WASD via `WorldCardinalCharacterMotionController` (copier aussi) — les deux intents fusionnés, le clavier prend la priorité et annule la cible de clic
- [ ] Vérifier : pas de traversée de dossier, pas de sortie de monde, arrivée propre sur la cible (pas d'oscillation)
- [ ] `gameblocks_usage.md` à jour

## Phase 3 — Gameplay : collecter les fragments du fichier

Le fichier perdu est éclaté en **fragments** dispersés sur le bureau. Le dernier est dans la Corbeille (Phase 4).

- [ ] Copier `world/object/PickupObject.js` + `world/object/factory/PickupVisualFactory.js`
- [ ] **Adapter** la factory → visuel « fragment de fichier » : bout de page blanche déchirée (plane plié + emissive douce), rotation/flottement gérés par `PickupObject`
- [ ] Placement : N−1 fragments sur le bureau via `SpawnAreaSampler` (zones éloignées du spawn, jamais dans un obstacle), le N-ième réservé à la Corbeille
- [ ] Copier `user-interface/UiStateModel.js`, `user-interface/DomHudRenderer.js`, `user-interface/NotificationQueue.js`
- [ ] HUD en DOM stylé macOS :
  - **barre de chemin Finder** en haut : `Macintosh HD ▸ Users ▸ elwen ▸ …` — chaque fragment ramassé révèle un segment du chemin
  - compteur `3/7 fragments` façon badge
  - notifications toast style macOS (coin haut droit) à chaque ramassage : *« Fragment récupéré »*
- [ ] Le **slug réel** tapé par le visiteur (reçu en query param, voir Phase 7) = nom du fichier à reconstituer, affiché en bout de chemin (`…/portfolio-secret.html`)
- [ ] Son de ramassage (petit « pop » macOS, fichiers libres ou synthétisés — pas d'assets Apple protégés)
- [ ] `gameblocks_usage.md` à jour

## Phase 4 — La Corbeille : le donjon

Le dernier fragment est dans la Corbeille, gardée par des **process errants** (icônes d'apps génériques qui patrouillent).

- [ ] Copier `behavior/AgentPathNavigator.js`, `behavior/WaypointProgressTracker.js`, `behavior/NearbyAvoidanceSteering.js`
- [ ] 3-4 gardiens : mesh « icône d'app générique » (squircle extrudé, couleur unie), patrouille en boucle sur des waypoints autour et dans la Corbeille, évitement mutuel via `NearbyAvoidanceSteering`
- [ ] Détection de contact gardien/joueur (distance planaire via `PlanarUtils`) :
  - le joueur est **renvoyé au spawn** avec un effet « Force Quit » (flash + son d'alerte macOS-like)
  - pas de perte de fragments (c'est une 404, on reste gentil) — juste le trajet à refaire
- [ ] Intérieur de la Corbeille : couloir en spirale descendante (colliders), ambiance plus sombre, le fragment final au centre qui brille
- [ ] Difficulté calibrée : échouable une fois ou deux, jamais frustrant — fenêtres de passage larges entre les patrouilles
- [ ] `gameblocks_usage.md` à jour

## Phase 5 — Fin de partie : restauration

- [ ] Dernier fragment ramassé → cinématique courte scriptée :
  - les fragments s'assemblent en une **icône de fichier** au-dessus du curseur
  - son « restaurer depuis la Corbeille »
  - une **fenêtre Finder** (DOM, pas 3D) s'ouvre par-dessus le canvas : le fichier apparaît dedans, sélectionné
- [ ] Bouton unique dans la fenêtre : **« Ouvrir »** → redirection `window.top.location = 'https://elwen.dev'` (top-level car on peut être en iframe)
- [ ] Copier `user-interface/StorageSettingsStore.js` — persister en localStorage : nombre de fichiers restaurés, meilleur temps
- [ ] Petit compteur discret à l'écran titre : *« 3 fichiers restaurés »* (rejouabilité easter egg)
- [ ] Écran d'accueil du jeu (avant le premier clic) : le message 404 diégétique + *« Cliquez pour rechercher le fichier »* — sert aussi de gate pour l'autoplay audio

## Phase 6 — Direction artistique & polish macOS

- [ ] Palette système macOS : bleu dossier `#3B82F6`-ish (vérifier sur capture réelle, cf. règle du portfolio : fidélité avant invention), gris Corbeille, blancs cassés
- [ ] HUD/DOM : `-apple-system, BlinkMacSystemFont, 'Inter'`, vibrancy (`backdrop-filter` + préfixe `-webkit-`), coins arrondis continus
- [ ] Ombres de contact douces sous curseur, dossiers, gardiens
- [ ] Idle animations : fragments qui flottent, gardiens qui « respirent », dossiers strictement statiques (ce sont des bâtiments)
- [ ] Perf : geometries/materials partagés, pas d'allocation dans la boucle de frame, `Object3DUtils` pour disposer proprement ce qui disparaît
- [ ] Cible 60 fps sur laptop moyen ; tester la conso GPU en continu (c'est une page 404, elle peut rester ouverte en fond)

## Phase 7 — Contrat d'intégration (query params) & mobile

Le jeu doit être **autonome** mais accepter le contexte passé par le portfolio.

- [ ] Query params d'entrée :
  - `?path=/le/slug/tape` → nom du fichier perdu affiché dans le HUD (sanitizer : longueur max, caractères sûrs, fallback `page.html`)
  - `?theme=dark|light` (optionnel) → accorder l'éclairage/HUD au thème du portfolio
- [ ] Mobile/tablette (mode iOS du portfolio) :
  - tap = click-to-move (déjà natif avec `AimResolver`, vérifier les événements pointer)
  - HUD redimensionné, safe areas (`env(safe-area-inset-*)`), `100dvh`
  - caméra légèrement plus haute pour compenser le champ réduit
- [ ] Tester au doigt sur vrai téléphone, pas seulement au devtools

## Phase 8 — Déploiement Vercel + conformité embed

- [ ] Projet Vercel, domaine `introuvable.elwen.dev`
- [ ] `vercel.json` : headers `Content-Security-Policy: frame-ancestors 'self' https://elwen.dev https://*.elwen.dev` (pas de `X-Frame-Options: DENY` !)
- [ ] Lancer le skill **`portfolio-embed-check`** dans ce repo : headers, responsive en fenêtre redimensionnable, liens `target="_blank"` interdits sauf volontaires, aucun cookie requis
- [ ] SEO minimal mais propre (title, description, favicon fichier-fantôme) — et `noindex` **volontaire** ? Non : laisser indexable, un easter egg trouvable sur Google par « elwen introuvable » c'est un bonus. Juste ne pas le lier depuis le portfolio.
- [ ] Vérifier le poids : Three + Rapier ≈ lourd → précharger seulement après interaction sur la 404 (voir Phase 9), compression brotli par défaut Vercel OK

## Phase 9 — Intégration 404 dans le portfolio (repo `portfolio`)

⚠️ Travail dans l'autre repo — charger les skills `os-macos-ui` (dialogue) et respecter CLAUDE.md du portfolio.

- [ ] `src/app/not-found.tsx` : bureau macOS normal (ou fond neutre du wallpaper) + **boîte de dialogue macOS** centrée, fidèle au vrai système :
  - icône Finder attristée / document blanc corné
  - titre : *« La page « {pathname} » est introuvable. »*
  - texte : *« Elle a peut-être été déplacée ou supprimée. »*
  - boutons : **« Retour au bureau »** (→ `/`) et **« Rechercher… »** (défaut, bleu)
- [ ] « Rechercher… » → le jeu, **plein écran** sur la 404 (iframe `https://introuvable.elwen.dev?path={pathname}` qui recouvre tout, pas une fenêtre du window manager — on n'est pas « dans » l'OS, on est tombé en dehors)
- [ ] Mode iOS (mobile) : même dialogue en style alerte iOS (`os-ios-ui` si besoin), iframe plein écran au tap
- [ ] `<link rel="preconnect">` vers `introuvable.elwen.dev` dès l'affichage de la 404 (le jeu charge vite si l'utilisateur clique)
- [ ] **Aucune** entrée dans `src/lib/apps.ts`, aucun lien dans le dock/Finder — la 404 est la seule porte
- [ ] Metadata de la 404 : status 404 réel (Next `not-found.tsx` le gère), `noindex` sur la page d'erreur elle-même
- [ ] Tester : URL bidon sur desktop, mobile, et navigation directe vs client-side (`notFound()` déclenché depuis une route dynamique)
- [ ] PR `feat/404-introuvable` vers `main` (conventions du repo : commits conventionnels, pas de Co-Authored-By)

## Phase 10 — Recette finale

- [ ] Parcours complet desktop : URL bidon → dialogue → jeu → collecte → Corbeille → restauration → retour elwen.dev
- [ ] Même parcours sur iPhone (Safari) et iPad
- [ ] Safari desktop : `backdrop-filter` préfixé, WebGL OK, sons après interaction
- [ ] Slug exotique en query param (unicode, très long, tentative d'injection) → sanitizé proprement
- [ ] Lighthouse/perf de la 404 du portfolio : le jeu ne doit rien coûter tant qu'on n'a pas cliqué « Rechercher… »
- [ ] Relire `gameblocks_usage.md` : chaque module copié y est documenté (réutilisé/adapté + changements)
- [ ] `check-security` léger côté portfolio si la 404 touche à autre chose que du statique

---

## Récap modules GameBlocks utilisés

| Module | Usage | Statut prévu |
| --- | --- | --- |
| `math/WorldBasis`, `Vector3Utils`, `ScalarUtils`, `TimeUtils`, `RandomUtils` | base coordonnées/temps/random | tel quel |
| `world/Object3DUtils` | cleanup ressources | tel quel |
| `world/environment/ArenaEnvironment` | → `DesktopEnvironment` (bureau + dossiers) | **adapté** |
| `world/environment/PlanarUtils`, `WorldBoundsColliderFactory`, `SpawnAreaSampler` | géométrie planaire, murs, spawns | tel quel |
| `actor-motion/KinematicBatchResolver` | collisions personnage | tel quel |
| `actor-motion/character/BaseCharacterMotionController` + `WorldTargetCharacterMotionController` | click-to-move du curseur | tel quel |
| `actor-motion/character/WorldCardinalCharacterMotionController` | fallback clavier | tel quel |
| `actor-motion/GeneralObjectModelController` | orientation du mesh curseur | tel quel |
| `camera/BaseCameraRig` + `PositionFollowCameraRig` | caméra iso follow | tel quel |
| `gameplay/AimResolver` | clic écran → point au sol | tel quel |
| `world/visual-effects/GroundClickIndicator` | feedback de clic | tel quel |
| `world/object/PickupObject` + `factory/PickupVisualFactory` | fragments à collecter | **factory adaptée** |
| `behavior/AgentPathNavigator`, `WaypointProgressTracker`, `NearbyAvoidanceSteering` | patrouilles des gardiens | tel quel |
| `user-interface/UiStateModel`, `DomHudRenderer`, `NotificationQueue`, `StorageSettingsStore` | HUD, toasts, persistance | tel quel |





améliorer l'ui (éléments de décors, curseur de souris, ennemis) avec ui/ux pro max

plus de gamification lors qu'on trouve un fragement (la partie en haut à gauche n'attire pas assez l'oeil quand on gagne un fragement)