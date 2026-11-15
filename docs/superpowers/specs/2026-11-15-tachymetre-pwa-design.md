# Spécification de Conception : Tachymètre Vélo PWA

**Date :** 15 novembre 2026  
**Auteur :** Gemini CLI & Utilisateur  
**Statut :** Validé pour implémentation  
**Cible :** Progressive Web App (PWA) hébergée sur GitHub Pages (Vanilla ES6, zéro build)

---

## 1. Contexte et Objectifs

L'objectif de ce projet est de transformer un smartphone Android fixé sur le cintre d'un vélo en un compteur de vitesse numérique épuré, économe en énergie et fiable.

### Objectifs Clés
- **Lisibilité optimale en roulant :** Affichage plein écran d'une vitesse géante au centre, lisible à distance de bras sans quitter la route des yeux.
- **Sobriété et autonomie :** Thème noir absolu (`#000000`) exploitant les dalles OLED/AMOLED pour limiter la consommation de batterie, avec chiffres gris doux par défaut.
- **Adaptation lumineuse :** Mode "Plein Soleil" à haut contraste (blanc pur / vert haute visibilité) activable manuellement ou automatiquement via l'API `AmbientLightSensor`.
- **Maintien de l'écran allumé :** Utilisation de la `Screen Wake Lock API` pour empêcher la mise en veille de l'écran pendant les trajets.
- **Calcul de vitesse précis :** Utilisation de l'API de géolocalisation (`coords.speed` issu du matériel GNSS), seuillage anti-dérive à l'arrêt, et lissage par moyenne mobile exponentielle.
- **Métriques utiles au cycliste :** Vitesse instantanée, vitesse moyenne (basée sur le temps en mouvement), distance parcourue, et durée de déplacement.
- **Hébergement direct GitHub Pages :** Aucun outil de build, aucun bundler ni dépendance npm requise au déploiement ; fichiers HTML/CSS/JS servis directement.
- **Fonctionnement hors-ligne :** Service Worker complet (Cache-First) et manifest PWA pour installation sur l'écran d'accueil Android.

---

## 2. Interface Utilisateur & Expérience Guidon

### 2.1 Hiérarchie Visuelle et Disposition

L'interface s'adapte aussi bien en mode portrait qu'en mode paysage :

```text
┌─────────────────────────────────────────────────────────────┐
│ [● GPS]                                       [☀/☾] [⛶ Full]│  <- Barre d'en-tête discrète
│                                                             │
│                                                             │
│                            28                               │  <- Vitesse géante (80vh / 40vw)
│                                                             │     tabular-nums, sans sautillement
│                           km/h                              │  <- Unité discrète
│                                                             │
│                                                             │
│  [ Dist: 12.4 km ]    [ Moy: 21.8 km/h ]    [ T: 00:34:10 ] │  <- Métriques secondaires
└─────────────────────────────────────────────────────────────┘     (masquable / affichable au tap)
```

### 2.2 Thèmes & Couleurs
- **Fond :** `#000000` (Noir OLED pur).
- **Mode Éco / Nuit (défaut) :** 
  - Vitesse : `#999999`
  - Unité et métriques secondaires : `#666666`
  - En-tête / icônes : `#444444`
- **Mode Plein Soleil (Haut Contraste) :**
  - Vitesse : `#ffffff`
  - Unité et métriques : `#cccccc`
  - En-tête / icônes : `#888888`
- **Typographie :** Police système sans-serif moderne (`system-ui, -apple-system, Roboto, sans-serif`) configurée avec `font-variant-numeric: tabular-nums` pour éviter toute variation de largeur lors des changements de chiffres.

### 2.3 Gestuelle et Interactions Tactiles
- **Simple Tap n'importe où sur l'écran :** Affiche ou masque avec transition douce le bandeau inférieur des métriques secondaires (distance, moyenne, chrono).
- **Double Tap :** Bascule manuelle immédiate entre le mode Éco (gris) et le mode Plein Soleil (blanc contrasté).
- **Appui long (2 secondes) sur le bandeau des métriques :** Réinitialise le trajet en cours (distance, chrono, moyenne remis à zéro) avec un feedback visuel temporaire ("Trajet réinitialisé").
- **Bouton Plein Écran (`[⛶]` / `[🗗]`) :**
  - Entrée en mode immersif via `document.documentElement.requestFullscreen()`.
  - Sortie via `document.exitFullscreen()` ou par le geste natif Android (glisser du bord).
  - L'icône de l'en-tête s'estompe après 5 secondes d'inactivité et réapparaît au toucher.

### 2.4 Indicateur de Statut GPS
- **Pulsation grise/orange :** En attente du premier signal GPS valide.
- **Point fixe discret vert/gris :** Signal actif et précis (`accuracy <= 25 m`).
- **Icône barrée rouge / avertissement discret :** Aucun signal reçu depuis plus de 4 secondes (watchdog déclenché).

---

## 3. Architecture Technique

### 3.1 Arborescence du Projet

