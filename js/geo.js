/**
 * Module de gestion de la géolocalisation et du signal GPS pour Tachymètre Vélo PWA.
 * Surveillance haute précision, filtrage de précision, et watchdog anti-perte de signal.
 */

import { filterSpeed } from './speed-filter.js';

export const GPS_STATUS = {
  SEARCHING: 'SEARCHING',
  ACTIVE: 'ACTIVE',
  LOST: 'LOST',
  ERROR: 'ERROR'
};

export class GeoManager {
  /**
   * @param {object} [options]
   * @param {(speedKmh: number|null) => void} [options.onSpeed]
   * @param {(status: string, error?: any) => void} [options.onStatus]
   * @param {(tracker: any) => void} [options.onTripUpdate]
   * @param {any} [options.tripTracker]
   * @param {number} [options.watchdogTimeoutMs=4000]
   * @param {number} [options.maxAccuracyMeters=35]
   */
  constructor(options = {}) {
    this.onSpeed = options.onSpeed || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onTripUpdate = options.onTripUpdate || (() => {});
    this.tripTracker = options.tripTracker || null;
    this.watchdogTimeoutMs = options.watchdogTimeoutMs || 4000;
    this.maxAccuracyMeters = options.maxAccuracyMeters || 35;

    this.status = GPS_STATUS.SEARCHING;
    this.lastFilteredSpeed = 0;
    this.watchId = null;
    this.watchdogTimer = null;
    this.simulationTimer = null;
  }

  /**
   * Renvoie le statut GPS courant.
   * @returns {string}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Renvoie la dernière vitesse filtrée en km/h.
   * @returns {number}
   */
  getLastFilteredSpeed() {
    return this.lastFilteredSpeed;
  }

  /**
   * Démarre la surveillance GPS native du navigateur.
   */
  start() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.status = GPS_STATUS.ERROR;
      this.onStatus(this.status, new Error('Géolocalisation non supportée'));
      return;
    }

    this.status = GPS_STATUS.SEARCHING;
    this.onStatus(this.status);
    this.resetWatchdog();

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => this.handleError(err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  }

  /**
   * Arrête la surveillance GPS et les timers associés.
   */
  stop() {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.stopSimulation();
  }

  /**
   * Réarme le timer watchdog de perte de signal.
   */
  resetWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
    }
    this.watchdogTimer = setTimeout(() => {
      this.triggerWatchdogTimeout();
    }, this.watchdogTimeoutMs);
  }

  /**
   * Déclenche l'expiration du watchdog (perte de signal GPS).
   */
  triggerWatchdogTimeout() {
    this.status = GPS_STATUS.LOST;
    this.lastFilteredSpeed = 0;
    this.onStatus(this.status);
    this.onSpeed(null);
  }

  /**
   * Traite un fix de position GPS reçu.
   * @param {GeolocationPosition} pos
   */
  handlePosition(pos) {
    if (!pos || !pos.coords) return;

    const coords = pos.coords;
    // Filtrage si la précision est insuffisante
    if (coords.accuracy !== undefined && coords.accuracy > this.maxAccuracyMeters) {
      return;
    }

    this.resetWatchdog();

    if (this.status !== GPS_STATUS.ACTIVE) {
      this.status = GPS_STATUS.ACTIVE;
      this.onStatus(this.status);
    }

    const rawSpeedMps = coords.speed !== undefined && coords.speed !== null ? coords.speed : 0;
    const filtered = filterSpeed(rawSpeedMps, this.lastFilteredSpeed);
    this.lastFilteredSpeed = filtered;

    this.onSpeed(filtered);

    if (this.tripTracker) {
      this.tripTracker.update(
        coords.latitude,
        coords.longitude,
        filtered,
        pos.timestamp || Date.now()
      );
      this.onTripUpdate(this.tripTracker);
    }
  }

  /**
   * Traite une erreur de géolocalisation.
   * @param {GeolocationPositionError|Error} err
   */
  handleError(err) {
    this.status = GPS_STATUS.ERROR;
    this.onStatus(this.status, err);
  }

  /**
   * Démarre une simulation réaliste d'itinéraire cycliste pour le test et la démo.
   * Génère des coordonnées géodésiques continues correspondant exactement à la vitesse.
   * @param {Array<{lat: number, lon: number, speedMps: number}>} [routePoints]
   */
  startSimulation(routePoints) {
    this.stop();

    this.status = GPS_STATUS.SEARCHING;
    this.onStatus(this.status);

    let curLat = 48.8584;
    let curLon = 2.2945;

    // Profil de vitesse réaliste en m/s (démarrage, vitesse de croisière 28-30 km/h, arrêt feu rouge, reprise)
    const speedProfile = [
      0, 2.2, 4.5, 6.2, 7.5, 8.0, 8.2, 8.4, 8.3, 8.5, 8.3, 8.2, // Accélération vers 30 km/h
      8.3, 8.1, 8.4, 8.2, 8.5, 8.3, 8.2,                         // Allure de croisière (~30 km/h)
      6.0, 3.5, 1.2, 0, 0, 0,                                    // Décélération et arrêt au feu rouge
      2.5, 5.2, 7.2, 8.1, 8.3                                    // Redémarrage
    ];

    let step = 0;

    this.simulationTimer = setInterval(() => {
      const speedMps = speedProfile[step % speedProfile.length];
      step++;

      // Avancement géographique exact : décomposition vectorielle à 45° (Nord-Est)
      // pour que l'hypoténuse (distance réelle Haversine) vaille exactement speedMps
      if (speedMps > 0) {
        const distMps = speedMps / Math.SQRT2;
        const deltaLat = distMps / 111139;
        const deltaLon = distMps / (111139 * Math.cos((curLat * Math.PI) / 180));
        curLat += deltaLat;
        curLon += deltaLon;
      }

      this.handlePosition({
        coords: {
          latitude: curLat,
          longitude: curLon,
          speed: speedMps,
          accuracy: 6
        },
        timestamp: Date.now()
      });
    }, 1000);
  }

  /**
   * Arrête la simulation.
   */
  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }
}
