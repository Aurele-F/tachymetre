/**
 * Contrôleur principal de l'application Tachymètre Vélo PWA.
 * Orchestration des capteurs, gestion du plein écran, thèmes et gestuelle tactile.
 */

import { formatSpeed, formatAverageSpeed } from './speed-filter.js';
import { TripTracker } from './trip.js';
import { GeoManager, GPS_STATUS } from './geo.js';
import { WakeLockManager } from './wakelock.js';
import { LightManager } from './light.js';

// Détection du mode Démonstration / Simulation (?demo=1)
const urlParams = new URLSearchParams(window.location.search);
const isDemoMode = urlParams.get('demo') === '1';

// Clés de persistance locale (clé dédiée en mode démo pour isoler les tests sans impacter le trajet réel)
const STORAGE_KEY_TRIP = isDemoMode ? 'tachymetre_demo_trip_data' : 'tachymetre_trip_data';
const STORAGE_KEY_METRICS_VIEW = 'tachymetre_metrics_view';

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
const metricLabelAvgEl = document.getElementById('metric-label-avg');
const metricLabelDurationEl = document.getElementById('metric-label-duration');
const metricsDotsEl = document.getElementById('metrics-dots');
const startupActionBtn = document.getElementById('startup-action-btn');
const resetToastEl = document.getElementById('reset-toast');

// Mode de vue actif du bandeau : 'moving' (temps de roulage) ou 'total' (temps global)
let metricsView = 'moving';
try {
  const savedView = localStorage.getItem(STORAGE_KEY_METRICS_VIEW);
  if (savedView === 'total' || savedView === 'moving') {
    metricsView = savedView;
  }
} catch (e) {}

// 1. Initialisation du suivi de trajet
const tripTracker = new TripTracker();
let savedTripSnapshot = null;
let currentStartupDecision = null;

try {
  const rawData = localStorage.getItem(STORAGE_KEY_TRIP);
  if (rawData) {
    savedTripSnapshot = JSON.parse(rawData);
  }
} catch (e) {}

// Analyse de l'action de démarrage selon le délai d'inactivité (seuil de 2 heures)
currentStartupDecision = TripTracker.determineStartupAction(savedTripSnapshot);

if (currentStartupDecision.action === 'prompt') {
  if (currentStartupDecision.defaultChoice === 'resume') {
    // Reprise par défaut (< 2h)
    tripTracker.restore(savedTripSnapshot);
  } else {
    // Nouveau trajet par défaut (>= 2h)
    tripTracker.reset();
  }
  showStartupPrompt(currentStartupDecision.buttonLabel);
} else {
  // Pas de trajet antérieur significatif
  if (savedTripSnapshot) {
    tripTracker.restore(savedTripSnapshot);
  }
}

// Mise à jour de l'affichage initial des métriques
updateTripUI(tripTracker);

function showStartupPrompt(label) {
  if (!startupActionBtn) return;
  startupActionBtn.textContent = label;
  startupActionBtn.style.display = 'flex';
  tripMetricsEl.classList.add('showing-startup-prompt');
}

function dismissStartupPrompt() {
  if (!tripMetricsEl.classList.contains('showing-startup-prompt')) return;
  tripMetricsEl.classList.remove('showing-startup-prompt');
  if (startupActionBtn) {
    startupActionBtn.style.display = 'none';
  }
  currentStartupDecision = null;
}

function handleStartupActionClick() {
  if (!currentStartupDecision) {
    dismissStartupPrompt();
    return;
  }

  if (currentStartupDecision.alternativeChoice === 'new') {
    tripTracker.reset();
    updateTripUI(tripTracker);
    try {
      localStorage.removeItem(STORAGE_KEY_TRIP);
    } catch (err) {}
    showToast('Nouveau trajet commencé');
  } else if (currentStartupDecision.alternativeChoice === 'resume' && savedTripSnapshot) {
    tripTracker.restore(savedTripSnapshot);
    updateTripUI(tripTracker);
    showToast('Trajet repris - appui long pour réinitialiser');
    try {
      localStorage.setItem(STORAGE_KEY_TRIP, JSON.stringify(tripTracker.serialize()));
    } catch (err) {}
  }

  dismissStartupPrompt();
}