```text
tachymetre/
├── index.html                  # Structure HTML5 principale
├── manifest.webmanifest        # Manifest PWA (standalone, orientation, icons)
├── sw.js                       # Service Worker pour cache hors-ligne
├── css/
│   └── style.css               # Feuilles de styles, CSS variables, layout responsive
├── js/
│   ├── app.js                  # Contrôleur UI, routing des événements tactiles
│   ├── geo.js                  # Gestionnaire de géolocalisation & watchdog signal
│   ├── speed-filter.js         # Filtre de seuillage et lissage exponentiel (EMA)
│   ├── trip.js                 # Calculateur de métriques (distance, vitesse moyenne, durée)
│   ├── wakelock.js             # Maintien de l'écran allumé (Screen Wake Lock API)
│   └── light.js                # Détection AmbientLightSensor & gestion des contrastes
├── icons/
│   ├── icon-192.png            # Icône PWA 192x192
│   ├── icon-512.png            # Icône PWA 512x512
│   └── icon.svg                # Source vectorielle de l'icône
└── tests/
    └── test.html               # Page de tests unitaires navigateur (zéro dépendance)
```

### 3.2 Modules et Responsabilités

#### Module `speed-filter.js`
- **Seuil d'arrêt (Deadband) :**
  - Seuil fixé à `MIN_SPEED_THRESHOLD = 0.8` m/s (~ 2.88 km/h).
  - Tout signal GPS inférieur à ce seuil est strictement forcé à `0 km/h` pour supprimer la dérive stationnaire.
- **Lissage exponentiel (Exponential Moving Average - EMA) :**
  - Formule : $v_{filtree} = \alpha \cdot v_{brute} + (1 - \alpha) \cdot v_{precedente}$
  - Facteur $\alpha = 0.4$ pour offrir un excellent compromis entre stabilité visuelle et réactivité lors des accélérations/décélérations.
  - Réinitialisation immédiate à zéro sans traînée dès que la vitesse brute passe sous le seuil d'arrêt.

#### Module `geo.js`
- Démarre la surveillance continue : `navigator.geolocation.watchPosition(onSuccess, onError, options)`
  - Options : `{ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }`.
- Vérification de la précision : Ignore les positions avec `accuracy > 35` mètres.
- **Watchdog de signal :**
  - Un timer de 4000 ms est réinitialisé à chaque position reçue.
  - En cas d'expiration sans nouveau fix, l'état passe à `SIGNAL_LOST`, et la vitesse affichée passe en tirets ou 0.

#### Module `trip.js`
- **Formule d'Haversine :** Calcul de distance orthodromique entre coordonnées consécutives :
  $$a = \sin^2(\Delta\varphi/2) + \cos(\varphi_1)\cos(\varphi_2)\sin^2(\Delta\lambda/2)$$
  $$d = 2 R \cdot \text{atan2}(\sqrt{a}, \sqrt{1-a})$$
- Les segments ne sont comptabilisés que lorsque le vélo est en mouvement ($v > \text{seuil}$).
- **Temps en mouvement (*Moving Time*) :** Uniquement incrémenté lorsque la vitesse est active.
- **Vitesse moyenne :** Calculée comme $\text{Distance (km)} / \text{Temps en mouvement (h)}$. Évite de biaiser la moyenne lors des arrêts aux intersections.
- **Persistance :** Sauvegarde dans `localStorage` pour reprise automatique en cas de rechargement.

#### Module `wakelock.js`
- Demande le verrou : `navigator.wakeLock.request('screen')`.
- Ré-acquisition automatique sur l'événement `visibilitychange` lorsque la page redevient visible (`document.visibilityState === 'visible'`).

#### Module `light.js`
- Écoute `AmbientLightSensor` (si disponible dans le navigateur) :
  - `lux > 10000` : Bascule en mode Plein Soleil.
  - `lux < 2000` : Retour au mode Éco.
- Fallback gracieux si l'API n'est pas supportée ou refusée : gestion manuelle par double-tap ou bouton de l'en-tête.

---

## 4. Mode Hors-Ligne & PWA

- **Manifest (`manifest.webmanifest`) :**
  - `display: standalone`
  - `theme_color: #000000`
  - `background_color: #000000`
  - `orientation: any`
- **Service Worker (`sw.js`) :**
  - Versionnement du cache (`tachymetre-v1`).
  - Pré-mise en cache de tous les assets critiques (`index.html`, `css/style.css`, tous les fichiers `js/*.js`, icônes).
  - Événement `fetch` : Stratégie Cache-First pour garantir un lancement instantané sans réseau.
  - Événement `activate` : Nettoyage automatique des anciens caches.

---

## 5. Stratégie de Test et Validation

1. **Harnais de test autonome (`tests/test.html`) :**
   - Mini-framework de test unitaire en pur JavaScript (sans Jest/Node).
   - Teste les calculs mathématiques purs :
     - Conversion d'unités et seuil d'arrêt dans `speed-filter.js`.
     - Lissage EMA et réactivité de freinage.
     - Calculs de distance Haversine avec coordonnées GPS réelles.
     - Précision du calcul de vitesse moyenne basée sur le temps en mouvement.
     - Gestion du watchdog de timeout du GPS.
2. **Mode Démonstration / Simulation (`?demo=1`) :**
   - Paramètre d'URL permettant d'injecter une fausse trace GPS cycliste (accélération, vitesse de croisière à 25-30 km/h, arrêt à un feu, reprise).
   - Permet de valider l'ergonomie, les transitions d'écran et les contrastes sur smartphone sans se déplacer.
3. **Vérification terrain sur Android :**
   - Validation du plein écran, du wake lock continu et de l'installation PWA sur Chrome Android.

---

## 6. Déploiement GitHub Pages

- Déploiement depuis la branche `main` du dépôt GitHub.
- Aucun workflow de build nécessaire : GitHub Pages servira directement les fichiers statiques de la racine du dépôt.
