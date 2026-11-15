# Tachymètre Vélo PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une Progressive Web App (PWA) de compteur de vitesse vélo économe et épurée, déployable directement sur GitHub Pages sans étape de build, offrant un affichage plein écran contrasté, une vitesse GPS filtrée, des métriques de sortie et un maintien actif de l'écran.

**Architecture:** Application modulaire en pur JavaScript ES6 (zéro bundler, zéro dépendance npm). Les calculs mathématiques (seuillage GPS, lissage EMA, distance Haversine, moyenne basée sur le temps en mouvement) sont isolés dans des modules purs et testables de façon autonome. L'interface exploite les APIs Web modernes (`Screen Wake Lock`, `AmbientLightSensor`, `Fullscreen`, `Geolocation`, `Service Worker`).

**Tech Stack:** HTML5, CSS3 (variables, clamp, tabular-nums), JavaScript ES6 modules, Service Worker API, Web App Manifest.

**Spec:** `docs/superpowers/specs/2026-11-15-tachymetre-pwa-design.md`

## Global Constraints

- **Zéro build / Zéro dépendance :** Fichiers statiques directement exécutables par le navigateur et servis à la racine pour GitHub Pages.
- **Thème sombre absolu :** Fond `#000000` (pixels éteints sur OLED).
- **Seuil d'arrêt GPS :** Vitesse brute $< 0.8\text{ m/s}$ forcée strictement à $0\text{ km/h}$.
- **Coefficient de lissage EMA :** $\alpha = 0.4$ pour les vitesses actives.
- **Watchdog GPS :** Timeout de $4000\text{ ms}$ sans fix déclenchant l'état `SIGNAL_LOST`.
- **Moyenne cycliste :** $\text{Vitesse Moyenne} = \text{Distance (km)} / \text{Temps en mouvement (h)}$.

## Review Focus

- **GPS stationnaire bruité :** Téléphone immobile au feu rouge recevant des coordonnées oscillantes — l'affichage doit rester strictement à $0\text{ km/h}$ et la distance cumulée ne doit pas augmenter.
- **Perte brutale de signal GPS :** Entrée sous un tunnel — le watchdog à $4000\text{ ms}$ doit faire passer l'icône en statut perdu et afficher `--` sans bloquer ni planter l'application.
- **Mise en veille ou bascule d'application :** Le cycliste passe sur une autre app et revient — le Wake Lock doit être ré-acquis automatiquement via `visibilitychange`.
- **Soleil direct éblouissant :** L'écran devient illisible en gris — le double-tap ou le capteur de lumière doit basculer instantanément en mode Plein Soleil (blanc haute visibilité).
- **Redémarrage ou rechargement de page :** Perte accidentelle de la session — les métriques de trajet (distance, temps, moyenne) doivent être restaurées depuis `localStorage`.

---

### Task 1: Module de Filtrage de Vitesse & Harnais de Test Autonome

**Files:**
- Create: `js/speed-filter.js`
- Create: `tests/test-runner.js`
- Create: `tests/test.html`

**Interfaces:**
- Consumes: Rien.
- Produces: 
  - `MIN_SPEED_THRESHOLD_MPS: number` (0.8 m/s)
  - `toKmh(speedMps: number | null): number`
  - `filterSpeed(rawSpeedMps: number | null, prevFilteredKmh: number, alpha?: number): number`
  - `formatSpeed(speedKmh: number | null): string`

- [ ] **Step 1: Créer le harnais de test autonome dans `tests/test-runner.js` et `tests/test.html`**

