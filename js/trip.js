/**
 * Module de calcul des métriques de trajet pour Tachymètre Vélo PWA.
 * Distance orthodromique (Haversine), temps en mouvement et vitesse moyenne.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calcule la distance en mètres entre deux coordonnées géographiques (formule d'Haversine).
 * @param {number} lat1 Latitude point 1
 * @param {number} lon1 Longitude point 1
 * @param {number} lat2 Latitude point 2
 * @param {number} lon2 Longitude point 2
 * @returns {number} Distance en mètres
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Gestionnaire de suivi du trajet en cours.
 */
export class TripTracker {
  constructor() {
    this.reset();
  }

  /**
   * Réinitialise toutes les métriques de la sortie.
   */
  reset() {
    this.distanceMeters = 0;
    this.movingTimeMs = 0;
    this.totalTimeMs = 0;
    this.paused = false;
    this.lastMoveTimestamp = null;
    this.lastPosition = null;
    this.lastUpdateTimestamp = null;
    this.autoResumeStartMs = null;
  }

  /**
   * Indique si l'enregistrement du trajet est actuellement en pause.
   * @returns {boolean}
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Active ou désactive la pause de la mesure.
   * @param {boolean} paused
   */
  setPaused(paused) {
    this.paused = Boolean(paused);
    if (this.paused) {
      this.lastMoveTimestamp = null;
      this.lastPosition = null;
      this.lastUpdateTimestamp = null;
      this.autoResumeStartMs = null;
    }
  }

  /**
   * Bascule l'état de pause.
   * @returns {boolean} Nouvel état de pause
   */
  togglePause() {
    this.setPaused(!this.paused);
    return this.paused;
  }

  /**
   * Vérifie si les conditions d'auto-reprise sont remplies (vitesse > seuil pendant N secondes).
   * @param {number} speedKmh Vitesse instantanée filtrée
   * @param {number} [timestampMs=Date.now()] Horodatage
   * @param {number} [thresholdKmh=12] Seuil de vitesse (défaut 12 km/h)
   * @param {number} [durationSec=3] Durée continue requise (défaut 3s)
   * @returns {boolean} true si l'auto-reprise a été déclenchée
   */
  checkAutoResume(speedKmh, timestampMs = Date.now(), thresholdKmh = 12, durationSec = 3) {
    if (!this.paused) {
      this.autoResumeStartMs = null;
      return false;
    }

    if (speedKmh > thresholdKmh) {
      if (this.autoResumeStartMs === null) {
        this.autoResumeStartMs = timestampMs;
      } else if (timestampMs - this.autoResumeStartMs >= durationSec * 1000) {
        this.setPaused(false);
        this.autoResumeStartMs = null;
        return true;
      }
    } else {
      this.autoResumeStartMs = null;
    }
    return false;
  }

  /**
   * Fait avancer le chronomètre de temps total sans nécessiter de nouvelle position GPS (utile à l'arrêt).
   * @param {number} [timestampMs=Date.now()] Horodatage
   */
  tick(timestampMs = Date.now()) {
    if (this.paused) {
      return;
    }
    if (this.lastUpdateTimestamp !== null) {
      const deltaTotalMs = timestampMs - this.lastUpdateTimestamp;
      if (deltaTotalMs > 0 && deltaTotalMs <= 15000) {
        this.totalTimeMs += deltaTotalMs;
      }
    }
    this.lastUpdateTimestamp = timestampMs;
  }

  /**
   * Met à jour le trajet avec la nouvelle position et la vitesse instantanée.
   * Ne comptabilise rien si la mesure est en pause.
   *
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @param {number} speedKmh Vitesse instantanée filtrée en km/h
   * @param {number} [timestampMs=Date.now()] Horodatage en millisecondes
   */
  update(lat, lon, speedKmh, timestampMs = Date.now()) {
    if (this.paused) {
      return;
    }

    // 1. Calcul du temps total écoulé (feux et arrêts compris, hors pause)
    this.tick(timestampMs);

    // 2. Calcul du temps effectif en mouvement et de la distance parcourue
    if (speedKmh > 0) {
      if (this.lastMoveTimestamp !== null && this.lastPosition !== null) {
        const deltaMs = timestampMs - this.lastMoveTimestamp;
        // Seuil de sécurité : si le délai est inférieur à 15 secondes, on cumule
        if (deltaMs > 0 && deltaMs <= 15000) {
          const deltaSec = deltaMs / 1000;
          let deltaDistance = haversineDistanceMeters(
            this.lastPosition.lat,
            this.lastPosition.lon,
            lat,
            lon
          );

          // Filtrage de cohérence physique : la distance Haversine ne doit pas dépasser
          // démesurément la distance permise par la vitesse instantanée mesurée par le capteur GPS
          // (élimine l'amplification du jitter d'antenne de 3-4m sur 1s à basse vitesse)
          const speedMps = speedKmh / 3.6;
          const maxPlausibleDistance = Math.max(speedMps * deltaSec * 1.5 + 1.5, 2.0 * deltaSec);
          if (deltaDistance > maxPlausibleDistance && deltaDistance / deltaSec < 50) {
            deltaDistance = maxPlausibleDistance;
          }

          // Évite d'ajouter des sauts aberrants (> 50 m/s ~ 180 km/h)
          if (deltaDistance / deltaSec < 50) {
            this.distanceMeters += deltaDistance;
            this.movingTimeMs += deltaMs;
          }
        }
      }
      this.lastMoveTimestamp = timestampMs;
      this.lastPosition = { lat, lon };
    } else {
      // À l'arrêt : on suspend le chronomètre de roulage et on réinitialise le point de repère
      this.lastMoveTimestamp = null;
      this.lastPosition = null;
    }
  }

