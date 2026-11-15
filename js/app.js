/**
 * Contrôleur principal de l'application Tachymètre Vélo PWA.
 * Orchestration des capteurs, gestion du plein écran, thèmes et gestuelle tactile.
 */

import { formatSpeed } from './speed-filter.js';
import { TripTracker } from './trip.js';
import { GeoManager, GPS_STATUS } from './geo.js';
import { WakeLockManager } from './wakelock.js';
import { LightManager } from './light.js';

// Clé de persistance locale
const STORAGE_KEY_TRIP = 'tachymetre_trip_data';

// Récupération des éléments DOM
const hudContainer = document.getElementById('hud-container');
const hudHeader = document.getElementById('hud-header');
const hudMain = document.getElementById('hud-main');
const speedValueEl = document.getElementById('speed-value');
const gpsIndicatorEl = document.getElementById('gps-indicator');
const gpsTextEl = document.getElementById('gps-text');
const themeToggleBtn = document.getElementById('theme-toggle');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const tripMetricsEl = document.getElementById('trip-metrics');
const metricDistanceEl = document.getElementById('metric-distance');
const metricAvgEl = document.getElementById('metric-avg');
const metricDurationEl = document.getElementById('metric-duration');
const resetToastEl = document.getElementById('reset-toast');

// 1. Initialisation du suivi de trajet
const tripTracker = new TripTracker();

// Restauration de l'état précédent si disponible
try {
  const savedData = localStorage.getItem(STORAGE_KEY_TRIP);
  if (savedData) {
    tripTracker.restore(JSON.parse(savedData));
  }
} catch (e) {
  // Ignorer les erreurs de parsing localStorage
}

// Mise à jour de l'affichage initial des métriques
updateTripUI(tripTracker);

// Sauvegarde automatique toutes les 5 secondes
setInterval(() => {
  try {
    localStorage.setItem(STORAGE_KEY_TRIP, JSON.stringify(tripTracker.serialize()));
  } catch (e) {}
}, 5000);

// 2. Gestion de l'affichage et du contraste
const lightManager = new LightManager({
  onThemeChange: (theme) => applyTheme(theme)
});

function applyTheme(theme) {
  if (theme === 'sun') {
    document.documentElement.classList.add('theme-sun');
    document.documentElement.classList.remove('theme-eco');
    themeToggleBtn.title = 'Passer en mode Éco / Nuit (faible luminosité)';
    themeToggleBtn.setAttribute('aria-label', 'Passer en mode Éco / Nuit');
  } else {
    document.documentElement.classList.add('theme-eco');
    document.documentElement.classList.remove('theme-sun');
    themeToggleBtn.title = 'Passer en mode Plein Soleil (fort contraste)';
    themeToggleBtn.setAttribute('aria-label', 'Passer en mode Plein Soleil');
  }
}

// Démarrage de la sonde de luminosité ambiante
lightManager.init();

// 3. Gestion du maintien actif de l'écran (Wake Lock)
const wakeLockManager = new WakeLockManager();

async function ensureWakeLock() {
  if (!wakeLockManager.isActive()) {
    await wakeLockManager.requestLock();
  }
}

// Tente d'acquérir le verrou au chargement
ensureWakeLock();

// 4. Initialisation du gestionnaire GPS
const geoManager = new GeoManager({
  tripTracker,
  onSpeed: (speedKmh) => {
    speedValueEl.textContent = formatSpeed(speedKmh);
  },
  onStatus: (status) => {
    updateGpsStatusUI(status);
  },
  onTripUpdate: (tracker) => {
    updateTripUI(tracker);
  }
});

function updateGpsStatusUI(status) {
  gpsIndicatorEl.classList.remove('status-searching', 'status-active', 'status-lost', 'status-error');

  switch (status) {
    case GPS_STATUS.ACTIVE:
      gpsIndicatorEl.classList.add('status-active');
      gpsTextEl.textContent = 'GPS';
      break;
    case GPS_STATUS.LOST:
      gpsIndicatorEl.classList.add('status-lost');
      gpsTextEl.textContent = 'SIGNAL PERDU';
      break;
    case GPS_STATUS.ERROR:
      gpsIndicatorEl.classList.add('status-error');
      gpsTextEl.textContent = 'GPS ERREUR';
      break;
    case GPS_STATUS.SEARCHING:
    default:
      gpsIndicatorEl.classList.add('status-searching');
      gpsTextEl.textContent = 'GPS...';
      break;
  }
}