if (startupActionBtn) {
  startupActionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleStartupActionClick();
  });
}

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

    // Masquage du bouton d'alternative dès qu'on commence à rouler
    if (speedKmh > 0 && currentStartupDecision) {
      if (currentStartupDecision.defaultChoice === 'resume') {
        showToast('Trajet repris - appui long pour réinitialiser');
      }
      dismissStartupPrompt();
    }

    // Détection d'auto-reprise (> 12 km/h pendant 3s)
    if (tripTracker.isPaused()) {
      const autoResumed = tripTracker.checkAutoResume(speedKmh, Date.now(), 12, 3);
      if (autoResumed) {
        updateTripUI(tripTracker);
        showToast('Trajet repris');
      }
    }
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
  const isPaused = tracker.isPaused();
  tripMetricsEl.classList.toggle('is-paused', isPaused);
  if (isPaused) {
    tripMetricsEl.classList.remove('metrics-hidden');
  }

  const formattedDist = tracker.getFormattedDistance();
  let avgKmh = 0;
  let durationSec = 0;

  if (metricsView === 'total') {
    avgKmh = tracker.getTotalAverageSpeedKmh();
    durationSec = tracker.getTotalTimeSeconds();
    if (metricLabelAvgEl) metricLabelAvgEl.textContent = 'Moy. totale';
    if (metricLabelDurationEl) metricLabelDurationEl.textContent = 'Temps total';
  } else {
    avgKmh = tracker.getMovingAverageSpeedKmh();
    durationSec = tracker.getMovingTimeSeconds();
    if (metricLabelAvgEl) metricLabelAvgEl.textContent = 'Moyenne';
    if (metricLabelDurationEl) metricLabelDurationEl.textContent = 'Temps';
  }

  metricDistanceEl.innerHTML = `${formattedDist} <span class="unit">km</span>`;
  metricAvgEl.innerHTML = `${formatAverageSpeed(avgKmh)} <span class="unit">km/h</span>`;
  metricDurationEl.textContent = tracker.formatDuration(durationSec);

  // Mise à jour de l'indicateur de pagination actif
  if (metricsDotsEl) {
    const dots = metricsDotsEl.querySelectorAll('.dot');
    dots.forEach((dot) => {
      dot.classList.toggle('active', dot.getAttribute('data-view') === metricsView);
    });
  }
}

// Mise à jour continue du temps total à l'arrêt (chaque seconde quand actif)
setInterval(() => {
  if (!tripTracker.isPaused() && metricsView === 'total') {
    tripTracker.tick();
    updateTripUI(tripTracker);
  }
}, 1000);

// 5. Démarrage de la simulation ou du GPS
if (isDemoMode) {
  console.log('[Tachymètre] Mode simulation activé (?demo=1)');
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
      // Simple tap confirmé : affiche ou masque le volet des métriques (verrouillé visible en pause)
      if (tripTracker.isPaused()) {
        tripMetricsEl.classList.remove('metrics-hidden');
      } else {
        tripMetricsEl.classList.toggle('metrics-hidden');
      }
      singleTapTimeout = null;
    }, 320);
  }
});

// 10. Gestuelle du bandeau des métriques : Tap (Pause/Reprise), Swipe (Carrousel), Appui long (Réinitialisation)
let longPressTimer = null;
let toastTimeout = null;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerStartTime = 0;
let isPointerDown = false;
let isSwiping = false;
let longPressTriggered = false;

function showToast(message) {
  resetToastEl.textContent = message;
  resetToastEl.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  const displayMs = message.length > 25 ? 3200 : 2200;
  toastTimeout = setTimeout(() => {
    resetToastEl.classList.remove('show');
  }, displayMs);
}

function switchMetricsView(targetView) {
  if (targetView) {
    metricsView = targetView;
  } else {
    metricsView = metricsView === 'moving' ? 'total' : 'moving';
  }
  try {
    localStorage.setItem(STORAGE_KEY_METRICS_VIEW, metricsView);
  } catch (e) {}
  updateTripUI(tripTracker);
}

