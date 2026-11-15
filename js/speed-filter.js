/**
 * Module de filtrage de vitesse pour Tachymètre Vélo PWA.
 * Seuil d'arrêt net (0.8 m/s ~ 2.88 km/h) et lissage exponentiel (EMA).
 */

export const MIN_SPEED_THRESHOLD_MPS = 0.8;

/**
 * Convertit des mètres par seconde (m/s) en kilomètres par heure (km/h).
 * @param {number|null|undefined} speedMps
 * @returns {number} Vitesse en km/h (>= 0)
 */
export function toKmh(speedMps) {
  if (speedMps === null || speedMps === undefined || isNaN(speedMps) || speedMps <= 0) {
    return 0;
  }
  return speedMps * 3.6;
}

/**
 * Filtre la vitesse brute mesurée par le GPS.
 * Si la vitesse est sous le seuil d'arrêt, renvoie immédiatement 0 (anti-dérive).
 * Sinon, applique un lissage exponentiel (EMA).
 *
 * @param {number|null|undefined} rawSpeedMps Vitesse brute en m/s
 * @param {number} prevFilteredKmh Dernière vitesse filtrée en km/h
 * @param {number} alpha Facteur de lissage (défaut: 0.4)
 * @returns {number} Vitesse filtrée en km/h
 */
export function filterSpeed(rawSpeedMps, prevFilteredKmh = 0, alpha = 0.4) {
  if (rawSpeedMps === null || rawSpeedMps === undefined || isNaN(rawSpeedMps) || rawSpeedMps < MIN_SPEED_THRESHOLD_MPS) {
    return 0;
  }

  const rawKmh = toKmh(rawSpeedMps);
  return alpha * rawKmh + (1 - alpha) * prevFilteredKmh;
}

/**
 * Formate la vitesse pour l'affichage numérique HUD.
 * @param {number|null|undefined} speedKmh Vitesse en km/h
 * @param {number} decimals Nombre de décimales (défaut: 0)
 * @returns {string} Vitesse formatée ou '--' si indisponible
 */
export function formatSpeed(speedKmh, decimals = 0) {
  if (speedKmh === null || speedKmh === undefined || isNaN(speedKmh)) {
    return '--';
  }
  if (decimals === 0) {
    return Math.round(speedKmh).toString();
  }
  return speedKmh.toFixed(decimals);
}

/**
 * Formate la vitesse moyenne pour l'affichage du bandeau des métriques.
 * Renvoie '--' si la moyenne n'est pas encore établie (<= 0), sinon la valeur à 1 décimale.
 * @param {number|null|undefined} avgKmh Vitesse moyenne en km/h
 * @returns {string} Vitesse moyenne formatée ou '--' si indisponible
 */
export function formatAverageSpeed(avgKmh) {
  if (avgKmh === null || avgKmh === undefined || isNaN(avgKmh) || avgKmh < 0) {
    return '--';
  }
  return avgKmh.toFixed(1);
}
