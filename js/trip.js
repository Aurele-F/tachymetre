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
    this.lastMoveTimestamp = null;
    this.lastPosition = null;
  }

  /**
   * Met à jour le trajet avec la nouvelle position et la vitesse instantanée.
   * Ne comptabilise la distance et le temps que si la vitesse est strictement positive.
   *
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @param {number} speedKmh Vitesse instantanée filtrée en km/h
   * @param {number} [timestampMs=Date.now()] Horodatage en millisecondes
   */
  update(lat, lon, speedKmh, timestampMs = Date.now()) {
    if (speedKmh > 0) {
      if (this.lastMoveTimestamp !== null && this.lastPosition !== null) {
        const deltaMs = timestampMs - this.lastMoveTimestamp;
        // Seuil de sécurité : si le délai est inférieur à 15 secondes, on cumule
        if (deltaMs > 0 && deltaMs <= 15000) {
          const deltaDistance = haversineDistanceMeters(
            this.lastPosition.lat,
            this.lastPosition.lon,
            lat,
            lon
          );
          // Évite d'ajouter des sauts aberrants (> 50 m/s ~ 180 km/h)
          if (deltaDistance / (deltaMs / 1000) < 50) {
            this.distanceMeters += deltaDistance;
            this.movingTimeMs += deltaMs;
          }
        }
      }
      this.lastMoveTimestamp = timestampMs;
      this.lastPosition = { lat, lon };
    } else {
      // À l'arrêt : on suspend le chronomètre et on réinitialise le point de repère
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
   * Calcule la vitesse moyenne basée sur le temps effectif en mouvement.
   * @returns {number} Vitesse moyenne en km/h
   */
  getAverageSpeedKmh() {
    const hours = this.movingTimeMs / 3600000;
    if (hours <= 0 || this.distanceMeters <= 0) {
      return 0;
    }
    return this.getDistanceKm() / hours;
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
   * Sérialise l'état pour la persistance dans localStorage.
   * @returns {object}
   */
  serialize() {
    return {
      distanceMeters: this.distanceMeters,
      movingTimeMs: this.movingTimeMs
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
    this.lastMoveTimestamp = null;
    this.lastPosition = null;
  }
}
