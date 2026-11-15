/**
 * Module d'adaptation de luminosité et de contraste pour Tachymètre Vélo PWA.
 * Exploite l'API AmbientLightSensor si supportée, avec bascule manuelle prioritaire.
 */

export class LightManager {
  /**
   * @param {object} [options]
   * @param {(theme: 'eco'|'sun') => void} [options.onThemeChange]
   */
  constructor(options = {}) {
    this.onThemeChange = options.onThemeChange || (() => {});
    this.theme = 'eco'; // 'eco' (sombre OLED) ou 'sun' (plein soleil haute visibilité)
    this.manualOverride = false;
    this.sensor = null;
  }

  /**
   * Initialise le capteur de luminosité ambiante si disponible dans le navigateur.
   * @returns {Promise<void>}
   */
  async init() {
    if (typeof window === 'undefined' || !('AmbientLightSensor' in window)) {
      return;
    }

    try {
      // @ts-ignore
      this.sensor = new window.AmbientLightSensor();
      this.sensor.addEventListener('reading', () => {
        if (this.sensor && typeof this.sensor.illuminance === 'number') {
          this.handleIlluminance(this.sensor.illuminance);
        }
      });
      this.sensor.addEventListener('error', () => {
        // En cas de refus de permission ou d'erreur capteur, on reste en mode manuel
        this.sensor = null;
      });
      this.sensor.start();
    } catch (err) {
      this.sensor = null;
    }
  }

  /**
   * Traite une valeur d'éclairement en lux provenant du capteur.
   * Ne modifie le thème que si l'utilisateur n'a pas forcé manuellement le mode.
   *
   * @param {number} lux Éclairement en lux
   */
  handleIlluminance(lux) {
    if (this.manualOverride) {
      return;
    }

    // Seuil de lumière directe du soleil : > 10 000 lux
    if (lux >= 10000 && this.theme !== 'sun') {
      this.setTheme('sun');
    } else if (lux <= 2000 && this.theme !== 'eco') {
      this.setTheme('eco');
    }
  }

  /**
   * Bascule manuellement entre le mode Éco et le mode Plein Soleil.
   * Marque le mode comme forcé manuellement.
   *
   * @returns {'eco'|'sun'} Nouveau thème actif
   */
  toggleManualMode() {
    this.manualOverride = true;
    const nextTheme = this.theme === 'eco' ? 'sun' : 'eco';
    this.setTheme(nextTheme);
    return nextTheme;
  }

  /**
   * Définit et notifie le nouveau thème.
   * @param {'eco'|'sun'} newTheme
   */
  setTheme(newTheme) {
    this.theme = newTheme;
    this.onThemeChange(this.theme);
  }

  /**
   * Renvoie le thème actuel.
   * @returns {'eco'|'sun'}
   */
  getTheme() {
    return this.theme;
  }

  /**
   * Indique si un forçage manuel est actif.
   * @returns {boolean}
   */
  isManual() {
    return this.manualOverride;
  }

  /**
   * Arrête le capteur si actif.
   */
  destroy() {
    if (this.sensor) {
      try {
        this.sensor.stop();
      } catch (err) {}
      this.sensor = null;
    }
  }
}