Le harnais fournit une fonction `describe(name, fn)`, `test(name, fn)`, `assert.strictEqual(actual, expected)`, `assert.ok(value)`, `assert.closeTo(actual, expected, delta)`.
Écrire les tests unitaires pour `speed-filter.js` :
- `toKmh(10)` -> 36
- `toKmh(null)` -> 0
- `filterSpeed(0.5, 0)` -> 0 (en dessous de 0.8 m/s, seuil d'arrêt net)
- `filterSpeed(10, 0, 0.4)` -> $0.4 \times 36 + 0.6 \times 0 = 14.4$
- `filterSpeed(0.2, 20)` -> 0 (remise à zéro franche dès qu'on descend sous le seuil d'arrêt, sans traînée)
- `formatSpeed(null)` -> `"--"`
- `formatSpeed(24.2)` -> `"24"` ou `"24.2"` selon mode arrondi

- [ ] **Step 2: Vérifier que le test échoue**

Charger `tests/test.html` dans le navigateur ou exécuter `node tests/test-runner.js`.
Attendu : Échec car `js/speed-filter.js` n'existe pas encore.

- [ ] **Step 3: Implémenter `js/speed-filter.js`**

Exporter en ES6 module les fonctions :
- `MIN_SPEED_THRESHOLD_MPS = 0.8`
- `toKmh(mps)` : conversion $m/s \times 3.6$, protection si null/undefined/négatif.
- `filterSpeed(rawMps, prevKmh, alpha = 0.4)` : seuillage à $0$ si $< 0.8$, sinon EMA $v = \alpha \cdot v_{brute} + (1 - \alpha) \cdot v_{prev}$.
- `formatSpeed(kmh, decimals = 0)` : formatage numérique avec gestion du cas null/NaN -> `"--"`.

- [ ] **Step 4: Vérifier que le test passe**

Exécuter le harnais de test.
Attendu : PASS, 0 échec.

- [ ] **Step 5: Enregistrer les modifications**

Les fichiers `js/speed-filter.js`, `tests/test-runner.js` et `tests/test.html` sont prêts.

---

### Task 2: Calculateur de Métriques de Trajet (`js/trip.js`)

**Files:**
- Create: `js/trip.js`
- Modify: `tests/test-runner.js`

**Interfaces:**
- Consumes: Formule mathématique Haversine et calculs de temps.
- Produces:
  - `haversineDistanceMeters(lat1, lon1, lat2, lon2): number`
  - `class TripTracker`:
    - `update(lat, lon, speedKmh, timestampMs): void`
    - `getDistanceKm(): number`
    - `getMovingTimeSeconds(): number`
    - `getAverageSpeedKmh(): number`
    - `formatDuration(seconds: number): string`
    - `reset(): void`
    - `serialize(): object`
    - `restore(data: object): void`

- [ ] **Step 1: Écrire les tests unitaires pour `haversineDistanceMeters` et `TripTracker`**

Dans `tests/test-runner.js` :
- Test Haversine : distance connue entre deux coordonnées GPS (ex. Paris Tour Eiffel à Notre-Dame ~ 4.1 km ± 50m).
- Test seuillage : une mise à jour avec vitesse = 0 n'incrémente ni la distance ni le temps en mouvement.
- Test temps en mouvement : 3 points à vitesse > 0 espacés de 10s incrémentent le temps de 20s.
- Test vitesse moyenne : $10\text{ km}$ parcourus en $1800\text{ s}$ ($0.5\text{ h}$) -> $20.0\text{ km/h}$.
- Test réinitialisation : `reset()` remet tout à 0.
- Test persistance : `serialize()` et `restore()` conservent l'état exact.

- [ ] **Step 2: Vérifier que le test échoue**

Exécuter `tests/test-runner.js`.
Attendu : Échec car `js/trip.js` n'existe pas.

- [ ] **Step 3: Implémenter `js/trip.js`**

- Fonction pure `haversineDistanceMeters(lat1, lon1, lat2, lon2)` avec $R = 6371000\text{ m}$.
- Classe `TripTracker` maintenant l'état : `distanceMeters`, `movingTimeMs`, `lastMoveTimestamp`, `lastPosition`.
- `update(lat, lon, speedKmh, timestampMs)` : si `speedKmh > 0`, accumule la distance et le temps écoulé depuis le dernier point mobile.
- `formatDuration(seconds)` : convertit en `HH:MM:SS` ou `MM:SS`.
- Méthodes `reset()`, `serialize()`, `restore(data)`.

- [ ] **Step 4: Vérifier que les tests passent**

Exécuter `tests/test-runner.js`.
Attendu : PASS pour tous les tests de distance, moyenne et chrono.

- [ ] **Step 5: Enregistrer les modifications**

Les tests de `trip.js` sont tous validés.

---

### Task 3: Gestionnaire GPS & Watchdog de Signal (`js/geo.js`)

**Files:**
- Create: `js/geo.js`
- Modify: `tests/test-runner.js`

**Interfaces:**
- Consumes: `js/speed-filter.js` (`filterSpeed`, `toKmh`), `js/trip.js` (`TripTracker`).
- Produces:
  - `GPS_STATUS: { SEARCHING: 'SEARCHING', ACTIVE: 'ACTIVE', LOST: 'LOST', ERROR: 'ERROR' }`
  - `class GeoManager`:
    - `constructor(options: { onSpeed, onStatus, onTripUpdate, speedFilter, tripTracker })`
    - `start(): void`
    - `stop(): void`
    - `startSimulation(routePoints: Array): void`
    - `handlePosition(pos: GeolocationPosition): void`
    - `triggerWatchdogTimeout(): void`

- [ ] **Step 1: Écrire les tests unitaires du watchdog et du filtrage GPS**

Dans `tests/test-runner.js` :
- Test statut initial : `SEARCHING`.
- Test position reçue valide (`accuracy = 10m`) : passe en `ACTIVE` et transmet la vitesse filtrée.
- Test position imprécise (`accuracy = 50m`) : ignorée, ne modifie pas la vitesse.
- Test watchdog : si aucun fix n'est reçu pendant $> 4000\text{ ms}$, le statut passe à `LOST` et la vitesse émise est `null`.
- Test reprise du signal : une nouvelle position valide après un état `LOST` repasse immédiatement en `ACTIVE`.

- [ ] **Step 2: Vérifier que le test échoue**

Exécuter `tests/test-runner.js`.
Attendu : Échec car `js/geo.js` n'est pas encore implémenté.

- [ ] **Step 3: Implémenter `js/geo.js`**

- `GeoManager` encapsulant `navigator.geolocation.watchPosition` avec `{ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }`.
- Gestionnaire de watchdog via `setTimeout` / `clearTimeout` réglé à $4000\text{ ms}$.
- Filtrage des positions avec `coords.accuracy > 35`.
- Intégration du mode simulateur (`startSimulation`) injectant des fausses positions horodatées pour le développement et la démo `?demo=1`.

- [ ] **Step 4: Vérifier que les tests passent**

Exécuter `tests/test-runner.js`.
Attendu : PASS sur tous les scénarios de position, watchdog et simulation.

- [ ] **Step 5: Enregistrer les modifications**

Module GPS opérationnel et testé.

---

### Task 4: Verrou d'Écran (Wake Lock) & Luminosité Ambiante (`js/wakelock.js`, `js/light.js`)

**Files:**
- Create: `js/wakelock.js`
- Create: `js/light.js`
- Modify: `tests/test-runner.js`

**Interfaces:**
- Consumes: APIs navigateur `navigator.wakeLock`, `window.AmbientLightSensor`, `document.visibilityState`.
- Produces:
  - `class WakeLockManager`:
    - `requestLock(): Promise<boolean>`
    - `releaseLock(): Promise<void>`
    - `isActive(): boolean`
  - `class LightManager`:
    - `constructor(options: { onThemeChange })`
    - `init(): Promise<void>`
    - `toggleManualMode(): string` // 'sun' | 'eco'
    - `getTheme(): string`

- [ ] **Step 1: Écrire les tests unitaires pour WakeLockManager et LightManager avec mocks**

Dans `tests/test-runner.js` :
- Mock de `navigator.wakeLock` : vérifier que `requestLock()` demande bien `'screen'`.
- Vérifier que l'événement `visibilitychange` réactive le lock lorsque `visibilityState === 'visible'`.
- Mock d'`AmbientLightSensor` : lux $> 10000$ déclenche le thème `'sun'`, lux $< 2000$ déclenche le thème `'eco'`.
- Test bascule manuelle : `toggleManualMode()` force le mode et inhibe le capteur jusqu'au prochain toggle.

- [ ] **Step 2: Vérifier que le test échoue**

Exécuter `tests/test-runner.js`.
Attendu : Échec car les fichiers n'existent pas encore.

- [ ] **Step 3: Implémenter `js/wakelock.js` et `js/light.js`**

- `wakelock.js` : encapsulation sécurisée avec blocs `try/catch` pour ne jamais planter si le navigateur bloque ou refuse l'API. Écouteur sur `visibilitychange`.
- `light.js` : tentative d'instanciation de `AmbientLightSensor`. En cas d'erreur de permission ou d'absence de support, dégradation gracieuse vers le mode manuel sans aucune erreur console.

- [ ] **Step 4: Vérifier que les tests passent**

Exécuter `tests/test-runner.js`.
Attendu : PASS pour Wake Lock et Light Manager.

- [ ] **Step 5: Enregistrer les modifications**

Modules matériels finalisés.

---

### Task 5: Interface Utilisateur, CSS Thématique & Interactions Guidon

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `GeoManager`, `TripTracker`, `WakeLockManager`, `LightManager`.
- Produces: Application web autonome affichable dans tout navigateur mobile.

- [ ] **Step 1: Structurer `index.html`**

Balises sémantiques :
- `<header class="hud-header">` : indicateur GPS (`#gps-indicator`), bouton thème (`#theme-toggle`), bouton plein écran (`#fullscreen-btn`).
- `<main class="hud-main">` : conteneur de vitesse géante (`#speed-value`) avec unité (`#speed-unit`).
- `<footer>` / `<section id="trip-metrics" class="hud-metrics">` :
  - Distance (`#metric-distance`)
  - Vitesse moyenne (`#metric-avg`)
  - Chrono déplacement (`#metric-duration`)
  - Toast de réinitialisation (`#reset-toast`)

- [ ] **Step 2: Développer `css/style.css`**

- Variables CSS :
  - `--bg: #000000`
  - `--speed-color: #999999` (Éco) / `--speed-color-sun: #ffffff` (Plein Soleil)
  - `--sub-color: #666666` / `--sub-color-sun: #cccccc`
  - `--dim-icon: #444444` / `--active-gps: #00ff66` / `--lost-gps: #ff4444`
- Typographie fluide via `clamp()` et `vh/vw` : le chiffre de vitesse occupe jusqu'à 65vh / 45vw sans déborder.
- `font-variant-numeric: tabular-nums` sur tous les chiffres.
- Gestion de l'orientation portrait et paysage via Media Queries sans rupture de disposition.
- Animation de fondu des icônes d'en-tête (inactivité 5s) et transition douce sur le bandeau des métriques.

- [ ] **Step 3: Implémenter l'orchestrateur `js/app.js`**

- Initialisation de `GeoManager`, `TripTracker`, `WakeLockManager`, `LightManager`.
- Gestion des interactions tactiles :
  - Simple tap sur `#hud-container` -> bascule la classe `.metrics-hidden` sur le bandeau inférieur.
  - Double tap -> bascule entre thème Éco et Plein Soleil.
  - Appui long (2 secondes via `touchstart`/`touchend` et `mousedown`/`mouseup`) sur `#trip-metrics` -> réinitialise le trajet avec affichage d'un toast temporaire de confirmation.
  - Clic sur bouton plein écran -> bascule `document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()`.
- Détection du paramètre d'URL `?demo=1` pour démarrer le simulateur GPS de démonstration automatiquement.
- Sauvegarde périodique du trajet dans `localStorage` toutes les 5 secondes.

- [ ] **Step 4: Valider visuellement l'interface et les interactions**

Ouvrir `index.html` et tester en mode normal et en mode `?demo=1` :
- Vérifier la fluidité des chiffres de vitesse.
- Vérifier le basculement d'affichage des métriques au tap.
- Vérifier l'activation du plein écran et la bascule de contraste.

- [ ] **Step 5: Enregistrer les modifications**

Interface utilisateur complète et fonctionnelle.

---

### Task 6: Support PWA Hors-Ligne & Manifest (`sw.js`, `manifest.webmanifest`, icônes)

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `icons/icon.svg`
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`
- Modify: `index.html` (enregistrement du Service Worker et métas PWA)

**Interfaces:**
- Consumes: Fichiers statiques du projet.
- Produces: PWA installable fonctionnant sans aucune connexion internet.

- [ ] **Step 1: Créer l'icône vectorielle et les icônes PWA dans `icons/`**

- Créer `icons/icon.svg` : compteur de vitesse minimaliste géométrique sobre (arc de cercle et aiguille épurée, ou logo tachymètre stylisé sur fond noir pur).
- Générer ou fournir `icon-192.png` et `icon-512.png` (ou fallback SVG propre supporté par les navigateurs modernes).

- [ ] **Step 2: Rédiger `manifest.webmanifest`**

- `name`: "Tachymètre Vélo"
- `short_name`: "Tachymètre"
- `start_url`: "./index.html"
- `display`: "standalone"
- `background_color`: "#000000"
- `theme_color`: "#000000"
- `orientation`: "any"
- Définition des icônes dans le manifest.

- [ ] **Step 3: Implémenter le Service Worker `sw.js`**

- Nom de cache : `tachymetre-v1`.
- Liste des ressources à pré-cacher :
  - `./`
  - `./index.html`
  - `./css/style.css`
  - `./js/app.js`
  - `./js/geo.js`
  - `./js/speed-filter.js`
  - `./js/trip.js`
  - `./js/wakelock.js`
  - `./js/light.js`
  - `./manifest.webmanifest`
  - `./icons/icon.svg`
- Stratégie `fetch` : Cache-First, fallback réseau.
- Stratégie `activate` : suppression de tout ancien cache obsolète.

- [ ] **Step 4: Enregistrer le Service Worker dans `index.html`**

Ajouter le script d'enregistrement de `sw.js` sous condition de support (`'serviceWorker' in navigator`).
Tester le mode hors-ligne dans le navigateur (en coupant le réseau dans l'onglet Application / Network).
Attendu : La page se charge instantanément même hors-ligne.

- [ ] **Step 5: Enregistrer les modifications**

PWA hors-ligne validée.

---

### Task 7: Validation Finale, Documentation & Préparation GitHub Pages

**Files:**
- Create: `README.md`
- Modify: `tests/test-runner.js` (validation complète globale)

**Interfaces:**
- Consumes: Ensemble du projet.
- Produces: Dépôt prêt à être activé sur GitHub Pages avec documentation d'utilisation.

- [ ] **Step 1: Exécuter l'ensemble de la suite de tests automatisée**

Vérifier que 100% des tests unitaires (`speed-filter`, `trip`, `geo`, `wakelock`, `light`) passent avec succès sur `tests/test.html` et `tests/test-runner.js`.

- [ ] **Step 2: Vérifier le comportement en mode simulation (`?demo=1`)**

Tester l'ensemble des scénarios :
- Accélération progressive, maintien d'allure, arrêt au feu rouge (vitesse retombant net à 0).
- Calcul de la vitesse moyenne cohérent avec le temps en mouvement.
- Bascule des thèmes (Éco / Plein Soleil) au double-tap.
- Masquage/affichage des statistiques au simple tap.
- Réinitialisation par appui long de 2s.

- [ ] **Step 3: Rédiger `README.md`**

Expliquer clairement :
- Présentation de l'application et fonctionnalités.
- Comment activer GitHub Pages en 2 clics (Paramètres du dépôt -> Pages -> Source : `Deploy from a branch` -> Branche `main` -> `/ (root)`).
- Comment installer la PWA sur Android Chrome ("Ajouter à l'écran d'accueil" / "Installer").
- Raccourcis tactiles au guidon (Tap, Double tap, Appui long).
- Lien vers le mode démo (`?demo=1`).

- [ ] **Step 4: Vérifier la conformité finale du dépôt**

S'assurer qu'aucun fichier temporaire ou déchet n'est présent.