function resetTripWithToast() {
  dismissStartupPrompt();
  tripTracker.reset();
  updateTripUI(tripTracker);
  try {
    localStorage.removeItem(STORAGE_KEY_TRIP);
  } catch (e) {}
  showToast('Trajet réinitialisé');
}

let pointerDownOnStartupBtn = false;

function onMetricsPointerDown(e) {
  pointerDownOnStartupBtn = Boolean(e.target.closest('#startup-action-btn'));
  isPointerDown = true;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;
  pointerStartTime = Date.now();
  isSwiping = false;
  longPressTriggered = false;

  if (longPressTimer) clearTimeout(longPressTimer);
  // Ne pas armer de réinitialisation par appui long si l'utilisateur appuie sur le bouton de démarrage
  if (!pointerDownOnStartupBtn) {
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      resetTripWithToast();
    }, 2000);
  }

  try {
    tripMetricsEl.setPointerCapture(e.pointerId);
  } catch (err) {}
}

function onMetricsPointerMove(e) {
  // Ignorer les survols de souris sans bouton enfoncé
  if (!isPointerDown) return;

  const deltaX = e.clientX - pointerStartX;
  const deltaY = e.clientY - pointerStartY;

  // Déplacement significatif : annule le déclenchement de l'appui long
  if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // Swipe horizontal détecté (amplitude >= 40px)
  if (Math.abs(deltaX) >= 40 && !isSwiping && !longPressTriggered) {
    isSwiping = true;
    if (currentStartupDecision && tripMetricsEl.classList.contains('showing-startup-prompt')) {
      // Un swipe sur le bouton de démarrage le masque sans faire tourner le carrousel
      if (currentStartupDecision.defaultChoice === 'resume') {
        showToast('Trajet repris - appui long pour réinitialiser');
      }
      dismissStartupPrompt();
    } else {
      switchMetricsView();
    }
  }
}

function onMetricsPointerUp(e) {
  if (!isPointerDown) return;
  isPointerDown = false;

  try {
    tripMetricsEl.releasePointerCapture(e.pointerId);
  } catch (err) {}

  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (longPressTriggered) {
    pointerDownOnStartupBtn = false;
    return;
  }

  const deltaX = Math.abs(e.clientX - pointerStartX);
  const deltaY = Math.abs(e.clientY - pointerStartY);
  const duration = Date.now() - pointerStartTime;

  // Simple tap confirmé : durée courte (< 350ms) et déplacement quasi nul (< 15px)
  if (!isSwiping && duration < 350 && deltaX < 15 && deltaY < 15) {
    // Si le tap a été initié sur le bouton de démarrage, exécuter son action et ne JAMAIS mettre en pause
    if (pointerDownOnStartupBtn) {
      pointerDownOnStartupBtn = false;
      handleStartupActionClick();
      return;
    }

    const isPaused = tripTracker.togglePause();
    if (isPaused) {
      tripMetricsEl.classList.remove('metrics-hidden');
    }
    updateTripUI(tripTracker);
    showToast(isPaused ? 'Trajet en pause' : 'Trajet repris');
    try {
      localStorage.setItem(STORAGE_KEY_TRIP, JSON.stringify(tripTracker.serialize()));
    } catch (err) {}
  }

  pointerDownOnStartupBtn = false;
}

function onMetricsPointerCancel(e) {
  isPointerDown = false;
  pointerDownOnStartupBtn = false;
  try {
    tripMetricsEl.releasePointerCapture(e.pointerId);
  } catch (err) {}
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

tripMetricsEl.addEventListener('pointerdown', onMetricsPointerDown);
tripMetricsEl.addEventListener('pointermove', onMetricsPointerMove);
tripMetricsEl.addEventListener('pointerup', onMetricsPointerUp);
tripMetricsEl.addEventListener('pointercancel', onMetricsPointerCancel);

// Clic direct sur les points de pagination du carrousel
if (metricsDotsEl) {
  metricsDotsEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const dot = e.target.closest('.dot');
    if (dot) {
      const targetView = dot.getAttribute('data-view');
      if (targetView && targetView !== metricsView) {
        switchMetricsView(targetView);
      }
    }
  });
}
