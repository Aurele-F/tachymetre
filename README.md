# 🚲 Tachymètre Vélo - PWA

> **Progressive Web App (PWA)** ultra-sobre, économe en énergie et précise, conçue pour transformer un smartphone Android fixé sur le guidon d'un vélo en compteur de vitesse numérique.

Déployable **directement sur GitHub Pages** (aucun outil de build, aucun bundler, zéro dépendance externe).

---

## ✨ Fonctionnalités Clés

- **⚡ Lisibilité Maximale au Guidon :** Affichage géant de la vitesse instantanée au centre de l'écran, exploitant une typographie numérique à espacement fixe (`tabular-nums`) pour éliminer tout sautillement de chiffres.
- **🔋 Économie de Batterie (Noir Absolu OLED) :** Fond noir pur (`#000000`) éteignant complètement les pixels des écrans OLED/AMOLED de smartphones pour maximiser l'autonomie lors des longues sorties.
- **☀️ Adaptation de Luminosité & Contraste :**
  - **Mode Éco / Nuit (défaut) :** Chiffres gris doux (`#999999`) sur fond noir, évitant toute fatigue visuelle ou éblouissement.
  - **Mode Plein Soleil :** Blanc éclatant (`#ffffff`) à très fort contraste pour rester parfaitement lisible sous le soleil direct.
  - **Automatique :** Exploite l'API `AmbientLightSensor` du smartphone si supportée (> 10 000 lux = Plein Soleil).
- **🔒 Écran Toujours Actif (Screen Wake Lock) :** Utilise la `Screen Wake Lock API` pour empêcher la mise en veille automatique du smartphone pendant que vous roulez, avec ré-acquisition automatique lors du retour sur l'application.
- **🎯 Mesure GPS Optimisée & Anti-Dérive :**
  - Vitesse extraite directement du matériel GNSS (`coords.speed`) en m/s et convertie en km/h.
  - **Seuil d'arrêt net (Deadband) :** En dessous de $0.8\text{ m/s}$ (~$2.9\text{ km/h}$), la vitesse affichée est strictement forcée à $0\text{ km/h}$ pour supprimer la dérive GPS à l'arrêt (feux rouges, intersections).
  - **Lissage exponentiel (EMA) :** Réduit les micro-variations de signal sans introduire de retard à l'accélération ou au freinage.
  - **Watchdog de perte de signal :** Détecte l'absence de signal pendant plus de 4 secondes (tunnels, sous-bois) et bascule discrètement l'indicateur GPS en "Signal Perdu".