  /**
   * Renvoie la distance cumulée en kilomètres.
   * @returns {number}
   */
  getDistanceKm() {
    return this.distanceMeters / 1000;
  }

  /**
   * Renvoie le temps en mouvement effectif en secondes.
   * @returns {number}
   */
  getMovingTimeSeconds() {
    return Math.floor(this.movingTimeMs / 1000);
  }

  /**
   * Renvoie la durée totale du trajet en secondes (feux et arrêts inclus, hors pause).
   * @returns {number}
   */
  getTotalTimeSeconds() {
    return Math.floor(this.totalTimeMs / 1000);
  }

  /**
   * Calcule la vitesse moyenne basée uniquement sur le temps effectif en mouvement.
   * Renvoie null tant que le temps de déplacement est inférieur à 5 secondes pour éliminer les pics de démarrage.
   * @returns {number|null} Vitesse moyenne de roulage en km/h ou null si non établie
   */
  getMovingAverageSpeedKmh() {
    if (this.movingTimeMs < 5000 || this.distanceMeters <= 0) {
      return null;
    }
    const hours = this.movingTimeMs / 3600000;
    return this.getDistanceKm() / hours;
  }

  /**
   * Calcule la vitesse moyenne basée sur le temps total (arrêts inclus, hors pause).
   * Renvoie null tant que le temps total est inférieur à 5 secondes.
   * Dès 5 secondes de temps total, renvoie la moyenne globale (0 si arrêté, ou calculée si en mouvement).
   * @returns {number|null} Vitesse moyenne totale en km/h ou null si non établie
   */
  getTotalAverageSpeedKmh() {
    if (this.totalTimeMs < 5000) {
      return null;
    }
    const hours = this.totalTimeMs / 3600000;
    if (hours <= 0 || this.distanceMeters <= 0) {
      return 0;
    }
    return this.getDistanceKm() / hours;
  }

  /**
   * Calcule la vitesse moyenne par défaut (moyenne de roulage), renvoie 0 si non établie.
   * @returns {number} Vitesse moyenne en km/h
   */
  getAverageSpeedKmh() {
    const avg = this.getMovingAverageSpeedKmh();
    return avg !== null ? avg : 0;
  }

  /**
   * Formate une durée en secondes sous forme 'MM:SS' ou 'HH:MM:SS'.
   * @param {number} seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  /**
   * Formate la distance en kilomètres avec précision adaptative.
   * - < 10 km  : 2 décimales (ex: 1.42)
   * - < 100 km : 1 décimale (ex: 24.5)
   * - >= 100 km: 0 décimale (ex: 125)
   * @returns {string}
   */
  getFormattedDistance() {
    return formatDistance(this.getDistanceKm());
  }

  /**
   * Sérialise l'état pour la persistance dans localStorage.
   * @returns {object}
   */
  serialize() {
    return {
      distanceMeters: this.distanceMeters,
      movingTimeMs: this.movingTimeMs,
      totalTimeMs: this.totalTimeMs,
      isPaused: this.paused
    };
  }

  /**
   * Restaure l'état à partir d'un objet sérialisé.
   * @param {object} data
   */
  restore(data) {
    if (!data) return;
    this.distanceMeters = Number(data.distanceMeters) || 0;
    this.movingTimeMs = Number(data.movingTimeMs) || 0;
    this.totalTimeMs = Number(data.totalTimeMs) || 0;
    this.paused = Boolean(data.isPaused);
    this.lastMoveTimestamp = null;
    this.lastPosition = null;
    this.lastUpdateTimestamp = null;
    this.autoResumeStartMs = null;
  }
}

/**
 * Formate une distance en kilomètres selon les paliers de lisibilité :
 * - En dessous de 10 km : 2 chiffres après la virgule (ex: 0.00, 1.42, 9.95)
 * - À partir de 10 km et jusqu'à 100 km : 1 chiffre après la virgule (ex: 10.0, 24.5, 99.8)
 * - À partir de 100 km : 0 chiffre après la virgule (ex: 100, 142)
 *
 * @param {number|null|undefined} distKm Distance en kilomètres
 * @returns {string} Distance formatée
 */
export function formatDistance(distKm) {
  if (distKm === null || distKm === undefined || isNaN(distKm) || distKm <= 0) {
    return '0.00';
  }

  if (distKm < 10) {
    return distKm.toFixed(2);
  }
  if (distKm < 100) {
    return distKm.toFixed(1);
  }
  return Math.round(distKm).toString();
}
