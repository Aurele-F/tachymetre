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
   * @param {Array<{lat: number, lon: number, speedMps: number}>} [routePoints]
   */
  startSimulation(routePoints) {
    this.stop();

    // Profil de simulation par défaut : démarrage, accélération à 28 km/h, arrêt feu, reprise
    const defaultRoute = [
      { lat: 48.8584, lon: 2.2945, speedMps: 0 },
      { lat: 48.8586, lon: 2.2947, speedMps: 2.5 },  // ~9 km/h
      { lat: 48.8590, lon: 2.2952, speedMps: 5.0 },  // ~18 km/h
      { lat: 48.8596, lon: 2.2960, speedMps: 7.2 },  // ~26 km/h
      { lat: 48.8603, lon: 2.2970, speedMps: 8.0 },  // ~28.8 km/h
      { lat: 48.8610, lon: 2.2980, speedMps: 8.3 },  // ~30 km/h
      { lat: 48.8615, lon: 2.2988, speedMps: 4.0 },  // décélération
      { lat: 48.8617, lon: 2.2990, speedMps: 0 },    // feu rouge (vitesse 0)
      { lat: 48.8617, lon: 2.2990, speedMps: 0 },    // arrêt prolongé
      { lat: 48.8622, lon: 2.2995, speedMps: 4.5 },  // redémarrage
      { lat: 48.8628, lon: 2.3005, speedMps: 7.5 }   // allure de croisière
    ];

    const points = routePoints && routePoints.length > 0 ? routePoints : defaultRoute;
    let idx = 0;

    this.status = GPS_STATUS.SEARCHING;
    this.onStatus(this.status);

    this.simulationTimer = setInterval(() => {
      const pt = points[idx % points.length];
      idx++;

      this.handlePosition({
        coords: {
          latitude: pt.lat,
          longitude: pt.lon,
          speed: pt.speedMps,
          accuracy: 8
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