- **📊 Métriques de Trajet :**
  - **Distance parcourue :** Calcul géodésique précis (formule d'Haversine).
  - **Vitesse moyenne cycliste :** Basée exclusivement sur le temps en mouvement effectif (le chrono se met en pause automatiquement à l'arrêt).
  - **Durée de déplacement :** Chronomètre au format `MM:SS` ou `HH:MM:SS`.
- **📶 Fonctionnement 100% Hors-Ligne :** Service Worker avec stratégie Cache-First permettant un lancement instantané sans aucune connexion réseau 4G/5G.

---

## 👆 Gestuelle Tactile au Cintre

L'application est pensée pour être manipulée d'une seule main au guidon :

| Action | Effet |
| :--- | :--- |
| **Simple Tap** | Affiche ou masque en fondu le volet inférieur des métriques (distance, moyenne, chrono). |
| **Double Tap** | Bascule immédiatement entre le mode Éco (gris) et le mode Plein Soleil (blanc haute visibilité). |
| **Appui long (2s) sur les métriques** | Réinitialise le trajet en cours (distance, moyenne et durée à zéro) avec notification de confirmation. |
| **Bouton Plein Écran `[⛶]`** | Active le mode immersif complet (masque la barre d'adresse et de navigation du navigateur). |

*Note : Les icônes de contrôle de l'en-tête s'estompent doucement après 5 secondes d'inactivité pour ne laisser que la vitesse à l'écran, et réapparaissent au moindre contact.*

---

## 🚀 Déploiement sur GitHub Pages (En 2 clics)

Le projet ne nécessite aucune étape de compilation ni d'installation de paquets.

1. Rendez-vous dans les paramètres de votre dépôt GitHub (**Settings**).
2. Dans le menu latéral gauche, cliquez sur **Pages**.
3. Dans la section **Build and deployment** :
   - **Source** : Sélectionnez `Deploy from a branch`.
   - **Branch** : Choisissez `main` et le dossier `/ (root)`.
   - Cliquez sur **Save**.
4. En quelques secondes, votre compteur est accessible en ligne via l'URL :  
   `https://<votre-identifiant>.github.io/tachymetre/`

---

## 📱 Installation sur Android (PWA)

1. Ouvrez l'URL du site dans Google Chrome sur votre smartphone Android.
2. Appuyez sur le menu (les trois points verticaux en haut à droite) ou sur la bannière d'installation.
3. Sélectionnez **"Installer l'application"** (ou *"Ajouter à l'écran d'accueil"*).
4. L'icône Tachymètre s'ajoute à votre lanceur d'applications : elle s'ouvre désormais en plein écran natif (sans barre de navigateur) et fonctionne même en mode avion / hors réseau.

---

## 🧪 Mode Démonstration / Simulation

Vous pouvez tester l'ensemble de l'interface et des calculs sans sortir rouler :

Ajoutez simplement `?demo=1` à la fin de l'URL :
```text
https://<votre-identifiant>.github.io/tachymetre/?demo=1
```
Ce mode injecte automatiquement une trace cycliste réaliste (démarrage, accélération progressive jusqu'à 30 km/h, décélération, arrêt au feu rouge avec remise à zéro nette, et reprise de croisière).

---

## 💻 Test Local sur Ordinateur

En raison de la politique de sécurité des navigateurs (CORS), les modules JavaScript ES6 (`import`/`export`), les Service Workers et la géolocalisation ne peuvent pas fonctionner avec le protocole `file:///` (double-clic direct sur un fichier HTML). Ils nécessitent un serveur HTTP local.

Un serveur HTTP autonome sans aucune dépendance externe est inclus dans le projet :

```bash
npm start
# ou directement :
node server.js
```

Le serveur s'ouvre sur le port `8080` :
- **Application :** [http://localhost:8080](http://localhost:8080)
- **Mode Démo (simulateur GPS) :** [http://localhost:8080/?demo=1](http://localhost:8080/?demo=1)
- **Tests unitaires :** [http://localhost:8080/tests/test.html](http://localhost:8080/tests/test.html)

*(Alternative si vous avez Python : `python -m http.server 8080`)*

---

## 🔬 Suite de Tests Unitaires

Le projet intègre une suite de tests unitaires autonome (24 tests) validant :
- La conversion d'unités et le seuil d'arrêt net (`js/speed-filter.js`).
- Le lissage exponentiel (EMA).
- Le calcul de distance Haversine et la vitesse moyenne (`js/trip.js`).
- La persistance et la réinitialisation de session.
- La détection de perte de signal et le watchdog GPS (`js/geo.js`).
- La gestion sécurisée du Wake Lock et du capteur de lumière (`js/wakelock.js`, `js/light.js`).

Pour exécuter les tests :
- **Dans le navigateur :** Ouvrez simplement le fichier `tests/test.html`.
- **En ligne de commande (si Node.js est installé) :**
  ```bash
  npm test
  # ou
  node tests/test-runner.js
  ```

---

## 📂 Structure du Répertoire

```text
tachymetre/
├── index.html              # Interface utilisateur et structure sémantique
├── manifest.webmanifest    # Configuration PWA (standalone, orientation, icône)
├── sw.js                   # Service Worker Cache-First pour le hors-ligne
├── package.json            # Définition ES module et script de test
├── README.md               # Guide d'utilisation et déploiement
├── css/
│   └── style.css           # Thème sombre OLED, variables CSS, typographie fluide
├── js/
│   ├── app.js              # Contrôleur principal et gestion des interactions
│   ├── speed-filter.js     # Filtre anti-dérive et lissage exponentiel
│   ├── trip.js             # Calculateur de distance Haversine, moyenne et chrono
│   ├── geo.js              # Gestionnaire GPS haute précision et watchdog
│   ├── wakelock.js         # Maintien actif de l'écran (Screen Wake Lock API)
│   └── light.js            # Capteur AmbientLightSensor et contrastes
├── icons/
│   └── icon.svg            # Icône vectorielle moderne du tachymètre
├── tests/
│   ├── test.html           # Page d'exécution des tests dans le navigateur
│   └── test-runner.js      # Harnais de test et assertions unitaires
└── docs/
    └── superpowers/
        ├── specs/          # Spécification de conception validée
        └── plans/          # Plan d'implémentation détaillé
```

---

## 📄 Licence

Projet open-source distribué sous licence MIT.