function updateTripUI(tracker) {
  const distKm = tracker.getDistanceKm();
  const avgKmh = tracker.getAverageSpeedKmh();
  const durationSec = tracker.getMovingTimeSeconds();

  // 2 décimales sous 1 km pour voir immédiatement les mètres défiler, 1 décimale au-delà
  const formattedDist = distKm < 1.0 ? distKm.toFixed(2) : distKm.toFixed(1);
  metricDistanceEl.innerHTML = `${formattedDist} <span class="unit">km</span>`;
  metricAvgEl.innerHTML = `${avgKmh.toFixed(1)} <span class="unit">km/h</span>`;
  metricDurationEl.textContent = tracker.formatDuration(durationSec);
}

// 5. Détection du mode Démonstration / Simulation (?demo=1)
const urlParams = new URLSearchParams(window.location.search);
const isDemoMode = urlParams.get('demo') === '1';

if (isDemoMode) {
  console.log('[Tachymètre] Mode simulation activé (?demo=1)');
  // En mode démo, si le compteur est à zéro, initialiser un trajet actif pour visualiser la dynamique
  if (tripTracker.getDistanceKm() === 0) {
    tripTracker.restore({
      distanceMeters: 1420, // 1.42 km
      movingTimeMs: 215000  // 3 min 35 s (moyenne ~23.8 km/h)
    });
    updateTripUI(tripTracker);
  }
  geoManager.startSimulation();
} else {
  geoManager.start();
}

// 6. Gestion du plein écran
fullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function updateFullscreenUI() {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenBtn.classList.toggle('is-fullscreen', isFullscreen);
  if (isFullscreen) {
    fullscreenBtn.title = 'Quitter le plein écran (réduire)';
    fullscreenBtn.setAttribute('aria-label', 'Quitter le plein écran');
  } else {
    fullscreenBtn.title = 'Plein écran (agrandir)';
    fullscreenBtn.setAttribute('aria-label', 'Plein écran');
  }
}

document.addEventListener('fullscreenchange', updateFullscreenUI);
document.addEventListener('webkitfullscreenchange', updateFullscreenUI);

// 7. Bascule manuelle du thème
themeToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  lightManager.toggleManualMode();
});

// 8. Estompage automatique de l'en-tête après 5s d'inactivité
let headerInactivityTimer = null;

function resetHeaderInactivity() {
  hudHeader.classList.remove('dimmed');
  if (headerInactivityTimer) {
    clearTimeout(headerInactivityTimer);
  }
  headerInactivityTimer = setTimeout(() => {
    hudHeader.classList.add('dimmed');
  }, 5000);
}

resetHeaderInactivity();
window.addEventListener('pointerdown', () => {
  resetHeaderInactivity();
  ensureWakeLock(); // Ré-acquisition lors du geste utilisateur
});

// 9. Gestuelle tactile au guidon : Simple Tap et Double Tap
let lastTapTimestamp = 0;
let singleTapTimeout = null;

hudContainer.addEventListener('click', (e) => {
  // Ignorer si on clique sur un bouton d'en-tête ou le bandeau des métriques
  if (e.target.closest('.hud-header') || e.target.closest('#trip-metrics')) {
    return;
  }

  const now = Date.now();
  const delta = now - lastTapTimestamp;

  if (delta < 320 && delta > 0) {
    // Double tap détecté : bascule du contraste (Éco / Plein Soleil)
    if (singleTapTimeout) {
      clearTimeout(singleTapTimeout);
      singleTapTimeout = null;
    }
    lightManager.toggleManualMode();
    lastTapTimestamp = 0;
  } else {
    // Enregistrement du premier tap, en attente d'un éventuel second tap
    lastTapTimestamp = now;
    singleTapTimeout = setTimeout(() => {
      // Simple tap confirmé : affiche ou masque le volet des métriques
      tripMetricsEl.classList.toggle('metrics-hidden');
      singleTapTimeout = null;
    }, 320);
  }
});

// 10. Appui long (2 secondes) sur le bandeau des métriques pour réinitialiser le trajet
let longPressTimer = null;
let toastTimeout = null;

function startLongPress(e) {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    resetTripWithToast();
  }, 2000);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function resetTripWithToast() {
  tripTracker.reset();
  updateTripUI(tripTracker);
  try {
    localStorage.removeItem(STORAGE_KEY_TRIP);
  } catch (e) {}

  resetToastEl.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    resetToastEl.classList.remove('show');
  }, 2200);
}

tripMetricsEl.addEventListener('touchstart', startLongPress, { passive: true });
tripMetricsEl.addEventListener('touchend', cancelLongPress);
tripMetricsEl.addEventListener('touchcancel', cancelLongPress);

tripMetricsEl.addEventListener('mousedown', startLongPress);
tripMetricsEl.addEventListener('mouseup', cancelLongPress);
tripMetricsEl.addEventListener('mouseleave', cancelLongPress);
